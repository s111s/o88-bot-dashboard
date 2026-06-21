//! `k-redeem-watch [--limit N]`
//!
//! Bot K-redeem observability binary. Discovers every PredictManager that's ever
//! been created on testnet, reads each manager's open positions, cross-references
//! against currently-settled oracles, and prints every position that is ready for
//! `predict::redeem_permissionless<Quote>`.
//!
//! Pure read-only. The actual tx-submission layer ships in Phase 1.3b (needs
//! testnet keypair + DUSDC + ptb builder).

use anyhow::Result;
use clap::Parser;
use o88_data::{
    Network, PredictCatalog, SuiRpcClient, discover_managers, find_redemption_candidates,
    read_manager_positions,
};
use rust_decimal::Decimal;

#[derive(Parser)]
struct Args {
    /// Max number of PredictManagers to scan back (newest first).
    #[arg(long, default_value_t = 200)]
    limit: usize,
    /// Skip manager-position reads (just print discovered managers + settled oracles).
    #[arg(long, default_value_t = false)]
    catalog_only: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let rpc = SuiRpcClient::for_network(Network::Testnet);

    // 1) Catalog → which oracles are settled today.
    let cat = PredictCatalog::default();
    let oracles = cat.list().await?;
    let settled: Vec<(String, Decimal)> = oracles
        .iter()
        .filter(|o| matches!(o.status, o88_data::OracleStatus::Settled))
        .filter_map(|o| {
            o.settlement_price.map(|p| {
                (
                    o.oracle_id.clone(),
                    Decimal::from(p) / Decimal::from(1_000_000_000u64),
                )
            })
        })
        .collect();
    eprintln!("catalog: {} oracles · {} settled", oracles.len(), settled.len());

    // 2) Discover PredictManagers.
    let managers = discover_managers(&rpc, args.limit).await?;
    eprintln!("scanned {} PredictManagerCreated events", managers.len());

    if args.catalog_only {
        for m in &managers {
            println!("{}  owner={}  created_at_ms={:?}", m.manager_id, m.owner, m.created_at_ms);
        }
        return Ok(());
    }

    // 3) For each manager, fetch its open positions.
    let mut all_positions = Vec::new();
    let mut errors = 0;
    for (i, m) in managers.iter().enumerate() {
        match read_manager_positions(&rpc, &m.manager_id).await {
            Ok(ps) => {
                if !ps.is_empty() {
                    eprintln!(
                        "  [{i:>3}/{}] {}  owner={}  positions={}",
                        managers.len(),
                        short(&m.manager_id),
                        short(&m.owner),
                        ps.len()
                    );
                }
                all_positions.extend(ps);
            }
            Err(e) => {
                errors += 1;
                eprintln!("  [{i:>3}] read err on {}: {e}", short(&m.manager_id));
            }
        }
    }
    eprintln!(
        "total open positions: {} · read errors: {errors}",
        all_positions.len()
    );

    // 4) Match against settled oracles.
    let candidates = find_redemption_candidates(&all_positions, &settled);
    println!();
    println!(
        "{:<14} {:<14} {:<14} {:<6} {:<10} {:<14} {:<14} {:<10}",
        "manager", "oracle", "owner", "side", "quantity", "strike", "settle@", "result"
    );
    for c in &candidates {
        println!(
            "{:<14} {:<14} {:<14} {:<6} {:<10} ${:<13} ${:<13} {:<10}",
            short(&c.position.manager_id),
            short(&c.position.oracle_id),
            short(&c.position.owner),
            if c.position.is_up { "UP" } else { "DOWN" },
            c.position.quantity,
            c.position.strike / 1_000_000_000,
            c.settlement_price.round_dp(0),
            if c.wins { "WIN→pay" } else { "loss" },
        );
    }
    println!();
    println!(
        "redemption candidates: {}",
        candidates.iter().filter(|c| c.wins).count()
    );
    Ok(())
}

fn short(s: &str) -> String {
    if s.len() < 12 {
        s.to_string()
    } else {
        format!("{}…{}", &s[..6], &s[s.len() - 4..])
    }
}
