use std::sync::Arc;

use arc_swap::ArcSwap;
use sqlx::PgPool;

use crate::catalog::{self, Catalog};
use crate::config::Config;
use crate::kv::Kv;
use crate::logging::Logger;
use crate::routing::health::Health;
use crate::routing::keypool::KeyPool;

pub struct AppStateInner {
    pub cfg: Config,
    pub db: PgPool,
    pub http: reqwest::Client,
    pub kv: Kv,
    pub catalog: ArcSwap<Catalog>,
    pub health: Health,
    pub keypool: KeyPool,
    pub logger: Logger,
}

pub type AppState = Arc<AppStateInner>;

impl AppStateInner {
    pub async fn reload_catalog(&self) -> anyhow::Result<()> {
        let c = catalog::load(&self.db, &self.cfg.master_key).await?;
        self.catalog.store(Arc::new(c));
        Ok(())
    }
}
