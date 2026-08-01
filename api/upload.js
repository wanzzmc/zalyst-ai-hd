// api/upload.js
// Menerima file gambar dari frontend, memvalidasi, lalu meng-upload ke
// GitHub Repository menggunakan GitHub Contents API. Token GitHub HANYA
// dibaca dari process.env.GITHUB_TOKEN dan tidak pernah dikirim ke client.

const formidable = require("formidable");
const fs = require("fs");
const crypto = require("crypto");
const fetch = require("node-fetch");

export const config = {
  api: {
    bodyParser: false, // kita pakai formidable untuk multipart/form-data
  },
};

const GITHUB_OWNER = process.env.GITHUB_OWNER || "wanzzmc";
const GITHUB_REPO = process.env.GITHUB_REPO || "zalyst-uploads";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

// ---------------------------------------------------------------------
// Simple in-memory rate limiter (per serverless instance).
// Cukup untuk mencegah spam kasar; untuk produksi skala besar gunakan
// layanan eksternal seperti Upstash/Redis.
// ---------------------------------------------------------------------
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "10", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS || "60000",
  10
);
const rateLimitStore = global.__zalyst_rate_limit__ || new Map();
global.__zalyst_rate_limit__ = rateLimitStore;

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

function sanitizeFileName(originalName) {
  const ext = (originalName.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  return `upload-${timestamp}-${uuid}.${safeExt}`;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

async function uploadToGitHub(fileBuffer, fileName) {
  if (!GITHUB_TOKEN) {
    throw new Error("SERVER_MISCONFIGURED_NO_TOKEN");
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/uploads/${fileName}`;
  const contentBase64 = fileBuffer.toString("base64");

  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "User-Agent": "zalyst-ai-hd-image-enhancer",
    },
    body: JSON.stringify({
      message: `chore: upload ${fileName}`,
      content: contentBase64,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`GITHUB_UPLOAD_FAILED: ${response.status} ${errText}`);
  }

  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/uploads/${fileName}`;
  return rawUrl;
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_SIZE_BYTES,
      multiples: false,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
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
    const { files } = await parseForm(req);
    const fileField = files.image;
    const file = Array.isArray(fileField) ? fileField[0] : fileField;

    if (!file) {
      res.status(400).json({ success: false, error: "NO_FILE_PROVIDED" });
      return;
    }

    const mimeType = file.mimetype || file.type;
    if (!ALLOWED_MIME.includes(mimeType)) {
      res.status(415).json({ success: false, error: "UNSUPPORTED_FILE" });
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      res.status(413).json({ success: false, error: "FILE_TOO_LARGE" });
      return;
    }

    const buffer = fs.readFileSync(file.filepath);
    const safeName = sanitizeFileName(file.originalFilename || "image.jpg");
    const rawUrl = await uploadToGitHub(buffer, safeName);

    res.status(200).json({
      success: true,
      url: rawUrl,
      fileName: safeName,
    });
  } catch (err) {
    console.error("upload.js error:", err.message);

    if (err.message === "SERVER_MISCONFIGURED_NO_TOKEN") {
      res.status(500).json({
        success: false,
        error: "SERVER_MISCONFIGURED",
        message:
          "GITHUB_TOKEN belum diset di environment variables server.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "UPLOAD_FAILED",
      message: "Gagal mengunggah gambar ke GitHub.",
    });
  }
};
