//! Client for the official DeepBook Predict server.
//!
//! Endpoint: `https://predict-server.testnet.mystenlabs.com/oracles`.
//! No auth. Returns every oracle ever created (active + settled).
//!
//! This is the canonical source for "what oracles exist." For freshness on a single
//! oracle's state, use [`crate::PredictReader`] instead (it hits sui_getObject).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const DEFAULT_BASE_URL: &str = "https://predict-server.testnet.mystenlabs.com";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OracleStatus {
    /// On-chain object exists but hasn't been activated by the cap holder yet.
    Created,
    /// Activated; accepting mints; waiting for expiry.
    Active,
    /// Past expiry, settlement_price frozen; redeemable.
    Settled,
    /// Deactivated without settling (rare admin path).
    Inactive,
    /// Forward-compat: any status the predict-server adds that we haven't
    /// taught the enum about. Bot K-redeem treats unknown as not-settled.
    #[serde(other)]
    Unknown,
}

/// One row from `GET /oracles`. Numeric fields stay as u64 (raw 1e9 scaling).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub predict_id: String,
    pub oracle_id: String,
    pub oracle_cap_id: String,
    pub underlying_asset: String,
    pub expiry: u64,
    pub min_strike: u64,
    pub tick_size: u64,
    pub status: OracleStatus,
    pub activated_at: Option<u64>,
    pub settlement_price: Option<u64>,
    pub settled_at: Option<u64>,
    pub created_checkpoint: u64,
}

pub struct PredictCatalog {
    http: reqwest::Client,
    base_url: String,
}

impl Default for PredictCatalog {
    fn default() -> Self {
        Self::new(DEFAULT_BASE_URL)
    }
}

impl PredictCatalog {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("reqwest client"),
            base_url: base_url.into(),
        }
    }

    /// Fetch the full oracle catalog. Typical response: 4,000+ rows.
    pub async fn list(&self) -> Result<Vec<CatalogEntry>> {
        self.http
            .get(format!("{}/oracles", self.base_url))
            .send()
            .await
            .context("GET /oracles")?
            .json::<Vec<CatalogEntry>>()
            .await
            .context("decode /oracles")
    }

    /// Subset filtered to currently-active oracles, sorted by `expiry` ascending.
    pub async fn list_active(&self) -> Result<Vec<CatalogEntry>> {
        let mut all = self.list().await?;
        all.retain(|e| e.status == OracleStatus::Active);
        all.sort_by_key(|e| e.expiry);
        Ok(all)
    }
}
