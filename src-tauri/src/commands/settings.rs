use tauri::{command, AppHandle};
use rusqlite::Connection;
use std::collections::HashMap;
use crate::database::sqlite::get_db_path;

#[command]
pub fn get_all_settings(app_handle: AppHandle) -> Result<HashMap<String, String>, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT setting_key, setting_value FROM system_settings")
        .map_err(|e| e.to_string())?;
        
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    let mut settings = HashMap::new();
    for row in rows {
        if let Ok((k, v)) = row {
            settings.insert(k, v);
        }
    }
    
    Ok(settings)
}

#[command]
pub fn update_settings(app_handle: AppHandle, payload: HashMap<String, String>) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // Usamos uma transação para garantir que salva tudo de uma vez
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    for (k, v) in payload {
        tx.execute(
            "INSERT INTO system_settings (setting_key, setting_value) VALUES (?1, ?2) 
             ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?2",
            (&k, &v),
        ).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;

    Ok("Configurações comerciais salvas com sucesso!".to_string())
}