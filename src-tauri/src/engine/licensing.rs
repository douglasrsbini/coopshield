use sha2::{Sha256, Digest};
use mac_address::get_mac_address;
use std::env::consts::ARCH;
use tauri::command;

/// Recolhe a assinatura única do hardware para evitar clonagem de licenças.
/// Lógica: Hostname:Arquitetura:MAC_Address -> Hash SHA-256 (24 chars HEX)
#[command]
pub fn get_machine_id() -> String {
    // 1. Hostname (Node)
    let host_name = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "UNKNOWN_NODE".to_string());

    // 2. Arquitetura (Machine)
    let arch = ARCH;

    // 3. Endereço MAC físico (Placa de Rede)
    let mac = match get_mac_address() {
        Ok(Some(ma)) => ma.to_string().replace(":", "").to_uppercase(),
        _ => "000000000000".to_string(),
    };

    // Concatenação idêntica ao padrão Binaver (Python: f"{node}:{machine}:{mac}")
    let dados_hardware = format!("{}:{}:{}", host_name, arch, mac);

    // Hashing com SHA-256
    let mut hasher = Sha256::new();
    hasher.update(dados_hardware.as_bytes());
    let result = hasher.finalize();

    // Converte para Hexadecimal, Maiúsculas e trunca nos primeiros 24 caracteres
    let hex_string = hex::encode(result).to_uppercase();
    hex_string[..24].to_string()
}