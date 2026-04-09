/**
 * imageProcessor.js
 * Handles image resizing and WebP conversion using sharp.
 */

const sharp = require("sharp");

/**
 * Resize a raw image buffer to the target dimensions and convert to WebP.
 * @param {Buffer} inputBuffer - Raw image data from provider
 * @param {number} width       - Target width in pixels
 * @param {number} height      - Target height in pixels
 * @param {number} quality     - WebP quality (1-100, default 85)
 * @returns {Buffer}           - Processed WebP buffer
 */
async function processImage(inputBuffer, width, height, quality = 85) {
  if (!inputBuffer || inputBuffer.length === 0) {
    throw new Error("Input buffer is empty or invalid");
  }

  const webpBuffer = await sharp(inputBuffer)
    .resize(width, height, {
      fit: "cover",        // crop/fill to exact dimensions
      position: "center",  // center the crop
    })
    .webp({ quality })
    .toBuffer();

  console.log(`[imageProcessor] Processed → ${width}x${height} WebP (quality: ${quality})`);
  return webpBuffer;
}

/**
 * Generate a URL/filename-safe slug from user text.
 * "Flight Airlines Banner!" → "flight-airlines-banner"
 */
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")  // remove special chars
    .trim()
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/-+/g, "-")            // collapse multiple hyphens
    .replace(/^-|-$/g, "");         // trim leading/trailing hyphens
}

/**
 * Build the final download filename.
 * slug + dimensions + .webp
 */
function buildFilename(slug) {
  return `${slug}.webp`;
}

module.exports = { processImage, generateSlug, buildFilename };