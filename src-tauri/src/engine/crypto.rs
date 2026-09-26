use aes_gcm::{
    aead::{Aead, OsRng},
    Aes256Gcm, KeyInit, Nonce,
};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug)]
pub struct BackupChunk {
    pub hash: String,
    pub encrypted_data: Vec<u8>,
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

        let ciphertext = cipher.encrypt(nonce, data).map_err(|e| e.to_string())?;
        Ok((ciphertext, nonce_bytes.to_vec()))
    }

    pub fn compute_sha256(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    pub fn process_file_to_chunks(
        file_path: &Path,
        encryption_key: &[u8],
    ) -> Result<Vec<BackupChunk>, String> {
        let mut file = File::open(file_path).map_err(|e| e.to_string())?;
        let mut buffer = vec![0u8; 1024 * 1024]; // Blocos de 1MB
        let mut chunks = Vec::new();

        loop {
            let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            let chunk_data = &buffer[..n];

            let hash = Self::compute_sha256(chunk_data);
            let (encrypted_data, _nonce) = Self::encrypt_chunk(chunk_data, encryption_key)?;

            chunks.push(BackupChunk {
                hash,
                encrypted_data,
            });
        }

        Ok(chunks)
    }
}
