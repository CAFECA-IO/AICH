//! Cryptographic helpers: provider-key envelope encryption, API key hashing,
//! password hashing and session tokens.

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const API_KEY_PREFIX: &str = "sk-hub-";

/// Encrypt a secret with AES-256-GCM. Output format: `v1:<base64(nonce||ciphertext)>`.
/// The master key is meant to come from a KMS / Vault in production (see docs/security.md).
pub fn encrypt_secret(master: &[u8; 32], plaintext: &str) -> String {
    let cipher = Aes256Gcm::new_from_slice(master).expect("32-byte key");
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
        .expect("encryption cannot fail");
    let mut out = nonce.to_vec();
    out.extend_from_slice(&ct);
    format!("v1:{}", B64.encode(out))
}

pub fn decrypt_secret(master: &[u8; 32], stored: &str) -> anyhow::Result<String> {
    if let Some(rest) = stored.strip_prefix("v1:") {
        let raw = B64.decode(rest)?;
        if raw.len() < 13 {
            anyhow::bail!("ciphertext too short");
        }
        let cipher = Aes256Gcm::new_from_slice(master).expect("32-byte key");
        let (nonce, ct) = raw.split_at(12);
        let pt = cipher
            .decrypt(Nonce::from_slice(nonce), ct)
            .map_err(|_| anyhow::anyhow!("failed to decrypt provider key (wrong master key?)"))?;
        Ok(String::from_utf8(pt)?)
    } else if let Some(rest) = stored.strip_prefix("plain:") {
        // Only used by seeded dev/mock data; the catalog refuses plain keys for real providers.
        Ok(rest.to_string())
    } else {
        anyhow::bail!("unknown secret format")
    }
}

pub fn sha256_hex(input: &str) -> String {
    hex::encode(Sha256::digest(input.as_bytes()))
}

/// Cryptographically secure random bytes from the OS.
pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    OsRng.fill_bytes(&mut b);
    b
}

/// Uniform random `[A-Za-z0-9]` string (rejection sampling, no modulo bias).
pub fn random_alphanumeric(len: usize) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut out = String::with_capacity(len);
    while out.len() < len {
        for b in random_bytes(len) {
            // 248 = 62 * 4: values >= 248 would skew the distribution.
            if b < 248 && out.len() < len {
                out.push(ALPHABET[(b % 62) as usize] as char);
            }
        }
    }
    out
}

/// Returns (full_key, display_prefix, hash).
pub fn generate_api_key() -> (String, String, String) {
    let body = random_alphanumeric(40);
    let key = format!("{API_KEY_PREFIX}{body}");
    let prefix = format!("{}…{}", &key[..11], &key[key.len() - 4..]);
    let hash = sha256_hex(&key);
    (key, prefix, hash)
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("hash error: {e}"))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub role: String,
    pub exp: usize,
}

pub fn issue_jwt(secret: &str, user_id: Uuid, role: &str) -> anyhow::Result<String> {
    let exp = (chrono::Utc::now() + chrono::Duration::days(7)).timestamp() as usize;
    let claims = Claims {
        sub: user_id,
        role: role.to_string(),
        exp,
    };
    Ok(jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )?)
}

pub fn verify_jwt(secret: &str, token: &str) -> Option<Claims> {
    jsonwebtoken::decode::<Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(secret.as_bytes()),
        &jsonwebtoken::Validation::default(),
    )
    .ok()
    .map(|d| d.claims)
}

pub fn last4(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    chars[chars.len().saturating_sub(4)..].iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_roundtrip() {
        let key = [7u8; 32];
        let enc = encrypt_secret(&key, "sk-test-123");
        assert!(enc.starts_with("v1:"));
        assert_eq!(decrypt_secret(&key, &enc).unwrap(), "sk-test-123");
        assert!(decrypt_secret(&[8u8; 32], &enc).is_err());
    }

    #[test]
    fn random_alphanumeric_is_uniform_charset() {
        let s = random_alphanumeric(4000);
        assert_eq!(s.len(), 4000);
        assert!(s.bytes().all(|b| b.is_ascii_alphanumeric()));
        // all 62 symbols should appear in 4000 draws
        let distinct: std::collections::HashSet<u8> = s.bytes().collect();
        assert_eq!(distinct.len(), 62);
        assert_ne!(random_alphanumeric(40), random_alphanumeric(40));
    }

    #[test]
    fn api_key_format() {
        let (k, p, h) = generate_api_key();
        assert!(k.starts_with(API_KEY_PREFIX));
        assert_eq!(k.len(), API_KEY_PREFIX.len() + 40);
        assert_eq!(h, sha256_hex(&k));
        assert!(p.starts_with("sk-hub-"));
    }

    #[test]
    fn password_roundtrip() {
        let h = hash_password("hunter22").unwrap();
        assert!(verify_password("hunter22", &h));
        assert!(!verify_password("nope", &h));
    }

    #[test]
    fn jwt_roundtrip() {
        let secret = "x".repeat(32);
        let id = Uuid::new_v4();
        let t = issue_jwt(&secret, id, "admin").unwrap();
        let c = verify_jwt(&secret, &t).unwrap();
        assert_eq!(c.sub, id);
        assert_eq!(c.role, "admin");
        assert!(verify_jwt("y".repeat(32).as_str(), &t).is_none());
    }
}
