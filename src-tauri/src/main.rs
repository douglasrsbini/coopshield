#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod database {
    pub mod sqlite;
}

pub mod commands {
    pub mod storage;
    pub mod backup;
    pub mod settings;
}

pub mod engine {
    pub mod crypto;
}

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    use tauri::Manager;
    
    // Tenta encontrar e fechar a splashscreen
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
    
    // Tenta encontrar, mostrar e focar a janela principal
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus(); // Traz a janela para a frente
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init()) // <-- Obrigatório para a janela de pastas abrir!
        .setup(|app| {
            crate::database::sqlite::init_db(&app.handle())
                .expect("Falha ao inicializar a base de dados do Kopher Shield");
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
            close_splashscreen,
            crate::commands::settings::get_all_settings,
            crate::commands::settings::update_settings
        ])
        .run(tauri::generate_context!())
        .expect("Erro fatal: Falha ao iniciar a engine do Kopher Shield");
}