use anyhow::{Context, Result, anyhow};
use clap::{Parser, Subcommand, ValueEnum};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;

const TESTNET: &str = "https://fullnode.testnet.sui.io:443";
const MAINNET: &str = "https://fullnode.mainnet.sui.io:443";

#[derive(Parser)]
#[command(name = "discover", about = "Sui on-chain discovery tool for o88")]
struct Cli {
    #[arg(long, value_enum, default_value_t = Net::Testnet, global = true)]
    net: Net,
    #[arg(long, global = true, help = "Override RPC URL (otherwise derived from --net)")]
    rpc: Option<String>,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Copy, Clone, ValueEnum)]
enum Net {
    Mainnet,
    Testnet,
}

impl Net {
    fn url(self) -> &'static str {
        match self {
            Net::Mainnet => MAINNET,
            Net::Testnet => TESTNET,
        }
    }
}

#[derive(Subcommand)]
enum Cmd {
    /// Scan all owned objects of an address. Groups by package address derived from object type.
    /// Optional --include filters types by any-of substring match (case-insensitive).
    Scan {
        address: String,
        #[arg(long, value_delimiter = ',')]
        include: Vec<String>,
        #[arg(long, default_value_t = 50, help = "Page size (max 50)")]
        page_size: usize,
        #[arg(long, default_value_t = 100, help = "Safety cap on page count")]
        max_pages: usize,
        #[arg(long, value_enum, default_value_t = Out::Table)]
        out: Out,
    },
    /// List Move modules of a package.
    Modules {
        package: String,
        #[arg(long, value_enum, default_value_t = Out::Table)]
        out: Out,
    },
    /// Print package metadata + module summary in one call (uses sui_getNormalizedMoveModulesByPackage).
    Package {
        package: String,
    },
    /// Recent transactions originating from an address. Useful to find recent publishes.
    Txns {
        address: String,
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    /// Query events filtered by Move event type. Type form: <pkg>::<module>::<event_name>
    Events {
        event_type: String,
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
}

#[derive(Copy, Clone, ValueEnum)]
enum Out {
    Table,
    Json,
}

#[derive(Serialize)]
struct OwnedObject {
    object_id: String,
    object_type: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let rpc = cli.rpc.unwrap_or_else(|| cli.net.url().to_string());
    let client = reqwest::Client::builder().build()?;

    match cli.cmd {
        Cmd::Scan { address, include, page_size, max_pages, out } => {
            let objects = scan_owned(&client, &rpc, &address, page_size, max_pages).await?;
            let filtered: Vec<&OwnedObject> = if include.is_empty() {
                objects.iter().collect()
            } else {
                let lc: Vec<String> = include.iter().map(|s| s.to_lowercase()).collect();
                objects
                    .iter()
                    .filter(|o| {
                        let t = o.object_type.to_lowercase();
                        lc.iter().any(|k| t.contains(k))
                    })
                    .collect()
            };
            render_scan(&objects, &filtered, out, &include);
        }
        Cmd::Modules { package, out } => {
            let modules = fetch_modules(&client, &rpc, &package).await?;
            render_modules(&package, &modules, out);
        }
        Cmd::Package { package } => {
            let modules = fetch_modules(&client, &rpc, &package).await?;
            println!("package: {package}");
            println!("modules ({}):", modules.len());
            for m in &modules {
                println!("  {m}");
            }
        }
        Cmd::Txns { address, limit } => {
            let txns = fetch_txns(&client, &rpc, &address, limit).await?;
            for (digest, kind, ts) in txns {
                println!("{ts}  {kind:24}  {digest}");
            }
        }
        Cmd::Events { event_type, limit } => {
            let events = fetch_events(&client, &rpc, &event_type, limit).await?;
            for (ts, sender, snippet) in events {
                println!("{ts}  {sender}  {snippet}");
            }
        }
    }

    Ok(())
}

async fn rpc_call(client: &reqwest::Client, rpc: &str, method: &str, params: Value) -> Result<Value> {
    let body = json!({"jsonrpc":"2.0","id":1,"method":method,"params":params});
    let resp: Value = client
        .post(rpc)
        .json(&body)
        .send()
        .await
        .with_context(|| format!("POST {rpc}"))?
        .json()
        .await
        .context("decode JSON")?;
    if let Some(err) = resp.get("error") {
        return Err(anyhow!("rpc error from {method}: {err}"));
    }
    resp.get("result")
        .cloned()
        .ok_or_else(|| anyhow!("no result in response: {resp}"))
}

async fn scan_owned(
    client: &reqwest::Client,
    rpc: &str,
    address: &str,
    page_size: usize,
    max_pages: usize,
) -> Result<Vec<OwnedObject>> {
    let mut cursor: Option<String> = None;
    let mut out = Vec::new();
    for page in 1..=max_pages {
        let params = json!([
            address,
            { "options": { "showType": true } },
            cursor,
            page_size
        ]);
        let res = rpc_call(client, rpc, "suix_getOwnedObjects", params).await?;
        if let Some(data) = res.get("data").and_then(Value::as_array) {
            for d in data {
                let object_id = d
                    .pointer("/data/objectId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let object_type = d
                    .pointer("/data/type")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                if !object_id.is_empty() {
                    out.push(OwnedObject { object_id, object_type });
                }
            }
        }
        let has_next = res.get("hasNextPage").and_then(Value::as_bool).unwrap_or(false);
        if !has_next {
            eprintln!("scanned {page} pages, {} objects", out.len());
            break;
        }
        cursor = res
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string);
        if page == max_pages {
            eprintln!("hit --max-pages={max_pages}, results may be truncated");
        }
    }
    Ok(out)
}

async fn fetch_modules(client: &reqwest::Client, rpc: &str, package: &str) -> Result<Vec<String>> {
    let params = json!([package]);
    let res = rpc_call(client, rpc, "sui_getNormalizedMoveModulesByPackage", params).await?;
    let mut names: Vec<String> = res
        .as_object()
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    names.sort();
    Ok(names)
}

async fn fetch_txns(
    client: &reqwest::Client,
    rpc: &str,
    address: &str,
    limit: usize,
) -> Result<Vec<(String, String, String)>> {
    let params = json!([
        { "filter": { "FromAddress": address }, "options": { "showInput": true } },
        null,
        limit,
        true // descending
    ]);
    let res = rpc_call(client, rpc, "suix_queryTransactionBlocks", params).await?;
    let mut out = Vec::new();
    if let Some(data) = res.get("data").and_then(Value::as_array) {
        for d in data {
            let digest = d.get("digest").and_then(Value::as_str).unwrap_or("").to_string();
            let ts = d.get("timestampMs").and_then(Value::as_str).unwrap_or("").to_string();
            let kind = d
                .pointer("/transaction/data/transaction/kind")
                .and_then(Value::as_str)
                .unwrap_or("Unknown")
                .to_string();
            out.push((digest, kind, ts));
        }
    }
    Ok(out)
}

async fn fetch_events(
    client: &reqwest::Client,
    rpc: &str,
    event_type: &str,
    limit: usize,
) -> Result<Vec<(String, String, String)>> {
    let params = json!([
        { "MoveEventType": event_type },
        null,
        limit,
        true // descending
    ]);
    let res = rpc_call(client, rpc, "suix_queryEvents", params).await?;
    let mut out = Vec::new();
    if let Some(data) = res.get("data").and_then(Value::as_array) {
        for d in data {
            let ts = d.get("timestampMs").and_then(Value::as_str).unwrap_or("").to_string();
            let sender = d.get("sender").and_then(Value::as_str).unwrap_or("").to_string();
            let snippet = d.get("parsedJson").map(|v| v.to_string()).unwrap_or_default();
            let trimmed: String = snippet.chars().take(160).collect();
            out.push((ts, sender, trimmed));
        }
    }
    Ok(out)
}

fn package_from_type(t: &str) -> Option<&str> {
    t.split_once("::").map(|(p, _)| p)
}

fn render_scan(all: &[OwnedObject], filtered: &[&OwnedObject], out: Out, include: &[String]) {
    match out {
        Out::Json => {
            let json = serde_json::to_string_pretty(&filtered).unwrap();
            println!("{json}");
            return;
        }
        Out::Table => {}
    }
    let mut by_pkg: BTreeMap<&str, BTreeMap<&str, Vec<&str>>> = BTreeMap::new();
    for o in filtered {
        let pkg = package_from_type(&o.object_type).unwrap_or("?");
        by_pkg
            .entry(pkg)
            .or_default()
            .entry(&o.object_type)
            .or_default()
            .push(&o.object_id);
    }
    eprintln!(
        "total: {} objects, filtered: {} (include: {:?})",
        all.len(),
        filtered.len(),
        include
    );
    for (pkg, types) in &by_pkg {
        println!("\n{pkg}");
        for (ty, ids) in types {
            println!("  {ty}  ({} obj)", ids.len());
            for id in ids {
                println!("    {id}");
            }
        }
    }
    eprintln!("\n{} distinct packages", by_pkg.len());
}

fn render_modules(package: &str, modules: &[String], out: Out) {
    match out {
        Out::Json => {
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({ "package": package, "modules": modules }))
                    .unwrap()
            );
        }
        Out::Table => {
            println!("package: {package}");
            println!("modules ({}):", modules.len());
            for m in modules {
                println!("  {m}");
            }
        }
    }
}
