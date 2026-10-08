use tauri::{command, AppHandle};
use rusqlite::Connection;
use std::collections::HashMap;
use crate::database::sqlite::get_db_path;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{Message, SmtpTransport, Transport};
use lettre::message::{header::ContentType, MultiPart, SinglePart, Attachment, Mailbox};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[command]
pub fn get_all_settings(app_handle: AppHandle) -> Result<HashMap<String, String>, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT setting_key, setting_value FROM system_settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| { Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)) }).map_err(|e| e.to_string())?;
    let mut settings = HashMap::new();
    for row in rows { if let Ok((k, v)) = row { settings.insert(k, v); } }
    Ok(settings)
}

#[command]
pub fn update_settings(app_handle: AppHandle, payload: HashMap<String, String>) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (k, v) in payload {
        tx.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES (?1, ?2) ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?2", (&k, &v)).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok("Configurações comerciais salvas com sucesso!".to_string())
}

#[command]
pub fn finish_setup(app_handle: AppHandle, language: String, theme: String, license_key: String) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('language', ?1) ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?1", (&language,)).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('theme', ?1) ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?1", (&theme,)).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('license_key', ?1) ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?1", (&license_key,)).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('license_status', 'active') ON CONFLICT(setting_key) DO UPDATE SET setting_value = 'active'", []).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('setup_completed', 'true') ON CONFLICT(setting_key) DO UPDATE SET setting_value = 'true'", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok("Setup concluído com sucesso. Bem-vindo ao Kopher Shield!".to_string())
}

fn build_email_template(client_name: &str, status_color: &str, status_bg: &str, status_text: &str, html_details: &str) -> String {
    format!(
        r#"<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><link href="https://fonts.googleapis.com/css2?family=Varela+Round&family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body {{ font-family: 'Quicksand', sans-serif; }} .title-font {{ font-family: 'Varela Round', sans-serif; }}</style></head><body style="background-color: #050709; margin: 0; padding: 40px 20px;"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center"><table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #0B0F14; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); border: 1px solid #1E2A3B;"><tr><td style="background-color: #0B0F14; padding: 40px 30px 25px 30px; text-align: center; border-bottom: 3px solid {status_color};"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center"><img src="cid:logo_coopshield" alt="Kopher Shield Logo" width="100" style="display: block; margin: 0 auto 12px auto; border: 0; outline: none; text-decoration: none;" /></td></tr><tr><td align="center"><div class="title-font" style="color: #94a3b8; font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;">Workspace: {client_name}</div></td></tr></table></td></tr><tr><td style="padding: 30px 40px 5px 40px; text-align: center;"><div class="title-font" style="display: inline-block; background-color: {status_bg}; color: {status_color}; padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; border: 1px solid {status_color};">{status_text}</div></td></tr><tr><td style="padding: 20px 40px 40px 40px; color: #FFFFFF;">{html_details}</td></tr><tr><td style="background-color: #050709; border-top: 1px solid #1E2A3B; padding: 30px 40px; text-align: center;"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding-bottom: 12px;"><img src="cid:logo_binaver" alt="Binaver Ícone" width="35" style="display: block; margin: 0 auto; border: 0; outline: none; text-decoration: none;" /></td></tr><tr><td align="center"><div class="title-font" style="font-size: 13px; font-weight: bold; color: #FFFFFF; letter-spacing: 0.5px; margin-bottom: 6px; text-transform: uppercase;">Binaver Soluções Tecnológicas Ltda</div><p style="margin: 0; color: #64748b; font-size: 11px; line-height: 1.6;">Relatório gerado automaticamente pelo motor de auditoria.<br>Este e-mail é estritamente confidencial e não requer resposta.</p></td></tr></table></td></tr></table></td></tr></table></body></html>"#,
        status_color = status_color, status_bg = status_bg, status_text = status_text, client_name = client_name, html_details = html_details
    )
}

fn get_image_bytes(app_handle: &AppHandle, file_name: &str) -> Option<Vec<u8>> {
    let mut paths_to_try = vec![];
    if let Ok(mut resource_path) = app_handle.path().resource_dir() { resource_path.push("public"); resource_path.push(file_name); paths_to_try.push(resource_path); }
    let mut dev_path = PathBuf::from(".."); dev_path.push("public"); dev_path.push(file_name); paths_to_try.push(dev_path);
    let mut direct_path = PathBuf::from("public"); direct_path.push(file_name); paths_to_try.push(direct_path);
    for path in paths_to_try { if let Ok(bytes) = fs::read(&path) { return Some(bytes); } }
    None
}

fn build_multipart_message(user: &str, dest: &str, cc: Option<&str>, bcc: Option<&str>, subject: &str, html_body: String, app_handle: &AppHandle) -> Result<Message, String> {
    let mut multipart = MultiPart::related().singlepart(SinglePart::builder().header(ContentType::TEXT_HTML).body(html_body));
    if let Some(logo_bytes) = get_image_bytes(app_handle, "logo.png") {
        let attachment = Attachment::new_inline(String::from("logo_coopshield")).body(logo_bytes, ContentType::parse("image/png").unwrap());
        multipart = multipart.singlepart(attachment);
    }
    if let Some(binaver_bytes) = get_image_bytes(app_handle, "icone_binaver.png") {
        let attachment = Attachment::new_inline(String::from("logo_binaver")).body(binaver_bytes, ContentType::parse("image/png").unwrap());
        multipart = multipart.singlepart(attachment);
    }

    let mut builder = Message::builder()
        .from(user.parse().map_err(|_| "Remetente inválido.")?)
        .to(dest.parse().map_err(|_| "Destinatário inválido.")?)
        .subject(subject);

    if let Some(cc_addr) = cc {
        if !cc_addr.trim().is_empty() {
            if let Ok(parsed_cc) = cc_addr.parse::<Mailbox>() { builder = builder.cc(parsed_cc); }
        }
    }
    if let Some(bcc_addr) = bcc {
        if !bcc_addr.trim().is_empty() {
            if let Ok(parsed_bcc) = bcc_addr.parse::<Mailbox>() { builder = builder.bcc(parsed_bcc); }
        }
    }

    builder.multipart(multipart).map_err(|e| e.to_string())
}

#[command]
pub fn test_smtp_connection(app_handle: AppHandle, host: String, port: u16, user: String, pass: String, cc_email: String, bcc_email: String) -> Result<String, String> {
    
    // Para o Teste, o "Destino" será o próprio E-mail Remetente, já que removemos o Destino Principal da Interface
    let to_email = user.clone(); 

    let html_details = r#"<div style="text-align: center; margin-bottom: 10px;"><h3 class="title-font" style="color: #FFFFFF; font-size: 18px; font-weight: bold; margin-bottom: 15px;">Teste de Conectividade SMTP</h3><p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 25px;">Se você está lendo esta mensagem, o motor de notificações da sua instância Kopher Shield comunicou-se perfeitamente com o servidor de e-mail corporativo.</p><div style="background-color: #121822; padding: 15px; border-radius: 6px; border: 1px dashed #F59E0B;"><span class="title-font" style="color: #F59E0B; font-weight: bold; font-size: 13px; letter-spacing: 0.5px;">CANAL SEGURO (TLS) ESTABELECIDO</span></div></div>"#;
    let html_body = build_email_template("Configuração de Sistema", "#F59E0B", "#050709", "TESTE DE COMUNICAÇÃO", html_details);
    
    let email = build_multipart_message(&user, &to_email, Some(&cc_email), Some(&bcc_email), "Kopher Shield - Validação de Sistema e Alertas", html_body, &app_handle)?;
    let creds = Credentials::new(user.clone(), pass.clone());
    let tls_params = TlsParameters::builder(host.clone()).build().map_err(|e| e.to_string())?;
    let mailer = SmtpTransport::builder_dangerous(&host).port(port).credentials(creds).tls(Tls::Required(tls_params)).build();

    match mailer.send(&email) { Ok(_) => Ok("E-mail de teste disparado com sucesso!".to_string()), Err(e) => Err(format!("Falha SMTP: {}", e)) }
}

pub fn send_email_alert(app_handle: &tauri::AppHandle, subject: &str, status: &str, html_details: &str) -> Result<(), String> {
    let settings = match get_all_settings(app_handle.clone()) { Ok(s) => s, Err(_) => return Ok(()) };
    let host = settings.get("smtp_host").cloned().unwrap_or_default();
    let port_str = settings.get("smtp_port").cloned().unwrap_or_default();
    let user = settings.get("smtp_user").cloned().unwrap_or_default();
    let pass = settings.get("smtp_pass").cloned().unwrap_or_default();
    
    // O Destino Mestre agora é a conta licenciada (O dono)
    let dest = settings.get("license_email").cloned().unwrap_or_else(|| user.clone());
    
    let cc = settings.get("smtp_cc").cloned().unwrap_or_default();
    let bcc = settings.get("smtp_bcc").cloned().unwrap_or_default();
    
    let client_name = settings.get("client_name").cloned().unwrap_or_else(|| "Cliente Enterprise".to_string());

    if host.is_empty() || user.is_empty() || dest.is_empty() { return Ok(()); }
    let port: u16 = port_str.parse().unwrap_or(587);

    let (status_color, status_bg, status_text) = if status.to_lowercase() == "success" { ("#27AE60", "#050709", "OPERAÇÃO CONCLUÍDA") } else if status.to_lowercase() == "error" { ("#ef4444", "#050709", "FALHA CRÍTICA") } else { ("#F59E0B", "#050709", "ALERTA DE SISTEMA") };
    let html_body = build_email_template(&client_name, status_color, status_bg, status_text, html_details);
    
    let email = build_multipart_message(&user, &dest, Some(&cc), Some(&bcc), subject, html_body, app_handle)?;

    let creds = Credentials::new(user, pass);
    let tls_params = TlsParameters::builder(host.clone()).build().unwrap();
    let mailer = SmtpTransport::builder_dangerous(&host).port(port).credentials(creds).tls(Tls::Required(tls_params)).build();
    let _ = mailer.send(&email); 
    Ok(())
}

#[command]
pub fn request_2fa_token(app_handle: AppHandle, email: String) -> Result<String, String> {
    let settings = get_all_settings(app_handle.clone())?;
    let host = settings.get("smtp_host").cloned().unwrap_or_default();
    let port_str = settings.get("smtp_port").cloned().unwrap_or_default();
    let user = settings.get("smtp_user").cloned().unwrap_or_default();
    let pass = settings.get("smtp_pass").cloned().unwrap_or_default();
    let client_name = settings.get("client_name").cloned().unwrap_or_else(|| "BINAVER".to_string());

    if host.is_empty() || user.is_empty() { return Err("Servidor SMTP não configurado. Por favor, configure o e-mail corporativo na aba de Alertas.".to_string()); }

    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos();
    let code = format!("{:06}", (nanos % 900000) + 100000); 

    let mut payload = HashMap::new();
    payload.insert("temp_2fa_code".to_string(), code.clone());
    let _ = update_settings(app_handle.clone(), payload);

    let html_details = format!(
        r#"<div style="text-align: center; margin-bottom: 10px;"><h3 class="title-font" style="color: #FFFFFF; font-size: 18px; font-weight: bold; margin-bottom: 15px;">Token de Segurança 2FA</h3><p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 25px;">Foi solicitada a ativação do software na sua conta. Utilize o código de verificação abaixo para autorizar o acesso.</p><div style="background-color: #121822; padding: 20px; border-radius: 6px; border: 1px dashed #F59E0B;"><span class="title-font" style="color: #F59E0B; font-weight: bold; font-size: 32px; letter-spacing: 10px;">{}</span></div><p style="color: #ef4444; font-size: 11px; margin-top: 15px;">Aviso: Se você não solicitou este código, ignore este e-mail.</p></div>"#, code
    );
    let html_body = build_email_template(&client_name, "#F59E0B", "#050709", "AUTENTICAÇÃO EXIGIDA", &html_details);
    
    // O Token vai sempre e apenas para o e-mail digitado no campo da tela, NUNCA copiando a empresa.
    let email_msg = build_multipart_message(&user, &email, None, None, "Código de Verificação BINAVER", html_body, &app_handle)?;

    let creds = Credentials::new(user, pass);
    let tls_params = TlsParameters::builder(host.clone()).build().map_err(|e| e.to_string())?;
    let port: u16 = port_str.parse().unwrap_or(587);
    let mailer = SmtpTransport::builder_dangerous(&host).port(port).credentials(creds).tls(Tls::Required(tls_params)).build();
    
    mailer.send(&email_msg).map_err(|e| format!("Falha de envio SMTP: {}", e))?;
    Ok("Token enviado com sucesso.".to_string())
}
fn build_webhook_payload(url: &str) -> serde_json::Value {
    let msg = "Kopher Shield: Conexão de Webhook estabelecida com sucesso!";
    if url.contains("discord.com") || url.contains("discordapp.com") {
        serde_json::json!({
            "username": "Kopher Shield",
            "embeds": [{ "title": "Kopher Shield", "description": msg, "color": 16096779 }]
        })
    } else if url.contains("hooks.slack.com") {
        serde_json::json!({
            "text": msg,
            "blocks": [
                { "type": "header", "text": { "type": "plain_text", "text": "Kopher Shield" } },
                { "type": "section", "text": { "type": "mrkdwn", "text": format!(":white_check_mark: {}", msg) } }
            ]
        })
    } else {
        serde_json::json!({
            "type": "message",
            "attachments": [{
                "contentType": "application/vnd.microsoft.card.adaptive",
                "contentUrl": null,
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        { "type": "TextBlock", "size": "Medium", "weight": "Bolder", "text": "Kopher Shield" },
                        { "type": "TextBlock", "text": msg, "wrap": true }
                    ]
                }
            }]
        })
    }
}

#[tauri::command]
pub async fn test_webhook_integration(url: String) -> Result<(), String> {
    let url = url.trim().to_string();
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("URL de webhook inválida: {}", e))?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("URL de webhook inválida: use http(s)://".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Falha ao iniciar cliente HTTP: {}", e))?;

    let response = client
        .post(parsed)
        .json(&build_webhook_payload(&url))
        .send()
        .await
        .map_err(|e| format!("Falha ao contatar o webhook: {}", e))?;

    let status = response.status();
    if status.is_success() {
        Ok(())
    } else {
        let body = response.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(200).collect();
        Err(format!("O webhook respondeu HTTP {}: {}", status.as_u16(), snippet))
    }
}