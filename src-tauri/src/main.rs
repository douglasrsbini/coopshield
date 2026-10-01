#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod database {
    pub mod sqlite;
}

pub mod commands {
    pub mod storage;
    pub mod backup;
    pub mod settings;
    pub mod system;
}

pub mod engine {
    pub mod crypto;
    pub mod licensing;
}

use std::sync::{Arc, Mutex};
use std::collections::HashSet;

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    use tauri::Manager;
    
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus(); 
    }

    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init()) 
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 1. Inicializa a base de dados
            crate::database::sqlite::init_db(&app_handle)
                .expect("Falha ao inicializar a base de dados do CoopShield");

            // 2. VIGIA DE AGENDAMENTO COM TELEMETRIA DE TERMINAL
            std::thread::spawn(move || {
                let executed_slots: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));

                loop {
                    std::thread::sleep(std::time::Duration::from_secs(15));

                    let now = chrono::Local::now();
                    let current_time_str = now.format("%H:%M").to_string();
                    let current_date_str = now.format("%Y-%m-%d").to_string(); 
                    
                    let db_path = crate::database::sqlite::get_db_path(&app_handle);
                    
                    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                        let mut stmt = match conn.prepare(
                            "SELECT id, name, schedule, source_path, destination_vault, status 
                            FROM backup_routines"
                        ) {
                            Ok(s) => s,
                            Err(_) => continue,
                        };

                        let rows = stmt.query_map([], |row| {
                            Ok((
                                row.get::<_, i64>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?, // schedule
                                row.get::<_, String>(3)?, // source_path
                                row.get::<_, String>(4)?, // destination_vault
                                row.get::<_, String>(5)?, // status
                            ))
                        });

                        if let Ok(routine_iter) = rows {
                            for routine_result in routine_iter {
                                if let Ok((id, name, schedule, source, dest, status)) = routine_result {
                                    
                                    let is_active = status.to_uppercase() == "ATIVO";
                                    let time_matches = schedule.contains(&current_time_str);

                                    if is_active && time_matches {
                                        let slot_key = format!("{}_{}_{}", id, current_date_str, current_time_str);
                                        
                                        let mut slots = executed_slots.lock().unwrap();
                                        if !slots.contains(&slot_key) {
                                            slots.insert(slot_key.clone());
                                            
                                            if slots.len() > 100 {
                                                slots.clear();
                                                slots.insert(slot_key);
                                            }
                                            
                                            drop(slots); 

                                            crate::commands::system::write_audit_log(
                                                &app_handle,
                                                "INFO",
                                                &format!("Agendamento disparado automaticamente para a rotina '{}' (ID: {})", name, id)
                                            );

                                            let handle_clone = app_handle.clone();
                                            let routine_name = name.clone();
                                            std::thread::spawn(move || {
                                                let _ = crate::commands::backup::execute_backup_routine(
                                                    handle_clone, 
                                                    id, 
                                                    routine_name, 
                                                    source, 
                                                    dest
                                                );
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::storage::add_cloud_vault,
            crate::commands::storage::get_cloud_vaults,
            crate::commands::backup::run_test_backup,
            crate::commands::backup::add_routine,
            crate::commands::backup::get_routines,
            crate::commands::backup::update_routine,
            crate::commands::backup::delete_routine,
            crate::commands::backup::select_folder_dialog,
            crate::commands::backup::execute_backup_routine,
            crate::commands::backup::scan_local_vault,
            crate::commands::backup::execute_restore,
            // COMANDOS DE RESTAURO CLOUD ADICIONADOS AQUI:
            crate::commands::backup::scan_cloud_vault,
            crate::commands::backup::execute_cloud_restore,
            close_splashscreen,
            crate::commands::storage::update_cloud_vault,
            crate::commands::storage::delete_cloud_vault,
            crate::commands::settings::get_all_settings,
            crate::commands::settings::update_settings,
            crate::commands::system::read_audit_logs,
            crate::commands::system::save_report_file,
            crate::commands::system::get_dashboard_telemetry,
            crate::commands::system::read_file_binary,
            // COMANDOS DE LICENCIAMENTO ADICIONADOS AQUI:
            crate::engine::licensing::get_machine_id
        ])
        .run(tauri::generate_context!())
        .expect("Erro fatal: Falha ao iniciar a engine do CoopShield");
}