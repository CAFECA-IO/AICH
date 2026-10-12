use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub redis_url: Option<String>,
    /// 32-byte key (hex or base64) used to encrypt provider API keys at rest.
    pub master_key: [u8; 32],
    pub jwt_secret: String,
    pub admin_email: Option<String>,
    pub admin_password: Option<String>,
    /// Store request/response bodies in request_logs (users with ZDR are always excluded).
    pub log_bodies: bool,
    pub max_attempts: usize,
    pub signup_bonus_credits: i64,
    pub cors_origins: Vec<String>,
    pub catalog_refresh_secs: u64,
    pub max_body_bytes: usize,
    /// Allow users to switch to paid plans without checkout (demo / pre-payment-integration).
    pub self_service_plans: bool,
    /// CAFECA wallet base URL for "Sign in with CAFECA" (empty = disabled).
    pub cafeca_wallet: Option<String>,
    /// Override the RPC used for ERC-1271 verification (defaults to the wallet's published RPC).
    pub cafeca_rpc: Option<String>,
    /// Exact web origins allowed to request CAFECA sign-in (scheme://host[:port]).
    pub cafeca_site_origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let master_raw = env::var("AICH_MASTER_KEY").unwrap_or_default();
        let master_key = parse_master_key(&master_raw)?;
        let jwt_secret = env::var("AICH_JWT_SECRET").unwrap_or_default();
        if jwt_secret.len() < 32 {
            anyhow::bail!(
                "AICH_JWT_SECRET must be at least 32 characters (got {}). Generate one with `openssl rand -base64 48` \
                 (or run ./scripts/init_env.sh)",
                jwt_secret.len()
            );
        }
        Ok(Self {
            bind_addr: env::var("AICH_BIND").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            database_url: env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?,
            redis_url: env::var("REDIS_URL").ok().filter(|s| !s.is_empty()),
            master_key,
            jwt_secret,
            admin_email: env::var("AICH_ADMIN_EMAIL").ok().filter(|s| !s.is_empty()),
            admin_password: env::var("AICH_ADMIN_PASSWORD")
                .ok()
                .filter(|s| !s.is_empty()),
            log_bodies: env_bool("AICH_LOG_BODIES", false),
            max_attempts: env_num("AICH_MAX_ATTEMPTS", 3),
            signup_bonus_credits: env_num("AICH_SIGNUP_BONUS_CREDITS", 200_000),
            cors_origins: env::var("AICH_CORS_ORIGINS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            catalog_refresh_secs: env_num("AICH_CATALOG_REFRESH_SECS", 30),
            max_body_bytes: env_num("AICH_MAX_BODY_BYTES", 20 * 1024 * 1024),
            self_service_plans: env_bool("AICH_SELF_SERVICE_PLANS", false),
            cafeca_wallet: match env::var("AICH_CAFECA_WALLET") {
                Ok(v) => Some(v.trim().to_string()).filter(|s| !s.is_empty()),
                Err(_) => Some("https://cafeca.io".to_string()),
            },
            cafeca_rpc: env::var("AICH_CAFECA_RPC").ok().filter(|s| !s.is_empty()),
            cafeca_site_origins: env::var("AICH_CAFECA_SITE_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000".into())
                .split(',')
                .filter_map(crate::cafeca::normalize_origin)
                .collect(),
        })
    }
}

fn env_bool(name: &str, default: bool) -> bool {
    env::var(name)
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(default)
}

fn env_num<T: std::str::FromStr>(name: &str, default: T) -> T {
    env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub fn parse_master_key(raw: &str) -> anyhow::Result<[u8; 32]> {
    use base64::Engine;
    let raw = raw.trim().trim_matches('"').trim_matches('\'');
    if raw.is_empty() {
        anyhow::bail!(
            "AICH_MASTER_KEY is not set. Generate one with `openssl rand -hex 32` (or run ./scripts/init_env.sh) \
             and put it in .env"
        );
    }
    let bytes = if raw.len() == 64 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
        hex::decode(raw)?
    } else {
        base64::engine::general_purpose::STANDARD.decode(raw).map_err(|_| {
            anyhow::anyhow!(
                "AICH_MASTER_KEY is neither 64 hex characters nor valid base64 (got {} characters). \
                 Generate one with `openssl rand -hex 32`",
                raw.len()
            )
        })?
    };
    let n = bytes.len();
    let arr: [u8; 32] = bytes.try_into().map_err(|_| {
        anyhow::anyhow!(
            "AICH_MASTER_KEY must decode to exactly 32 bytes but decoded to {n} bytes. \
             Generate one with `openssl rand -hex 32`"
        )
    })?;
    Ok(arr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn master_key_formats() {
        assert!(parse_master_key(&"ab".repeat(32)).is_ok());
        assert!(parse_master_key(&format!("\"{}\"", "ab".repeat(32))).is_ok());
        assert!(parse_master_key("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=").is_ok());
        let e = parse_master_key("").unwrap_err().to_string();
        assert!(e.contains("not set"));
        let e = parse_master_key("abcd").unwrap_err().to_string();
        assert!(e.contains("decoded to 3 bytes"));
    }
}
