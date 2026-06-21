//! o88-data: read-only data layer.
//!
//! - `predict_server` — DeepBook Predict catalog (off-chain server, no auth)
//! - `sui_rpc`        — thin Sui JSON-RPC client (sui_getObject, suix_queryEvents)
//! - `predict`        — on-chain OracleSVI reader (combines catalog + RPC)
//! - `types`          — OracleSvi / SviParams / CatalogEntry Rust types

pub mod keys;
pub mod managers;
pub mod predict;
pub mod predict_server;
pub mod scale;
pub mod sui_rpc;
pub mod types;

pub use managers::{
    Manager, Position, RedemptionCandidate, discover_managers, find_redemption_candidates,
    read_manager_positions,
};
pub use predict::PredictReader;
pub use predict_server::{CatalogEntry, OracleStatus, PredictCatalog};
pub use sui_rpc::{Network, SuiRpcClient};
pub use types::{OracleSvi, PriceData, SviParams};
