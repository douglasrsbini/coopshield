use tauri::{command, AppHandle, Manager};
use std::fs::{self, OpenOptions, File};
use std::io::{Read, Write};
use chrono::Local;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose, Engine as _};
use std::collections::HashSet;

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