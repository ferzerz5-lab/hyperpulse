// /api/markets.js
//
// Replaces the old SQL Explorer market_context queries. Those pulled from
// an indexed table that turned out to be unreliably slow (confirmed with
// Sahil — sometimes 25s+ even on a bare, unfiltered query) and had data
// quality issues (day_ntl_vlm and oracle_px coming back as 0 across every
// row in a batch).
//
// metaAndAssetCtxs instead asks Hyperliquid directly for the CURRENT state
// of every market in one request — no historical window, no polling table,
// so there's no "1h/6h/24h" concept here the way SQL Explorer had. It's
// just "give me everything, right now."
//
// Quicknode's own docs page for this method says it isn't available
// through their /info proxy since it's not part of the open-source node —
// but Sahil confirmed directly that it still returns data through the
// endpoint anyway, so this is built on his word, not the docs.

const INFO_URL = process.env.QN_INFO_URL; // full URL to your Hyperliquid /info endpoint, from your Quicknode dashboard

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!INFO_URL) {
    res.status(200).json({ demo: true, reason: "QN_INFO_URL not set" });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const upstream = await fetch(INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ error: "info endpoint error", detail: text });
      return;
    }

    const data = await upstream.json();
    res.status(200).json({ demo: false, data });
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed", detail: String(err && err.message ? err.message : err) });
  }
};

module.exports.config = { maxDuration: 15 };
