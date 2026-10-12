//! Account creation shared by email registration and Sign in with CAFECA.
//!
//! The very first account created on a fresh installation becomes the administrator (on the
//! Enterprise plan). A transaction-scoped advisory lock serialises concurrent sign-ups so two
//! simultaneous "first" users cannot both become admin.

use sqlx::PgPool;
use uuid::Uuid;

use crate::billing;

/// Arbitrary constant identifying the "first user becomes admin" critical section.
const FIRST_ADMIN_LOCK: i64 = 0x41_49_43_48_01; // "AICH" 01

pub struct NewUser<'a> {
    pub email: Option<&'a str>,
    pub password_hash: Option<&'a str>,
    pub name: &'a str,
    pub cafeca_account: Option<&'a str>,
    pub cafeca_handle: Option<&'a str>,
}

pub struct Created {
    pub id: Uuid,
    pub role: String,
}

/// Insert a user; returns its id and role. Grants the sign-up bonus (and, for the first admin,
/// the Enterprise plan's monthly allowance).
pub async fn create_user(
    db: &PgPool,
    u: NewUser<'_>,
    signup_bonus: i64,
) -> Result<Created, sqlx::Error> {
    let id = Uuid::new_v4();
    let mut tx = db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(FIRST_ADMIN_LOCK)
        .execute(&mut *tx)
        .await?;
    // The optional env-bootstrapped admin (AICH_ADMIN_EMAIL) does not count: the first real person still becomes admin.
    let has_admin: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND NOT is_bootstrap)",
    )
    .fetch_one(&mut *tx)
    .await?;
    let (role, plan) = if has_admin {
        ("user", "free")
    } else {
        ("admin", "enterprise")
    };
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, name, role, plan_id, plan_renews_at, cafeca_account, cafeca_handle, last_login_at) \
         VALUES ($1, $2, $3, $4, $5, $6, now() + interval '1 month', $7, $8, now())",
    )
    .bind(id)
    .bind(u.email)
    .bind(u.password_hash)
    .bind(u.name)
    .bind(role)
    .bind(plan)
    .bind(u.cafeca_account)
    .bind(u.cafeca_handle)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    if signup_bonus > 0 {
        billing::grant(db, id, signup_bonus, "signup_bonus", u.cafeca_account)
            .await
            .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    }
    if role == "admin" {
        let monthly: i64 =
            sqlx::query_scalar("SELECT monthly_credits FROM plans WHERE id = 'enterprise'")
                .fetch_optional(db)
                .await?
                .unwrap_or(0);
        if monthly > 0 {
            billing::grant(
                db,
                id,
                monthly,
                "plan_start:enterprise",
                Some("first_admin"),
            )
            .await
            .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        }
        tracing::info!(user = %id, "first account created — granted administrator role");
    }
    Ok(Created {
        id,
        role: role.to_string(),
    })
}
