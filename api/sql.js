// /api/sql.js
// Server-side proxy to Quicknode SQL Explorer.
//
// Why this exists instead of calling SQL Explorer from the browser:
// 1. Your Quicknode API key never reaches the client — it stays in the
//    Vercel environment variable QUICKNODE_API_KEY.
// 2. The client can only ask for one of the PRESETS below. It cannot send
//    arbitrary SQL, so nobody can point this endpoint at an expensive query
//    and burn through your SQL Explorer credits.

const CLUSTER_ID = "hyperliquid-core-mainnet";
const ENDPOINT = "https://api.quicknode.com/sql/rest/v1/query";

const PRESETS = {
  // Big single trades — the "whale" feed. $50k+ notional, last 6h, biggest first.
  whale_trades: `SELECT timestamp, coin, side, price, size, toFloat64(price) * toFloat64(size) AS notional_usd, buyer_address, seller_address FROM hyperliquid_trades WHERE block_time > now() - INTERVAL 6 HOUR AND toFloat64(price) * toFloat64(size) > 50000 ORDER BY block_number DESC, trade_id DESC LIMIT 40`,

  // Forced liquidation fills, most recent first.
  liquidations: `SELECT time, coin, side, price, size, toFloat64(price) * toFloat64(size) AS notional, liquidated_user, liquidation_mark_price FROM hyperliquid_fills WHERE block_time > now() - INTERVAL 24 HOUR AND is_liquidation = 1 ORDER BY block_number DESC, tid DESC LIMIT 40`,

  // Latest snapshot of funding / open interest / price per market, sorted by 24h volume.
  // Uses argMax to pull the single most-recent row per coin instead of
  // relying on a tight freshness window — markets don't all get a fresh
  // polled_at row on the same cadence, so filtering by a narrow window was
  // returning zero rows, and widening it to 6h made the scan too slow and
  // it timed out instead. This version is both correct and fast.
  market_context: `SELECT coin, argMax(funding, polled_at) AS funding, argMax(open_interest, polled_at) AS open_interest, argMax(mark_px, polled_at) AS mark_px, argMax(oracle_px, polled_at) AS oracle_px, argMax(prev_day_px, polled_at) AS prev_day_px, argMax(day_ntl_vlm, polled_at) AS day_ntl_vlm FROM hyperliquid_perpetual_market_contexts WHERE polled_at > now() - INTERVAL 24 HOUR GROUP BY coin ORDER BY toFloat64(day_ntl_vlm) DESC LIMIT 12`,

  // Platform-wide daily rollup — today vs yesterday, for the header stat row.
  overview: `SELECT day, total_volume_usd, total_fills, active_traders, liquidation_count, liquidation_volume_usd FROM hyperliquid_metrics_overview ORDER BY day DESC LIMIT 2`,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const preset = body && body.preset;
  const sql = PRESETS[preset];

  if (!sql) {
    res.status(400).json({ error: `Unknown preset. Expected one of: ${Object.keys(PRESETS).join(", ")}` });
    return;
  }

  const apiKey = process.env.QUICKNODE_API_KEY;

  if (!apiKey) {
    // No key configured yet — tell the client to fall back to demo data
    // instead of throwing, so the dashboard never looks broken.
    res.status(200).json({ demo: true, reason: "QUICKNODE_API_KEY not set" });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // stay under Vercel Hobby's ~10s function limit

    const upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ query: sql, clusterId: CLUSTER_ID }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ error: "SQL Explorer error", detail: text });
      return;
    }

    const data = await upstream.json();
    res.status(200).json({ demo: false, data });
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed", detail: String(err && err.message ? err.message : err) });
  }
};
