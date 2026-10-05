use tauri::{command, AppHandle, Manager};
use std::fs::{self, OpenOptions, File};
use std::io::{Read, Write};
use chrono::Local;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose, Engine as _};
use std::collections::HashSet;
use rusqlite::Connection;
use crate::database::sqlite::get_db_path;

#[derive(Serialize, Deserialize, Clone)]
pub struct AuditLog {
    pub timestamp: String,
    pub level: String, 
    pub message: String,
}

#[derive(Serialize)]
pub struct DashboardTelemetry {
    pub total_routines: usize,
    pub active_vaults: usize,
    pub protected_files: usize,
    pub last_execution: String,
    pub recent_audits: Vec<AuditLog>,
}

fn get_log_path(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_data_dir().expect("Falha ao resolver o diretório do sistema");
    if !app_dir.exists() {
        let _ = fs::create_dir_all(&app_dir);
    }
    app_dir.join("coopshield_audit.log")
}

pub fn write_audit_log(app_handle: &AppHandle, level: &str, message: &str) {
    let log_path = get_log_path(app_handle);
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let log_entry = format!("[{}] [{}] {}\n", now, level, message);

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = file.write_all(log_entry.as_bytes());
    }
}

#[command]
pub fn read_audit_logs(app_handle: AppHandle) -> Result<Vec<AuditLog>, String> {
    let log_path = get_log_path(&app_handle);
    
    if !log_path.exists() {
        return Ok(Vec::new()); 
    }

    let mut file = File::open(&log_path).map_err(|e| e.to_string())?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    
    for line in contents.lines() {
        if line.is_empty() { continue; }
        
        if let (Some(ts_end), Some(lvl_start), Some(lvl_end)) = (line.find("] ["), line.find("] ["), line.rfind("] ")) {
            let timestamp = line[1..ts_end].to_string();
            let level = line[lvl_start + 3..lvl_end].to_string();
            let message = line[lvl_end + 2..].to_string();
            
            logs.push(AuditLog { timestamp, level, message });
        }
    }

    Ok(logs)
}

#[command]
pub fn save_report_file(path: String, content: String, is_base64: bool) -> Result<String, String> {
    if is_base64 {
        let bytes = general_purpose::STANDARD.decode(&content).map_err(|e| e.to_string())?;
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    } else {
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
    }
    Ok("Relatório salvo com sucesso!".to_string())
}

#[command]
pub fn get_dashboard_telemetry(app_handle: AppHandle) -> Result<DashboardTelemetry, String> {
    let mut telemetry = DashboardTelemetry {
        total_routines: 0,
        active_vaults: 0, 
        protected_files: 0,
        last_execution: "Aguardando...".to_string(),
        recent_audits: Vec::new(),
    };

    let db_path = crate::database::sqlite::get_db_path(&app_handle);
    if let Ok(conn) = rusqlite::Connection::open(db_path) {
        if let Ok(c) = conn.query_row("SELECT COUNT(*) FROM backup_routines", [], |row| row.get::<_, i64>(0)) {
            telemetry.total_routines = c as usize;
        }

        if let Ok(mut stmt) = conn.prepare("SELECT destination_vault FROM backup_routines") {
            if let Ok(vault_iter) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                let mut unique_vaults = HashSet::new();
                
                for vault_result in vault_iter {
                    if let Ok(dest) = vault_result {
                        if dest.starts_with("Local: ") {
                            let local_path = dest.replace("Local: ", "");
                            let vault_dir = std::path::Path::new(&local_path).join("CoopShield_Vault");
                            
                            if unique_vaults.insert(vault_dir.clone()) {
                                if vault_dir.exists() {
                                    let count = walkdir::WalkDir::new(&vault_dir)
                                        .into_iter()
                                        .filter_map(|e| e.ok())
                                        .filter(|e| e.path().is_file() && e.path().extension().map_or(false, |ext| ext == "chunk"))
                                        .count();
                                    
                                    telemetry.protected_files += count;
                                }
                            }
                        }
                    }
                }
                telemetry.active_vaults = unique_vaults.len();
                // O fallback artificial de active_vaults foi removido com sucesso.
            }
        }
    }

    if let Ok(mut logs) = read_audit_logs(app_handle) {
        logs.reverse(); 
        
        if let Some(last_run) = logs.iter().find(|l| l.level == "SUCCESS" && l.message.contains("finalizada")) {
            telemetry.last_execution = last_run.timestamp.clone();
        }

        telemetry.recent_audits = logs.into_iter().take(2000).collect();
    }

    Ok(telemetry)
}

#[tauri::command]
pub fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

// ==========================================
// MOTOR DO SININHO DE NOTIFICAÇÕES (UI)
// ==========================================

#[derive(Serialize, Deserialize)]
pub struct SystemNotification {
    pub id: i64,
    pub title: String,
    pub message: String,
    pub type_str: String, // "info", "warning", "success", "error"
    pub is_read: bool,
    pub created_at: String,
}

#[command]
pub fn get_system_notifications(app_handle: AppHandle) -> Result<Vec<SystemNotification>, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Busca as notificações ordenadas da mais recente para a mais antiga (Limite 50)
    let mut stmt = conn
        .prepare("SELECT id, title, message, type, is_read, created_at FROM system_notifications ORDER BY created_at DESC LIMIT 50")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        let is_read_int: i32 = row.get(4)?;
        Ok(SystemNotification {
            id: row.get(0)?,
            title: row.get(1)?,
            message: row.get(2)?,
            type_str: row.get(3)?,
            is_read: is_read_int == 1,
            created_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut notifications = Vec::new();
    for row in rows {
        if let Ok(notif) = row {
            notifications.push(notif);
        }
    }

    Ok(notifications)
}

#[command]
pub fn mark_notifications_as_read(app_handle: AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // Transforma todas as notificações não lidas (0) em lidas (1)
    conn.execute("UPDATE system_notifications SET is_read = 1 WHERE is_read = 0", [])
        .map_err(|e| e.to_string())?;
        
    Ok(())
}

// Esta função não precisa do `#[command]` porque será usada internamente pelo motor Rust
pub fn emit_system_notification(app_handle: &AppHandle, title: &str, message: &str, notif_type: &str) {
    let db_path = get_db_path(app_handle);
    if let Ok(conn) = Connection::open(&db_path) {
        let _ = conn.execute(
            "INSERT INTO system_notifications (title, message, type, is_read) VALUES (?1, ?2, ?3, 0)",
            (title, message, notif_type),
        );
    }
}

#[tauri::command]
pub fn get_os_hostname() -> Result<String, String> {
    // Tenta pelas variáveis de ambiente padrão do SO (muito rápido e seguro)
    if let Ok(name) = std::env::var("COMPUTERNAME") { // Windows
        if !name.trim().is_empty() { return Ok(name.trim().to_string()); }
    }
    if let Ok(name) = std::env::var("HOSTNAME") { // Linux / macOS
        if !name.trim().is_empty() { return Ok(name.trim().to_string()); }
    }
    
    // Fallback executando o comando nativo do SO
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("hostname").output() {
            if let Ok(s) = String::from_utf8(output.stdout) {
                let trimmed = s.trim();
                if !trimmed.is_empty() { return Ok(trimmed.to_string()); }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = std::process::Command::new("uname").arg("-n").output() {
            if let Ok(s) = String::from_utf8(output.stdout) {
                let trimmed = s.trim();
                if !trimmed.is_empty() { return Ok(trimmed.to_string()); }
            }
        }
    }

    Ok("Dispositivo Desconhecido".to_string())
}