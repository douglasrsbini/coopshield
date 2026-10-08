//src-tauri/src/commands/backup.rs
use tauri::{command, AppHandle, Emitter};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::database::sqlite::get_db_path;
use crate::engine::crypto::SecurityEngine;
use std::path::Path;
use rfd::FileDialog;
use walkdir::WalkDir;
use std::thread; 
use std::fs;
use std::io::Write;
use crate::commands::system::{write_audit_log, emit_system_notification};
use chrono::TimeZone;
use tauri_plugin_notification::NotificationExt;

use aws_sdk_s3::config::{Credentials, Region, BehaviorVersion};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::primitives::ByteStream;

#[derive(Serialize, Deserialize)]
pub struct Routine {
    pub id: Option<i64>,
    pub name: String,
    pub source_path: String,
    pub destination_vault: String,
    pub schedule: String,
}

#[derive(Serialize)]
pub struct BackupManifest {
    pub name: String,
    pub path: String,
    pub status: String,
    pub date_formatted: String,  
    pub original_source: String, 
    pub total_files: usize,      
}

#[derive(Clone, Serialize)]
pub struct ProgressPayload {
    pub routine_id: i64,
    pub progress: u8,
    pub status: String,
}

#[derive(Clone, Serialize)]
pub struct FailedPayload {
    pub routine_id: i64,
    pub reason: String,
}

#[derive(Clone, Serialize)]
pub struct CompletePayload {
    pub routine_id: i64,
}

#[derive(Clone, Serialize)]
pub struct RestoreProgressPayload {
    pub manifest_path: String,
    pub progress: u8,
    pub status: String,
}

#[derive(Clone, Serialize)]
pub struct RestoreCompletePayload {
    pub manifest_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileMetadata {
    pub relative_path: String, 
    pub chunk_hash: String,    
    pub nonce: String,         
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VaultManifest {
    pub timestamp: u64,
    pub original_source_path: String,
    pub encryption_key_hex: String, 
    pub total_files: usize,
    pub files: Vec<FileMetadata>,   
}

fn get_cloud_credentials(app: &AppHandle, name: &str) -> Result<(String, String, String, Option<String>), String> {
    let db_path = get_db_path(app);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT access_key, secret_key, bucket_name, endpoint_url FROM cloud_vaults WHERE name = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([name]).map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let ak: String = row.get(0).map_err(|e| e.to_string())?;
        let sk: String = row.get(1).map_err(|e| e.to_string())?;
        let bucket: String = row.get(2).map_err(|e| e.to_string())?;
        let ep: Option<String> = row.get(3).unwrap_or(None);

        Ok((ak, sk, bucket, ep))
    } else {
        Err(format!("Cofre Cloud '{}' não encontrado.", name))
    }
}

#[command]
pub fn add_routine(app_handle: AppHandle, routine: Routine) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO backup_routines (name, source_path, destination_vault, schedule) VALUES (?1, ?2, ?3, ?4)", (&routine.name, &routine.source_path, &routine.destination_vault, &routine.schedule)).map_err(|e| e.to_string())?;
    Ok(format!("Rotina '{}' criada com sucesso!", routine.name))
}

#[command]
pub fn update_routine(app_handle: AppHandle, routine: Routine) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let id = routine.id.ok_or("ID da rotina não fornecido para atualização.")?;
    conn.execute("UPDATE backup_routines SET name = ?1, source_path = ?2, destination_vault = ?3, schedule = ?4 WHERE id = ?5", (&routine.name, &routine.source_path, &routine.destination_vault, &routine.schedule, id)).map_err(|e| e.to_string())?;
    Ok(format!("Rotina '{}' atualizada com sucesso!", routine.name))
}

#[command]
pub fn delete_routine(app_handle: AppHandle, id: i64) -> Result<String, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM backup_routines WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok("Rotina eliminada com sucesso!".into())
}

#[command]
pub fn get_routines(app_handle: AppHandle) -> Result<Vec<Routine>, String> {
    let db_path = get_db_path(&app_handle);
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, source_path, destination_vault, schedule FROM backup_routines").map_err(|e| e.to_string())?;
    let routine_iter = stmt.query_map([], |row| {
        Ok(Routine { id: Some(row.get(0)?), name: row.get(1)?, source_path: row.get(2)?, destination_vault: row.get(3)?, schedule: row.get(4)? })
    }).map_err(|e| e.to_string())?;
    let mut routines = Vec::new();
    for r in routine_iter { routines.push(r.map_err(|e| e.to_string())?); }
    Ok(routines)
}

#[command]
pub fn select_folder_dialog() -> Result<String, String> {
    let folder = FileDialog::new().set_title("Selecionar Pasta de Origem para Backup").pick_folder();
    match folder {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("Nenhuma pasta selecionada.".into()),
    }
}

#[command]
pub fn run_test_backup(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() { return Err("Arquivo de origem não encontrado.".into()); }
    let key = SecurityEngine::generate_key();
    let mut chunk_count = 0;
    SecurityEngine::process_file_to_chunks(path, &key, |_chunk| { chunk_count += 1; Ok(()) })?;
    Ok(format!("Sucesso! Total de blocos compactados e cifrados: {}.", chunk_count))
}

#[command]
pub fn execute_backup_routine(app: AppHandle, routine_id: i64, routine_name: String, source_path: String, destination_vault: String) -> Result<String, String> {
    let path_str = source_path.clone();
    let dest_str = destination_vault.clone();
    let r_name = routine_name.clone();
    
    let path = Path::new(&path_str);
    if !path.exists() || !path.is_dir() {
        return Err("O diretório de origem não existe ou é inválido.".into());
    }

    let rt = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(e) => return Err(format!("Falha grave: Motor assíncrono falhou ao iniciar. {}", e))
    };

    thread::spawn(move || {
        let start_time = chrono::Local::now();
        let start_time_str = start_time.format("%d/%m/%Y às %H:%M:%S").to_string();

        let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: 2, status: "Inicializando motor de I/O...".to_string() });

        let root_path = Path::new(&path_str);
        write_audit_log(&app, "INFO", &format!("Rotina de Backup iniciada: '{}'", r_name));
        
        let key = SecurityEngine::generate_key();
        let total_files = walkdir::WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()).filter(|e| e.path().is_file()).count();

        let mut current_file = 0;
        let mut success_count = 0;
        let mut error_count = 0;

        let is_local = dest_str.starts_with("Local:");
        let is_cloud = dest_str.starts_with("Cloud: ");
        let mut vault_dir = std::path::PathBuf::new();
        let mut dest_label_detailed = String::new();
        
        let mut s3_client_opt = None;
        let mut s3_bucket_opt = None;

        if is_local {
            let local_path = dest_str.replace("Local: ", "").replace("Local:", "");
            vault_dir = Path::new(&local_path).join("CoopShield_Vault");
            dest_label_detailed = format!("Disco Local ({})", local_path);
            
            if let Err(e) = std::fs::create_dir_all(&vault_dir) {
                let err_msg = format!("Falha de I/O no disco: {}", e);
                let _ = app.emit("backup-error", err_msg.clone());
                let _ = app.emit("backup-failed", FailedPayload { routine_id, reason: err_msg.clone() });
                let _ = app.emit("backup-complete", CompletePayload { routine_id }); 
                
                let _ = emit_system_notification(&app, &format!("Falha Crítica - {}", r_name), &err_msg, "error");

                let relatorio_erro = format!("A rotina foi abortada devido a uma falha crítica de acesso ao disco.\n\n• Horário de Início: {}\n• Motivo da Falha: {}", start_time_str, e);
                let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA - {}", r_name), "error", &relatorio_erro);
                crate::commands::webhook::notify_failure(&app, "Backup", &r_name, &path_str, &dest_str, &err_msg);
                return; 
            }
        } else if is_cloud {
            let vault_name = dest_str.replace("Cloud: ", "");
            dest_label_detailed = format!("Nuvem (Cofre: {})", vault_name);
            let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: 5, status: "Conectando à Nuvem...".to_string() });
            
            match get_cloud_credentials(&app, &vault_name) {
                Ok((ak, sk, bucket, ep)) => {
                    let client = rt.block_on(async {
                        let creds = Credentials::new(&ak, &sk, None, None, "coopshield");
                        let mut cfg = aws_sdk_s3::config::Builder::new()
                            .behavior_version(BehaviorVersion::latest())
                            .credentials_provider(creds)
                            .region(Region::new("us-east-1"))
                            .force_path_style(true);

                        if let Some(endpoint) = ep {
                            if !endpoint.is_empty() {
                                let safe_ep = if endpoint.starts_with("http") { endpoint } else { format!("https://{}", endpoint) };
                                cfg = cfg.endpoint_url(safe_ep);
                            }
                        }
                        S3Client::from_conf(cfg.build())
                    });
                    
                    s3_client_opt = Some(client);
                    s3_bucket_opt = Some(bucket);
                },
                Err(e) => {
                    let err_msg = format!("Falha ao obter credenciais da nuvem: {:?}", e);
                    write_audit_log(&app, "ERROR", &err_msg); 
                    let _ = app.emit("backup-failed", FailedPayload { routine_id, reason: err_msg.clone() });
                    let _ = app.emit("backup-complete", CompletePayload { routine_id }); 
                    
                    let _ = emit_system_notification(&app, &format!("Falha Crítica - {}", r_name), &err_msg, "error");

                    let relatorio_erro = format!("A rotina foi abortada. O sistema não conseguiu ligar-se à nuvem.\n\n• Horário de Início: {}\n• Cofre Alvo: {}\n• Detalhes Técnicos: {:?}", start_time_str, vault_name, e);
                    let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA - {}", r_name), "error", &relatorio_erro);
                    crate::commands::webhook::notify_failure(&app, "Backup", &r_name, &path_str, &dest_str, &err_msg);
                    return;
                }
            }
        }

        let mut manifest_files = Vec::new();
        let mut upload_critical_error = None; 

        for entry in walkdir::WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            if upload_critical_error.is_some() { break; } 

            if entry.path().is_file() {
                current_file += 1;
                let percent = if total_files > 0 { ((current_file as f64 / total_files as f64) * 90.0) as u8 } else { 90 };
                let safe_percent = std::cmp::max(10, percent);
                let file_name = entry.file_name().to_string_lossy().to_string();
                
                let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: safe_percent, status: format!("Blindando: {}", file_name) });

                let relative_path = entry.path().strip_prefix(root_path).unwrap_or(entry.path()).to_string_lossy().replace("\\", "/"); 
                let app_clone = app.clone();
                let vault_dir_clone = vault_dir.clone();
                let relative_path_clone = relative_path.clone();
                let s3_client_clone = s3_client_opt.clone();
                let s3_bucket_clone = s3_bucket_opt.clone();

                let process_result = SecurityEngine::process_file_to_chunks(entry.path(), &key, |chunk| {
                    let chunk_name = format!("{}.chunk", chunk.hash);

                    if is_local {
                        let chunk_file_path = vault_dir_clone.join(&chunk_name);
                        if let Err(e) = std::fs::write(&chunk_file_path, &chunk.encrypted_data) {
                            write_audit_log(&app_clone, "ERROR", &format!("Falha no disco local: {:?}", e));
                            return Err(e.to_string());
                        }
                    } else if is_cloud {
                        if let (Some(s3), Some(bucket)) = (&s3_client_clone, &s3_bucket_clone) {
                            let body = ByteStream::from(chunk.encrypted_data.clone());
                            let upload_result = rt.block_on(async {
                                s3.put_object().bucket(bucket).key(&chunk_name).body(body).send().await
                            });
                            if let Err(_) = upload_result {
                                return Err("FALHA_DE_REDE".to_string());
                            }
                        }
                    }
                    manifest_files.push(FileMetadata { relative_path: relative_path_clone.clone(), chunk_hash: chunk.hash, nonce: hex::encode(chunk.nonce) });
                    Ok(())
                });

                match process_result {
                    Ok(_) => { success_count += 1; },
                    Err(e) => {
                        error_count += 1;
                        if e == "FALHA_DE_REDE" {
                            upload_critical_error = Some("Conexão com a nuvem perdida durante a transferência dos blocos.");
                        } else {
                            let _ = app.emit("backup-error", format!("Falha no arquivo {}: {}", file_name, e));
                        }
                    }
                }
            }
        }

        let end_time = chrono::Local::now();
        let end_time_str = end_time.format("%d/%m/%Y às %H:%M:%S").to_string();
        let duration_seconds = end_time.signed_duration_since(start_time).num_seconds();
        let duration_str = format!("{:02}h {:02}m {:02}s", duration_seconds / 3600, (duration_seconds % 3600) / 60, duration_seconds % 60);

        if let Some(err_msg) = upload_critical_error {
            let final_err = format!("A rotina '{}' falhou e foi abortada.\n\n• Início: {}\n• Término: {}\n• Motivo: {}", r_name, start_time_str, end_time_str, err_msg);
            write_audit_log(&app, "ERROR", &final_err);
            let _ = app.emit("backup-error", final_err.clone());
            let _ = app.emit("backup-failed", FailedPayload { routine_id, reason: err_msg.to_string() });
            let _ = app.emit("backup-complete", CompletePayload { routine_id });
            
            let _ = emit_system_notification(&app, &format!("Falha no Backup - {}", r_name), &err_msg, "error");

            let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA - {}", r_name), "error", &final_err);
            crate::commands::webhook::notify_failure(&app, "Backup", &r_name, &path_str, &dest_str, err_msg);
            return;
        }

        let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: 95, status: "Fechando o Cofre...".to_string() });

        let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        let safe_name: String = r_name.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' }).collect();
        let mut safe_name = safe_name.replace("__", "_");
        safe_name = safe_name.trim_matches('_').to_string();
        if safe_name.is_empty() { safe_name = "backup".to_string(); }

        let final_manifest = VaultManifest {
            timestamp, original_source_path: path_str.clone(), encryption_key_hex: hex::encode(&key), 
            total_files: manifest_files.len(), files: manifest_files.clone(), 
        };
        
        if let Ok(json_data) = serde_json::to_string_pretty(&final_manifest) {
            let manifest_filename = format!("{}_{}.kophershield", safe_name, timestamp);
            if is_local {
                let manifest_path = vault_dir.join(&manifest_filename);
                let _ = std::fs::write(&manifest_path, json_data);
            } else if is_cloud {
                if let (Some(s3), Some(bucket)) = (&s3_client_opt, &s3_bucket_opt) {
                    let body = ByteStream::from(json_data.into_bytes());
                    let _ = rt.block_on(async { s3.put_object().bucket(bucket).key(&manifest_filename).body(body).send().await });
                }
            }
        }

        let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: 100, status: "Concluído!".to_string() });
        let _ = app.emit("backup-complete", CompletePayload { routine_id });
        
        let taxa_sucesso = if total_files > 0 { (success_count as f64 / total_files as f64) * 100.0 } else { 0.0 };
        let taxa_falha = 100.0 - taxa_sucesso;
        let total_gerado = manifest_files.len();

        let bar_color = if success_count == 0 { "#ef4444" } else if error_count > 0 { "#F59E0B" } else { "#27AE60" };
        let fail_color = if error_count > 0 { "#ef4444" } else { "#64748B" };
        let status_type = if error_count > 0 { "warning" } else { "success" };

        let relatorio_email = format!(
            r#"
            <div style="margin-bottom: 25px;">
                <h3 class="title-font" style="color: #FFFFFF; font-size: 16px; margin-bottom: 15px; font-weight: bold; border-bottom: 2px solid #1E2A3B; padding-bottom: 8px;">Dados da Rotina</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold; width: 35%;">Identificação</th>
                        <td style="padding: 10px 0; color: #FFFFFF; font-weight: bold;">{}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Período</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">{} até {}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Duração</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">{}</td>
                    </tr>
                    <tr>
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Destino</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">{}</td>
                    </tr>
                </table>
            </div>

            <div style="background-color: #121822; padding: 25px; border-radius: 8px; border: 1px solid #1E2A3B;">
                <table style="width: 100%; margin-bottom: 10px; font-family: sans-serif;">
                    <tr>
                        <td style="font-size: 14px; color: #FFFFFF; font-weight: bold;">Taxa de Proteção</td>
                        <td style="font-size: 16px; color: {bar_color}; font-weight: bold; text-align: right;">{taxa_sucesso:.2}%</td>
                    </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <tr>
                        <td style="width: {taxa_sucesso:.0}%; background-color: {bar_color}; height: 8px; font-size: 1px; line-height: 1px;">&nbsp;</td>
                        <td style="width: {taxa_falha:.0}%; background-color: #1E2A3B; height: 8px; font-size: 1px; line-height: 1px;">&nbsp;</td>
                    </tr>
                </table>
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <tr>
                        <td style="color: #94A3B8; padding: 8px 0; border-bottom: 1px solid #1E2A3B; font-weight: bold;">Arquivos Processados</td>
                        <td style="text-align: right; color: #27AE60; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #1E2A3B;">{}</td>
                    </tr>
                    <tr>
                        <td style="color: #94A3B8; padding: 8px 0; border-bottom: 1px solid #1E2A3B; font-weight: bold;">Falhas / Ignorados</td>
                        <td style="text-align: right; color: {fail_color}; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #1E2A3B;">{}</td>
                    </tr>
                    <tr>
                        <td style="color: #94A3B8; padding: 8px 0; font-weight: bold;">Blocos Criptográficos Gerados</td>
                        <td style="text-align: right; color: #FFFFFF; font-weight: bold; padding: 8px 0;">{}</td>
                    </tr>
                </table>
            </div>
            "#,
            r_name, start_time_str, end_time_str, duration_str, dest_label_detailed, success_count, error_count, total_gerado
        );

        if error_count > 0 {
            let msg = format!("Rotina '{}' com alertas: {} arquivos blindados, mas {} falharam.", r_name, success_count, error_count);
            write_audit_log(&app, "WARNING", &msg);
            let _ = app.notification().builder().title("Kopher Shield - Aviso").body(&msg).show();
            
            // Grava no histórico do Sininho (Aviso)
            let _ = emit_system_notification(&app, &format!("Aviso de Backup - {}", r_name), &msg, "warning");
        } else {
            let msg = format!("Rotina '{}' finalizada! {} arquivos seguros.", r_name, success_count);
            write_audit_log(&app, "SUCCESS", &msg);
            let _ = app.notification().builder().title("Kopher Shield - Operação Concluída").body(&msg).show();
            
            // Grava no histórico do Sininho (Sucesso)
            let _ = emit_system_notification(&app, &format!("Backup Concluído - {}", r_name), &msg, "success");
        }
        
        let _ = crate::commands::settings::send_email_alert(&app, &format!("Auditoria Kopher Shield: {}", r_name), status_type, &relatorio_email);
        crate::commands::webhook::dispatch(&app, crate::commands::webhook::WebhookEvent {
            operation: "Backup".to_string(), routine: r_name.to_string(),
            level: if error_count > 0 { crate::commands::webhook::WebhookLevel::Warning } else { crate::commands::webhook::WebhookLevel::Success },
            origin: path_str.to_string(), destination: dest_label_detailed.to_string(), duration: Some(duration_str.clone()),
            details: vec![("Arquivos processados".to_string(), success_count.to_string()), ("Falhas / ignorados".to_string(), error_count.to_string()), ("Taxa de proteção".to_string(), format!("{:.2}%", taxa_sucesso)), ("Blocos gerados".to_string(), total_gerado.to_string())],
        });
    });

    Ok("A rotina foi acionada. O processamento começou.".to_string())
}

#[tauri::command]
pub fn scan_local_vault(vault_path: String) -> Result<Vec<BackupManifest>, String> {
    let mut manifests = Vec::new();

    for entry in WalkDir::new(&vault_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        
        if path.is_file() && path.extension().map_or(false, |ext| ext == "coopshield" || ext == "kophershield") {
            let mut date_formatted = "Data Desconhecida".to_string();
            let mut original_source = "Origem Desconhecida".to_string();
            let mut total_files = 0;

            if let Ok(content) = fs::read_to_string(path) {
                if let Ok(manifest) = serde_json::from_str::<VaultManifest>(&content) {
                    original_source = manifest.original_source_path;
                    total_files = manifest.total_files;
                    
                    if let Some(dt) = chrono::Local.timestamp_opt(manifest.timestamp as i64, 0).single() {
                        date_formatted = dt.format("%d/%m/%Y às %H:%M").to_string();
                    }
                }
            }

            let raw_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let clean_name = raw_name.split('_').filter(|p| !p.chars().all(char::is_numeric)).collect::<Vec<&str>>().join(" ").replace(".kophershield", "").replace(".coopshield", "");
            
            let clean_name = if !clean_name.is_empty() {
                let mut chars = clean_name.chars();
                match chars.next() { None => String::new(), Some(f) => f.to_uppercase().collect::<String>() + chars.as_str() }
            } else {
                "Backup Desconhecido".to_string()
            };

            manifests.push(BackupManifest {
                name: clean_name, path: path.to_string_lossy().to_string(), status: "Íntegro (ZSTD+AES256)".to_string(),
                date_formatted, original_source, total_files,
            });
        }
    }

    manifests.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(manifests)
}

#[command]
pub fn scan_cloud_vault(app: AppHandle, vault_name: String) -> Result<Vec<BackupManifest>, String> {
    let (ak, sk, bucket, ep) = get_cloud_credentials(&app, &vault_name)?;
    let ep_scan = ep.clone();

    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    
    let manifests = rt.block_on(async {
        let creds = Credentials::new(&ak, &sk, None, None, "coopshield");
        let mut cfg = aws_sdk_s3::config::Builder::new()
            .behavior_version(BehaviorVersion::latest())
            .credentials_provider(creds)
            .region(Region::new("us-east-1"))
            .force_path_style(true);

        if let Some(endpoint) = ep_scan {
            if !endpoint.is_empty() {
                let safe_ep = if endpoint.starts_with("http") { endpoint } else { format!("https://{}", endpoint) };
                cfg = cfg.endpoint_url(safe_ep);
            }
        }
        let s3 = S3Client::from_conf(cfg.build());

        let mut results = Vec::new();
        let list_output = match s3.list_objects_v2().bucket(&bucket).send().await {
            Ok(out) => out,
            Err(_) => return results,
        };

        if let Some(contents) = list_output.contents {
            for obj in contents {
                if let Some(key) = obj.key {
                    if key.ends_with(".coopshield") || key.ends_with(".kophershield") {
                        let get_output = match s3.get_object().bucket(&bucket).key(&key).send().await {
                            Ok(res) => res,
                            Err(_) => continue,
                        };

                        let data = match get_output.body.collect().await {
                            Ok(bytes) => bytes.into_bytes(),
                            Err(_) => continue,
                        };

                        if let Ok(content_str) = String::from_utf8(data.to_vec()) {
                            if let Ok(manifest) = serde_json::from_str::<VaultManifest>(&content_str) {
                                let mut date_formatted = "Data Desconhecida".to_string();
                                if let Some(dt) = chrono::Local.timestamp_opt(manifest.timestamp as i64, 0).single() {
                                    date_formatted = dt.format("%d/%m/%Y às %H:%M").to_string();
                                }

                                let clean_name = key.split('_').filter(|p| !p.chars().all(char::is_numeric)).collect::<Vec<&str>>().join(" ").replace(".kophershield", "").replace(".coopshield", "");
                                let clean_name = if !clean_name.is_empty() {
                                    let mut chars = clean_name.chars();
                                    match chars.next() { None => "Backup Cloud".to_string(), Some(f) => f.to_uppercase().collect::<String>() + chars.as_str() }
                                } else {
                                    "Backup Cloud".to_string()
                                };

                                results.push(BackupManifest {
                                    name: clean_name,
                                    path: key.clone(),
                                    status: "Íntegro na Nuvem (S3)".to_string(),
                                    date_formatted,
                                    original_source: manifest.original_source_path,
                                    total_files: manifest.total_files,
                                });
                            }
                        }
                    }
                }
            }
        }
        results
    });

    Ok(manifests)
}

#[command]
pub fn execute_cloud_restore(app: AppHandle, vault_name: String, manifest_key: String, restore_path: String) -> Result<String, String> {
    let v_name = vault_name.clone();
    let m_key = manifest_key.clone();
    let r_path = restore_path.clone();

    thread::spawn(move || {
        let start_time = chrono::Local::now();
        let start_time_str = start_time.format("%d/%m/%Y às %H:%M:%S").to_string();

        write_audit_log(&app, "INFO", &format!("Iniciando restauro do cofre Cloud '{}' para a pasta destino.", v_name));

        let (ak, sk, bucket, ep) = match get_cloud_credentials(&app, &v_name) {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Erro de credenciais S3: {}", e);
                let _ = app.emit("restore-error", err_msg.clone());
                let _ = emit_system_notification(&app, &format!("Falha no Restauro - {}", v_name), &err_msg, "error");
                let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", v_name), "error", &err_msg);
                crate::commands::webhook::notify_failure(&app, "Restauro Cloud", &v_name, &v_name, &r_path, &err_msg);
                return;
            }
        };

        let ep_manifest = ep.clone();
        let ep_chunks = ep.clone();
        let ak_m = ak.clone();
        let sk_m = sk.clone();
        let bucket_m = bucket.clone();
        
        let ak_c = ak.clone();
        let sk_c = sk.clone();
        let bucket_c = bucket.clone();

        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(_) => return,
        };

        let manifest_content = rt.block_on(async {
            let creds = Credentials::new(&ak_m, &sk_m, None, None, "coopshield");
            let mut cfg = aws_sdk_s3::config::Builder::new()
                .behavior_version(BehaviorVersion::latest())
                .credentials_provider(creds)
                .region(Region::new("us-east-1"))
                .force_path_style(true);

            if let Some(endpoint) = ep_manifest {
                if !endpoint.is_empty() {
                    let safe_ep = if endpoint.starts_with("http") { endpoint } else { format!("https://{}", endpoint) };
                    cfg = cfg.endpoint_url(safe_ep);
                }
            }
            let s3 = S3Client::from_conf(cfg.build());

            let get_obj = match s3.get_object().bucket(&bucket_m).key(&m_key).send().await {
                Ok(res) => res,
                Err(e) => {
                    let err_msg = format!("Erro ao descarregar manifesto da Nuvem: {:?}", e);
                    let _ = app.emit("restore-error", err_msg.clone());
                    let _ = emit_system_notification(&app, &format!("Falha no Restauro - {}", v_name), &err_msg, "error");
                    let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", v_name), "error", &err_msg);
                    crate::commands::webhook::notify_failure(&app, "Restauro Cloud", &v_name, &v_name, &r_path, &err_msg);
                    return None;
                }
            };

            let bytes = match get_obj.body.collect().await {
                Ok(b) => b.into_bytes(),
                Err(_) => return None,
            };

            String::from_utf8(bytes.to_vec()).ok()
        });

        let content = match manifest_content {
            Some(c) => c,
            None => {
                let err_msg = "Falha ao obter o manifesto da nuvem.";
                let _ = app.emit("restore-error", err_msg.to_string());
                let _ = emit_system_notification(&app, "Falha Crítica no Restauro", err_msg, "error");
                let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", v_name), "error", err_msg);
                crate::commands::webhook::notify_failure(&app, "Restauro Cloud", &v_name, &v_name, &r_path, err_msg);
                return;
            }
        };

        let manifest: VaultManifest = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(_) => {
                 let err_msg = "Falha ao analisar o manifesto (JSON inválido).";
                 let _ = app.emit("restore-error", err_msg.to_string());
                 let _ = emit_system_notification(&app, "Falha no Restauro", err_msg, "error");
                 let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", v_name), "error", err_msg);
                 crate::commands::webhook::notify_failure(&app, "Restauro Cloud", &v_name, &v_name, &r_path, err_msg);
                 return;
            }
        };

        let encryption_key = match hex::decode(&manifest.encryption_key_hex) {
            Ok(k) => k,
            Err(_) => {
                let err_msg = "Falha ao descodificar a chave de encriptação.";
                let _ = app.emit("restore-error", err_msg.to_string());
                let _ = emit_system_notification(&app, "Falha no Restauro", err_msg, "error");
                let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", v_name), "error", err_msg);
                crate::commands::webhook::notify_failure(&app, "Restauro Cloud", &v_name, &v_name, &r_path, err_msg);
                return;
            }
        };

        let dest_dir = Path::new(&r_path).join(format!("KopherShield_Cloud_Restaurado_{}", manifest.timestamp));
        if let Err(e) = fs::create_dir_all(&dest_dir) {
            let err_msg = format!("Erro ao criar pasta destino: {}", e);
            let _ = app.emit("restore-error", err_msg.clone());
            let _ = emit_system_notification(&app, "Falha no Restauro", &err_msg, "error");
            let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", v_name), "error", &err_msg);
            crate::commands::webhook::notify_failure(&app, "Restauro Cloud", &v_name, &v_name, &r_path, &err_msg);
            return;
        }

        let total_chunks = manifest.files.len();
        let mut current_chunk = 0;
        let mut success_count = 0;
        let mut error_count = 0;

        let mut current_open_path: Option<String> = None;
        let mut current_open_file: Option<std::fs::File> = None;

        for file_meta in manifest.files {
            current_chunk += 1;
            let percent = if total_chunks > 0 { ((current_chunk as f64 / total_chunks as f64) * 95.0) as u8 } else { 95 };

            let _ = app.emit("restore-progress", RestoreProgressPayload {
                manifest_path: m_key.clone(), 
                progress: std::cmp::max(1, percent), 
                status: format!("Baixando: {}", file_meta.relative_path),
            });

            let chunk_filename = format!("{}.chunk", file_meta.chunk_hash);
            let ep_chunk_iter = ep_chunks.clone();
            
            let mut retries = 0;
            let mut encrypted_data_opt = None;

            while retries < 3 && encrypted_data_opt.is_none() {
                encrypted_data_opt = rt.block_on(async {
                    let creds = Credentials::new(&ak_c, &sk_c, None, None, "coopshield");
                    let mut cfg = aws_sdk_s3::config::Builder::new()
                        .behavior_version(BehaviorVersion::latest())
                        .credentials_provider(creds)
                        .region(Region::new("us-east-1"))
                        .force_path_style(true);

                    if let Some(ref endpoint) = ep_chunk_iter {
                        if !endpoint.is_empty() {
                            let safe_ep = if endpoint.starts_with("http") { endpoint.clone() } else { format!("https://{}", endpoint) };
                            cfg = cfg.endpoint_url(safe_ep);
                        }
                    }
                    let s3 = S3Client::from_conf(cfg.build());

                    match s3.get_object().bucket(&bucket_c).key(&chunk_filename).send().await {
                        Ok(res) => res.body.collect().await.map(|b| b.into_bytes().to_vec()).ok(),
                        Err(e) => {
                            eprintln!("Erro ao descarregar bloco {}: {:?}", chunk_filename, e);
                            None
                        },
                    }
                });

                if encrypted_data_opt.is_none() {
                    retries += 1;
                    thread::sleep(std::time::Duration::from_millis(500 * retries as u64)); 
                }
            }

            let encrypted_data = match encrypted_data_opt {
                Some(d) => d,
                None => {
                    error_count += 1;
                    eprintln!("Falha crítica no bloco: {}", chunk_filename);
                    continue; 
                }
            };

            let nonce_bytes = match hex::decode(&file_meta.nonce) { Ok(n) => n, Err(_) => continue };

            match SecurityEngine::decrypt_and_decompress_chunk(&encrypted_data, &encryption_key, &nonce_bytes) {
                Ok(plaintext) => {
                    let target_file_path = dest_dir.join(&file_meta.relative_path);
                    
                    if current_open_path.as_deref() != Some(file_meta.relative_path.as_str()) {
                        if let Some(parent_dir) = target_file_path.parent() { let _ = fs::create_dir_all(parent_dir); }
                        let mut options = fs::OpenOptions::new();
                        options.create(true).write(true).truncate(true);

                        let file_handle = options.open(&target_file_path).ok();
                        current_open_file = file_handle;
                        current_open_path = Some(file_meta.relative_path.clone());
                    }

                    if let Some(file) = &mut current_open_file {
                        if file.write_all(&plaintext).is_err() {
                            error_count += 1;
                        } else {
                            success_count += 1;
                        }
                    }
                },
                Err(e) => { 
                    eprintln!("Erro de descriptografia no bloco {}: {:?}", chunk_filename, e);
                    error_count += 1; 
                }
            }
        }

        let end_time = chrono::Local::now();
        let end_time_str = end_time.format("%d/%m/%Y às %H:%M:%S").to_string();
        let duration_seconds = end_time.signed_duration_since(start_time).num_seconds();
        let duration_str = format!("{:02}h {:02}m {:02}s", duration_seconds / 3600, (duration_seconds % 3600) / 60, duration_seconds % 60);

        let taxa_integridade = if total_chunks > 0 { (success_count as f64 / total_chunks as f64) * 100.0 } else { 0.0 };
        let taxa_falha = 100.0 - taxa_integridade;

        let relatorio_path = dest_dir.join("Relatorio_Auditoria.txt");
        let relatorio_content = format!("KOPHER SHIELD - DADOS RESTAURADOS DA NUVEM\n\nOs seus ficheiros originais foram remontados a partir de {} blocos (chunks) encriptados.\nBlocos reconstruídos: {}\nFalhas em blocos: {}\n", total_chunks, success_count, error_count);
        let _ = fs::write(&relatorio_path, relatorio_content);

        let bar_color = if success_count == 0 { "#ef4444" } else if error_count > 0 { "#F59E0B" } else { "#27AE60" };
        let fail_color = if error_count > 0 { "#ef4444" } else { "#64748B" };
        let status_type = if error_count > 0 { "warning" } else { "success" };

        let clean_name = m_key.split('_').filter(|p| !p.chars().all(char::is_numeric)).collect::<Vec<&str>>().join(" ").replace(".kophershield", "").replace(".coopshield", "");

        let relatorio_email = format!(
            r#"
            <div style="margin-bottom: 25px;">
                <h3 class="title-font" style="color: #FFFFFF; font-size: 16px; margin-bottom: 15px; font-weight: bold; border-bottom: 2px solid #1E2A3B; padding-bottom: 8px;">Auditoria de Restauração</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold; width: 35%;">Manifesto Localizado</th>
                        <td style="padding: 10px 0; color: #FFFFFF; font-weight: bold; font-family: monospace; font-size: 11px;">{clean_name}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Origem</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">Nuvem ({v_name})</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Período do Restauro</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">{start_time_str} até {end_time_str}</td>
                    </tr>
                    <tr>
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Tempo Total</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">{duration_str}</td>
                    </tr>
                </table>
            </div>

            <div style="background-color: #121822; padding: 25px; border-radius: 8px; border: 1px solid #1E2A3B;">
                <table style="width: 100%; margin-bottom: 10px; font-family: sans-serif;">
                    <tr>
                        <td style="font-size: 14px; color: #FFFFFF; font-weight: bold;">Taxa de Integridade</td>
                        <td style="font-size: 16px; color: {bar_color}; font-weight: bold; text-align: right;">{taxa_integridade:.2}%</td>
                    </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <tr>
                        <td style="width: {taxa_integridade:.0}%; background-color: {bar_color}; height: 8px; font-size: 1px; line-height: 1px;">&nbsp;</td>
                        <td style="width: {taxa_falha:.0}%; background-color: #1E2A3B; height: 8px; font-size: 1px; line-height: 1px;">&nbsp;</td>
                    </tr>
                </table>
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <tr>
                        <td style="color: #94A3B8; padding: 8px 0; border-bottom: 1px solid #1E2A3B; font-weight: bold;">Blocos Remontados</td>
                        <td style="text-align: right; color: #27AE60; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #1E2A3B;">{success_count}</td>
                    </tr>
                    <tr>
                        <td style="color: #94A3B8; padding: 8px 0; font-weight: bold;">Blocos Corrompidos/Falhos</td>
                        <td style="text-align: right; color: {fail_color}; font-weight: bold; padding: 8px 0;">{error_count}</td>
                    </tr>
                </table>
            </div>
            "#
        );

        let _ = app.emit("restore-progress", RestoreProgressPayload { manifest_path: m_key.clone(), progress: 100, status: "Restauro Cloud Concluído!".to_string() });
        let _ = app.emit("restore-complete", RestoreCompletePayload { manifest_path: m_key.clone() });
        
        if error_count > 0 {
            let msg = format!("Restauro concluído com alertas. {} de {} blocos reconstruídos. ({} falhas).", success_count, total_chunks, error_count);
            write_audit_log(&app, "WARNING", &msg);
            let _ = app.notification().builder().title("Aviso no Restauro").body(&msg).show();
            
            let _ = emit_system_notification(&app, "Aviso no Restauro Cloud", &msg, "warning");
        } else {
            let msg = format!("Restauro bem-sucedido! Ficheiros originais remontados a partir de {} blocos.", total_chunks);
            write_audit_log(&app, "SUCCESS", &msg);
            let _ = app.notification().builder().title("Recuperação Cloud Concluída").body(&msg).show();
            
            let _ = emit_system_notification(&app, "Restauro Cloud Concluído", &msg, "success");
        }

        let _ = crate::commands::settings::send_email_alert(&app, &format!("Auditoria de Recuperação: {}", clean_name), status_type, &relatorio_email);
        crate::commands::webhook::dispatch(&app, crate::commands::webhook::WebhookEvent {
            operation: "Restauro Cloud".to_string(), routine: clean_name.to_string(),
            level: if error_count > 0 { crate::commands::webhook::WebhookLevel::Warning } else { crate::commands::webhook::WebhookLevel::Success },
            origin: v_name.to_string(), destination: r_path.to_string(), duration: Some(duration_str.clone()),
            details: vec![("Blocos remontados".to_string(), format!("{} de {}", success_count, total_chunks)), ("Blocos com falha".to_string(), error_count.to_string()), ("Integridade".to_string(), format!("{:.2}%", taxa_integridade))],
        });
    });

    Ok("Processo de recuperação de desastres (Cloud) iniciado!".to_string())
}

#[command]
pub fn execute_restore(app: AppHandle, manifest_path: String, restore_path: String) -> Result<String, String> {
    let m_path_str = manifest_path.clone();
    let r_path_str = restore_path.clone();
    
    thread::spawn(move || {
        let start_time = chrono::Local::now();
        let start_time_str = start_time.format("%d/%m/%Y às %H:%M:%S").to_string();

        let file_name = Path::new(&m_path_str).file_name().unwrap_or_default().to_string_lossy();
        let clean_name = file_name.split('_').filter(|p| !p.chars().all(char::is_numeric)).collect::<Vec<&str>>().join(" ").replace(".kophershield", "").replace(".coopshield", "");
        let clean_name = if clean_name.is_empty() { "Desconhecido".to_string() } else { clean_name };

        write_audit_log(&app, "INFO", &format!("Iniciando restauro do cofre '{}' para a pasta destino.", clean_name));
        
        let manifest_content = match fs::read_to_string(&m_path_str) {
            Ok(content) => content,
            Err(e) => {
                let err_msg = format!("Falha ao ler o manifesto: {}", e);
                let _ = app.emit("restore-error", err_msg.clone());
                let _ = emit_system_notification(&app, &format!("Falha no Restauro - {}", clean_name), &err_msg, "error");
                let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", clean_name), "error", &err_msg);
                crate::commands::webhook::notify_failure(&app, "Restauro", &clean_name, &m_path_str, &r_path_str, &err_msg);
                return;
            }
        };

        let manifest: VaultManifest = match serde_json::from_str(&manifest_content) {
            Ok(m) => m,
            Err(e) => {
                let err_msg = format!("Manifesto corrompido: {}", e);
                let _ = app.emit("restore-error", err_msg.clone());
                let _ = emit_system_notification(&app, &format!("Falha no Restauro - {}", clean_name), &err_msg, "error");
                let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", clean_name), "error", &err_msg);
                crate::commands::webhook::notify_failure(&app, "Restauro", &clean_name, &m_path_str, &r_path_str, &err_msg);
                return;
            }
        };

        let encryption_key = match hex::decode(&manifest.encryption_key_hex) {
            Ok(k) => k,
            Err(_) => {
                let err_msg = "Falha ao extrair a chave de segurança.";
                let _ = app.emit("restore-error", err_msg.to_string());
                let _ = emit_system_notification(&app, "Falha no Restauro", err_msg, "error");
                let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", clean_name), "error", err_msg);
                crate::commands::webhook::notify_failure(&app, "Restauro", &clean_name, &m_path_str, &r_path_str, err_msg);
                return;
            }
        };

        let vault_dir = Path::new(&m_path_str).parent().unwrap_or(Path::new(""));
        let dest_dir = Path::new(&r_path_str).join(format!("KopherShield_Restaurado_{}", manifest.timestamp));
        if let Err(e) = fs::create_dir_all(&dest_dir) {
            let err_msg = format!("Acesso negado ao criar pasta de destino: {}", e);
            let _ = app.emit("restore-error", err_msg.clone());
            let _ = emit_system_notification(&app, "Falha no Restauro", &err_msg, "error");
            let _ = crate::commands::settings::send_email_alert(&app, &format!("Kopher Shield: FALHA CRÍTICA NO RESTAURO - {}", clean_name), "error", &err_msg);
            crate::commands::webhook::notify_failure(&app, "Restauro", &clean_name, &m_path_str, &r_path_str, &err_msg);
            return;
        }

        let total_chunks = manifest.files.len();
        let mut current_chunk = 0;
        let mut success_count = 0;
        let mut error_count = 0;

        let mut current_open_path: Option<String> = None;
        let mut current_open_file: Option<std::fs::File> = None;

        for file_meta in manifest.files {
            current_chunk += 1;
            let percent = if total_chunks > 0 { ((current_chunk as f64 / total_chunks as f64) * 95.0) as u8 } else { 95 };

            let _ = app.emit("restore-progress", RestoreProgressPayload {
                manifest_path: m_path_str.clone(), progress: std::cmp::max(1, percent), status: format!("Descompactando: {}", file_meta.relative_path),
            });

            let chunk_path = vault_dir.join(format!("{}.chunk", file_meta.chunk_hash));
            
            let encrypted_data = match fs::read(&chunk_path) {
                Ok(data) => data,
                Err(_) => {
                    error_count += 1;
                    continue;
                }
            };

            let nonce_bytes = match hex::decode(&file_meta.nonce) { Ok(n) => n, Err(_) => continue };

            match SecurityEngine::decrypt_and_decompress_chunk(&encrypted_data, &encryption_key, &nonce_bytes) {
                Ok(plaintext) => {
                    let target_file_path = dest_dir.join(&file_meta.relative_path);
                    
                    if current_open_path.as_deref() != Some(file_meta.relative_path.as_str()) {
                        if let Some(parent_dir) = target_file_path.parent() { let _ = fs::create_dir_all(parent_dir); }
                        let mut options = fs::OpenOptions::new();
                        options.create(true).write(true).truncate(true);

                        let mut retries = 0;
                        let mut file_handle = None;

                        while retries < 5 {
                            match options.open(&target_file_path) {
                                Ok(f) => { file_handle = Some(f); break; },
                                Err(_) => {
                                    retries += 1;
                                    thread::sleep(std::time::Duration::from_millis(50 * retries as u64));
                                    if retries == 5 { error_count += 1; }
                                }
                            }
                        }

                        current_open_file = file_handle;
                        current_open_path = Some(file_meta.relative_path.clone());
                    }

                    if let Some(file) = &mut current_open_file {
                        if let Err(_) = file.write_all(&plaintext) {
                            error_count += 1;
                        } else {
                            success_count += 1;
                        }
                    }
                },
                Err(_) => { error_count += 1; }
            }
        }

        let end_time = chrono::Local::now();
        let end_time_str = end_time.format("%d/%m/%Y às %H:%M:%S").to_string();
        let duration_seconds = end_time.signed_duration_since(start_time).num_seconds();
        let duration_str = format!("{:02}h {:02}m {:02}s", duration_seconds / 3600, (duration_seconds % 3600) / 60, duration_seconds % 60);

        let taxa_integridade = if total_chunks > 0 { (success_count as f64 / total_chunks as f64) * 100.0 } else { 0.0 };
        let taxa_falha = 100.0 - taxa_integridade;

        let relatorio_path = dest_dir.join("Relatorio_Auditoria.txt");
        let relatorio_content = format!("KOPHER SHIELD - DADOS RESTAURADOS\n\nForam descompactados e reconstruídos ficheiros a partir de {} blocos.\nErros: {}\n", success_count, error_count);
        let _ = fs::write(&relatorio_path, relatorio_content);

        let bar_color = if success_count == 0 { "#ef4444" } else if error_count > 0 { "#F59E0B" } else { "#27AE60" };
        let fail_color = if error_count > 0 { "#ef4444" } else { "#64748B" };
        let status_type = if error_count > 0 { "warning" } else { "success" };

        let relatorio_email = format!(
            r#"
            <div style="margin-bottom: 25px;">
                <h3 class="title-font" style="color: #FFFFFF; font-size: 16px; margin-bottom: 15px; font-weight: bold; border-bottom: 2px solid #1E2A3B; padding-bottom: 8px;">Auditoria de Restauração</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold; width: 35%;">Manifesto Localizado</th>
                        <td style="padding: 10px 0; color: #FFFFFF; font-weight: bold; font-family: monospace; font-size: 11px;">{clean_name}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Origem</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">Disco Local</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #1E2A3B;">
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Período do Restauro</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">{start_time_str} até {end_time_str}</td>
                    </tr>
                    <tr>
                        <th style="padding: 10px 0; color: #94A3B8; font-weight: bold;">Tempo Total</th>
                        <td style="padding: 10px 0; color: #FFFFFF;">{duration_str}</td>
                    </tr>
                </table>
            </div>

            <div style="background-color: #121822; padding: 25px; border-radius: 8px; border: 1px solid #1E2A3B;">
                <table style="width: 100%; margin-bottom: 10px; font-family: sans-serif;">
                    <tr>
                        <td style="font-size: 14px; color: #FFFFFF; font-weight: bold;">Taxa de Integridade</td>
                        <td style="font-size: 16px; color: {bar_color}; font-weight: bold; text-align: right;">{taxa_integridade:.2}%</td>
                    </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <tr>
                        <td style="width: {taxa_integridade:.0}%; background-color: {bar_color}; height: 8px; font-size: 1px; line-height: 1px;">&nbsp;</td>
                        <td style="width: {taxa_falha:.0}%; background-color: #1E2A3B; height: 8px; font-size: 1px; line-height: 1px;">&nbsp;</td>
                    </tr>
                </table>
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <tr>
                        <td style="color: #94A3B8; padding: 8px 0; border-bottom: 1px solid #1E2A3B; font-weight: bold;">Blocos Remontados</td>
                        <td style="text-align: right; color: #27AE60; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #1E2A3B;">{success_count}</td>
                    </tr>
                    <tr>
                        <td style="color: #94A3B8; padding: 8px 0; font-weight: bold;">Blocos Corrompidos/Falhos</td>
                        <td style="text-align: right; color: {fail_color}; font-weight: bold; padding: 8px 0;">{error_count}</td>
                    </tr>
                </table>
            </div>
            "#
        );

        let _ = app.emit("restore-progress", RestoreProgressPayload { manifest_path: m_path_str.clone(), progress: 100, status: "Concluído!".to_string() });
        let _ = app.emit("restore-complete", RestoreCompletePayload { manifest_path: m_path_str.clone() });
        
        if error_count > 0 {
            let msg = format!("Restauro de '{}' com alertas. {} ficheiros recuperados, {} falhas.", clean_name, success_count, error_count);
            write_audit_log(&app, "WARNING", &msg);
            let _ = app.notification().builder().title("Restauração com Alertas").body(&msg).show();
            
            let _ = emit_system_notification(&app, "Aviso no Restauro Local", &msg, "warning");
        } else {
            let msg = format!("Cofre '{}' restaurado! {} ficheiros recuperados.", clean_name, total_chunks);
            write_audit_log(&app, "SUCCESS", &msg);
            let _ = app.notification().builder().title("Restauração Concluída").body(&msg).show();
            
            let _ = emit_system_notification(&app, "Restauro Local Concluído", &msg, "success");
        }

        let _ = crate::commands::settings::send_email_alert(&app, &format!("Auditoria de Recuperação: {}", clean_name), status_type, &relatorio_email);
        crate::commands::webhook::dispatch(&app, crate::commands::webhook::WebhookEvent {
            operation: "Restauro".to_string(), routine: clean_name.to_string(),
            level: if error_count > 0 { crate::commands::webhook::WebhookLevel::Warning } else { crate::commands::webhook::WebhookLevel::Success },
            origin: m_path_str.to_string(), destination: r_path_str.to_string(), duration: Some(duration_str.clone()),
            details: vec![("Blocos remontados".to_string(), format!("{} de {}", success_count, total_chunks)), ("Blocos com falha".to_string(), error_count.to_string()), ("Integridade".to_string(), format!("{:.2}%", taxa_integridade))],
        });
    });

    Ok("Motor de restauro ativado.".to_string())
}
/// Decide se o agendamento vence neste minuto. Aceita JSON neutro (v1) ou o texto legado.
pub fn schedule_is_due(schedule: &str, now: &chrono::DateTime<chrono::Local>) -> bool {
    use chrono::{Datelike, Timelike};
    let hm = now.format("%H:%M").to_string();
    let Ok(v) = serde_json::from_str::<serde_json::Value>(schedule) else {
        return schedule.contains(&hm);
    };
    let time = v["time"].as_str().unwrap_or("");
    let (th, tm) = match time.split_once(':') {
        Some((h, m)) => (h.parse::<u32>().unwrap_or(99), m.parse::<u32>().unwrap_or(99)),
        None => return false,
    };
    let wd = now.weekday().num_days_from_sunday();
    match v["kind"].as_str().unwrap_or("manual") {
        "daily" => now.hour() == th && now.minute() == tm,
        "weekdays" => (1..=5).contains(&wd) && now.hour() == th && now.minute() == tm,
        "weekly" => wd as u64 == v["day"].as_u64().unwrap_or(1) && now.hour() == th && now.minute() == tm,
        "interval" => {
            let every = v["every"].as_i64().unwrap_or(1).max(1);
            now.minute() == tm && (now.hour() as i64 - th as i64).rem_euclid(every) == 0
        }
        _ => false,
    }
}
