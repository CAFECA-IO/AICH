//! "Sign in with CAFECA" (protocol v1) relying-party implementation.
//!
//! Spec: https://github.com/Luphia/cafeca — README §"Sign in with CAFECA".
//! The wallet signs an EIP-712 `SignIn` message with the user's passkey; we verify it by calling
//! ERC-1271 `isValidSignature(hash, signature)` on the user's identity contract through a public
//! RPC. The identity contract address (`account`) is the user's stable ID.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha3::{Digest, Keccak256};
use tokio::sync::RwLock;

pub const MAGIC_1271: [u8; 4] = [0x16, 0x26, 0xba, 0x7e];
const SIGNIN_TYPE: &str = "SignIn(string domain,string uri,string nonce,uint256 issuedAt,uint256 expiresAt,string statement,string claims,string channel)";
const DOMAIN_TYPE: &str =
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SignInMessage {
    pub domain: String,
    pub uri: String,
    pub nonce: String,
    #[serde(rename = "issuedAt")]
    pub issued_at: u64,
    #[serde(rename = "expiresAt")]
    pub expires_at: u64,
    #[serde(default)]
    pub statement: String,
    #[serde(default)]
    pub claims: String,
    #[serde(default)]
    pub channel: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SignInResponse {
    pub v: u32,
    #[serde(rename = "type")]
    pub kind: String,
    pub account: String,
    #[serde(rename = "chainId")]
    pub chain_id: u64,
    pub message: SignInMessage,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerifiedSignIn {
    /// Lower-case 0x address of the identity contract — the user's unique ID.
    pub account: String,
    /// Handle confirmed with the wallet's profile API (only when the user granted `handle`).
    pub handle: Option<String>,
}

#[derive(Debug, Clone)]
struct ChainInfo {
    chain_id: u64,
    rpc: String,
}

pub struct Cafeca {
    pub wallet: String,
    pub site_origins: Vec<String>,
    rpc_override: Option<String>,
    http: reqwest::Client,
    chain: RwLock<Option<ChainInfo>>,
}

fn keccak(data: &[u8]) -> [u8; 32] {
    Keccak256::digest(data).into()
}

fn u256(v: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&v.to_be_bytes());
    out
}

pub fn parse_address(s: &str) -> Option<[u8; 20]> {
    let h = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X"))?;
    if h.len() != 40 {
        return None;
    }
    hex::decode(h).ok()?.try_into().ok()
}

fn parse_hex(s: &str) -> Option<Vec<u8>> {
    hex::decode(s.strip_prefix("0x")?).ok()
}

/// EIP-712 digest of a CAFECA `SignIn` message, identical to viem's `hashTypedData`.
pub fn signin_hash(account: &[u8; 20], chain_id: u64, m: &SignInMessage) -> [u8; 32] {
    let mut d = Vec::with_capacity(160);
    d.extend_from_slice(&keccak(DOMAIN_TYPE.as_bytes()));
    d.extend_from_slice(&keccak(b"CAFECA Sign-In"));
    d.extend_from_slice(&keccak(b"1"));
    d.extend_from_slice(&u256(chain_id));
    let mut addr = [0u8; 32];
    addr[12..].copy_from_slice(account);
    d.extend_from_slice(&addr);
    let domain_separator = keccak(&d);

    let mut s = Vec::with_capacity(288);
    s.extend_from_slice(&keccak(SIGNIN_TYPE.as_bytes()));
    s.extend_from_slice(&keccak(m.domain.as_bytes()));
    s.extend_from_slice(&keccak(m.uri.as_bytes()));
    s.extend_from_slice(&keccak(m.nonce.as_bytes()));
    s.extend_from_slice(&u256(m.issued_at));
    s.extend_from_slice(&u256(m.expires_at));
    s.extend_from_slice(&keccak(m.statement.as_bytes()));
    s.extend_from_slice(&keccak(m.claims.as_bytes()));
    s.extend_from_slice(&keccak(m.channel.as_bytes()));
    let struct_hash = keccak(&s);

    let mut f = Vec::with_capacity(66);
    f.extend_from_slice(&[0x19, 0x01]);
    f.extend_from_slice(&domain_separator);
    f.extend_from_slice(&struct_hash);
    keccak(&f)
}

/// ABI-encode `isValidSignature(bytes32,bytes)` calldata.
pub fn is_valid_signature_calldata(hash: &[u8; 32], signature: &[u8]) -> Vec<u8> {
    let mut out = MAGIC_1271.to_vec(); // the function selector equals the magic value
    out.extend_from_slice(hash);
    out.extend_from_slice(&u256(0x40));
    out.extend_from_slice(&u256(signature.len() as u64));
    out.extend_from_slice(signature);
    let pad = (32 - signature.len() % 32) % 32;
    out.extend(std::iter::repeat_n(0u8, pad));
    out
}

/// Validate a site origin the way the wallet does: scheme://host[:port] with no path.
pub fn normalize_origin(s: &str) -> Option<String> {
    let s = s.trim().trim_end_matches('/');
    let rest = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))?;
    if rest.is_empty()
        || rest.contains('/')
        || rest.contains('?')
        || rest.contains('#')
        || rest.contains('@')
    {
        return None;
    }
    Some(s.to_string())
}

fn same_origin(uri: &str, origin: &str) -> bool {
    uri == origin
        || uri.starts_with(&format!("{origin}/"))
        || uri.starts_with(&format!("{origin}?"))
        || uri.starts_with(&format!("{origin}#"))
}

impl Cafeca {
    pub fn new(
        wallet: String,
        site_origins: Vec<String>,
        rpc_override: Option<String>,
        http: reqwest::Client,
    ) -> Self {
        Self {
            wallet: wallet.trim_end_matches('/').to_string(),
            site_origins,
            rpc_override,
            http,
            chain: RwLock::new(None),
        }
    }

    pub fn allows_origin(&self, origin: &str) -> bool {
        self.site_origins.iter().any(|o| o == origin)
    }

    async fn chain(&self) -> anyhow::Result<ChainInfo> {
        if let Some(c) = self.chain.read().await.clone() {
            return Ok(c);
        }
        let url = format!("{}/.well-known/cafeca-configuration", self.wallet);
        let v: Value = self
            .http
            .get(&url)
            .timeout(Duration::from_secs(10))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let chain_id = v
            .pointer("/chain/id")
            .and_then(Value::as_u64)
            .ok_or_else(|| anyhow::anyhow!("cafeca-configuration has no chain.id"))?;
        let rpc = match &self.rpc_override {
            Some(r) => r.clone(),
            None => v
                .pointer("/chain/rpc")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("cafeca-configuration has no chain.rpc"))?
                .to_string(),
        };
        let info = ChainInfo { chain_id, rpc };
        *self.chain.write().await = Some(info.clone());
        Ok(info)
    }

    async fn is_valid_signature(
        &self,
        rpc: &str,
        account: &str,
        hash: &[u8; 32],
        signature: &[u8],
    ) -> anyhow::Result<bool> {
        let data = format!(
            "0x{}",
            hex::encode(is_valid_signature_calldata(hash, signature))
        );
        let body = json!({"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": account, "data": data}, "latest"]});
        let v: Value = self
            .http
            .post(rpc)
            .timeout(Duration::from_secs(15))
            .json(&body)
            .send()
            .await?
            .json()
            .await?;
        // A revert (e.g. not a contract / bad signature) comes back as a JSON-RPC error: invalid.
        let Some(result) = v.get("result").and_then(Value::as_str) else {
            return Ok(false);
        };
        let bytes = parse_hex(result).unwrap_or_default();
        Ok(bytes.len() >= 4 && bytes[..4] == MAGIC_1271)
    }

    async fn lookup_handle(&self, account: &str) -> Option<String> {
        let url = format!("{}/api/profile?q={account}", self.wallet);
        let v: Value = self
            .http
            .get(&url)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()?;
        let h = v.get("handle")?.as_str()?;
        let ok = (3..=20).contains(&h.len())
            && h.chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
        ok.then(|| h.to_string())
    }

    /// Verify a wallet response for a nonce we issued for `domain`. Returns a user-facing error message on failure.
    pub async fn verify(
        &self,
        res: &SignInResponse,
        domain: &str,
        nonce: &str,
        now: u64,
    ) -> Result<VerifiedSignIn, String> {
        if res.v != 1 || res.kind != "cafeca:auth" {
            return Err("不是 CAFECA 登入回應".into());
        }
        let account = parse_address(&res.account).ok_or("帳戶地址錯誤")?;
        let m = &res.message;
        if m.domain != domain {
            return Err("登入訊息的網域不符（可能來自仿冒網站）".into());
        }
        if !same_origin(&m.uri, domain) {
            return Err("登入頁面與網站網域不一致".into());
        }
        if m.nonce != nonce {
            return Err("nonce 不符".into());
        }
        if now > m.expires_at {
            return Err("登入已過期，請重新登入".into());
        }
        if m.issued_at > now + 60 || m.expires_at.saturating_sub(m.issued_at) > 600 {
            return Err("登入時間不合理".into());
        }
        let chain = self.chain().await.map_err(|e| {
            tracing::error!(error = %e, "cannot load CAFECA configuration");
            "暫時無法連線 CAFECA，請稍後再試".to_string()
        })?;
        if res.chain_id != chain.chain_id {
            return Err("鏈 ID 不符".into());
        }
        let signature = parse_hex(&res.signature)
            .filter(|s| !s.is_empty())
            .ok_or("簽章格式錯誤")?;
        let hash = signin_hash(&account, res.chain_id, m);
        let account_hex = format!("0x{}", hex::encode(account));
        let valid = self
            .is_valid_signature(&chain.rpc, &account_hex, &hash, &signature)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "CAFECA RPC call failed");
                "暫時無法驗證 CAFECA 簽章，請稍後再試".to_string()
            })?;
        if !valid {
            return Err("簽章驗證失敗".into());
        }
        let granted: Vec<&str> = m.claims.split(',').filter(|c| !c.is_empty()).collect();
        let handle = if granted.contains(&"handle") {
            self.lookup_handle(&account_hex).await
        } else {
            None
        };
        Ok(VerifiedSignIn {
            account: account_hex,
            handle,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg() -> SignInMessage {
        SignInMessage {
            domain: "http://localhost:3000".into(),
            uri: "http://localhost:3000/login".into(),
            nonce: "abcdEFGH12345678_-".into(),
            issued_at: 1791777000,
            expires_at: 1791777300,
            statement: "登入 AICH".into(),
            claims: "handle".into(),
            channel: String::new(),
        }
    }

    #[test]
    fn signin_hash_matches_viem() {
        // Vector produced with viem@2 hashTypedData (see docs/auth.md).
        let account = parse_address("0x1234567890AbcdEF1234567890aBcdef12345678").unwrap();
        assert_eq!(
            hex::encode(signin_hash(&account, 8018, &msg())),
            "264e2441bb39fe31d5183e504043aabf0129aedec422805f88b282144e07c85d"
        );
    }

    #[test]
    fn calldata_matches_viem() {
        let data = is_valid_signature_calldata(&[0x11; 32], &hex::decode("deadbeefcafe").unwrap());
        assert_eq!(
            hex::encode(data),
            "1626ba7e1111111111111111111111111111111111111111111111111111111111111111\
             0000000000000000000000000000000000000000000000000000000000000040\
             0000000000000000000000000000000000000000000000000000000000000006\
             deadbeefcafe0000000000000000000000000000000000000000000000000000"
        );
    }

    #[test]
    fn origins() {
        assert_eq!(
            normalize_origin("https://aich.cafeca.io/").as_deref(),
            Some("https://aich.cafeca.io")
        );
        assert_eq!(
            normalize_origin("http://localhost:3000").as_deref(),
            Some("http://localhost:3000")
        );
        assert!(normalize_origin("https://x.io/path").is_none());
        assert!(normalize_origin("ftp://x.io").is_none());
        assert!(same_origin(
            "http://localhost:3000/login?x=1",
            "http://localhost:3000"
        ));
        assert!(!same_origin(
            "http://localhost:30001/login",
            "http://localhost:3000"
        ));
    }

    #[tokio::test]
    async fn rejects_wrong_domain_before_network() {
        let c = Cafeca::new(
            "http://127.0.0.1:1".into(),
            vec!["http://localhost:3000".into()],
            None,
            reqwest::Client::new(),
        );
        let res = SignInResponse {
            v: 1,
            kind: "cafeca:auth".into(),
            account: "0x1234567890AbcdEF1234567890aBcdef12345678".into(),
            chain_id: 8018,
            message: SignInMessage {
                domain: "https://evil.example".into(),
                ..msg()
            },
            signature: "0x00".into(),
        };
        let e = c
            .verify(
                &res,
                "http://localhost:3000",
                "abcdEFGH12345678_-",
                1791777100,
            )
            .await
            .unwrap_err();
        assert!(e.contains("網域不符"));
        let res2 = SignInResponse {
            message: msg(),
            ..res
        };
        let e = c
            .verify(
                &res2,
                "http://localhost:3000",
                "other-nonce-123",
                1791777100,
            )
            .await
            .unwrap_err();
        assert!(e.contains("nonce"));
        let e = c
            .verify(
                &res2,
                "http://localhost:3000",
                "abcdEFGH12345678_-",
                1791777400,
            )
            .await
            .unwrap_err();
        assert!(e.contains("過期"));
    }
}
