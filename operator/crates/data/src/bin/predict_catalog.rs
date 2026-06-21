//! `predict-catalog [--active-only]`
//!
//! Print the Predict oracle catalog from the official testnet server. With
//! `--active-only`, filters to currently-active oracles sorted by expiry.

use anyhow::Result;
use clap::Parser;
use o88_data::PredictCatalog;

#[derive(Parser)]
struct Args {
    #[arg(long, default_value_t = false)]
    active_only: bool,
    #[arg(long, default_value_t = 50)]
    limit: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let catalog = PredictCatalog::default();
    let entries = if args.active_only {
        catalog.list_active().await?
    } else {
        catalog.list().await?
    };

    println!(
        "{:<5}  {:<13}  {:<20}  {:<14}  oracle_id",
        "asset", "expiry_ms", "status", "min_strike",
    );
    for e in entries.iter().take(args.limit) {
        println!(
            "{:<5}  {:<13}  {:<20?}  {:<14}  {}",
            e.underlying_asset, e.expiry, e.status, e.min_strike, e.oracle_id,
        );
    }
    eprintln!(
        "showed {}/{} entries",
        entries.iter().take(args.limit).count(),
        entries.len()
    );
    Ok(())
}
