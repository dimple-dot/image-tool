/**
 * imageProvider.js
 * Modular image generation service.
 * Supports: pollinations (default), openai, replicate, huggingface
 * Controlled via IMAGE_PROVIDER env variable.
 */

const fetch = require("node-fetch");

// ─────────────────────────────────────────────
// BRAND / AIRLINE BLOCKLIST — terms to sanitize
// ─────────────────────────────────────────────
const BRAND_REPLACEMENTS = [
  // Airlines
  { pattern: /\bemirates\b/gi, replace: "airline" },
  { pattern: /\bindigo\b/gi, replace: "airline" },
  { pattern: /\bqatar airways\b/gi, replace: "airline" },
  { pattern: /\bair india\b/gi, replace: "airline" },
  { pattern: /\bindiGo\b/gi, replace: "airline" },
  { pattern: /\bspicejet\b/gi, replace: "airline" },
  { pattern: /\bvistara\b/gi, replace: "airline" },
  { pattern: /\bdelta\b/gi, replace: "airline" },
  { pattern: /\bunited airlines\b/gi, replace: "airline" },
  { pattern: /\bamerican airlines\b/gi, replace: "airline" },
  { pattern: /\blufthansa\b/gi, replace: "airline" },
  { pattern: /\bbritish airways\b/gi, replace: "airline" },
  { pattern: /\bair france\b/gi, replace: "airline" },
  { pattern: /\bsingapore airlines\b/gi, replace: "airline" },
  { pattern: /\bcathay pacific\b/gi, replace: "airline" },
  // Big brands
  { pattern: /\bnike\b/gi, replace: "brand" },
  { pattern: /\badidas\b/gi, replace: "brand" },
  { pattern: /\bapple\b/gi, replace: "tech company" },
  { pattern: /\bgoogle\b/gi, replace: "tech company" },
  { pattern: /\bmicrosoft\b/gi, replace: "tech company" },
  { pattern: /\bamazon\b/gi, replace: "e-commerce" },
  { pattern: /\bcocacola\b/gi, replace: "beverage brand" },
  { pattern: /\bcoca-cola\b/gi, replace: "beverage brand" },
  { pattern: /\bpepsi\b/gi, replace: "beverage brand" },
  { pattern: /\bmcdonald'?s\b/gi, replace: "fast food restaurant" },
];

// ─────────────────────────────────────────────
// GENERIC STYLE SUFFIX to enforce clean output
// ─────────────────────────────────────────────
const STYLE_SUFFIX =
  "photorealistic, clean, no text, no watermark, no logo, no brand, no UI overlay, blog-friendly, high quality";

/**
 * Clean prompt: remove brands, enforce generic style.
 */
function cleanPrompt(prompt) {
  let cleaned = prompt;
  for (const { pattern, replace } of BRAND_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replace);
  }
  // Strip any stray watermark/logo intent
  cleaned = cleaned.replace(/\b(watermark|logo|brand name|overlay|ui|infographic)\b/gi, "");
  cleaned = cleaned.trim();
  return `${cleaned}, ${STYLE_SUFFIX}`;
}

// ─────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────

/**
 * Pollinations AI (no API key needed)
 * Returns an image buffer.
 */
async function generateWithPollinations(prompt, width, height) {
  const encodedPrompt = encodeURIComponent(prompt);
  // Pollinations supports width/height as query params
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&nofeed=true&enhance=true`;

  const response = await fetch(url, { timeout: 60000 });
  if (!response.ok) {
    throw new Error(`Pollinations API error: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.buffer();
  return buffer;
}

/**
 * OpenAI DALL-E 3 (requires OPENAI_API_KEY)
 */
async function generateWithOpenAI(prompt, width, height) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1792x1024", // DALL-E 3 closest to wide formats
      response_format: "url",
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenAI API error");

  const imageUrl = data.data[0].url;
  const imgRes = await fetch(imageUrl);
  const buffer = await imgRes.buffer();
  return buffer;
}

/**
 * Replicate (requires REPLICATE_API_TOKEN)
 * Uses SDXL by default.
 */
async function generateWithReplicate(prompt, width, height) {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error("REPLICATE_API_TOKEN is not set in .env");

  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({
      version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b", // SDXL
      input: { prompt, width, height },
    }),
  });

  let prediction = await createRes.json();
  if (!createRes.ok) throw new Error(prediction.detail || "Replicate API error");

  // Poll for result
  while (prediction.status !== "succeeded" && prediction.status !== "failed") {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    prediction = await pollRes.json();
  }

  if (prediction.status === "failed") throw new Error("Replicate generation failed");

  const imageUrl = prediction.output[0];
  const imgRes = await fetch(imageUrl);
  const buffer = await imgRes.buffer();
  return buffer;
}

/**
 * HuggingFace Inference API (requires HUGGINGFACE_API_KEY)
 * Uses stable-diffusion-xl-base-1.0
 */
async function generateWithHuggingFace(prompt) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) throw new Error("HUGGINGFACE_API_KEY is not set in .env");

  const response = await fetch(
    "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HuggingFace API error: ${errText}`);
  }

  const buffer = await response.buffer();
  return buffer;
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────

/**
 * Generate raw image buffer from the configured provider.
 * @param {string} rawPrompt - User's original prompt
 * @param {number} width
 * @param {number} height
 * @returns {Buffer} raw image buffer
 */
async function generateImage(rawPrompt, width, height) {
  const provider = (process.env.IMAGE_PROVIDER || "pollinations").toLowerCase();
  const cleanedPrompt = cleanPrompt(rawPrompt);

  console.log(`[imageProvider] Using provider: ${provider}`);
  console.log(`[imageProvider] Cleaned prompt: ${cleanedPrompt}`);

  switch (provider) {
    case "pollinations":
      return generateWithPollinations(cleanedPrompt, width, height);
    case "openai":
      return generateWithOpenAI(cleanedPrompt, width, height);
    case "replicate":
      return generateWithReplicate(cleanedPrompt, width, height);
    case "huggingface":
      return generateWithHuggingFace(cleanedPrompt);
    default:
      throw new Error(`Unknown IMAGE_PROVIDER: "${provider}". Valid options: pollinations, openai, replicate, huggingface`);
  }
}

module.exports = { generateImage, cleanPrompt };