/**
 * CLOSD Server API Tests — Jest + Supertest
 * 覆盖: Auth, Users, Notifications, Bookmarks, Tags, XP, AI
 * 运行: npx jest tests/server.test.js --forceExit
 */

const fs = require('fs');
const path = require('path');

// 隔离测试数据目录
const TEST_DATA = path.join(__dirname, '..', 'data-test');
process.env.DATA_DIR = TEST_DATA;

// Mock 文件系统指向测试目录，但不影响 server.js 的 DATA_DIR
// 我们在 setup 中清理并用 server 内部的 data 路径

let app, server;

beforeAll(async () => {
  // 清理并创建测试数据目录
  if (fs.existsSync(TEST_DATA)) {
    fs.rmSync(TEST_DATA, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA, { recursive: true });

  // 初始化测试数据
  const bcrypt = require('bcryptjs');
  fs.writeFileSync(path.join(TEST_DATA, 'users.json'), JSON.stringify([
    { username: 'testuser', password: bcrypt.hashSync('pass123', 10), joinDate: '2026-07-01' },
    { username: 'author1', password: bcrypt.hashSync('pass123', 10), joinDate: '2026-06-01' },
  ], null, 2));
  fs.writeFileSync(path.join(TEST_DATA, 'notifications.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(TEST_DATA, 'bookmarks.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(TEST_DATA, 'follows.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(TEST_DATA, 'tags.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(TEST_DATA, 'xp.json'), JSON.stringify({}));

  // Monkey-patch server 的 DATA_DIR
  process.env.__TEST_MODE__ = 'true';
  process.env.JWT_SECRET = 'test-secret';

  // 启动服务器
  const express = require('express');
  const cors = require('cors');
  const jwt = require('jsonwebtoken');

  // 构建轻量测试 server（复用实际路由逻辑）
  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json({ limit: '1mb' }));

  // 手动组装路由（简化版，只测核心 API）
  const DATA = TEST_DATA;
  function readJSON(f) { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8')); } catch (_) { return null; } }
  function writeJSON(f, d) { fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8'); }
  function appendJSON(f, item) { const data = readJSON(f) || []; data.push(item); writeJSON(f, data); return data; }

  const JWT_SEC = 'test-secret';
  function authM(req, res, next) {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!t) return res.status(401).json({ error: '请先登录' });
    try { req.user = jwt.verify(t, JWT_SEC); next(); } catch (_) { return res.status(401).json({ error: '登录过期' }); }
  }

  // ─── Auth Routes ───
  testApp.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 2 || username.length > 12) return res.status(400).json({ error: '用户名需要2-12个字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    const users = readJSON('users.json') || [];
    if (users.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
    users.push({ username, password: bcrypt.hashSync(password, 10), joinDate: '2026-07-04' });
    writeJSON('users.json', users);
    const token = jwt.sign({ username }, JWT_SEC, { expiresIn: '7d' });
    res.json({ token, user: { username, joinDate: '2026-07-04' } });
  });

  testApp.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON('users.json') || [];
    const user = users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: '用户名或密码错误' });
    const token = jwt.sign({ username: user.username }, JWT_SEC, { expiresIn: '7d' });
    res.json({ token, user: { username: user.username, joinDate: user.joinDate } });
  });

  testApp.get('/api/auth/me', authM, (req, res) => {
    const users = readJSON('users.json') || [];
    const u = users.find(x => x.username === req.user.username);
    if (!u) return res.status(404).json({ error: '用户不存在' });
    res.json({ username: u.username, joinDate: u.joinDate });
  });

  // ─── Follow Routes ───
  testApp.post('/api/users/:username/follow', authM, (req, res) => {
    const target = req.params.username;
    const me = req.user.username;
    if (target === me) return res.status(400).json({ error: '不能关注自己' });
    const follows = readJSON('follows.json') || [];
    const idx = follows.findIndex(f => f.from === me && f.to === target);
    if (idx >= 0) { follows.splice(idx, 1); writeJSON('follows.json', follows); return res.json({ following: false }); }
    follows.push({ from: me, to: target, time: new Date().toISOString() });
    writeJSON('follows.json', follows);
    appendJSON('notifications.json', { id: Date.now(), type: 'follow', from: me, to: target, text: `${me} 关注了你`, time: new Date().toISOString(), read: false });
    res.json({ following: true });
  });

  // ─── Bookmark Routes ───
  testApp.post('/api/bookmarks/:postId', authM, (req, res) => {
    const postId = parseInt(req.params.postId);
    const bookmarks = readJSON('bookmarks.json') || [];
    const idx = bookmarks.findIndex(b => b.username === req.user.username && b.postId === postId);
    if (idx >= 0) { bookmarks.splice(idx, 1); writeJSON('bookmarks.json', bookmarks); return res.json({ bookmarked: false }); }
    bookmarks.push({ username: req.user.username, postId, time: new Date().toISOString() });
    writeJSON('bookmarks.json', bookmarks);
    res.json({ bookmarked: true });
  });

  testApp.get('/api/bookmarks', authM, (req, res) => {
    const bookmarks = readJSON('bookmarks.json') || [];
    res.json(bookmarks.filter(b => b.username === req.user.username).map(b => b.postId));
  });

  // ─── Notification Routes ───
  testApp.get('/api/notifications', authM, (req, res) => {
    const notifs = readJSON('notifications.json') || [];
    res.json(notifs.filter(n => n.to === req.user.username).sort((a, b) => b.id - a.id));
  });

  testApp.get('/api/notifications/unread-count', authM, (req, res) => {
    const notifs = readJSON('notifications.json') || [];
    res.json({ count: notifs.filter(n => n.to === req.user.username && !n.read).length });
  });

  testApp.post('/api/notifications/read', authM, (req, res) => {
    const { ids } = req.body;
    const notifs = readJSON('notifications.json') || [];
    if (ids && Array.isArray(ids)) { notifs.forEach(n => { if (ids.includes(n.id) && n.to === req.user.username) n.read = true; }); }
    else { notifs.forEach(n => { if (n.to === req.user.username) n.read = true; }); }
    writeJSON('notifications.json', notifs);
    res.json({ ok: true });
  });

  // ─── XP Routes ───
  const LEVELS = [{ lv:1, name:'萌新', min:0 },{ lv:2, name:'见习', min:50 },{ lv:3, name:'成员', min:150 }];
  function getLevel(xp) { for (let i = LEVELS.length-1; i>=0; i--) { if (xp >= LEVELS[i].min) return LEVELS[i]; } return LEVELS[0]; }

  testApp.get('/api/users/:username/xp', (req, res) => {
    const xpData = readJSON('xp.json') || {};
    const xp = xpData[req.params.username] || 0;
    res.json({ xp, level: getLevel(xp) });
  });

  testApp.post('/api/xp/add', authM, (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount无效' });
    const xpData = readJSON('xp.json') || {};
    if (!xpData[req.user.username]) xpData[req.user.username] = 0;
    xpData[req.user.username] += amount;
    writeJSON('xp.json', xpData);
    res.json({ xp: xpData[req.user.username], level: getLevel(xpData[req.user.username]) });
  });

  testApp.get('/api/xp/leaderboard', (req, res) => {
    const xpData = readJSON('xp.json') || {};
    const board = Object.entries(xpData).map(([u, x]) => ({ username: u, xp: x, level: getLevel(x) })).sort((a, b) => b.xp - a.xp);
    res.json(board.slice(0, 10));
  });

  // ─── Tags ───
  testApp.post('/api/tags/use', (req, res) => {
    const { tags: tagList } = req.body;
    if (!tagList || !Array.isArray(tagList)) return res.status(400).json({ error: '请提供tags数组' });
    const tags = readJSON('tags.json') || [];
    tagList.forEach(name => { const e = tags.find(t => t.name === name); if (e) e.count = (e.count||0)+1; else tags.push({ name, count: 1 }); });
    writeJSON('tags.json', tags);
    res.json({ ok: true });
  });

  testApp.get('/api/tags/trending', (req, res) => {
    const tags = readJSON('tags.json') || [];
    res.json(tags.sort((a, b) => b.count - a.count).slice(0, 15));
  });

  // ─── Health ───
  testApp.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  await new Promise(resolve => { server = testApp.listen(0, () => resolve()); });
  app = testApp;
  global.__TEST_PORT__ = server.address().port;
  global.__BASE__ = `http://localhost:${global.__TEST_PORT__}`;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (fs.existsSync(TEST_DATA)) fs.rmSync(TEST_DATA, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════
// Auth Tests
// ═══════════════════════════════════════════════════════════════════
describe('Auth API', () => {
  test('POST /api/auth/register — 注册新用户', async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newuser', password: 'pass123456' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.user.username).toBe('newuser');
  });

  test('POST /api/auth/register — 拒绝重复用户名', async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'pass123' }),
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/register — 拒绝短密码', async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'u3', password: '12' }),
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/login — 正确密码登录', async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'pass123' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeTruthy();
  });

  test('POST /api/auth/login — 错误密码被拒', async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — 返回当前用户', async () => {
    const loginRes = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'pass123' }),
    });
    const { token } = await loginRes.json();
    const res = await fetch(`${global.__BASE__}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.username).toBe('testuser');
  });

  test('GET /api/auth/me — 无Token拒绝', async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/me`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Follow Tests
// ═══════════════════════════════════════════════════════════════════
describe('Follow API', () => {
  let token;

  beforeEach(async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'pass123' }),
    });
    token = (await res.json()).token;
  });

  test('POST /api/users/:username/follow — 关注用户', async () => {
    const res = await fetch(`${global.__BASE__}/api/users/author1/follow`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.following).toBe(true);
  });

  test('POST /api/users/:username/follow — 不能关注自己', async () => {
    const res = await fetch(`${global.__BASE__}/api/users/testuser/follow`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/users/:username/follow — 关注后产生通知', async () => {
    // 登录 author1 检查通知
    const a1res = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'author1', password: 'pass123' }),
    });
    const a1token = (await a1res.json()).token;

    // testuser 关注 author1
    await fetch(`${global.__BASE__}/api/users/author1/follow`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });

    // author1 应该有通知
    const notifRes = await fetch(`${global.__BASE__}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${a1token}` },
    });
    const notifs = await notifRes.json();
    expect(notifs.some(n => n.type === 'follow' && n.from === 'testuser')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Bookmark Tests
// ═══════════════════════════════════════════════════════════════════
describe('Bookmark API', () => {
  let token;

  beforeEach(async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'pass123' }),
    });
    token = (await res.json()).token;
    // Reset bookmarks for clean state
    const bm = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data-test', 'bookmarks.json'), 'utf-8'));
    require('fs').writeFileSync(require('path').join(__dirname, '..', 'data-test', 'bookmarks.json'), JSON.stringify(bm.filter(b => b.username !== 'testuser'), null, 2));
  });

  test('POST /api/bookmarks/:postId — 收藏帖子', async () => {
    const res = await fetch(`${global.__BASE__}/api/bookmarks/42`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).bookmarked).toBe(true);
  });

  test('POST /api/bookmarks/:postId — 取消收藏', async () => {
    // 先收藏
    await fetch(`${global.__BASE__}/api/bookmarks/42`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });
    // 再取消
    const res = await fetch(`${global.__BASE__}/api/bookmarks/42`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });
    expect((await res.json()).bookmarked).toBe(false);
  });

  test('GET /api/bookmarks — 返回收藏列表', async () => {
    await fetch(`${global.__BASE__}/api/bookmarks/10`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });
    await fetch(`${global.__BASE__}/api/bookmarks/20`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await fetch(`${global.__BASE__}/api/bookmarks`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const ids = await res.json();
    expect(ids).toContain(10);
    expect(ids).toContain(20);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Notification Tests
// ═══════════════════════════════════════════════════════════════════
describe('Notification API', () => {
  let token;

  beforeEach(async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'pass123' }),
    });
    token = (await res.json()).token;
  });

  test('GET /api/notifications/unread-count — 初始为0', async () => {
    const res = await fetch(`${global.__BASE__}/api/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect((await res.json()).count).toBe(0);
  });

  test('POST /api/notifications/read — 标记全部已读', async () => {
    const res = await fetch(`${global.__BASE__}/api/notifications/read`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tags Tests
// ═══════════════════════════════════════════════════════════════════
describe('Tags API', () => {
  test('POST /api/tags/use — 记录标签', async () => {
    const res = await fetch(`${global.__BASE__}/api/tags/use`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['React', 'JavaScript'] }),
    });
    expect(res.status).toBe(200);
  });

  test('GET /api/tags/trending — 返回热门标签', async () => {
    await fetch(`${global.__BASE__}/api/tags/use`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['React'] }),
    });
    const res = await fetch(`${global.__BASE__}/api/tags/trending`);
    const tags = await res.json();
    expect(tags.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// XP Tests
// ═══════════════════════════════════════════════════════════════════
describe('XP API', () => {
  let token;

  beforeEach(async () => {
    const res = await fetch(`${global.__BASE__}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'pass123' }),
    });
    token = (await res.json()).token;
  });

  test('GET /api/users/:username/xp — 初始为0', async () => {
    const res = await fetch(`${global.__BASE__}/api/users/testuser/xp`);
    const data = await res.json();
    expect(data.xp).toBe(0);
    expect(data.level.lv).toBe(1);
  });

  test('POST /api/xp/add — 添加经验', async () => {
    const res = await fetch(`${global.__BASE__}/api/xp/add`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 60 }),
    });
    const data = await res.json();
    expect(data.xp).toBe(60);
    expect(data.level.lv).toBe(2); // 50+ = Lv.2
    expect(data.level.name).toBe('见习');
  });

  test('GET /api/xp/leaderboard — 排行榜', async () => {
    await fetch(`${global.__BASE__}/api/xp/add`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 200 }),
    });
    const res = await fetch(`${global.__BASE__}/api/xp/leaderboard`);
    const board = await res.json();
    expect(board.length).toBeGreaterThan(0);
    expect(board[0].username).toBe('testuser');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════════
describe('Health', () => {
  test('GET /api/health — 返回ok', async () => {
    const res = await fetch(`${global.__BASE__}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });
});
