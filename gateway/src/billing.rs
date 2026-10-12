//! ISC accounting. All amounts are integer micro-ISC (1 ISC = 1,000,000 units).
//!
//! Each route stores the model's official upstream list price (micro-USD per 1M tokens), which
//! keeps the relative price between models ("收費比例"). The global `base` (費用基數, ISC per USD)
//! turns that into ISC, so changing one number re-prices every model proportionally:
//!
//!   charge = (prompt × input_price + completion × output_price) / 1e6  [µUSD]
//!            × ratio (route, default 1.0) × base (ISC per USD)       → µISC, rounded up

use sqlx::PgPool;
use uuid::Uuid;

use crate::catalog::{BillingSettings, Route};
use crate::types::Usage;

/// micro-ISC charged for `usage` on `route` under the current billing settings.
pub fn credits_for(usage: &Usage, route: &Route, billing: &BillingSettings) -> i64 {
    let raw = usage.prompt_tokens as i128 * route.input_price as i128
        + usage.completion_tokens as i128 * route.output_price as i128; // µUSD × 1e6
    let num = raw * billing.base_micro() * route.ratio_bp.max(0) as i128;
    const DEN: i128 = 10_000_000_000_000_000; // 1e6 (per-1M) × 1e6 (base_micro) × 1e4 (bp)
    ((num + DEN - 1) / DEN) as i64
}

/// Price shown to users: ISC per 1M tokens for a list price in µUSD per 1M tokens.
pub fn isc_per_million(price_micro_usd: i64, ratio_bp: i32, billing: &BillingSettings) -> f64 {
    price_micro_usd as f64 / 1_000_000.0 * (ratio_bp as f64 / 10_000.0) * billing.base
}

/// Deduct usage credits from the user and the API key counter. Returns the new balance.
/// Usage itself is recorded in request_logs; the ledger only holds grants/adjustments.
pub async fn charge(
    db: &PgPool,
    user_id: Uuid,
    api_key_id: Option<Uuid>,
    credits: i64,
) -> anyhow::Result<i64> {
    if credits <= 0 {
        return Ok(
            sqlx::query_scalar("SELECT credit_balance FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_one(db)
                .await?,
        );
    }
    let mut tx = db.begin().await?;
    let balance: i64 =
        sqlx::query_scalar("UPDATE users SET credit_balance = credit_balance - $1 WHERE id = $2 RETURNING credit_balance")
            .bind(credits)
            .bind(user_id)
            .fetch_one(&mut *tx)
            .await?;
    if let Some(k) = api_key_id {
        sqlx::query("UPDATE api_keys SET credits_used = credits_used + $1, last_used_at = now() WHERE id = $2")
            .bind(credits)
            .bind(k)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(balance)
}

/// Add (or remove, with a negative delta) credits and write a ledger entry atomically.
pub async fn grant(
    db: &PgPool,
    user_id: Uuid,
    delta: i64,
    reason: &str,
    ref_id: Option<&str>,
) -> anyhow::Result<i64> {
    let mut tx = db.begin().await?;
    let balance: i64 =
        sqlx::query_scalar("UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance")
            .bind(delta)
            .bind(user_id)
            .fetch_one(&mut *tx)
            .await?;
    sqlx::query("INSERT INTO credit_ledger (user_id, delta, balance_after, reason, ref_id) VALUES ($1, $2, $3, $4, $5)")
        .bind(user_id)
        .bind(delta)
        .bind(balance)
        .bind(reason)
        .bind(ref_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(balance)
}

/// Grant monthly plan credits to every user whose renewal date has passed.
/// Idempotent per period: the renewal timestamp is advanced in the same statement.
pub async fn run_renewals(db: &PgPool) -> anyhow::Result<u64> {
    let due: Vec<(Uuid, i64, String)> = sqlx::query_as(
        "UPDATE users u SET plan_renews_at = u.plan_renews_at + interval '1 month' \
         FROM plans p WHERE p.id = u.plan_id AND u.status = 'active' AND u.plan_renews_at IS NOT NULL AND u.plan_renews_at <= now() \
         RETURNING u.id, p.monthly_credits, p.id",
    )
    .fetch_all(db)
    .await?;
    for (user_id, credits, plan) in &due {
        if *credits > 0 {
            grant(
                db,
                *user_id,
                *credits,
                &format!("plan_renewal:{plan}"),
                None,
            )
            .await?;
        }
    }
    Ok(due.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route(inp: i64, out: i64, ratio_bp: i32) -> Route {
        Route {
            id: Uuid::nil(),
            provider_id: "p".into(),
            upstream_model: "m".into(),
            priority: 0,
            input_price: inp,
            output_price: out,
            tags: vec![],
            ratio_bp,
        }
    }

    fn base(b: f64) -> BillingSettings {
        BillingSettings {
            currency: "ISC".into(),
            base: b,
        }
    }

    #[test]
    fn base_one_equals_usd_cost() {
        // $3 / 1M input → 1,000 tokens cost $0.003 → 0.003 ISC = 3,000 µISC at base 1.
        assert_eq!(
            credits_for(
                &Usage::new(1000, 0),
                &route(3_000_000, 15_000_000, 10_000),
                &base(1.0)
            ),
            3000
        );
        assert_eq!(
            credits_for(
                &Usage::new(100, 50),
                &route(3_000_000, 15_000_000, 10_000),
                &base(1.0)
            ),
            300 + 750
        );
        assert_eq!(
            credits_for(&Usage::new(0, 0), &route(1, 1, 10_000), &base(1.0)),
            0
        );
        // Rounds up partial micro-ISC.
        assert_eq!(
            credits_for(&Usage::new(1, 0), &route(1, 0, 10_000), &base(1.0)),
            1
        );
    }

    #[test]
    fn base_scales_every_model_proportionally() {
        let flagship = route(3_000_000, 15_000_000, 10_000);
        let cheap = route(300_000, 2_500_000, 10_000);
        let u = Usage::new(10_000, 2_000);
        for b in [0.5, 1.0, 30.0, 32.5] {
            let f = credits_for(&u, &flagship, &base(b));
            let c = credits_for(&u, &cheap, &base(b));
            assert_eq!(f, (60_000.0 * b).ceil() as i64);
            assert_eq!(c, (8_000.0 * b).ceil() as i64);
        }
    }

    #[test]
    fn route_ratio_applies() {
        let u = Usage::new(1_000_000, 0);
        assert_eq!(
            credits_for(&u, &route(1_000_000, 0, 15_000), &base(2.0)),
            3_000_000
        ); // $1 × 1.5 × 2 = 3 ISC
        assert!((isc_per_million(1_000_000, 15_000, &base(2.0)) - 3.0).abs() < 1e-9);
    }
}
