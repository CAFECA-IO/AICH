//! Compute Credits accounting. 1 credit = USD 0.000001.
//! Route prices are credits per 1M tokens, so cost = ceil((p*in + c*out) / 1e6).

use sqlx::PgPool;
use uuid::Uuid;

use crate::catalog::Route;
use crate::types::Usage;

pub fn credits_for(usage: &Usage, route: &Route) -> i64 {
    let raw = usage.prompt_tokens as i128 * route.input_price as i128
        + usage.completion_tokens as i128 * route.output_price as i128;
    ((raw + 999_999) / 1_000_000) as i64
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

    fn route(inp: i64, out: i64) -> Route {
        Route {
            id: Uuid::nil(),
            provider_id: "p".into(),
            upstream_model: "m".into(),
            priority: 0,
            input_price: inp,
            output_price: out,
            tags: vec![],
        }
    }

    #[test]
    fn computes_credits_like_spec() {
        // Spec example: flagship input 1,000 tokens = 3,000 credits at $3/Mtok.
        assert_eq!(
            credits_for(&Usage::new(1000, 0), &route(3_000_000, 15_000_000)),
            3000
        );
        // $0.075/Mtok → 75 credits per 1K input tokens.
        assert_eq!(
            credits_for(&Usage::new(1000, 0), &route(75_000, 300_000)),
            75
        );
        // Rounds up partial credits.
        assert_eq!(credits_for(&Usage::new(1, 0), &route(1, 0)), 1);
        assert_eq!(credits_for(&Usage::new(0, 0), &route(1, 1)), 0);
        assert_eq!(
            credits_for(&Usage::new(100, 50), &route(3_000_000, 15_000_000)),
            300 + 750
        );
    }
}
