use crate::database::sqlite::get_db_path;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Serialize, Deserialize)]
pub struct CloudVault {
    pub name: String,
    pub provider: String,
    pub access_key: String,
    pub secret_key: String,
    pub bucket_name: String,
}

#[tauri::command]
pub fn add_cloud_vault(app_handle: AppHandle, vault: CloudVault) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO cloud_vaults (name, provider, access_key, secret_key, bucket_name) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &vault.name,
            &vault.provider,
            &vault.access_key,
            &vault.secret_key,
            &vault.bucket_name,
        ),
    )
    .map_err(|e| e.to_string())?;

    Ok(format!(
        "Cofre '{}' conectado e gravado com sucesso no Kopher Shield!",
        vault.name
    ))
}

// ... (código existente acima)

#[tauri::command]
pub fn get_cloud_vaults(app_handle: AppHandle) -> Result<Vec<CloudVault>, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT name, provider, access_key, secret_key, bucket_name FROM cloud_vaults")
        .map_err(|e| e.to_string())?;

    let vault_iter = stmt
        .query_map([], |row| {
            Ok(CloudVault {
                name: row.get(0)?,
                provider: row.get(1)?,
                access_key: row.get(2)?,
                secret_key: row.get(3)?,
                bucket_name: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut vaults = Vec::new();
    for vault in vault_iter {
        vaults.push(vault.map_err(|e| e.to_string())?);
    }

    Ok(vaults)
}
