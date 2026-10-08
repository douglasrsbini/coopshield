use crate::database::sqlite::get_db_path;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use aws_sdk_s3::config::{Credentials, Region, BehaviorVersion};
use aws_sdk_s3::Client;

#[derive(Serialize, Deserialize)]
pub struct CloudVault {
    pub id: Option<i64>,
    pub name: String,
    pub provider: String,
    pub access_key: String,
    pub secret_key: String,
    pub bucket_name: String,
    pub endpoint_url: Option<String>,
}

async fn build_s3_client(vault: &CloudVault) -> Client {
    let credentials = Credentials::new(
        &vault.access_key,
        &vault.secret_key,
        None,
        None,
        "kopher-shield",
    );

    let region = Region::new("us-east-1");

    let mut config_builder = aws_sdk_s3::config::Builder::new()
        .behavior_version(BehaviorVersion::latest())
        .credentials_provider(credentials)
        .region(region)
        .force_path_style(true);

    if let Some(endpoint) = &vault.endpoint_url {
        if !endpoint.is_empty() {
            let safe_endpoint = if endpoint.starts_with("http") {
                endpoint.clone()
            } else {
                format!("https://{}", endpoint)
            };
            config_builder = config_builder.endpoint_url(safe_endpoint);
        }
    }

    Client::from_conf(config_builder.build())
}

#[tauri::command]
pub async fn add_cloud_vault(app_handle: AppHandle, vault: CloudVault) -> Result<String, String> {
    let s3_client = build_s3_client(&vault).await;
    
    let connection_test = s3_client
        .head_bucket()
        .bucket(&vault.bucket_name)
        .send()
        .await;

    if let Err(e) = connection_test {
        let err_msg = format!("Credenciais rejeitadas ou Bucket inexistente. Detalhes: {:?}", e);
        return Err(err_msg);
    }

    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // CORRIGIDO: Adicionado endpoint_url no INSERT
    conn.execute(
        "INSERT INTO cloud_vaults (name, provider, access_key, secret_key, bucket_name, endpoint_url) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &vault.name,
            &vault.provider,
            &vault.access_key,
            &vault.secret_key,
            &vault.bucket_name,
            &vault.endpoint_url,
        ),
    )
    .map_err(|e| e.to_string())?;

    crate::commands::system::write_audit_log(
        &app_handle,
        "SUCCESS",
        &format!("Cofre '{}' conectado e autenticado na Nuvem com sucesso.", vault.name)
    );

    Ok(format!("Autenticado com sucesso! Cofre '{}' online.", vault.name))
}

#[tauri::command]
pub fn update_cloud_vault(app_handle: AppHandle, vault: CloudVault) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let id = vault.id.ok_or("ID não fornecido.")?;

    // CORRIGIDO: Adicionado endpoint_url no UPDATE
    conn.execute(
        "UPDATE cloud_vaults SET name = ?1, provider = ?2, access_key = ?3, secret_key = ?4, bucket_name = ?5, endpoint_url = ?6 WHERE id = ?7",
        (
            &vault.name,
            &vault.provider,
            &vault.access_key,
            &vault.secret_key,
            &vault.bucket_name,
            &vault.endpoint_url,
            id,
        ),
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("Configurações do cofre atualizadas."))
}

#[tauri::command]
pub fn delete_cloud_vault(app_handle: AppHandle, id: i64) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM cloud_vaults WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok("Conexão eliminada.".into())
}

#[tauri::command]
pub fn get_cloud_vaults(app_handle: AppHandle) -> Result<Vec<CloudVault>, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // CORRIGIDO: Selecionando o endpoint_url do banco
    let mut stmt = conn
        .prepare("SELECT id, name, provider, access_key, secret_key, bucket_name, endpoint_url FROM cloud_vaults")
        .map_err(|e| e.to_string())?;

    let vault_iter = stmt
        .query_map([], |row| {
            Ok(CloudVault {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                provider: row.get(2)?,
                access_key: row.get(3)?,
                secret_key: row.get(4)?,
                bucket_name: row.get(5)?,
                endpoint_url: row.get(6)?, // Lendo da coluna 6 
            })
        })
        .map_err(|e| e.to_string())?;

    let mut vaults = Vec::new();
    for vault in vault_iter {
        vaults.push(vault.map_err(|e| e.to_string())?);
    }

    Ok(vaults)
}