/**
 * CLOSD 后端服务器 — 静态文件服务 + OpenAI API 代理
 * 启动: node server.js
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── 加载环境变量 ───────────────────────────────────────────────
let OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL;
try {
  // 尝试加载 dotenv（如果已安装）
  const result = require('dotenv').config({ path: path.join(__dirname, '.env') });
  if (result.error) {
    // dotenv 未安装，尝试手动读取 .env
    try {
      const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          if (!process.env[key]) process.env[key] = val;
        }
      });
    } catch (_) { /* .env not found */ }
  }
} catch (_) { /* dotenv not available */ }

OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const app = express();
const PORT = process.env.PORT || 8080;

// ─── 中间件 ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting — 每分钟最多 30 次 AI 请求
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '请求太频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth 接口严格限流 — 防暴力破解
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: 10,                   // 最多 10 次尝试
  message: { error: '登录尝试过于频繁，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── 输入净化 ─────────────────────────────────────────────────────
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
function sanitizePost(post) {
  if (post.title) post.title = sanitize(post.title);
  if (post.content) post.content = sanitize(post.content);
  if (post.tags) post.tags = post.tags.map(t => sanitize(t));
  return post;
}

// ─── 请求 ID + 日志中间件 ─────────────────────────────────────────
let reqCounter = 0;
app.use((req, res, next) => {
  req.id = String(Date.now()).slice(-6) + '-' + (++reqCounter % 10000);
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400 || ms > 1000) {
      // req logging disabled for prod
    }
  });
  next();
});

// ─── JSON 文件存储 ────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(filename) {
  const file = path.join(DATA_DIR, filename);
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (_) { return null; }
}
// ─── 文件写入互斥锁（防止并发竞态） ──────────────────────────────
const fileLocks = {};
function withLock(filename, fn) {
  if (!fileLocks[filename]) fileLocks[filename] = Promise.resolve();
  return fileLocks[filename] = fileLocks[filename].then(() => fn()).catch(err => {
    console.error('[lock:' + filename + ']', err.message);
    throw err;
  }).finally(() => {});
}
async function writeJSON(filename, data) {
  const file = path.join(DATA_DIR, filename);
  await withLock(filename, () => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  });
}
async function appendJSON(filename, item) {
  const data = (await readJSON(filename)) || [];
  data.push(item);
  await writeJSON(filename, data);
  return data;
}

// ─── 启动时异步初始化默认数据 ────────────────────────────────────
async function initData() {
  if (!readJSON('users.json')) await writeJSON('users.json', [
    { username: 'admin', password: bcrypt.hashSync('admin123', 10), joinDate: '2026-01-01' },
    { username: 'CLOSD小助手', password: bcrypt.hashSync('123456', 10), joinDate: '2026-01-15' },
    { username: '代码诗人', password: bcrypt.hashSync('123456', 10), joinDate: '2026-03-22' },
    { username: '齐天大圣', password: bcrypt.hashSync('123456', 10), joinDate: '2026-02-10' },
  ]);
  if (!readJSON('notifications.json')) await writeJSON('notifications.json', []);
  if (!readJSON('bookmarks.json')) await writeJSON('bookmarks.json', []);
  if (!readJSON('follows.json')) await writeJSON('follows.json', []);
}

// ─── JWT 配置 ──────────────────────────────────────────────────────
// JWT 密钥 —— 持久化，重启不变
const SECRET_FILE = path.join(DATA_DIR, '.jwt_secret');
let JWT_SECRET;
if (process.env.JWT_SECRET) {
  JWT_SECRET = process.env.JWT_SECRET;
} else if (fs.existsSync(SECRET_FILE)) {
  JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
} else {
  JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, JWT_SECRET, 'utf-8');
}
const JWT_EXPIRY = '7d';

function signToken(username, remember) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: remember ? '30d' : JWT_EXPIRY });
}

function sendErr(res, err, label) {
  console.error('[' + label + ']', err.message);
  res.status(500).json({ error: '服务器内部错误' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// ─── 图片上传 ────────────────────────────────────────────────────
const multer = require('multer');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

// POST /api/upload — 上传图片
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片文件 (jpg/png/gif/webp, max 5MB)' });
  res.json({ url: '/uploads/' + req.file.filename, name: req.file.originalname, size: req.file.size });
});

// POST /api/upload/multi — 批量上传 (最多9张)
app.post('/api/upload/multi', authMiddleware, upload.array('images', 9), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择图片' });
  res.json({ images: req.files.map(f => ({ url: '/uploads/' + f.filename, name: f.originalname, size: f.size })) });
});

// 静态文件服务
app.use(express.static(__dirname, {
  index: false,
}));

// ─── OpenAI API 调用封装 ────────────────────────────────────────
async function callOpenAI(messages, options = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 未配置，请在 .env 文件中设置');
  }

  const body = {
    model: options.model || OPENAI_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 1024,
  };

  const resp = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeout || 30000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let errMsg;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errText;
    } catch {
      errMsg = errText;
    }
    throw new Error(`OpenAI API 错误 (${resp.status}): ${errMsg}`);
  }

  const data = await resp.json();
  return data.choices[0]?.message?.content || '';
}

// ─── API 路由 ───────────────────────────────────────────────────

// POST /api/ai/chat — AI 对话（聊天机器人、发帖助手对话）
app.post('/api/ai/chat', aiLimiter, async (req, res) => {
  try {
    // 检查订阅配额（登录用户受限制，未登录也可使用免费额度）
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    let username = 'guest';
    try { if (token) { const d = jwt.verify(token, JWT_SECRET); username = d.username; } } catch (_) {}
    if (username !== 'guest' && !checkAiQuota(username)) {
      return res.status(429).json({ error: '今日 AI 额度已用完，请升级订阅或明天再来', code: 'QUOTA_EXCEEDED' });
    }
    if (username !== 'guest') recordAiUsage(username);
    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供 messages 数组' });
    }

    const systemMsg = context
      ? { role: 'system', content: `你是 CLOSD 社区的 AI 助手。${context}` }
      : { role: 'system', content: '你是"栖语 Nest"社区的AI助手，名字叫"小栖"。你热情友好，擅长帮助用户解决社区相关的问题，包括发帖建议、内容创作、社区规则解答等。回复简洁有力，使用中文。' };

    const reply = await callOpenAI([systemMsg, ...messages]);
    res.json({ reply });
  } catch (err) {
    console.error('[chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/generate — 内容生成（标题建议、正文润色、大纲生成）
app.post('/api/ai/generate', aiLimiter, async (req, res) => {
  try {
    const { type, input, forum } = req.body;
    if (!type || !input) {
      return res.status(400).json({ error: '请提供 type 和 input' });
    }

    let prompt;
    switch (type) {
      case 'title':
        prompt = `根据以下内容，生成 3 个吸引人的帖子标题（每个不超过 30 字），用中文回复。\n\n内容/关键词：${input}\n${forum ? `发布在"${forum}"吧` : ''}\n\n请直接列出 3 个标题，每行一个，用数字编号。`;
        break;
      case 'polish':
        prompt = `请润色以下文字，使其更流畅、更有吸引力。保持原意，使用中文。直接返回润色后的文字，不要加解释。\n\n原文：${input}`;
        break;
      case 'outline':
        prompt = `根据以下话题，生成一个帖子大纲（包含引言、3-4 个要点、结尾），使用中文。\n\n话题：${input}\n\n请用清晰的层级结构输出。`;
        break;
      case 'reply':
        prompt = `你正在参与一个社区讨论。请根据以下帖子内容，生成一条有价值的回复（50-150字），友好、有帮助，使用中文。\n\n帖子内容：${input}\n\n直接返回回复内容。`;
        break;
      default:
        return res.status(400).json({ error: '未知的生成类型' });
    }

    const result = await callOpenAI([
      { role: 'user', content: prompt }
    ], { temperature: 0.8, max_tokens: 800 });

    res.json({ result });
  } catch (err) {
    console.error('[generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/moderate — 内容审核
app.post('/api/ai/moderate', aiLimiter, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: '请提供 items 数组 [{id, text}]' });
    }

    const itemsText = items.map((item, i) => `${i + 1}. [ID:${item.id}] ${item.text}`).join('\n');
    const prompt = `你是一个社区内容审核员。审核以下评论/帖子，判断每条内容是否违规。

规则：
- "spam": 广告、垃圾信息、包含网址/联系方式推销
- "harassment": 人身攻击、辱骂、仇恨言论
- "safe": 正常内容

请以 JSON 数组格式返回审核结果，每个元素包含 id, verdict (spam/harassment/safe), reason (简短中文理由)。

待审核内容：
${itemsText}

直接返回 JSON 数组，不要加其他文字。`;

    const result = await callOpenAI([
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 1500 });

    // 尝试解析 JSON
    let parsed;
    try {
      // 清理可能的 markdown 代码块包裹
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // 如果 AI 没有返回合法 JSON，回退处理
      parsed = items.map(item => ({
        id: item.id,
        verdict: 'safe',
        reason: 'AI 无法判断，默认通过',
      }));
    }

    res.json({ results: parsed });
  } catch (err) {
    console.error('[moderate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/summarize — 内容摘要
app.post('/api/ai/summarize', aiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: '请提供 text' });
    }

    const prompt = `请用 1-2 句话总结以下内容的核心要点，使用中文。简洁明了。\n\n内容：${text}`;
    const result = await callOpenAI([
      { role: 'user', content: prompt }
    ], { temperature: 0.5, max_tokens: 200 });

    res.json({ summary: result });
  } catch (err) {
    console.error('[summarize]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/trending — AI 热点分析
app.get('/api/ai/trending', aiLimiter, async (req, res) => {
  try {
    const { topics } = req.query;
    const topicList = topics ? topics.split(',').slice(0, 5) : [];

    let prompt;
    if (topicList.length > 0) {
      prompt = `分析以下热点话题，为每个话题写一句话的简短点评（中文，有趣有料）。\n\n${topicList.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n以 JSON 数组格式返回：[{topic, insight}]`;
    } else {
      prompt = '请生成 5 个当前可能的热门社区话题（科技/生活/游戏/设计/AI 方向），以 JSON 数组格式返回：[{topic, insight}]';
    }

    const result = await callOpenAI([
      { role: 'user', content: prompt }
    ], { temperature: 0.8, max_tokens: 600 });

    let parsed;
    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = topicList.map(t => ({ topic: t, insight: '热门讨论中' }));
    }

    res.json({ insights: parsed });
  } catch (err) {
    console.error('[trending]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 💰 订阅 & 支付 API (Lemon Squeezy)
// ===================================================================

const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY || '';
const LEMON_SQUEEZY_WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || '';
const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID || '';

// 订阅档位定义
const PLANS = {
  free:     { name: '免费版',   aiDailyLimit: 5,   price: 0 },
  basic:    { name: '基础版',   aiDailyLimit: 50,  price: 29,  variantId: process.env.LEMON_VARIANT_BASIC || '' },
  pro:      { name: '专业版',   aiDailyLimit: 999, price: 99,  variantId: process.env.LEMON_VARIANT_PRO || '' },
};

// 初始化订阅数据
if (!readJSON('subscriptions_billing.json')) writeJSON('subscriptions_billing.json', {});

function getUserPlan(username) {
  const subs = readJSON('subscriptions_billing.json') || {};
  const sub = subs[username];
  if (!sub || !sub.plan) return 'free';
  // 检查是否过期
  if (sub.expiresAt && Date.now() > new Date(sub.expiresAt).getTime()) {
    subs[username] = { ...sub, plan: 'free' };
    writeJSON('subscriptions_billing.json', subs);
    return 'free';
  }
  return sub.plan;
}

function getUserAiLimit(username) {
  return PLANS[getUserPlan(username)].aiDailyLimit;
}

// AI 调用计数（按天重置）
if (!readJSON('ai_usage.json')) writeJSON('ai_usage.json', {});

function getTodayKey() { return new Date().toISOString().split('T')[0]; }

function checkAiQuota(username) {
  const plan = getUserPlan(username);
  const limit = PLANS[plan].aiDailyLimit;
  if (limit >= 999) return true; // 专业版无限制

  const usage = readJSON('ai_usage.json') || {};
  const today = getTodayKey();
  if (!usage[today]) usage[today] = {};
  const used = usage[today][username] || 0;
  return used < limit;
}

function recordAiUsage(username) {
  const usage = readJSON('ai_usage.json') || {};
  const today = getTodayKey();
  if (!usage[today]) usage[today] = {};
  usage[today][username] = (usage[today][username] || 0) + 1;
  writeJSON('ai_usage.json', usage);
}

// POST /api/billing/checkout — 创建 Lemon Squeezy 支付链接
app.post('/api/billing/checkout', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !PLANS[plan] || plan === 'free') {
      return res.status(400).json({ error: '无效的订阅档位' });
    }

    const planInfo = PLANS[plan];
    if (!LEMON_SQUEEZY_API_KEY) {
      return res.status(500).json({ error: '支付系统未配置' });
    }

    // 调用 Lemon Squeezy API 创建 checkout
    const resp = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LEMON_SQUEEZY_API_KEY}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              custom: { user_id: req.user.username },
            },
            product_options: {
              redirect_url: (process.env.APP_URL || 'http://localhost:8080') + '/?subscribed=' + plan,
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: LEMON_SQUEEZY_STORE_ID } },
            variant: { data: { type: 'variants', id: planInfo.variantId } },
          },
        },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[lemon] checkout error:', JSON.stringify(data).substring(0, 300));
      return res.status(500).json({ error: '创建支付链接失败' });
    }

    const checkoutUrl = data.data?.attributes?.url;
    if (!checkoutUrl) {
      return res.status(500).json({ error: '支付链接生成失败' });
    }

    res.json({ url: checkoutUrl });
  } catch (err) {
    console.error('[billing:checkout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/webhook — Lemon Squeezy Webhook 接收
// 使用自定义 raw body 解析以支持签名验证
app.post('/api/billing/webhook', (req, res, next) => {
  // 暂存原始 body 供签名验证
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = JSON.parse(data); } catch (_) { req.body = {}; }
    next();
  });
}, async (req, res) => {
  try {
    // 验证签名
    const crypto = require('crypto');
    const signature = req.headers['x-signature'];
    if (LEMON_SQUEEZY_WEBHOOK_SECRET && signature && req.rawBody) {
      const hmac = crypto.createHmac('sha256', LEMON_SQUEEZY_WEBHOOK_SECRET);
      const digest = hmac.update(req.rawBody).digest('hex');
      if (digest !== signature) {
        console.error('[lemon] webhook 签名验证失败');
        return res.status(401).json({ error: '签名验证失败' });
      }
    }

    const payload = req.body;
    const event = payload.meta?.event_name;
    const eventData = payload.data?.attributes || {};
    const customData = eventData.custom_data || payload.meta?.custom_data || {};
    const username = customData.user_id;

    console.log('[lemon] webhook:', event, 'user:', username);

    if (!username) return res.json({ received: true });

    const subs = readJSON('subscriptions_billing.json') || {};

    switch (event) {
      case 'order_created':
      case 'subscription_created':
        // 激活订阅 — 1 个月有效期
        const planName = payload.data?.attributes?.variant_name?.toLowerCase() || '';
        let plan = 'basic';
        if (planName.includes('pro') || planName.includes('专业')) plan = 'pro';

        const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        subs[username] = {
          plan,
          startedAt: new Date().toISOString(),
          expiresAt,
          orderId: payload.data?.id,
          status: 'active',
        };
        writeJSON('subscriptions_billing.json', subs);
        notifyAndBroadcast('system', 'CLOSD小助手', username,
          `🎉 你已升级到${PLANS[plan].name}！现在每天可使用 ${PLANS[plan].aiDailyLimit} 次 AI 功能。`);
        break;

      case 'subscription_updated':
      case 'subscription_payment_success':
        // 续费成功
        if (subs[username]) {
          subs[username].expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
          subs[username].status = 'active';
          writeJSON('subscriptions_billing.json', subs);
        }
        break;

      case 'subscription_cancelled':
      case 'subscription_expired':
        // 订阅过期
        if (subs[username]) {
          subs[username].status = 'expired';
          subs[username].plan = 'free';
          writeJSON('subscriptions_billing.json', subs);
          notifyAndBroadcast('system', 'CLOSD小助手', username,
            '你的订阅已过期，AI 功能已恢复为免费版额度。随时可以重新订阅～');
        }
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[billing:webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/status — 查询当前用户订阅状态
app.get('/api/billing/status', authMiddleware, (req, res) => {
  const plan = getUserPlan(req.user.username);
  const subs = readJSON('subscriptions_billing.json') || {};
  const sub = subs[req.user.username] || {};
  const usage = readJSON('ai_usage.json') || {};
  const today = getTodayKey();
  const usedToday = (usage[today] && usage[today][req.user.username]) || 0;

  res.json({
    plan: plan,
    planName: PLANS[plan].name,
    aiDailyLimit: PLANS[plan].aiDailyLimit,
    aiUsedToday: usedToday,
    aiRemaining: Math.max(0, PLANS[plan].aiDailyLimit - usedToday),
    expiresAt: sub.expiresAt || null,
    status: sub.status || 'free',
    plans: Object.entries(PLANS).map(([key, p]) => ({
      id: key,
      name: p.name,
      price: p.price,
      aiDailyLimit: p.aiDailyLimit,
    })),
  });
});

// ===================================================================
// 用户认证 API
// ===================================================================

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 2 || username.length > 12) return res.status(400).json({ error: '用户名需要 2-12 个字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少需要 6 位' });

    const users = readJSON('users.json') || [];
    if (users.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });

    const newUser = {
      username,
      password: bcrypt.hashSync(password, 10),
      joinDate: new Date().toISOString().split('T')[0],
    };
    users.push(newUser);
    writeJSON('users.json', users);

    const token = signToken(username, req.body.remember);
    // Auto-subscribe to popular forums
    const subs = readJSON('subscriptions.json') || [];
    ['tech','ai','game'].forEach(function(fid){
      if(!subs.find(function(s){return s.username===username&&s.forum===fid})){
        subs.push({username:username,forum:fid,time:new Date().toISOString()});
      }
    });
    writeJSON('subscriptions.json', subs);
    // Welcome notification
    notifyAndBroadcast('welcome', 'CLOSD小助手', username, '欢迎加入栖语！已为你订阅技术交流、游戏天地、AI探索。祝你在这里找到同好～');
    // Welcome DM
    appendJSON('messages.json', {id:Date.now()+1,from:'CLOSD小助手',to:username,text:'👋 欢迎来到栖语 Nest！\n\n这里是话语栖息之地。你可以：\n• 在技术交流吧发帖提问\n• 用右下角AI助手获取灵感\n• 点击用户名关注有趣的人\n• 按Ctrl+N快速发帖\n\n祝你玩得开心！',time:new Date().toISOString(),read:false});
    res.json({ token, user: { username, joinDate: newUser.joinDate, role: 'user' } });
  } catch (err) { sendErr(res, err, 'auth:register'); }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password, remember } = req.body;
    const users = readJSON('users.json') || [];
    const user = users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = signToken(user.username, remember);
    res.json({ token, user: { username: user.username, joinDate: user.joinDate, role: user.role || 'user' } });
  } catch (err) { sendErr(res, err, 'auth'); }
});

// POST /api/auth/phone-code
app.post('/api/auth/phone-code', (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1\d{10}$/.test(phone)) return res.status(400).json({ error: '请输入正确的手机号' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  // 模拟：控制台输出验证码
  console.log(`[短信验证码] ${phone} → ${code}`);
  res.json({ code }); // 开发环境直接返回，生产环境应通过短信发送
});

// POST /api/auth/phone-login
app.post('/api/auth/phone-login', authLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: '手机号和验证码不能为空' });
    // 开发环境接受任意 6 位验证码
    if (code.length !== 6) return res.status(400).json({ error: '验证码错误' });

    const users = readJSON('users.json') || [];
    let user = users.find(u => u.phone === phone);
    if (!user) {
      const username = '用户' + phone.slice(-4);
      user = { username, phone, password: '', joinDate: new Date().toISOString().split('T')[0] };
      users.push(user);
      await writeJSON('users.json', users);
    }
    const token = signToken(user.username, req.body.remember);
    res.json({ token, user: { username: user.username, joinDate: user.joinDate } });
  } catch (err) { sendErr(res, err, 'auth'); }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const follows = readJSON('follows.json') || [];
  const following = follows.filter(f => f.from === user.username).length;
  const followers = follows.filter(f => f.to === user.username).length;
  const plan = getUserPlan(user.username);
  const subs = readJSON('subscriptions_billing.json') || {};
  const sub = subs[user.username] || {};

  res.json({
    username: user.username, joinDate: user.joinDate, following, followers,
    bio: user.bio || '', avatar: user.avatar || '', avatarColor: user.avatarColor || '#007AFF',
    github: user.github || '', role: user.role || 'user',
    subscription: {
      plan,
      planName: PLANS[plan].name,
      aiDailyLimit: PLANS[plan].aiDailyLimit,
      expiresAt: sub.expiresAt || null,
      status: sub.status || 'free',
    },
  });
});

// PUT /api/auth/me — 更新个人资料
app.put('/api/auth/me', authMiddleware, (req, res) => {
  const { bio, avatarColor, username: newName } = req.body;
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (bio !== undefined) user.bio = String(bio).substring(0, 200);
  if (avatarColor) user.avatarColor = avatarColor;
  if (newName && newName !== user.username) {
    if (newName.length < 2 || newName.length > 12) return res.status(400).json({ error: '用户名需要2-12个字符' });
    if (users.find(u => u.username === newName)) return res.status(400).json({ error: '用户名已被占用' });
    // Update username in all related data
    const oldName = user.username;
    user.username = newName;
    // Update username in all related data
    ['follows.json','bookmarks.json','notifications.json','xp.json','posts.json'].forEach(f => {
      if (f === 'follows.json') {
        let d = readJSON(f) || [];
        d.forEach(item => { if(item.from===oldName) item.from=newName; if(item.to===oldName) item.to=newName; });
        writeJSON(f, d);
      } else if (f === 'bookmarks.json') {
        let d = readJSON(f) || [];
        d.forEach(item => { if(item.username===oldName) item.username=newName; });
        writeJSON(f, d);
      } else if (f === 'notifications.json') {
        let d = readJSON(f) || [];
        d.forEach(item => { if(item.from===oldName) item.from=newName; if(item.to===oldName) item.to=newName; });
        writeJSON(f, d);
      } else if (f === 'xp.json') {
        let xp = readJSON(f) || {};
        if (xp[oldName] !== undefined) { xp[newName] = xp[oldName]; delete xp[oldName]; }
        writeJSON(f, xp);
      } else if (f === 'posts.json') {
        let posts = readJSON(f) || [];
        posts.forEach(p => { if(p.author===oldName) p.author=newName; (p.comments||[]).forEach(c => { if(c.author===oldName) c.author=newName; (c.replies||[]).forEach(r => { if(r.author===oldName) r.author=newName; }); }); });
        writeJSON(f, posts);
      }
    });
    // Issue new JWT with new username
    const newToken = signToken(newName, true);
    return res.json({ ok: true, username: newName, token: newToken, bio: user.bio || '', avatarColor: user.avatarColor || '#007AFF' });
  }
  writeJSON('users.json', users);
  res.json({ ok: true, bio: user.bio || '', avatarColor: user.avatarColor || '#007AFF' });
});

// PUT /api/auth/me/password — 修改密码
app.put('/api/auth/me/password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请提供旧密码和新密码' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (!bcrypt.compareSync(oldPassword, user.password)) return res.status(400).json({ error: '旧密码错误' });
  user.password = bcrypt.hashSync(newPassword, 10);
  writeJSON('users.json', users);
  res.json({ ok: true });
});

// PUT /api/auth/me/avatar — 传头像
app.put('/api/auth/me/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片' });
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  user.avatar = '/uploads/' + req.file.filename;
  writeJSON('users.json', users);
  res.json({ avatar: user.avatar });
});

// ===================================================================
// GitHub OAuth
// ===================================================================
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_CALLBACK = process.env.GITHUB_CALLBACK || 'http://localhost:8080/api/auth/github/callback';

app.get('/api/auth/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) return res.status(500).json({ error: 'GitHub OAuth未配置' });
  const url = 'https://github.com/login/oauth/authorize?' +
    'client_id=' + GITHUB_CLIENT_ID +
    '&redirect_uri=' + encodeURIComponent(GITHUB_CALLBACK) +
    '&scope=user:email';
  res.redirect(url);
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
    });
    const tokenData = await tokenResp.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    const userResp = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'Bearer ' + tokenData.access_token, 'User-Agent': 'qiyu-nest' },
    });
    const ghUser = await userResp.json();
    if (!ghUser.login) throw new Error('GitHub用户信息获取失败');

    const users = readJSON('users.json') || [];
    let localUser = users.find(u => u.github === ghUser.login || u.username === ('gh_' + ghUser.login));
    if (!localUser) {
      localUser = {
        username: ghUser.login,
        password: bcrypt.hashSync('github_' + ghUser.id, 10),
        joinDate: new Date().toISOString().split('T')[0],
        github: ghUser.login,
        avatar: ghUser.avatar_url,
      };
      users.push(localUser);
      writeJSON('users.json', users);
    }
    const token = signToken(localUser.username, true);
    res.redirect('/?token=' + token + '&user=' + encodeURIComponent(JSON.stringify({ username: localUser.username, joinDate: localUser.joinDate })));
  } catch (err) {
    console.error('[github:oauth]', err.message);
    res.redirect('/?error=' + encodeURIComponent(err.message));
  }
});

// ===================================================================
// 用户 & 关注 API
// ===================================================================

// GET /api/users/search?q=xxx
app.get('/api/users/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const users = readJSON('users.json') || [];
  if (!q) return res.json([]);
  res.json(users.filter(u => u.username.toLowerCase().includes(q)).slice(0, 10).map(u => u.username));
});

// GET /api/users/:username
app.get('/api/users/:username', (req, res) => {
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const follows = readJSON('follows.json') || [];
  const following = follows.filter(f => f.from === user.username).length;
  const followers = follows.filter(f => f.to === user.username).length;

  // User stats
  const allPosts = readJSON('posts.json') || [];
  const userPosts = allPosts.filter(p => p.author === user.username);
  const totalComments = allPosts.reduce((sum, p) => sum + (p.comments||[]).filter(c => c.author === user.username).length, 0);
  const totalLikes = allPosts.filter(p => p.author === user.username).reduce((sum, p) => sum + (p.likes||0), 0);
  const xpData = readJSON('xp.json') || {};
  const levels = [{lv:1,name:'萌新',min:0},{lv:2,name:'见习',min:50},{lv:3,name:'成员',min:150},{lv:4,name:'活跃',min:400},{lv:5,name:'达人',min:1000},{lv:6,name:'大佬',min:2500}];
  const xp = xpData[user.username] || 0;
  let level = levels[0]; for(let i=levels.length-1;i>=0;i--){if(xp>=levels[i].min){level=levels[i];break}}

  // Achievements
  const achievements = [];
  if (userPosts.length >= 5) achievements.push('📝 发帖达人');
  if (totalComments >= 20) achievements.push('💬 话痨');
  if (totalLikes >= 100) achievements.push('👍 受欢迎');
  if (followers >= 10) achievements.push('🌟 小有名气');
  if (xp >= 1000) achievements.push('🏆 社区大佬');
  const bookmarkData = readJSON('bookmarks.json') || [];
  const bookmarks = bookmarkData.filter(b => b.username === user.username).length;

  res.json({
    username: user.username, joinDate: user.joinDate, following, followers,
    bio: user.bio || '', avatar: user.avatar || '', avatarColor: user.avatarColor || '#007AFF',
    github: user.github || '', role: user.role || 'user', xp, level, achievements,
    stats: { posts: userPosts.length, comments: totalComments, likes: totalLikes, bookmarks },
    recentPosts: userPosts.sort((a,b)=>b.id-a.id).slice(0, 10).map(p => ({id:p.id,title:p.title,forum:p.forum,time:p.time,replies:p.replies,likes:p.likes})),
  });
});

// POST /api/users/:username/follow
app.post('/api/users/:username/follow', authMiddleware, async (req, res) => {
  const target = req.params.username;
  const me = req.user.username;
  if (target === me) return res.status(400).json({ error: '不能关注自己' });

  const follows = readJSON('follows.json') || [];
  const idx = follows.findIndex(f => f.from === me && f.to === target);

  if (idx >= 0) {
    // 取关
    follows.splice(idx, 1);
    await writeJSON('follows.json', follows);
    // 移除通知
    const notifs = readJSON('notifications.json') || [];
    await writeJSON('notifications.json', notifs.filter(n => !(n.from === me && n.to === target && n.type === 'follow')));
    return res.json({ following: false });
  } else {
    // 关注
    follows.push({ from: me, to: target, time: new Date().toISOString() });
    await writeJSON('follows.json', follows);
    // 发通知
    notifyAndBroadcast('follow', me, target, me+' 关注了你');
    return res.json({ following: true });
  }
});

// GET /api/users/:username/followers
app.get('/api/users/:username/followers', (req, res) => {
  const follows = readJSON('follows.json') || [];
  res.json(follows.filter(f => f.to === req.params.username).map(f => f.from));
});

// GET /api/users/:username/following
app.get('/api/users/:username/following', (req, res) => {
  const follows = readJSON('follows.json') || [];
  res.json(follows.filter(f => f.from === req.params.username).map(f => f.to));
});

// GET /api/users/:username/is-following
app.get('/api/users/:username/is-following', authMiddleware, (req, res) => {
  const follows = readJSON('follows.json') || [];
  const exists = follows.some(f => f.from === req.user.username && f.to === req.params.username);
  res.json({ following: exists });
});

// ===================================================================
// 通知 API
// ===================================================================

// GET /api/notifications
app.get('/api/notifications', authMiddleware, (req, res) => {
  const notifs = readJSON('notifications.json') || [];
  const mine = notifs.filter(n => n.to === req.user.username).sort((a, b) => b.id - a.id).slice(0, 50);
  res.json(mine);
});

// GET /api/notifications/unread-count
app.get('/api/notifications/unread-count', authMiddleware, (req, res) => {
  const notifs = readJSON('notifications.json') || [];
  const count = notifs.filter(n => n.to === req.user.username && !n.read).length;
  res.json({ count });
});

// POST /api/notifications — 创建通知（帖主收到回复/点赞时调用）
app.post('/api/notifications', authMiddleware, async (req, res) => {
  const { type, to, text } = req.body;
  if (!type || !to || !text) return res.status(400).json({ error: '缺少参数' });
  const notif = {
    id: Date.now(), type, from: req.user.username, to, text,
    time: new Date().toISOString(), read: false,
  };
  await appendJSON('notifications.json', notif);
  res.json({ ok: true });
});

// POST /api/notifications/read
app.post('/api/notifications/read', authMiddleware, async (req, res) => {
  const { ids } = req.body;
  const notifs = readJSON('notifications.json') || [];
  if (ids && Array.isArray(ids)) {
    notifs.forEach(n => { if (ids.includes(n.id) && n.to === req.user.username) n.read = true; });
  } else {
    notifs.forEach(n => { if (n.to === req.user.username) n.read = true; });
  }
  await writeJSON('notifications.json', notifs);
  res.json({ ok: true });
});

// ===================================================================
// 收藏 API
// ===================================================================

// GET /api/bookmarks
app.get('/api/bookmarks', authMiddleware, (req, res) => {
  const bookmarks = readJSON('bookmarks.json') || [];
  res.json(bookmarks.filter(b => b.username === req.user.username).map(b => b.postId));
});

// POST /api/bookmarks/:postId
app.post('/api/bookmarks/:postId', authMiddleware, async (req, res) => {
  const postId = parseInt(req.params.postId);
  const bookmarks = readJSON('bookmarks.json') || [];
  const idx = bookmarks.findIndex(b => b.username === req.user.username && b.postId === postId);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
    await writeJSON('bookmarks.json', bookmarks);
    return res.json({ bookmarked: false });
  } else {
    bookmarks.push({ username: req.user.username, postId, time: new Date().toISOString() });
    await writeJSON('bookmarks.json', bookmarks);
    return res.json({ bookmarked: true });
  }
});

// GET /api/bookmarks/check/:postId
app.get('/api/bookmarks/check/:postId', authMiddleware, (req, res) => {
  const bookmarks = readJSON('bookmarks.json') || [];
  const exists = bookmarks.some(b => b.username === req.user.username && b.postId === parseInt(req.params.postId));
  res.json({ bookmarked: exists });
});

// ===================================================================
// 帖子 API
// ===================================================================

// 初始化种子帖子数据（合入 initData）
async function initPostsData() {
  if (!readJSON('posts.json')) {
    await writeJSON('posts.json', [
    {id:1,title:'【公告】社区规范更新 & 新功能上线通知',content:'各位吧友好！\n\n我们近期对社区规范进行了更新，主要变化如下：\n\n1. 新增 AI 生成内容的标识规范\n2. 优化了帖子的推荐算法\n3. 举报处理速度提升 50%\n4. 新增夜间模式\n\n感谢大家一直以来的支持！',author:'CLOSD小助手',forum:'tech',time:'2026-07-03',replies:128,likes:356,views:12800,pinned:true,tags:['公告','社区'],comments:[{author:'热心吧友',text:'支持！AI标注这个确实很重要 👍',time:'2026-07-03',replies:[{to:'热心吧友',author:'CLOSD小助手',text:'感谢支持，大家一起维护社区环境～'}]}]},
    {id:2,title:'分享一个超好用的 VS Code 插件，提升编码效率',content:'最近发现 GitHub Copilot 插件，代码补全简直神了！\n\n用了一段时间后发现它不仅仅是补全代码，还能：\n- 根据注释自动生成函数\n- 帮你写单元测试\n- 解释看不懂的代码\n\n强烈推荐给大家。',author:'代码诗人',forum:'tech',time:'2026-07-03',replies:47,likes:203,views:3200,pinned:false,tags:['工具','效率'],comments:[]},
    {id:3,title:'《黑神话：悟空》全成就达成！分享一些 BOSS 打法心得',content:'肝了两周终于全成就了！🏆\n\n说说几个比较难的 BOSS：\n\n🐺 灵虚子：掌握好闪避节奏，建议用定身术起手\n🐉 亢金龙：强烈建议用法术流，远程消耗\n🦅 金翅大鹏：核心是卡在它俯冲后那 2 秒硬直输出\n\n大家打到哪了？',author:'齐天大圣',forum:'game',time:'2026-07-03',replies:215,likes:892,views:45600,pinned:false,tags:['黑神话','攻略'],comments:[]},
    {id:4,title:'React 18 的 useEffect 执行两次是什么原因？',content:'新手刚学 React，遇到一个问题：\n\n在 React 18 中，useEffect 在开发模式下会执行两次，这是为什么？\n\n```jsx\nuseEffect(() => {\n  fetchData();\n}, []);\n```\n\n控制台会打印两次，导致 fetch 也发了两次请求。求大神指点！',author:'前端小菜',forum:'tech',time:'2026-07-02',replies:23,likes:45,views:1800,pinned:false,tags:['React','前端'],comments:[]},
    {id:5,title:'用 Midjourney 生成的赛博朋克风格城市，效果惊艳',content:'最近迷上了用 AI 生成赛博朋克风格的城市景观。\n\n用的 prompt：\n"cyberpunk city at night, neon lights, rain, flying cars, highly detailed, 8K, cinematic lighting, blade runner style"\n\n感觉 V6 版本对光影的理解又上了一个台阶。',author:'AI画师',forum:'ai',time:'2026-07-03',replies:92,likes:567,views:23100,pinned:false,tags:['Midjourney','AI绘画'],comments:[]},
  ]);
}
}

// GET /api/posts — 帖子列表
app.get('/api/posts', (req, res) => {
  const posts = (readJSON('posts.json') || []).map(p => ({...p, _ts: p.id > 1000000000000 ? p.id : (p.time==='刚刚'?Date.now():Date.now()-86400000)}));
  const { forum, sort, page, limit, range } = req.query;
  let filtered = [...posts];

  // Time range filter
  const now = Date.now();
  const ranges = { today: 86400000, week: 604800000, month: 2592000000 };
  if (range && ranges[range]) {
    filtered = filtered.filter(p => p._ts > now - ranges[range]);
  }

  // Forum filter
  if (forum && forum !== 'all') filtered = filtered.filter(p => p.forum === forum);

  // Sort
  switch(sort) {
    case 'latest': filtered.sort((a, b) => b._ts - a._ts); break;
    case 'hottest': filtered.sort((a, b) => (b.pinned?1000:0)+(b.replies*2+b.likes) - ((a.pinned?1000:0)+(a.replies*2+a.likes))); break;
    case 'likes': filtered.sort((a, b) => b.likes - a.likes); break;
    case 'views': filtered.sort((a, b) => b.views - a.views); break;
    default: filtered.sort((a, b) => (b.pinned?1:0) - (a.pinned?1:0) || b.replies - a.replies);
  }

  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 50;
  const start = (pageNum - 1) * pageSize;
  res.json({
    posts: filtered.slice(start, start + pageSize).map(p => formatPostTimes(p)),
    total: filtered.length,
    page: pageNum,
    hasMore: start + pageSize < filtered.length,
  });
});

// GET /api/posts/:id — 帖子详情
app.get('/api/posts/:id', async (req, res) => {
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  post.views = (post.views || 0) + 1;
  await writeJSON('posts.json', posts);
  res.json(formatPostTimes(post));
});

// ─── 时间格式化 ────────────────────────────────────────────────────
function fmtTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + '分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + '小时前';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + '天前';
  const mon = Math.floor(day / 30);
  if (mon < 12) return mon + '个月前';
  return Math.floor(mon / 12) + '年前';
}
function formatPostTimes(post) {
  if (post.createdAt) post.time = fmtTime(post.createdAt);
  if (post.comments) post.comments.forEach(c => {
    if (c.createdAt) c.time = fmtTime(c.createdAt);
    if (c.replies) c.replies.forEach(r => { if (r.createdAt) r.time = fmtTime(r.createdAt); });
  });
  return post;
}

// POST /api/posts — 发帖
app.post('/api/posts', authMiddleware, async (req, res) => {
  const { title, content, forum, tags: postTags, images, poll } = req.body;
  if (!title || !forum) return res.status(400).json({ error: '标题和板块不能为空' });
  if (title.length > 100) return res.status(400).json({ error: '标题不能超过100字' });
  if (content && content.length > 10000) return res.status(400).json({ error: '内容不能超过10000字' });
  const posts = readJSON('posts.json') || [];
  const now = new Date().toISOString();
  const newPost = {
    id: Date.now(),
    title: sanitize(title), content: sanitize(content || ''), author: req.user.username,
    forum, time: fmtTime(now), createdAt: now, replies: 0, likes: 0, views: 0, pinned: false,
    tags: (postTags || []).map(t => sanitize(t)), images: images || [], comments: [], likedBy: [],
  };
  if (poll && poll.options && poll.options.length >= 2) {
    newPost.poll = { question: poll.question || '', options: poll.options.map(function(o){ return { text: o, count: 0 } }), total: 0 };
    newPost.pollVoters = {};
  }
  posts.unshift(newPost);
  await writeJSON('posts.json', posts);
  await addXP(req.user.username, 10);
  res.json(newPost);
});

// POST /api/posts/:id/comments — 评论
app.post('/api/posts/:id/comments', authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '评论不能为空' });
  if (text.length > 2000) return res.status(400).json({ error: '评论不能超过2000字' });
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (!post.comments) post.comments = [];
  const now = new Date().toISOString();
  post.comments.push({ author: req.user.username, text: sanitize(text), time: fmtTime(now), createdAt: now, replies: [] });
  post.replies = (post.replies || 0) + 1;
  await writeJSON('posts.json', posts);
  await addXP(req.user.username, 3);
  // @mention notifications
  var mentions = text.match(/@(\w[\w一-鿿]{1,11})/g);
  if (mentions) {
    var allUsers = readJSON('users.json') || [];
    mentions.forEach(function(m){
      var name = m.slice(1);
      if(allUsers.find(function(u){return u.username===name}) && name!==req.user.username && name!==post.author){
        notifyAndBroadcast('mention', req.user.username, name, req.user.username+' 在评论中@了你');
      }
    });
  }
  res.json({ ok: true, comment: post.comments[post.comments.length - 1] });
});

// PUT /api/posts/:id — 编辑帖子
app.put('/api/posts/:id', authMiddleware, (req, res) => {
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (post.author !== req.user.username && (!user || user.role !== 'admin')) return res.status(403).json({ error: '无权编辑' });
  const { title, content, tags: postTags } = req.body;
  if (title) post.title = title;
  if (content !== undefined) post.content = content;
  if (postTags) post.tags = postTags;
  writeJSON('posts.json', posts);
  res.json({ ok: true, post });
});

// POST /api/posts/:id/vote — 投票
app.post('/api/posts/:id/vote', authMiddleware, async (req, res) => {
  const { option } = req.body;
  if (option === undefined) return res.status(400).json({ error: '请选择投票选项' });
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post || !post.poll) return res.status(404).json({ error: '帖子不存在或不是投票贴' });
  if (!post.pollVoters) post.pollVoters = {};
  if (post.pollVoters[req.user.username] !== undefined) return res.status(400).json({ error: '你已经投过票了' });
  post.poll.options[option].count = (post.poll.options[option].count || 0) + 1;
  post.poll.total = (post.poll.total || 0) + 1;
  post.pollVoters[req.user.username] = option;
  await writeJSON('posts.json', posts);
  res.json({ poll: post.poll, voted: option });
});

// POST /api/posts/:id/like — 点赞（防重复）
app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (!post.likedBy) post.likedBy = [];
  if (post.likedBy.includes(req.user.username)) {
    // 取消点赞
    post.likes = Math.max(0, (post.likes || 0) - 1);
    post.likedBy = post.likedBy.filter(u => u !== req.user.username);
    await writeJSON('posts.json', posts);
    return res.json({ likes: post.likes, liked: false });
  }
  post.likes = (post.likes || 0) + 1;
  post.likedBy.push(req.user.username);
  await writeJSON('posts.json', posts);
  res.json({ likes: post.likes, liked: true });
});

// DELETE /api/posts/:id — 删除帖子（仅作者或管理员可删）
app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  const posts = readJSON('posts.json') || [];
  const idx = posts.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '帖子不存在' });
  const post = posts[idx];
  if (post.author !== req.user.username && req.user.username !== 'admin') {
    return res.status(403).json({ error: '只能删除自己的帖子' });
  }
  posts.splice(idx, 1);
  await writeJSON('posts.json', posts);
  res.json({ ok: true });
});

// PUT /api/posts/:id — 编辑帖子（仅作者可编辑，仅编辑标题和内容）
app.put('/api/posts/:id', authMiddleware, async (req, res) => {
  const { title, content } = req.body;
  if (!title && !content) return res.status(400).json({ error: '请提供要修改的内容' });
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (post.author !== req.user.username && req.user.username !== 'admin') {
    return res.status(403).json({ error: '只能编辑自己的帖子' });
  }
  if (title !== undefined) {
    if (title.length > 100) return res.status(400).json({ error: '标题不能超过100字' });
    post.title = sanitize(title);
  }
  if (content !== undefined) {
    if (content.length > 10000) return res.status(400).json({ error: '内容不能超过10000字' });
    post.content = sanitize(content);
  }
  post.editedAt = new Date().toISOString();
  await writeJSON('posts.json', posts);
  res.json(formatPostTimes(post));
});

// GET /api/posts/search — 帖子搜索
app.get('/api/posts/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 1) return res.status(400).json({ error: '请输入搜索关键词' });
  const posts = readJSON('posts.json') || [];
  const keyword = q.trim().toLowerCase();
  const results = posts
    .filter(p => p.title.toLowerCase().includes(keyword) || (p.content || '').toLowerCase().includes(keyword))
    .slice(0, 50)
    .map(p => formatPostTimes(p));
  res.json({ results, total: results.length, keyword: q.trim() });
});

// ===================================================================
// 标签 API
// ===================================================================

// GET /api/tags/trending
app.get('/api/tags/trending', (req, res) => {
  // 从所有 post data 中统计标签频率（这里从客户端传来的帖子数据中提取）
  // 由于帖子存在前端 samplePosts，这里返回热门标签的简单实现
  const tags = readJSON('tags.json') || [];
  res.json(tags.sort((a, b) => b.count - a.count).slice(0, 15));
});

// 记录标签使用
app.post('/api/tags/use', async (req, res) => {
  const { tags: tagList } = req.body;
  if (!tagList || !Array.isArray(tagList)) return res.status(400).json({ error: '请提供 tags 数组' });
  const tags = readJSON('tags.json') || [];
  tagList.forEach(name => {
    const existing = tags.find(t => t.name === name);
    if (existing) existing.count = (existing.count || 0) + 1;
    else tags.push({ name, count: 1 });
  });
  await writeJSON('tags.json', tags);
  res.json({ ok: true });
});

// ===================================================================
// 经验值 API
// ===================================================================

const LEVELS = [
  { lv: 1, name: '萌新', min: 0 },
  { lv: 2, name: '见习', min: 50 },
  { lv: 3, name: '成员', min: 150 },
  { lv: 4, name: '活跃', min: 400 },
  { lv: 5, name: '达人', min: 1000 },
  { lv: 6, name: '大佬', min: 2500 },
];

function getLevel(xp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

async function addXP(username, amount) {
  const xpData = readJSON('xp.json') || {};
  if (!xpData[username]) xpData[username] = 0;
  xpData[username] += amount;
  await writeJSON('xp.json', xpData);
  return { xp: xpData[username], level: getLevel(xpData[username]) };
}

// GET /api/users/:username/xp
app.get('/api/users/:username/xp', (req, res) => {
  const xpData = readJSON('xp.json') || {};
  const xp = xpData[req.params.username] || 0;
  res.json({ xp, level: getLevel(xp), nextLevel: LEVELS.find(l => l.min > xp) || null });
});

// POST /api/xp/add — 前端触发加经验
app.post('/api/xp/add', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount 无效' });
  const result = await addXP(req.user.username, amount);
  res.json(result);
});

// GET /api/xp/leaderboard
app.get('/api/xp/leaderboard', (req, res) => {
  const xpData = readJSON('xp.json') || {};
  const board = Object.entries(xpData)
    .map(([username, xp]) => ({ username, xp, level: getLevel(xp) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 20);
  res.json(board);
});

// ===================================================================

// ===================================================================
// 举报 API
// ===================================================================
if (!readJSON('reports.json')) writeJSON('reports.json', []);

// SSE 实时推送
const sseClients = new Map(); // username -> Set<response>
function broadcastSSE(username, data) {
  const clients = sseClients.get(username);
  if (clients) clients.forEach(res => { res.write('data: '+JSON.stringify(data)+'\n\n') });
}
function notifyAndBroadcast(type, from, to, text) {
  const notif = { id: Date.now(), type, from, to, text, time: new Date().toISOString(), read: false };
  appendJSON('notifications.json', notif);
  broadcastSSE(to, notif);
  return notif;
}

// GET /api/notifications/stream — SSE实时通知
app.get('/api/notifications/stream', (req, res) => {
  const token = (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).end();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':ok\n\n');
    if (!sseClients.has(decoded.username)) sseClients.set(decoded.username, new Set());
    sseClients.get(decoded.username).add(res);
    req.on('close', () => {
      const clients = sseClients.get(decoded.username);
      if (clients) { clients.delete(res); if (clients.size===0) sseClients.delete(decoded.username) }
    });
  } catch(_) { res.status(401).end() }
});

// POST /api/reports — 提交举报
app.post('/api/reports', authMiddleware, (req, res) => {
  const { postId, commentIndex, reason, detail } = req.body;
  if (!postId || !reason) return res.status(400).json({ error: '请提供帖子ID和举报原因' });
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === parseInt(postId));
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const report = {
    id: Date.now(),
    postId: parseInt(postId),
    postTitle: post.title,
    commentIndex: commentIndex !== undefined ? parseInt(commentIndex) : null,
    reason, detail: detail || '',
    reporter: req.user.username,
    time: new Date().toISOString(),
    status: 'pending', // pending / dismissed / deleted
  };
  appendJSON('reports.json', report);
  res.json({ ok: true });
});

// GET /api/reports — 管理员查看举报列表
app.get('/api/reports', authMiddleware, (req, res) => {
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: '仅管理员可访问' });
  const reports = readJSON('reports.json') || [];
  res.json(reports.sort((a, b) => b.id - a.id));
});

// PUT /api/reports/:id — 管理员处理举报
app.put('/api/reports/:id', authMiddleware, (req, res) => {
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: '仅管理员可访问' });

  const { action } = req.body; // 'dismiss' | 'delete_post'
  const reports = readJSON('reports.json') || [];
  const report = reports.find(r => r.id === parseInt(req.params.id));
  if (!report) return res.status(404).json({ error: '举报不存在' });

  report.status = action === 'delete_post' ? 'resolved' : 'dismissed';
  report.resolvedBy = req.user.username;
  report.resolvedAt = new Date().toISOString();
  writeJSON('reports.json', reports);

  // If deleting post
  if (action === 'delete_post') {
    const posts = readJSON('posts.json') || [];
    writeJSON('posts.json', posts.filter(p => p.id !== report.postId));
  }

  res.json({ ok: true });
});

// ===================================================================
// 私信 API
// ===================================================================
if (!readJSON('messages.json')) writeJSON('messages.json', []);

app.post('/api/messages', authMiddleware, (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: '请提供接收者和消息内容' });
  const users = readJSON('users.json') || [];
  if (!users.find(u => u.username === to)) return res.status(404).json({ error: '用户不存在' });
  const msg = { id: Date.now(), from: req.user.username, to, text: text.substring(0,2000), time: new Date().toISOString(), read: false };
  appendJSON('messages.json', msg);
  broadcastSSE(to, { type: 'dm', from: req.user.username, text: text.substring(0,50) });
  res.json(msg);
});

app.get('/api/messages/:username', authMiddleware, (req, res) => {
  const msgs = readJSON('messages.json') || [];
  const other = req.params.username;
  const conv = msgs.filter(m =>
    (m.from === req.user.username && m.to === other) ||
    (m.from === other && m.to === req.user.username)
  ).sort((a, b) => a.id - b.id).slice(-100);
  // Mark as read
  msgs.forEach(m => { if (m.to === req.user.username && m.from === other) m.read = true });
  writeJSON('messages.json', msgs);
  res.json(conv);
});

app.get('/api/messages', authMiddleware, (req, res) => {
  const msgs = readJSON('messages.json') || [];
  const myMsgs = msgs.filter(m => m.from === req.user.username || m.to === req.user.username);
  const convs = {};
  myMsgs.forEach(m => {
    const other = m.from === req.user.username ? m.to : m.from;
    if (!convs[other] || m.id > convs[other].id) convs[other] = m;
  });
  const unread = {};
  myMsgs.filter(m => m.to === req.user.username && !m.read).forEach(m => { unread[m.from] = (unread[m.from]||0)+1 });
  const list = Object.values(convs).sort((a,b) => b.id - a.id).map(m => {
    const other = m.from === req.user.username ? m.to : m.from;
    return { with: other, lastText: m.text.substring(0,60), time: m.time, unread: unread[other]||0 };
  });
  res.json(list);
});

// ===================================================================
// 板块订阅
// ===================================================================
if (!readJSON('subscriptions.json')) writeJSON('subscriptions.json', []);

const DEFAULT_FORUMS = [
  { id:'tech', name:'技术交流', icon:'💻', desc:'程序员的家园' },
  { id:'game', name:'游戏天地', icon:'🎮', desc:'游戏攻略与讨论' },
  { id:'life', name:'生活日常', icon:'🌸', desc:'分享生活点滴' },
  { id:'design', name:'设计创意', icon:'🎨', desc:'设计师交流平台' },
  { id:'music', name:'音乐分享', icon:'🎵', desc:'分享你爱的音乐' },
  { id:'ai', name:'AI 探索', icon:'🤖', desc:'人工智能前沿' },
  { id:'frontend', name:'前端开发', icon:'💻', desc:'前端技术交流' },
  { id:'indie-game', name:'独立游戏', icon:'🎮', desc:'独立游戏开发' },
  { id:'food', name:'美食分享', icon:'🍳', desc:'美食制作与分享' },
  { id:'pet', name:'萌宠乐园', icon:'🐱', desc:'宠物日常' },
];

if (!readJSON('forums.json')) writeJSON('forums.json', []);

app.get('/api/forums', (req, res) => {
  const custom = readJSON('forums.json') || [];
  res.json({ default: DEFAULT_FORUMS, custom });
});

app.post('/api/forums', authMiddleware, adminOnly, (req, res) => {
  const { id, name, icon, desc } = req.body;
  if (!id || !name) return res.status(400).json({ error: '请提供板块ID和名称' });
  const forums = readJSON('forums.json') || [];
  if (DEFAULT_FORUMS.find(f => f.id === id) || forums.find(f => f.id === id)) return res.status(400).json({ error: '板块ID已存在' });
  forums.push({ id, name, icon: icon||'📌', desc: desc||'', posts: 0, members: 0 });
  writeJSON('forums.json', forums);
  res.json({ ok: true });
});

app.put('/api/forums/:id', authMiddleware, adminOnly, (req, res) => {
  const { name, icon, desc } = req.body;
  const forums = readJSON('forums.json') || [];
  const forum = forums.find(f => f.id === req.params.id);
  if (!forum) return res.status(404).json({ error: '板块不存在或为默认板块不可编辑' });
  if (name) forum.name = name;
  if (icon) forum.icon = icon;
  if (desc !== undefined) forum.desc = desc;
  writeJSON('forums.json', forums);
  res.json({ ok: true });
});

app.delete('/api/forums/:id', authMiddleware, adminOnly, (req, res) => {
  let forums = readJSON('forums.json') || [];
  const before = forums.length;
  forums = forums.filter(f => f.id !== req.params.id);
  if (forums.length === before) return res.status(404).json({ error: '板块不存在' });
  writeJSON('forums.json', forums);
  res.json({ ok: true });
});

app.post('/api/forums/:id/subscribe', authMiddleware, (req, res) => {
  const forumId = req.params.id;
  const forum = DEFAULT_FORUMS.find(f => f.id === forumId) || (readJSON('forums.json')||[]).find(f => f.id === forumId);
  if (!forum) return res.status(404).json({ error: '板块不存在' });
  const subs = readJSON('subscriptions.json') || [];
  const idx = subs.findIndex(s => s.username === req.user.username && s.forum === forumId);
  if (idx >= 0) { subs.splice(idx, 1); writeJSON('subscriptions.json', subs); return res.json({ subscribed: false }) }
  subs.push({ username: req.user.username, forum: forumId, time: new Date().toISOString() });
  writeJSON('subscriptions.json', subs);
  res.json({ subscribed: true });
});

app.get('/api/users/:username/subscriptions', (req, res) => {
  const subs = readJSON('subscriptions.json') || [];
  res.json(subs.filter(s => s.username === req.params.username).map(s => s.forum));
});

// ===================================================================
// 数据看板 API
// ===================================================================
app.get('/api/admin/stats', authMiddleware, adminOnly, (req, res) => {
  const posts = readJSON('posts.json') || [];
  const users = readJSON('users.json') || [];
  const bookmarks = readJSON('bookmarks.json') || [];
  const follows = readJSON('follows.json') || [];
  const xpData = readJSON('xp.json') || {};
  const notifs = readJSON('notifications.json') || [];
  const reports = readJSON('reports.json') || [];

  // Forum distribution
  const forumDist = {};
  posts.forEach(p => { forumDist[p.forum] = (forumDist[p.forum]||0)+1 });

  // Top authors
  const authorDist = {};
  posts.forEach(p => { authorDist[p.author] = (authorDist[p.author]||0)+1 });
  const topAuthors = Object.entries(authorDist).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count}));

  // Daily post trend (last 7 days, simulated from post IDs)
  const now = Date.now();
  const days = [];
  for(let i=6;i>=0;i--){
    const dayStart = now-(i+1)*86400000;
    const dayEnd = now-i*86400000;
    const count = posts.filter(p=>p.id>dayStart&&p.id<=dayEnd).length;
    days.push({date:new Date(dayEnd).toLocaleDateString('zh-CN',{month:'short',day:'numeric'}),count});
  }

  // Engagement stats
  const totalLikes = posts.reduce((s,p)=>s+(p.likes||0),0);
  const totalComments = posts.reduce((s,p)=>s+(p.replies||0),0);

  res.json({
    overview: {
      users: users.length, posts: posts.length, bookmarks: bookmarks.length,
      follows: follows.length, reports: reports.length, notifs: notifs.length,
      totalLikes, totalComments,
    },
    forumDistribution: forumDist,
    topAuthors,
    dailyTrend: days,
  });
});

// ===================================================================
// 管理员 API
// ===================================================================

function adminOnly(req, res, next) {
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.user.username);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: '仅管理员可操作' });
  next();
}

// PUT /api/users/:username/role — 设置用户角色
app.put('/api/users/:username/role', authMiddleware, adminOnly, (req, res) => {
  const { role } = req.body;
  if (!['user','moderator','admin'].includes(role)) return res.status(400).json({ error: '无效角色' });
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  user.role = role;
  writeJSON('users.json', users);
  res.json({ ok: true, username: user.username, role });
});

// 公告
if (!readJSON('announcements.json')) writeJSON('announcements.json', []);

app.get('/api/announcements', (req, res) => {
  res.json((readJSON('announcements.json')||[]).filter(a => !a.deleted).slice(-3));
});

app.post('/api/announcements', authMiddleware, adminOnly, (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '公告内容不能为空' });
  const ann = { id: Date.now(), text, time: new Date().toISOString(), author: req.user.username, deleted: false };
  appendJSON('announcements.json', ann);
  res.json(ann);
});

app.delete('/api/announcements/:id', authMiddleware, adminOnly, (req, res) => {
  const anns = readJSON('announcements.json') || [];
  const ann = anns.find(a => a.id === parseInt(req.params.id));
  if (!ann) return res.status(404).json({ error: '公告不存在' });
  ann.deleted = true;
  writeJSON('announcements.json', anns);
  res.json({ ok: true });
});

// 批量删除帖子
app.post('/api/admin/posts/bulk-delete', authMiddleware, adminOnly, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: '请提供帖子ID数组' });
  let posts = readJSON('posts.json') || [];
  const before = posts.length;
  posts = posts.filter(p => !ids.includes(p.id));
  writeJSON('posts.json', posts);
  res.json({ deleted: before - posts.length });
});

// GET /api/search?q=xxx — 站内搜索
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 1) return res.json({ results: [], total: 0 });

  const posts = readJSON('posts.json') || [];
  const results = posts
    .map(p => {
      let score = 0;
      const title = (p.title || '').toLowerCase();
      const content = (p.content || '').toLowerCase();
      const author = (p.author || '').toLowerCase();
      const tags = (p.tags || []).join(' ').toLowerCase();

      // Title match = highest weight
      if (title.includes(q)) score += 50;
      if (title.startsWith(q)) score += 30;
      // Tag match
      if (tags.includes(q)) score += 40;
      // Content match
      const contentMatches = (content.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += Math.min(contentMatches * 5, 30);
      // Author match
      if (author.includes(q)) score += 20;
      // Recency bonus
      if (p.id > Date.now() - 7*86400000) score += 5;
      // Popularity bonus
      score += Math.min(p.likes / 20, 10);
      score += Math.min(p.replies / 10, 10);

      return { ...p, _score: Math.round(score) };
    })
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 30);

  res.json({ results, total: results.length, query: q });
});

// GET /api/stats — 真实社区数据
app.get('/api/stats', (req, res) => {
  const users = readJSON('users.json') || [];
  const bookmarks = readJSON('bookmarks.json') || [];
  const follows = readJSON('follows.json') || [];
  const tags = readJSON('tags.json') || [];
  const posts = readJSON('posts.json') || [];
  const xpData = readJSON('xp.json') || {};
  const leaderboard = Object.entries(xpData).map(([u, x]) => ({ username: u, xp: x })).sort((a, b) => b.xp - a.xp);
  res.json({
    users: users.length,
    posts: posts.length,
    bookmarks: bookmarks.length,
    follows: follows.length,
    tags: tags.length,
    leaderboard: leaderboard.slice(0, 10),
    hotTags: (readJSON('tags.json') || []).sort((a, b) => b.count - a.count).slice(0, 10),
  });
});

// GET /api/health — 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiConfigured: !!OPENAI_API_KEY,
    model: OPENAI_MODEL,
    timestamp: new Date().toISOString(),
  });
});

// ─── 前端路由 ───────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ─── 全局错误处理 ───────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[${req.id || '???'}] 未捕获异常:`, err.message, err.stack?.split('\n')[1]?.trim());
  res.status(500).json({ error: '服务器内部错误' });
});

// ─── 启动服务器 ─────────────────────────────────────────────────
(async () => {
  await initData();
  await initPostsData();
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║       🪹 栖语 Nest · 话语栖息之地      ║');
    console.log(`  ║       http://localhost:${PORT}                ║`);
    console.log(`  ║       管理后台: /admin                    ║`);
    console.log(`  ║       AI: ${OPENAI_API_KEY ? 'DeepSeek ✅' : '未配置 ⚠️'}                          ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
})();
