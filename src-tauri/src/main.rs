#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database {
    pub mod sqlite;
}

mod commands {
    pub mod storage;
    pub mod backup;
    pub mod settings;
}

mod engine {
    pub mod crypto;
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init()) // <-- Obrigatório para a janela de pastas abrir!
        .setup(|app| {
            database::sqlite::init_db(&app.handle())
                .expect("Falha ao inicializar a base de dados do Kopher Shield");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::storage::add_cloud_vault,
            commands::storage::get_cloud_vaults,
            commands::backup::run_test_backup,
            commands::backup::add_routine,
            commands::backup::get_routines,
            commands::backup::update_routine,
            commands::backup::delete_routine,
            commands::backup::select_folder_dialog,
            commands::backup::execute_backup_routine,
            commands::backup::scan_local_vault,
            commands::backup::execute_restore,
            commands::settings::get_all_settings,
            commands::settings::update_settings
        ])
        .run(tauri::generate_context!())
        .expect("Erro fatal: Falha ao iniciar a engine do Kopher Shield");
}