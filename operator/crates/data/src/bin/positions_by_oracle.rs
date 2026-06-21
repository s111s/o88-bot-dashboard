//! `positions-by-oracle [--limit N] [--top K]`
//!
//! Scan PredictManagers + their positions, group by oracle_id, print the oracles
//! with the most open positions. Useful for finding a market that has actual
//! traffic so the dashboard's per-oracle panels actually populate.

use anyhow::Result;
use clap::Parser;
use o88_data::{
    Network, PredictCatalog, SuiRpcClient, discover_managers, read_manager_positions,
};
use std::collections::HashMap;

#[derive(Parser)]
struct Args {
    /// Max number of PredictManagers to scan back (newest first).
    #[arg(long, default_value_t = 200)]
    limit: usize,
    /// Print only the top K oracles by position count.
    #[arg(long, default_value_t = 20)]
    top: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let rpc = SuiRpcClient::for_network(Network::Testnet);

    // Build a catalog index for asset / expiry / status lookups.
    let cat = PredictCatalog::default();
    let oracles = cat.list().await?;
    let mut by_id: HashMap<String, &o88_data::CatalogEntry> = HashMap::new();
    for o in &oracles {
        by_id.insert(o.oracle_id.clone(), o);
    }

    // Scan managers.
    let managers = discover_managers(&rpc, args.limit).await?;
    eprintln!("scanned {} managers", managers.len());

    let mut totals: HashMap<String, (usize, u64, std::collections::HashSet<String>)> =
        HashMap::new();
    let mut with_positions = 0usize;
    for (i, m) in managers.iter().enumerate() {
        match read_manager_positions(&rpc, &m.manager_id).await {
            Ok(positions) => {
                if !positions.is_empty() {
                    with_positions += 1;
                    eprintln!(
                        "  [{i:>3}/{}] {}  +{} positions",
                        managers.len(),
                        short(&m.manager_id),
                        positions.len()
                    );
                }
                for p in &positions {
                    let entry =
                        totals.entry(p.oracle_id.clone()).or_insert((0, 0, Default::default()));
                    entry.0 += 1;
                    entry.1 += p.quantity;
                    entry.2.insert(p.owner.clone());
                }
            }
            Err(e) => eprintln!("  [{i:>3}] err on {}: {e}", short(&m.manager_id)),
        }
    }
    eprintln!(
        "\n{} of {} managers had open positions · {} oracles touched",
        with_positions,
        managers.len(),
        totals.len()
    );

    let mut ranked: Vec<(&String, &(usize, u64, std::collections::HashSet<String>))> =
        totals.iter().collect();
    ranked.sort_by(|a, b| b.1.0.cmp(&a.1.0));

    println!();
    println!(
        "{:<5}  {:<10}  {:<20}  {:<7}  {:<7}  {:<7}  oracle_id",
        "asset", "status", "expiry", "pos", "qty", "owners"
    );
    for (oid, (count, qty, owners)) in ranked.iter().take(args.top) {
        let cat = by_id.get(*oid);
        let asset = cat.map(|c| c.underlying_asset.as_str()).unwrap_or("?");
        let status = cat
            .map(|c| match c.status {
                o88_data::OracleStatus::Active => "active",
                o88_data::OracleStatus::Settled => "settled",
                o88_data::OracleStatus::Inactive => "inactive",
            })
            .unwrap_or("?");
        let expiry = cat
            .map(|c| format_expiry(c.expiry))
            .unwrap_or_else(|| "?".into());
        println!(
            "{:<5}  {:<10}  {:<20}  {:<7}  {:<7}  {:<7}  {}",
            asset,
            status,
            expiry,
            count,
            qty,
            owners.len(),
            oid
        );
    }

    println!();
    println!("dashboard links (top {} active markets):", args.top.min(ranked.len()));
    let mut shown = 0;
    for (oid, _) in &ranked {
        if shown >= args.top {
            break;
        }
        let cat = by_id.get(*oid);
        if matches!(cat.map(|c| &c.status), Some(o88_data::OracleStatus::Active)) {
            println!("  https://dashboard.o88.gg/predict/o/{}", oid);
            shown += 1;
        }
    }
    Ok(())
}

fn short(s: &str) -> String {
    if s.len() < 12 {
        s.to_string()
    } else {
        format!("{}…{}", &s[..6], &s[s.len() - 4..])
    }
}

fn format_expiry(ms: u64) -> String {
    // Cheap formatter — no chrono dep.
    let secs = ms / 1000;
    let days_since_epoch = secs / 86_400;
    let hours = (secs % 86_400) / 3600;
    let mins = (secs % 3600) / 60;
    // Convert days to YYYY-MM-DD (rough — good enough for an ops report).
    let mut year = 1970;
    let mut d = days_since_epoch;
    loop {
        let ly = is_leap(year);
        let days = if ly { 366 } else { 365 };
        if d < days {
            break;
        }
        d -= days;
        year += 1;
    }
    let months = [31, if is_leap(year) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 0u32;
    let mut day_of_month = d;
    for (i, dm) in months.iter().enumerate() {
        if day_of_month < (*dm as u64) {
            month = (i as u32) + 1;
            break;
        }
        day_of_month -= *dm as u64;
    }
    format!("{}-{:02}-{:02} {:02}:{:02}", year, month, day_of_month + 1, hours, mins)
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}
