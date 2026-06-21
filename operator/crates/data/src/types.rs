//! Rust mirror of the deployed testnet `deepbook_predict::oracle` Move structs.
//!
//! Schema reference: `docs/deepbook-predict-testnet.md`.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// SVI volatility surface parameters. All values are decoded from the 1e9-scaled u64s
/// the chain stores. `rho` and `m` are signed (Move-side `deepbook_predict::i64::I64`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SviParams {
    /// Overall variance level (>= 0).
    pub a: Decimal,
    /// Slope of the smile wings (>= 0).
    pub b: Decimal,
    /// Signed skew parameter (typically negative — puts more expensive).
    pub rho: Decimal,
    /// Signed horizontal shift parameter.
    pub m: Decimal,
    /// ATM curvature / smoothness (>= 0).
    pub sigma: Decimal,
}

/// High-frequency price data updated by the cap holder ~every second.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PriceData {
    pub spot: Decimal,
    pub forward: Decimal,
}

/// Decoded `OracleSVI` shared object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OracleSvi {
    /// Shared-object id.
    pub id: String,
    /// Underlying asset name as stored on chain ("BTC", "ETH" once that exists).
    pub underlying: String,
    /// Expiry timestamp in milliseconds.
    pub expiry_ms: u64,
    /// True after `activate()` and before settlement; on-chain status decision
    /// also depends on whether `expiry` has passed.
    pub active: bool,
    pub prices: PriceData,
    pub svi: SviParams,
    /// `timestamp` of the last on-chain update, in milliseconds.
    pub timestamp_ms: u64,
    /// `Some(price)` once settlement landed; `None` otherwise.
    pub settlement_price: Option<Decimal>,
    /// IDs of authorized `OracleSVICap`s that can push updates (Block Scholes operator fleet).
    pub authorized_caps: Vec<String>,
}

impl OracleSvi {
    /// Lifecycle status implied by the oracle's stored fields + the supplied clock.
    /// Mirrors `oracle::status` in the deployed Move source.
    pub fn status(&self, now_ms: u64) -> OracleStatus {
        if self.settlement_price.is_some() {
            OracleStatus::Settled
        } else if now_ms >= self.expiry_ms {
            OracleStatus::PendingSettlement
        } else if !self.active {
            OracleStatus::Inactive
        } else {
            OracleStatus::Active
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OracleStatus {
    Inactive,
    Active,
    PendingSettlement,
    Settled,
}
