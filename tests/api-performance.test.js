/**
 * CLOSD API 性能测试与压力测试
 * 本地: npx jest tests/api-performance.test.js --forceExit
 * 远端: TEST_HOST=http://42.193.192.7:8080 npx jest tests/api-performance.test.js --forceExit
 */

const BASE = process.env.TEST_HOST || `http://localhost:${process.env.TEST_PORT || 8080}`;

beforeAll(async () => {
  try {
    const resp = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error('Server not ready');
  } catch (_) {
    throw new Error('服务器不可达: ' + BASE + '  请先启动: node server.js');
  }
});

// ─── 响应时间基准测试 ─────────────────────────────────────────────
describe('API 响应时间基准', () => {
  const TIMEOUT = 2000; // ms — 任何 API 不应超过此值

  test('GET /api/health < 100ms', async () => {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/health`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(100);
  });

  test('POST /api/auth/login < 500ms', async () => {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });

  test('GET /api/tags/trending < 100ms', async () => {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/tags/trending`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(100);
  });

  test('GET /api/xp/leaderboard < 100ms', async () => {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/xp/leaderboard`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── 并发测试 ─────────────────────────────────────────────────────
describe('并发请求', () => {
  test('10个并发 health check 全部成功', async () => {
    const requests = Array(10).fill(null).map(() =>
      fetch(`${BASE}/api/health`).then(r => r.status)
    );
    const results = await Promise.all(requests);
    expect(results.every(s => s === 200)).toBe(true);
  });

  test('5个并发登录 全部成功', async () => {
    const login = () => fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }).then(r => r.status);

    const results = await Promise.all(Array(5).fill(null).map(() => login()));
    expect(results.every(s => s === 200)).toBe(true);
  });
});

// ─── 边界条件测试 ─────────────────────────────────────────────────
describe('边界条件', () => {
  test('空用户名注册被拒绝', async () => {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('超长用户名被拒绝', async () => {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x'.repeat(100), password: '123456' }),
    });
    expect(res.status).toBe(400);
  });

  test('JWT 伪造 token 被拒绝', async () => {
    const res = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Authorization': 'Bearer fake.token.here' },
    });
    expect(res.status).toBe(401);
  });

  test('不存在的用户返回404', async () => {
    const res = await fetch(`${BASE}/api/users/nonexistent_user_99999`);
    expect(res.status).toBe(404);
  });
});

// ─── 数据完整性测试 ───────────────────────────────────────────────
describe('数据完整性', () => {
  test('JWT 登录后可正确获取用户信息', async () => {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const { token } = await loginRes.json();

    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);
    expect((await meRes.json()).username).toBe('admin');
  });

  test('关注双方数据一致', async () => {
    const aLogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: '123456' }),
    });
    if (aLogin.status !== 200) return; // testuser 可能不存在，跳过

    const { token: aTok } = await aLogin.json();
    const bLogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const { token: bTok } = await bLogin.json();

    // testuser 关注 admin
    await fetch(`${BASE}/api/users/admin/follow`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${aTok}` },
    });

    // admin 的粉丝列表应包含 testuser
    const followersRes = await fetch(`${BASE}/api/users/admin/followers`);
    const followers = await followersRes.json();
    expect(followers).toContain('testuser');
  });
});
