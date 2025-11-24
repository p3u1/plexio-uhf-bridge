import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 7000;

// IMPORTANT: must be like "https://plexio.stream/addon/XXXXXXXX"
const PLEXIO_ADDON_BASE = process.env.PLEXIO_ADDON_BASE;

if (!PLEXIO_ADDON_BASE) {
  console.error("[BOOT] Missing PLEXIO_ADDON_BASE env var");
} else {
  console.log("[BOOT] Using PLEXIO_ADDON_BASE =", PLEXIO_ADDON_BASE);
}

// ---- Manifest (made more Torrentio-like) ----
const manifest = {
  id: "com.p3u1.plexio.bridge",
  version: "0.0.2",
  name: "Plexio Bridge (Streams)",
  description:
    "Exposes your Plexio addon as a stream-only Stremio addon for IPTV/UHF clients.",
  logo: "https://plexio.stream/favicon.ico",

  // Torrentio-style: just declare "stream"
  resources: ["stream"],

  // UHF already accepts these with Torrentio
  types: ["movie", "series"],

  // Hint: these IDs are typically IMDB-style, same as many public addons
  idPrefixes: ["tt"],

  catalogs: [],

  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};

// ---- Helpers ----
function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

// ---- Routes ----

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "plexio-uhf-bridge",
    plexioBaseConfigured: Boolean(PLEXIO_ADDON_BASE)
  });
});

// Manifest endpoint
app.get("/manifest.json", (req, res) => {
  log("MANIFEST requested from", req.ip || "unknown");
  res.json(manifest);
});

// Stream endpoint that forwards to your Plexio addon
app.get("/stream/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  const originalQuery = req.url.split("?")[1];
  const qs = originalQuery ? `?${originalQuery}` : "";

  log("STREAM request:", {
    ip: req.ip,
    type,
    id,
    query: req.query
  });

  if (!PLEXIO_ADDON_BASE) {
    log("STREAM aborted: PLEXIO_ADDON_BASE not set");
    return res.status(500).json({ streams: [] });
  }

  const target = `${PLEXIO_ADDON_BASE}/stream/${encodeURIComponent(
    type
  )}/${encodeURIComponent(id)}.json${qs}`;

  log("Forwarding to Plexio:", target);

  try {
    const r = await fetch(target);

    log("Plexio response:", {
      status: r.status,
      ok: r.ok
    });

    if (!r.ok) {
      const text = await r.text();
      log("Plexio non-OK body:", text.slice(0, 300));
      return res.json({ streams: [] });
    }

    const data = await r.json();
    const count = Array.isArray(data.streams) ? data.streams.length : 0;

    log(`Returning ${count} stream(s) to client`);

    res.json({ streams: data.streams || [] });
  } catch (e) {
    log("Bridge error:", e.message);
    res.json({ streams: [] });
  }
});

// Fallback for anything else – optional but tidy
app.use((req, res) => {
  log("Unknown path", req.method, req.originalUrl);
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  log(`Plexio bridge listening on port ${PORT}`);
});
