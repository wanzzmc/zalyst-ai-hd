// api/enhance.js
// Menerima { image, model } dari frontend, memetakan model ke endpoint AI
// yang sesuai, meneruskan request, lalu mengembalikan hasilnya ke frontend.

const fetch = require("node-fetch");

const MODEL_ENDPOINTS = {
  hdv1: { url: "https://api-faa.my.id/faa/superhd", param: "url" },
  hdv2: { url: "https://api-faa.my.id/faa/hdv2", param: "url" },
  hdv3: { url: "https://api-faa.my.id/faa/hdv3", param: "image" },
  hdv4: { url: "https://api-faa.my.id/faa/hdv4", param: "image" },
};

// Rate limiter sederhana (per instance)
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "10", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const rateLimitStore = global.__zalyst_rate_limit_enhance__ || new Map();
global.__zalyst_rate_limit_enhance__ = rateLimitStore;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  rateLimitStore.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

// Upload image to uguu.se (free, no auth, hotlink OK)
async function uploadToUguu(imageUrl) {
  try {
    // Download image from source (GitHub, etc)
    const imgResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ZalystAI/1.0)',
        'Accept': 'image/*'
      }
    });
    if (!imgResponse.ok) throw new Error(`Failed to download: ${imgResponse.status}`);
    const buffer = await imgResponse.buffer();
    
    // Upload to uguu.se
    const formData = new (require('form-data'))();
    formData.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
    
    const uploadResponse = await fetch('https://uguu.se/upload', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    if (!uploadResponse.ok) throw new Error(`Uguu upload failed: ${uploadResponse.status}`);
    const data = await uploadResponse.json();
    
    if (data.success && data.files && data.files[0] && data.files[0].url) {
      return data.files[0].url;
    }
    throw new Error('Uguu response missing URL');
  } catch (err) {
    console.error("uploadToUguu error:", err.message);
    throw err;
  }
}

// Check if URL is from GitHub raw (blocked by AI API)
function isGithubRawUrl(url) {
  return url.includes('raw.githubusercontent.com');
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.status(429).json({
      success: false,
      error: "RATE_LIMITED",
      message: "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
    });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { image, model } = body;

    if (!image || typeof image !== "string") {
      res.status(400).json({ success: false, error: "MISSING_IMAGE_URL" });
      return;
    }

    if (!model || !MODEL_ENDPOINTS[model]) {
      res.status(400).json({ success: false, error: "INVALID_MODEL" });
      return;
    }

    let aiImageUrl = image;

    // If GitHub URL, rehost to uguu.se first (AI API blocks GitHub raw URLs)
    if (isGithubRawUrl(image)) {
      console.log("Enhance: GitHub URL detected, rehosting to uguu.se...");
      try {
        aiImageUrl = await uploadToUguu(image);
        console.log("Enhance: Rehosted to", aiImageUrl);
      } catch (err) {
        console.error("Enhance: Rehost failed, trying original URL:", err.message);
        // Fallback: try original URL anyway
      }
    }

    const { url: endpoint, param } = MODEL_ENDPOINTS[model];
    const apiUrl = `${endpoint}?${param}=${encodeURIComponent(aiImageUrl)}`;

    console.log("Enhance: Calling AI API:", model, apiUrl.substring(0, 100) + "...");

    const aiResponse = await fetch(apiUrl, { 
      method: "GET",
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ZalystAI/1.0)',
        'Accept': 'image/*,application/json;q=0.9,*/*;q=0.8'
      }
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => "");
      console.error("AI endpoint error:", aiResponse.status, errText);
      res.status(502).json({
        success: false,
        error: "AI_PROCESSING_FAILED",
        message: "Layanan AI gagal memproses gambar.",
      });
      return;
    }

    const contentType = aiResponse.headers.get("content-type") || "";
    let resultUrl = null;

    if (contentType.includes("application/json")) {
      const data = await aiResponse.json();
      resultUrl = data.result || data.url || data.data?.url || data.image || data.result?.image_upscaled || null;

      if (!resultUrl) {
        if (data.status === false && data.error) {
          res.status(502).json({
            success: false,
            error: "AI_PROCESSING_FAILED",
            message: data.error,
          });
          return;
        }
        res.status(502).json({
          success: false,
          error: "AI_PROCESSING_FAILED",
          message: "Respons AI tidak berisi URL hasil gambar.",
        });
        return;
      }
    } else if (contentType.startsWith("image/")) {
      // API mengembalikan gambar langsung (binary) -> gunakan URL endpoint sebagai resultUrl
      resultUrl = apiUrl;
    } else {
      const text = await aiResponse.text().catch(() => "");
      console.error("Unknown AI response type:", contentType, text.substring(0, 200));
      res.status(502).json({
        success: false,
        error: "AI_PROCESSING_FAILED",
        message: "Format respons AI tidak dikenali.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      model,
      sourceUrl: image,
      resultUrl,
    });
  } catch (err) {
    console.error("enhance.js error:", err.message, err.stack);

    if (err.message === "BODY_TOO_LARGE") {
      res.status(413).json({ success: false, error: "BODY_TOO_LARGE" });
      return;
    }

    res.status(500).json({
      success: false,
      error: "AI_PROCESSING_FAILED",
      message: "Terjadi kesalahan saat memproses gambar: " + err.message,
    });
  }
};
