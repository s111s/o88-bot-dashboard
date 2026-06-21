//! `inspect-oracle <ORACLE_ID>`
//!
//! Read one OracleSVI from chain via sui_getObject + parse into the typed
//! [`o88_data::OracleSvi`] shape. Prints decoded fields.

use anyhow::Result;
use clap::Parser;
use o88_data::{Network, PredictReader, PredictCatalog, SuiRpcClient};

#[derive(Parser)]
struct Args {
    oracle_id: String,
    #[arg(long, default_value = "testnet")]
    net: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let net = match args.net.as_str() {
        "mainnet" => Network::Mainnet,
        _ => Network::Testnet,
    };
    let reader = PredictReader::new(
        PredictCatalog::default(),
        SuiRpcClient::for_network(net),
    );
    let o = reader.read_oracle(&args.oracle_id).await?;

    println!("id              {}", o.id);
    println!("underlying      {}", o.underlying);
    println!("expiry_ms       {}", o.expiry_ms);
    println!("active          {}", o.active);
    println!("spot            {}", o.prices.spot);
    println!("forward         {}", o.prices.forward);
    println!("svi.a           {}", o.svi.a);
    println!("svi.b           {}", o.svi.b);
    println!("svi.rho         {}", o.svi.rho);
    println!("svi.m           {}", o.svi.m);
    println!("svi.sigma       {}", o.svi.sigma);
    println!("timestamp_ms    {}", o.timestamp_ms);
    println!(
        "settled_price   {}",
        o.settlement_price
            .map(|d| d.to_string())
            .unwrap_or_else(|| "—".into())
    );
    println!("auth_caps       {} caps", o.authorized_caps.len());
    for c in &o.authorized_caps {
        println!("  {c}");
    }
    Ok(())
}
