use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_db_path(app_handle: &AppHandle) -> PathBuf {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    path.push("com.binaver.coopshield");
    fs::create_dir_all(&path).unwrap_or(()); 

    path.push("coopshield.db");
    path
}

pub fn init_db(app_handle: &AppHandle) -> Result<()> {
    let db_path = get_db_path(app_handle);
    let conn = Connection::open(db_path)?;

    // Criação base (Atualizada com a coluna endpoint_url para novas instalações)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cloud_vaults (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            access_key TEXT NOT NULL,
            secret_key TEXT NOT NULL,
            bucket_name TEXT NOT NULL,
            endpoint_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // MIGRAÇÃO DE DADOS (Estratégia Silenciosa)
    // Tenta adicionar a coluna para clientes antigos. Se já existir, a falha é ignorada em segurança.
    let _ = conn.execute("ALTER TABLE cloud_vaults ADD COLUMN endpoint_url TEXT", []);

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

    // Tabela de Configurações do Sistema
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
        ('language', 'pt-BR'),
        ('setup_completed', 'false'),
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

    // --- NOVA TABELA PARA O SININHO DE NOTIFICAÇÕES ---
    conn.execute(
        "CREATE TABLE IF NOT EXISTS system_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    Ok(())
}