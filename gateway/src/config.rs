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
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let master_raw = env::var("AICH_MASTER_KEY").unwrap_or_default();
        let master_key = parse_master_key(&master_raw)?;
        let jwt_secret = env::var("AICH_JWT_SECRET").unwrap_or_default();
        if jwt_secret.len() < 32 {
            anyhow::bail!("AICH_JWT_SECRET must be at least 32 characters");
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
    let raw = raw.trim();
    let bytes = if raw.len() == 64 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
        hex::decode(raw)?
    } else {
        base64::engine::general_purpose::STANDARD
            .decode(raw)
            .map_err(|_| {
                anyhow::anyhow!("AICH_MASTER_KEY must be 32 bytes as 64 hex chars or base64")
            })?
    };
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("AICH_MASTER_KEY must decode to exactly 32 bytes"))?;
    Ok(arr)
}
