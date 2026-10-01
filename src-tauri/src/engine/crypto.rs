use aes_gcm::{
    aead::{Aead, OsRng},
    Aes256Gcm, KeyInit, Nonce,
};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zstd::stream::{encode_all, decode_all};

#[derive(Debug)]
pub struct BackupChunk {
    pub hash: String,
    pub encrypted_data: Vec<u8>,
    pub nonce: Vec<u8>,
}

pub struct SecurityEngine;

impl SecurityEngine {
    pub fn generate_key() -> Vec<u8> {
        use aes_gcm::aead::rand_core::RngCore;
        let mut key = vec![0u8; 32];
        OsRng.fill_bytes(&mut key);
        key
    }

    pub fn encrypt_chunk(data: &[u8], key: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
        if key.len() != 32 {
            return Err("A chave de encriptação deve ter exatamente 32 bytes.".into());
        }

        let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
        use aes_gcm::aead::rand_core::RngCore;
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, data).map_err(|e| format!("Falha de encriptação: {}", e))?;
        
        Ok((ciphertext, nonce_bytes.to_vec()))
    }

    pub fn decrypt_and_decompress_chunk(encrypted_data: &[u8], key: &[u8], nonce_bytes: &[u8]) -> Result<Vec<u8>, String> {
        if key.len() != 32 {
            return Err("A chave de desencriptação deve ter 32 bytes.".into());
        }
        if nonce_bytes.len() != 12 {
            return Err("O nonce deve ter 12 bytes.".into());
        }

        let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
        let nonce = Nonce::from_slice(nonce_bytes);

        // 1. Tira o cadeado blindado (Desencripta AES)
        let compressed_plaintext = cipher.decrypt(nonce, encrypted_data).map_err(|e| format!("Falha na integridade/autenticação AES: {}", e))?;
        
        // 2. Tira do saco a vácuo (Descompacta ZSTD em memória)
        let original_plaintext = decode_all(compressed_plaintext.as_slice()).map_err(|e| format!("Falha ao descompactar ZSTD: {}", e))?;
        
        Ok(original_plaintext)
    }

    pub fn compute_sha256(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    // ARQUITETURA DE STREAMING: Processa e entrega 1 bloco por vez via Callback (on_chunk)
    pub fn process_file_to_chunks<F>(
        file_path: &Path,
        encryption_key: &[u8],
        mut on_chunk: F,
    ) -> Result<(), String>
    where
        F: FnMut(BackupChunk) -> Result<(), String>,
    {
        let mut file = File::open(file_path).map_err(|e| e.to_string())?;
        let mut buffer = vec![0u8; 2 * 1024 * 1024]; // Bloco de 2MB para ganho de escala
        
        loop {
            let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            let raw_chunk_data = &buffer[..n];

            // 1. COMPACTAÇÃO: Zstandard (Nível 3 - Foco em velocidade e boa taxa de compressão)
            let compressed_data = encode_all(raw_chunk_data, 3).map_err(|e| format!("Erro de compressão ZSTD: {}", e))?;

            // 2. CRIPTOGRAFIA: Tranca o pacote já compactado
            let (encrypted_data, nonce) = Self::encrypt_chunk(&compressed_data, encryption_key)?;

            // 3. HASH: Assinatura da peça encriptada
            let mut unique_data = encrypted_data.clone();
            unique_data.extend_from_slice(&nonce);
            let hash = Self::compute_sha256(&unique_data);

            let chunk = BackupChunk {
                hash,
                encrypted_data,
                nonce,
            };

            // 4. DESPACHO: Entrega o chunk e limpa a memória RAM instantaneamente
            on_chunk(chunk)?;
        }

        Ok(())
    }
}