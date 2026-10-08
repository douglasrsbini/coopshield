#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod database {
    pub mod sqlite;
}

pub mod commands {
    pub mod storage;
    pub mod backup;
    pub mod settings;
    pub mod system;
    pub mod support;
}

pub mod engine {
    pub mod crypto;
    pub mod licensing;
}

use std::sync::{Arc, Mutex};
use std::collections::HashSet;
use std::sync::atomic::Ordering;

use tauri::{Emitter, Manager, menu::{Menu, MenuItem}, tray::{TrayIconBuilder, MouseButton, TrayIconEvent}};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

mod startup {
    use std::sync::atomic::{AtomicBool, Ordering};

    #[derive(Default)]
    pub struct StartupStatus(pub AtomicBool);

    #[tauri::command]
    pub fn get_system_ready(status: tauri::State<'_, StartupStatus>) -> bool {
        status.0.load(Ordering::Acquire)
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init()) 
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--silent"])))
        .manage(startup::StartupStatus::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let _ = app.autolaunch().enable();

            let show_i = MenuItem::with_id(app, "show", "Abrir Painel do Kopher Shield", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Encerrar Serviço de Proteção", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => std::process::exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    },
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            crate::database::sqlite::init_db(&app_handle).expect("Falha ao inicializar a base de dados do Kopher Shield");
            app.state::<startup::StartupStatus>().0.store(true, Ordering::Release);
            app.emit("system-ready", ())?;

            std::thread::spawn(move || {
                let executed_slots: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));

                loop {
                    std::thread::sleep(std::time::Duration::from_secs(15));

                    let now = chrono::Local::now();
                    let current_time_str = now.format("%H:%M").to_string();
                    let current_date_str = now.format("%Y-%m-%d").to_string(); 
                    
                    let db_path = crate::database::sqlite::get_db_path(&app_handle);
                    
                    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                        let mut stmt = match conn.prepare("SELECT id, name, schedule, source_path, destination_vault, status FROM backup_routines") {
                            Ok(s) => s, Err(_) => continue,
                        };

                        let rows = stmt.query_map([], |row| {
                            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?))
                        });

                        if let Ok(routine_iter) = rows {
                            for routine_result in routine_iter {
                                if let Ok((id, name, schedule, source, dest, status)) = routine_result {
                                    let is_active = status.to_uppercase() == "ATIVO";
                                    let time_matches = crate::commands::backup::schedule_is_due(&schedule, &now);

                                    if is_active && time_matches {
                                        let slot_key = format!("{}_{}_{}", id, current_date_str, current_time_str);
                                        let mut slots = executed_slots.lock().unwrap();
                                        if !slots.contains(&slot_key) {
                                            slots.insert(slot_key.clone());
                                            if slots.len() > 100 { slots.clear(); slots.insert(slot_key); }
                                            drop(slots); 

                                            crate::commands::system::write_audit_log(&app_handle, "INFO", &format!("Agendamento disparado para a rotina '{}' (ID: {})", name, id));

                                            let handle_clone = app_handle.clone();
                                            let routine_name = name.clone();
                                            std::thread::spawn(move || {
                                                let _ = crate::commands::backup::execute_backup_routine(handle_clone, id, routine_name, source, dest);
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
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            startup::get_system_ready,
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
            crate::commands::backup::scan_cloud_vault,
            crate::commands::backup::execute_cloud_restore,
            crate::commands::storage::update_cloud_vault,
            crate::commands::storage::delete_cloud_vault,
            crate::commands::settings::get_all_settings,
            crate::commands::settings::update_settings,
            crate::commands::system::read_audit_logs,
            crate::commands::system::save_report_file,
            crate::commands::system::get_dashboard_telemetry,
            crate::commands::system::read_file_binary,
            crate::engine::licensing::get_machine_id,
            crate::commands::settings::test_smtp_connection,
            crate::commands::settings::finish_setup,
            crate::engine::licensing::validate_license_key,
            crate::commands::settings::request_2fa_token,
            crate::engine::licensing::authenticate_and_activate,
            crate::engine::licensing::generate_totp_qr,
            crate::engine::licensing::verify_totp_code,
            crate::commands::system::get_system_notifications,
            crate::commands::system::mark_notifications_as_read,
            crate::commands::system::submit_support_ticket,
            crate::commands::support::send_support_ticket,
            crate::commands::system::get_os_hostname
        ])
        .run(tauri::generate_context!())
        .expect("Erro fatal: Falha ao iniciar a engine do Kopher Shield");
}