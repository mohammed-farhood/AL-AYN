require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 7860;

// ─────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE
// ─────────────────────────────────────────────────────────

// 1. CORS — Restrict to known origins (add your deployment domain here)
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:5500',
  'http://localhost:8081',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8081',
  'https://mohammed-farhood.github.io'
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from: ${origin}`);
      callback(new Error('CORS: Origin not allowed'));
    }
  }
}));

// 2. JSON parser with size limit (prevent oversized payloads)
app.use(express.json({ limit: '1mb' }));

// 3. Simple Rate Limiter (in-memory, no dependencies)
const rateLimits = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX_REQUESTS = 30;     // 30 requests per minute

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  const entry = rateLimits.get(ip);
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_WINDOW_MS;
    return next();
  }

  entry.count++;
  if (entry.count > RATE_MAX_REQUESTS) {
    return res.status(429).json({ success: false, error: 'Too many requests. Try again later.' });
  }
  next();
}
app.use('/api', rateLimiter);

// 4. API Key Authentication — protects sensitive endpoints
const API_SECRET = process.env.API_SECRET;
function apiKeyAuth(req, res, next) {
  // Skip auth for auth-code endpoints (used by the frontend to initiate linking)
  const isAuthCodeEndpont = 
    req.path.includes('auth-code') || 
    req.path.includes('check-auth') ||
    req.originalUrl.includes('auth-code') ||
    req.originalUrl.includes('check-auth');

  if (isAuthCodeEndpont) {
    return next();
  }
  const key = req.headers['x-api-key'];
  if (!API_SECRET || key !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API key' });
  }
  next();
}
app.use('/api', apiKeyAuth);

// ─────────────────────────────────────────────────────────
// TELEGRAM BOT SETUP
// ─────────────────────────────────────────────────────────
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("CRITICAL: TELEGRAM_BOT_TOKEN is missing in .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Data stores (JSON-backed for persistence across restarts)
const getCodes = () => {
  try { return JSON.parse(fs.readFileSync('auth_codes.json')); } catch (e) { return {}; }
};
const saveCodes = (c) => fs.writeFileSync('auth_codes.json', JSON.stringify(c, null, 2));

const generateAuthCode = () => 'AUTH-' + Math.random().toString(36).substr(2, 6).toUpperCase();

// Clean up stale auth codes every 10 minutes
setInterval(() => {
  const codes = getCodes();
  const now = Date.now();
  let changed = false;
  for (const k in codes) {
    if (now - codes[k].createdAt > 10 * 60 * 1000) { delete codes[k]; changed = true; }
  }
  if (changed) saveCodes(codes);
}, 10 * 60 * 1000);

// ─────────────────────────────────────────────────────────
// BOT EVENTS
// ─────────────────────────────────────────────────────────
bot.on('message', (msg) => {
  console.log(`[BOT DEBUG] Received message from ${msg.chat.id}: "${msg.text}"`);
});

bot.onText(/\/start (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const authCode = match[1].trim(); 
  const codes = getCodes();

  console.log(`[BOT DEBUG] Start command detected with code: "${authCode}"`);

  if (codes[authCode]) {
    const data = codes[authCode];
    if (data.status === 'pending') {
      codes[authCode] = { ...data, status: 'linked', chatId: chatId };
      saveCodes(codes);
      bot.sendMessage(chatId, "✅ تم ربط حسابك في تطبيق ومن أحياها بنجاح!"); 
      console.log(`[BOT SUCCESS] Linked authCode ${authCode} to chatId ${chatId}`);
    } else {
      bot.sendMessage(chatId, "هذا الرابط تم استخدامه مسبقاً.");
    }
  } else {
    console.log(`[BOT ERROR] Auth code "${authCode}" not found in current session.`);
    bot.sendMessage(chatId, "عذراً، الرابط غير صحيح أو منتهي الصلاحية.");
  }
});

bot.on("polling_error", (err) => {
  console.error(`[BOT POLLING ERROR] ${err.message}`);
});

// ─────────────────────────────────────────────────────────
// API ENDPOINTS
// ─────────────────────────────────────────────────────────

// 1. Generate Auth Code
app.post('/api/auth-code', (req, res) => {
  const code = generateAuthCode();
  const codes = getCodes();
  codes[code] = { status: 'pending', chatId: null, createdAt: Date.now() };
  saveCodes(codes);
  res.json({ success: true, code });
});

// 2. Check Auth Code Status
app.get('/api/check-auth/:code', (req, res) => {
  const code = req.params.code;
  const codes = getCodes();
  if (!codes[code]) {
    return res.status(404).json({ success: false, error: "Code not found" });
  }
  const data = codes[code];
  res.json({ success: true, status: data.status, chatId: data.chatId });
});

// 3. Send Reminders (Queue System)
class ReminderQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  add(messages) {
    this.queue.push(...messages);
    if (!this.isProcessing) this.process();
  }

  async process() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const { chatId, text } = this.queue.shift();
      try {
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        console.log(`[QUEUE] Sent message to ${chatId}`);
      } catch (err) {
        console.error(`[QUEUE ERROR] Failed to send to ${chatId}:`, err.message);
      }
      // Wait >1 second to prevent Telegram rate-limit ban
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    this.isProcessing = false;
  }
}

const reminderQueue = new ReminderQueue();

// Input validation helper
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every(m => 
    m && (typeof m.chatId === 'number' || typeof m.chatId === 'string') && 
    typeof m.text === 'string' && m.text.trim().length > 0
  );
}

app.post('/api/send-reminders', (req, res) => {
  const { messages } = req.body;
  if (!validateMessages(messages)) {
    return res.status(400).json({ success: false, error: "Invalid payload: messages must be an array of { chatId, text }" });
  }

  // Cap at 50 messages per batch to prevent abuse
  const batch = messages.slice(0, 50);
  reminderQueue.add(batch);
  res.json({ success: true, status: "queued", count: batch.length });
});

// 4. Send Automated Digital Receipt
app.post('/api/send-receipt', (req, res) => {
  const { chatId, donorName, amount, month, collectorName } = req.body;
  if (!chatId || !amount) {
    return res.status(400).json({ success: false, error: "Missing receipt data (chatId, amount required)" });
  }
  
  const safeName = String(donorName || '').replace(/[*_`\[\]]/g, '');
  const safeCollector = String(collectorName || 'غير محدد').replace(/[*_`\[\]]/g, '');
  
  const text = `🧾 *وصل استلام تبرع كفالة أيتام* 🧾\n\n` +
               `مرحباً ${safeName}،\n` +
               `تم استلام تبرعك لشهر *${month}* بنجاح.\n\n` +
               `💰 *المبلغ*: ${amount} دينار عراقي\n` +
               `👤 *الجامع*: ${safeCollector}\n` +
               `📅 *التاريخ*: ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}\n\n` +
               `اليتيم المليء بالشكر يدعو لك! شكراً لعطائك. 🌸`;

  reminderQueue.add([{ chatId, text }]);
  res.json({ success: true, status: "receipt_queued" });
});

// 5. Broadcast GPS Live Location
app.post('/api/notify-location', (req, res) => {
  const { chatIds, collectorName, lat, lng } = req.body;
  if (!Array.isArray(chatIds) || chatIds.length === 0) {
    return res.status(400).json({ success: false, error: "chatIds must be a non-empty array" });
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ success: false, error: "lat and lng must be numbers" });
  }

  const safeName = String(collectorName || '').replace(/[*_`\[\]]/g, '');
  const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
  const text = `📍 *متواجد الآن لاستلام التبرعات* 📍\n\n` +
               `جامع التبرعات (${safeName}) متواجد حالياً ويستقبل التبرعات.\n\n` +
               `اضغط على الرابط أدناه للوصول إلى موقعه على الخريطة:\n${mapLink}\n\n` +
               `إدارة تطبيق ومن أحياها`;

  const messages = chatIds.slice(0, 100).map(chatId => ({ chatId, text }));
  reminderQueue.add(messages);
  res.json({ success: true, status: "location_queued", count: messages.length });
});

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.1.0', uptime: process.uptime() });
});

app.listen(port, () => {
  console.log(`[SERVER] Backend running on http://localhost:${port}`);
  console.log(`[BOT] Listening for Telegram messages...`);
  console.log(`[SECURITY] CORS: restricted, Rate Limit: ${RATE_MAX_REQUESTS}/min, API Auth: ${API_SECRET ? 'enabled' : 'DISABLED'}`);
});
