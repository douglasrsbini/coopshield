use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_db_path(app_handle: &AppHandle) -> PathBuf {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    path.push("com.binaver.kophershield");
    fs::create_dir_all(&path).unwrap_or(()); 

    path.push("kopher_shield.db");
    path
}

pub fn init_db(app_handle: &AppHandle) -> Result<()> {
    let db_path = get_db_path(app_handle);
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cloud_vaults (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            access_key TEXT NOT NULL,
            secret_key TEXT NOT NULL,
            bucket_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS backup_routines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            source_path TEXT NOT NULL,
            destination_vault TEXT NOT NULL,
            schedule TEXT NOT NULL,
            status TEXT DEFAULT 'Ativo',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // NOVA TABELA: Configurações do Sistema (Modelo Chave-Valor Escalonável)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS system_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL
        )",
        [],
    )?;

    // Injeta os valores padrão de fábrica caso a tabela esteja vazia
    conn.execute(
        "INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES 
        ('theme', 'dark'),
        ('accent_color', '#3b82f6'),
        ('license_status', 'unlicensed'),
        ('license_key', ''),
        ('smtp_host', ''),
        ('smtp_port', ''),
        ('smtp_user', ''),
        ('whatsapp_api', ''),
        ('whatsapp_token', ''),
        ('whatsapp_number', '')",
        []
    )?;

    Ok(())
}