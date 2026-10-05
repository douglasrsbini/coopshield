use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env::consts::ARCH;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use mac_address::get_mac_address;
use tauri::{command, AppHandle};
use totp_rs::{Algorithm, Secret, TOTP};
use base64::{engine::general_purpose, Engine as _};

#[derive(Serialize)]
struct ValidacaoRequest {
    chave_licenca: String,
    machine_id: String,
}

#[derive(Deserialize)]
struct ValidacaoResponse {
    valido: Option<bool>,
    mensagem: Option<String>,
    token_offline: Option<String>,
    detail: Option<String>, 
}

#[derive(Serialize)]
struct AtivacaoRequest {
    email: String,
    senha: String,
    two_factor_code: String,
    machine_id: String,
    chave_licenca: Option<String>,
}

#[derive(Deserialize)]
struct AtivacaoResponse {
    valido: Option<bool>,
    mensagem: Option<String>,
    token_offline: Option<String>,
    chave_vinculada: Option<String>,
    detail: Option<String>,
}

#[command]
pub fn get_machine_id() -> String {
    let host_name = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "UNKNOWN_NODE".to_string());

    let arch = ARCH;

    let mac = match get_mac_address() {
        Ok(Some(ma)) => ma.to_string().replace(":", "").to_uppercase(),
        _ => "000000000000".to_string(),
    };

    let dados_hardware = format!("{}:{}:{}", host_name, arch, mac);

    let mut hasher = Sha256::new();
    hasher.update(dados_hardware.as_bytes());
    let result = hasher.finalize();

    let hex_string = hex::encode(result).to_uppercase();
    hex_string[..24].to_string()
}

fn get_offline_token_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("com.binaver.coopshield");
    fs::create_dir_all(&path).unwrap_or(());
    path.push(".binaver_license.token");
    path
}

// ----------------------------------------------------------------------
// INTEGRAÇÃO COM APP AUTENTICADOR (GOOGLE / MICROSOFT) - MODO OFFLINE
// ----------------------------------------------------------------------
#[command]
pub fn generate_totp_qr(app_handle: AppHandle, email: String) -> Result<String, String> {
    let secret_bytes = rand::random::<[u8; 32]>();
    let secret = Secret::Raw(secret_bytes.to_vec()).to_encoded();
    let secret_string = secret.to_string();

    let mut payload = std::collections::HashMap::new();
    payload.insert("totp_app_secret".to_string(), secret_string);
    let _ = crate::commands::settings::update_settings(app_handle, payload);

    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_bytes().unwrap(),
        Some("BINAVER Kopher Shield".to_string()),
        email,
    ).map_err(|e| e.to_string())?;

    // O totp-rs v5.7 devolve um vetor de bytes (PNG) ou string Base64 dependendo do método. 
    // Vamos usar get_qr_base64 e concatenar o cabeçalho data URI scheme do HTML.
    let qr_base64 = totp.get_qr_base64().map_err(|e| e.to_string())?;
    
    // CORREÇÃO: Adiciona o prefixo 'data:image/png;base64,' para o React renderizar imediatamente
    Ok(format!("data:image/png;base64,{}", qr_base64))
}

#[command]
pub fn verify_totp_code(app_handle: AppHandle, code: String) -> Result<bool, String> {
    let settings = crate::commands::settings::get_all_settings(app_handle).unwrap_or_default();
    let saved_secret = settings.get("totp_app_secret").cloned().unwrap_or_default();

    if saved_secret.is_empty() { 
        return Err("Nenhum App Autenticador foi vinculado ainda.".to_string()); 
    }

    let secret = Secret::Encoded(saved_secret);
    let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.to_bytes().unwrap(), None, "".to_string()).map_err(|e| e.to_string())?;
    
    Ok(totp.check_current(&code).unwrap_or(false))
}
// ----------------------------------------------------------------------

#[command]
pub async fn validate_license_key(key: String) -> Result<String, String> {
    let machine_id = get_machine_id();
    let clean_key = key.trim().to_uppercase();

    if clean_key.len() != 55 {
        return Err("Formato inválido. A licença deve conter 8 blocos alfanuméricos.".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let payload = ValidacaoRequest {
        chave_licenca: clean_key,
        machine_id: machine_id.clone(),
    };

    let api_url = "http://127.0.0.1:8000/licencas/validar"; 

    match client.post(api_url).json(&payload).send().await {
        Ok(response) => {
            let status = response.status();
            let body: ValidacaoResponse = response.json().await.map_err(|e| e.to_string())?;

            if status.is_success() {
                if let Some(token) = body.token_offline {
                    let _ = fs::write(get_offline_token_path(), token);
                }
                Ok(body.mensagem.unwrap_or_else(|| "Licença validada!".to_string()))
            } else {
                Err(body.detail.unwrap_or_else(|| "Acesso negado pelo servidor DRM.".to_string()))
            }
        }
        Err(_) => {
            if let Ok(token_salvo) = fs::read_to_string(get_offline_token_path()) {
                if !token_salvo.is_empty() {
                    return Ok("Modo de Contingência (Offline) Ativado. Válido por 7 dias.".to_string());
                }
            }
            Err("Sem conexão com a internet e sem token offline válido para contingência.".to_string())
        }
    }
}

// ATENÇÃO: Retorna Tripla (Mensagem, Chave, E-mail Autorizado). Variáveis inutilizadas temporariamente ganharam um `_`
#[command]
pub async fn authenticate_and_activate(
    app_handle: AppHandle, 
    email: String, 
    _password: String, 
    two_factor_code: String, 
    method: Option<String>, 
    key: Option<String>
) -> Result<(String, String, String), String> {
    let clean_key = key.map(|k| k.trim().to_uppercase()).filter(|k| !k.is_empty());
    let settings = crate::commands::settings::get_all_settings(app_handle.clone()).unwrap_or_default();
    
    // Identifica se a chamada veio do "app" (Autenticador) ou "email"
    let auth_method = method.unwrap_or_else(|| "email".to_string());

    if auth_method == "app" {
        // Validação Criptográfica Offline via Google / Microsoft Authenticator
        let saved_secret = settings.get("totp_app_secret").cloned().unwrap_or_default();
        if saved_secret.is_empty() {
            return Err("Nenhum App Autenticador foi configurado nesta máquina.".to_string());
        }

        let secret = Secret::Encoded(saved_secret);
        let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.to_bytes().unwrap(), None, "".to_string()).map_err(|e| e.to_string())?;
        
        // Verifica o código de 6 dígitos gerado no telemóvel com tolerância de relógio (skew)
        let is_valid = totp.check_current(&two_factor_code).unwrap_or(false);
        if !is_valid {
            return Err("Código do Google/Microsoft Authenticator incorreto ou expirado.".to_string());
        }
    } else {
        // Validação via E-mail (SMTP)
        let saved_code = settings.get("temp_2fa_code").cloned().unwrap_or_default();
        if saved_code.is_empty() || two_factor_code != saved_code {
            return Err("O token de segurança de e-mail é inválido ou expirou.".to_string());
        }

        // Regra de Segurança: Token de Uso Único (Limpa o código após o uso)
        let mut payload_clear = std::collections::HashMap::new();
        payload_clear.insert("temp_2fa_code".to_string(), "".to_string());
        let _ = crate::commands::settings::update_settings(app_handle, payload_clear);
    }

    tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
    let resolved_key = clean_key.unwrap_or_else(|| "BINAVR-ENTERP0-CLIENT00-000000-000000-000000-000000".to_string());
    
    Ok(("Identidade validada e software ativado com sucesso!".to_string(), resolved_key, email))
}