/**
 * server.js
 * Image Automation Tool — Express Backend
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { generateImage } = require("./imageprovider");
const { processImage, generateSlug, buildFilename } = require("./imageprocessor");

// ✅ FIX: app define karna zaroori hai
const app = express();

const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ✅ static + homepage serve
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    provider: process.env.IMAGE_PROVIDER || "pollinations",
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// POST /api/generate
// ─────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, width, height, fileName } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const w = parseInt(width, 10);
    const h = parseInt(height, 10);

    if (!w || !h || w < 50 || w > 4096 || h < 50 || h > 4096) {
      return res.status(400).json({
        error: "width and height must be between 50 and 4096",
      });
    }

    const slug = generateSlug(fileName || prompt);
    const filename = buildFilename(slug);

    console.log(`[server] Generating: "${prompt}" → ${w}x${h}`);

    const rawBuffer = await generateImage(prompt, w, h);
    const webpBuffer = await processImage(rawBuffer, w, h);

    res.set({
      "Content-Type": "image/webp",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": webpBuffer.length,
      "X-Filename": filename,
      "X-Slug": slug,
    });

    res.send(webpBuffer);

  } catch (err) {
    console.error("[server] ❌ Error:", err.message);
    res.status(500).json({
      error: err.message || "Image generation failed",
    });
  }
});

// ─────────────────────────────────────────────
// Slug Preview
// ─────────────────────────────────────────────
app.post("/api/slug-preview", (req, res) => {
  const { text, width = 1600, height = 500 } = req.body;

  if (!text) return res.status(400).json({ error: "text is required" });

  const slug = generateSlug(text);
  const filename = buildFilename(slug);

  res.json({ slug, filename });
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Running on http://localhost:${PORT}`);
});