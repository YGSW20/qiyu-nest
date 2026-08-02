# CLOSD Bug 排查报告

> 方法: 六步系统化调试工作流 | 日期: 2026-07-04

---

## 1. 问题总览

| # | 严重级 | 位置 | 问题 |
|---|:---:|------|------|
| B1 | P2 | `index.html` 多处 | 空 catch 块静默吞错，调试不可见 |
| B2 | P2 | `server.js:382` | Auth 路由 catch 块未打日志 |
| B3 | P3 | `sw.js` | Service Worker 缓存过期策略不完善 |
| B4 | P3 | `index.html:1529,1539` | 书签/关注同步静默失败 |
| B5 | P3 | `index.html:1447` | 通知发送使用 fire-and-forget，无重试 |
| B6 | P3 | `server.js` | JSON 文件并发写入无锁保护 |

---

## 2. 逐条分析

### B1: 空 catch 块静默吞错 (P2)

**位置**: `index.html` 行 1177, 1196, 1336, 1339, 1342, 1879, 1915

```javascript
// ❌ Bad — 错误被完全忽略
}catch(e){}

// ✅ Fix — 至少打日志
}catch(e){ console.warn('[CLOSD] 操作失败:', e.message) }
```

**影响**: 用户操作失败时无任何反馈，排查问题无从下手。

### B2: Auth 路由错误日志缺失 (P2)

**位置**: `server.js:333, 349, 382`

```javascript
// ❌ 缺少日志
} catch (err) {
  res.status(500).json({ error: err.message });
}

// ✅ Fix
} catch (err) {
  console.error('[auth]', err.message);
  res.status(500).json({ error: '服务器内部错误' });
  // 生产环境不暴露内部错误细节给客户端
}
```

### B3: Service Worker 缓存过期 (P3)

**位置**: `sw.js`

当前只有 `v1 → v2` 手动升级，后续每次代码变更需要手动 bump。缺少自动 hash 机制。

```javascript
// ✅ 改进: 基于构建时间的自动版本
const CACHE = 'closd-' + new Date().toISOString().split('T')[0];
```

### B4: 书签/关注同步静默失败 (P3)

**位置**: `index.html:1529, 1539`

当 API 调用失败时静默跳过，页面渲染的状态与实际数据不一致。

```javascript
// ✅ Fix
try {
  var d = await apiCall('/api/bookmarks/check/' + postId);
  el.textContent = d.bookmarked ? '⭐' : '☆';
} catch(e) {
  console.warn('[sync] bookmark check failed for', postId, e.message);
  // 保持默认状态 ☆，不阻塞页面渲染
}
```

### B5: 通知发送无重试 (P3)

**位置**: `index.html:1447`

```javascript
// ❌ 一次失败就永远丢失
fetch('/api/notifications', {...}).catch(function(){});

// ✅ 加简单重试
async function sendNotification(body, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify(body)
      });
      return;
    } catch(e) {
      if (i === retries) console.warn('[notif] send failed after', retries, 'retries');
    }
  }
}
```

### B6: JSON 文件无并发锁 (P3)

**位置**: `server.js`

`readJSON` → 修改 → `writeJSON` 模式在并发请求下有竞态条件。

```javascript
// ✅ 简单互斥锁
const fileLocks = {};
function withLock(filename, fn) {
  if (!fileLocks[filename]) fileLocks[filename] = Promise.resolve();
  return fileLocks[filename] = fileLocks[filename].then(() => fn()).finally(() => {});
}
```

---

## 3. 修复优先级

| 优先级 | Bug | 修复成本 | 收益 |
|:---:|-----|:---:|------|
| **立即** | B1 空catch加日志 | 10分钟 | 可观测性 ↑↑ |
| **立即** | B2 Auth日志 | 2分钟 | 安全 + 可观测 |
| **本周** | B4 书签同步 | 15分钟 | 用户体验 |
| **本周** | B5 通知重试 | 15分钟 | 可靠性 |
| **后续** | B3 SW版本 | 30分钟 | 开发体验 |
| **后续** | B6 并发锁 | 1小时 | 数据安全 |
