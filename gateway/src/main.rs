use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let json_logs = std::env::var("AICH_LOG_FORMAT")
        .map(|v| v == "json")
        .unwrap_or(false);
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info,sqlx=warn"));
    if json_logs {
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .json()
            .init();
    } else {
        tracing_subscriber::fmt().with_env_filter(filter).init();
    }

    let cfg = aich_gateway::config::Config::from_env()?;
    let bind = cfg.bind_addr.clone();
    let state = aich_gateway::app::build_state(cfg).await?;
    aich_gateway::app::spawn_background(state.clone());
    let app = aich_gateway::app::router(state);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!(%bind, "AICH gateway listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
            tracing::info!("shutting down");
        })
        .await?;
    Ok(())
}
