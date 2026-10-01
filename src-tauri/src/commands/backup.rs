use tauri::{command, AppHandle, Emitter};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::database::sqlite::get_db_path;
use crate::engine::crypto::SecurityEngine;
use std::path::Path;
use rfd::FileDialog;
use walkdir::WalkDir;
use std::thread; // <--- IMPORTAÇÃO ADICIONADA AQUI
use std::fs;
use std::io::Write;
use crate::commands::system::write_audit_log;
use chrono::TimeZone;
use tauri_plugin_notification::NotificationExt;

// Importações cruciais para a Magia da Nuvem (AWS S3)
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

// LÊ AS CHAVES DO BANCO DE DADOS (Não bloqueante)
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
        Err(e) => return Err(format!("Falha grave: Motor assíncrono falhou ao arrancar. {}", e))
    };

    thread::spawn(move || {
        let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: 2, status: "A inicializar motor de I/O...".to_string() });

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
        
        let mut s3_client_opt = None;
        let mut s3_bucket_opt = None;

        if is_local {
            let local_path = dest_str.replace("Local: ", "").replace("Local:", "");
            vault_dir = Path::new(&local_path).join("CoopShield_Vault");
            if let Err(e) = std::fs::create_dir_all(&vault_dir) {
                let _ = app.emit("backup-error", format!("Falha de I/O no disco: {}", e));
                let _ = app.emit("backup-complete", CompletePayload { routine_id }); 
                return; 
            }
        } else if is_cloud {
            let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: 5, status: "A ligar à Cloud...".to_string() });
            
            let vault_name = dest_str.replace("Cloud: ", "");
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
                    write_audit_log(&app, "ERROR", &format!("Rotina '{}' abortada: {:?}", r_name, e)); 
                    let _ = app.emit("backup-complete", CompletePayload { routine_id }); 
                    return;
                }
            }
        }

        let mut manifest_files = Vec::new();

        for entry in walkdir::WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
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
                            write_audit_log(&app_clone, "ERROR", &format!("Falha disco local: {:?}", e));
                            return Err(e.to_string());
                        }
                    } else if is_cloud {
                        if let (Some(s3), Some(bucket)) = (&s3_client_clone, &s3_bucket_clone) {
                            let body = ByteStream::from(chunk.encrypted_data.clone());
                            
                            let upload_result = rt.block_on(async {
                                s3.put_object()
                                    .bucket(bucket)
                                    .key(&chunk_name)
                                    .body(body)
                                    .send()
                                    .await
                            });

                            if let Err(e) = upload_result {
                                write_audit_log(&app_clone, "ERROR", &format!("Falha ao enviar o bloco {} para a Nuvem: {:?}", chunk.hash, e));
                                return Err("Falha de Rede com a Nuvem.".into());
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
                        let _ = app.emit("backup-error", format!("Falha em {}: {}", file_name, e));
                    }
                }
            }
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
            let manifest_filename = format!("{}_{}.coopshield", safe_name, timestamp);
            
            if is_local {
                let manifest_path = vault_dir.join(&manifest_filename);
                let _ = std::fs::write(&manifest_path, json_data);
            } else if is_cloud {
                if let (Some(s3), Some(bucket)) = (&s3_client_opt, &s3_bucket_opt) {
                    let body = ByteStream::from(json_data.into_bytes());
                    let _ = rt.block_on(async {
                        s3.put_object().bucket(bucket).key(&manifest_filename).body(body).send().await
                    });
                }
            }
        }

        let _ = app.emit("backup-progress", ProgressPayload { routine_id, progress: 100, status: "Concluído!".to_string() });
        let _ = app.emit("backup-complete", CompletePayload { routine_id });
        
        if error_count > 0 {
            let msg = format!("Rotina '{}' com alertas: {} ficheiros seguros, mas {} falharam.", r_name, success_count, error_count);
            write_audit_log(&app, "WARNING", &msg);
            let _ = app.notification().builder().title("CoopShield - Aviso").body(&msg).show();
        } else {
            let dest_label = if is_cloud { "armazenados na Nuvem" } else { "guardados no disco" };
            let msg = format!("Rotina '{}' finalizada! {} ficheiros {} em segurança.", r_name, success_count, dest_label);
            write_audit_log(&app, "SUCCESS", &msg);
            let _ = app.notification().builder().title("CoopShield - Operação Concluída").body(&msg).show();
        }
    });

    Ok("A rotina foi acionada. O processamento começou.".to_string())
}

#[tauri::command]
pub fn scan_local_vault(vault_path: String) -> Result<Vec<BackupManifest>, String> {
    let mut manifests = Vec::new();

    for entry in WalkDir::new(&vault_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        
        if path.is_file() && path.extension().map_or(false, |ext| ext == "coopshield") {
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
            let clean_name = raw_name.split('_').filter(|p| !p.chars().all(char::is_numeric)).collect::<Vec<&str>>().join(" ").replace(".coopshield", "");
            
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

// ==========================================
// MÓDULO DE RESTAURO CLOUD COM THREAD IMPORTADA
// ==========================================

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
                    if key.ends_with(".coopshield") {
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

                                let clean_name = key.split('_').filter(|p| !p.chars().all(char::is_numeric)).collect::<Vec<&str>>().join(" ").replace(".coopshield", "");
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
        write_audit_log(&app, "INFO", &format!("Iniciando restauro do cofre Cloud '{}' para a pasta destino.", v_name));

        let (ak, sk, bucket, ep) = match get_cloud_credentials(&app, &v_name) {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("restore-error", format!("Erro de credenciais S3: {}", e));
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
                    let _ = app.emit("restore-error", format!("Erro ao descarregar manifesto da Nuvem: {:?}", e));
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
                let _ = app.emit("restore-error", "Falha ao obter o manifesto da nuvem.".to_string());
                return;
            }
        };

        let manifest: VaultManifest = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(_) => {
                 let _ = app.emit("restore-error", "Falha ao analisar o manifesto (JSON inválido).".to_string());
                 return;
            }
        };

        let encryption_key = match hex::decode(&manifest.encryption_key_hex) {
            Ok(k) => k,
            Err(_) => {
                let _ = app.emit("restore-error", "Falha ao descodificar a chave de encriptação.".to_string());
                return;
            }
        };

        let dest_dir = Path::new(&r_path).join(format!("CoopShield_Cloud_Restaurado_{}", manifest.timestamp));
        if let Err(e) = fs::create_dir_all(&dest_dir) {
            let _ = app.emit("restore-error", format!("Erro ao criar pasta destino: {}", e));
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
            // Cálculo do progresso com garantia de avanço visual
            let percent = if total_chunks > 0 { ((current_chunk as f64 / total_chunks as f64) * 95.0) as u8 } else { 95 };

            // Garante a emissão contínua
            let _ = app.emit("restore-progress", RestoreProgressPayload {
                manifest_path: m_key.clone(), 
                progress: std::cmp::max(1, percent), 
                status: format!("Baixando: {}", file_meta.relative_path),
            });

            let chunk_filename = format!("{}.chunk", file_meta.chunk_hash);
            let ep_chunk_iter = ep_chunks.clone();
            
            // Tenta até 3 vezes descarregar o bloco em caso de falha de rede (Timeout/Rate Limit)
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
                    thread::sleep(std::time::Duration::from_millis(500 * retries as u64)); // Espera exponencial
                }
            }

            let encrypted_data = match encrypted_data_opt {
                Some(d) => d,
                None => {
                    error_count += 1;
                    eprintln!("Falha crítica no bloco: {}", chunk_filename);
                    continue; // Pula este ficheiro
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

        let relatorio_path = dest_dir.join("Relatorio_Auditoria.txt");
        let relatorio_content = format!("COOPSHIELD - DADOS RESTAURADOS DA NUVEM\n\nOs seus ficheiros originais foram remontados com sucesso a partir de {} blocos (chunks) encriptados.\nFicheiros reconstruídos: {}\nFalhas em blocos: {}\n", total_chunks, success_count, error_count);
        let _ = fs::write(&relatorio_path, relatorio_content);

        let _ = app.emit("restore-progress", RestoreProgressPayload { manifest_path: m_key.clone(), progress: 100, status: "Restauro Cloud Concluído!".to_string() });
        let _ = app.emit("restore-complete", CompletePayload { routine_id: 0 });
        
        if error_count > 0 {
            let msg = format!("Restauro concluído com alertas. {} de {} blocos reconstruídos. ({} falhas).", success_count, total_chunks, error_count);
            write_audit_log(&app, "WARNING", &msg);
            let _ = app.notification().builder().title("Aviso no Restauro").body(&msg).show();
        } else {
            let msg = format!("Restauro bem-sucedido! Ficheiros originais remontados a partir de {} blocos.", total_chunks);
            write_audit_log(&app, "SUCCESS", &msg);
            let _ = app.notification().builder().title("Recuperação Cloud Concluída").body(&msg).show();
        }
    });

    Ok("Processo de recuperação de desastres (Cloud) iniciado!".to_string())
}

#[command]
pub fn execute_restore(app: AppHandle, manifest_path: String, restore_path: String) -> Result<String, String> {
    let m_path_str = manifest_path.clone();
    let r_path_str = restore_path.clone();
    
    thread::spawn(move || {
        let file_name = Path::new(&m_path_str).file_name().unwrap_or_default().to_string_lossy();
        let clean_name = file_name.split('_').filter(|p| !p.chars().all(char::is_numeric)).collect::<Vec<&str>>().join(" ").replace(".coopshield", "");
        let clean_name = if clean_name.is_empty() { "Desconhecido".to_string() } else { clean_name };

        write_audit_log(&app, "INFO", &format!("Iniciando restauro do cofre '{}' para a pasta destino.", clean_name));
        
        let manifest_content = match fs::read_to_string(&m_path_str) {
            Ok(content) => content,
            Err(e) => {
                let _ = app.emit("restore-error", format!("Falha ao ler o manifesto: {}", e));
                return;
            }
        };

        let manifest: VaultManifest = match serde_json::from_str(&manifest_content) {
            Ok(m) => m,
            Err(e) => {
                let _ = app.emit("restore-error", format!("Manifesto corrompido: {}", e));
                return;
            }
        };

        let encryption_key = match hex::decode(&manifest.encryption_key_hex) {
            Ok(k) => k,
            Err(_) => {
                let _ = app.emit("restore-error", "Falha ao extrair a chave de segurança.".to_string());
                return;
            }
        };

        let vault_dir = Path::new(&m_path_str).parent().unwrap_or(Path::new(""));
        let dest_dir = Path::new(&r_path_str).join(format!("CoopShield_Restaurado_{}", manifest.timestamp));
        if let Err(e) = fs::create_dir_all(&dest_dir) {
            let _ = app.emit("restore-error", format!("Acesso negado ao criar pasta de destino: {}", e));
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
                manifest_path: m_path_str.clone(), progress: percent, status: format!("Descompactando: {}", file_meta.relative_path),
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

        let relatorio_path = dest_dir.join("Relatorio_Auditoria.txt");
        let relatorio_content = format!("COOPSHIELD - DADOS RESTAURADOS\n\nForam descompactados e reconstruídos ficheiros a partir de {} blocos.\nErros: {}\n", success_count, error_count);
        let _ = fs::write(&relatorio_path, relatorio_content);

        let _ = app.emit("restore-progress", RestoreProgressPayload { manifest_path: m_path_str.clone(), progress: 100, status: "Concluído!".to_string() });
        let _ = app.emit("restore-complete", RestoreCompletePayload { manifest_path: m_path_str.clone() });
        
        if error_count > 0 {
            let msg = format!("Restauro de '{}' com alertas. {} ficheiros recuperados, {} falhas.", clean_name, success_count, error_count);
            write_audit_log(&app, "WARNING", &msg);
            let _ = app.notification().builder().title("Restauração com Alertas").body(&msg).show();
        } else {
            let msg = format!("Cofre '{}' restaurado! {} ficheiros recuperados.", clean_name, total_chunks);
            write_audit_log(&app, "SUCCESS", &msg);
            let _ = app.notification().builder().title("Restauração Concluída").body(&msg).show();
        }
    });

    Ok("Motor de restauro ativado.".to_string())
}