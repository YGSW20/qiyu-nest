# CLOSD Bug 知识沉淀

> 来源: Bug 排查专家包 | 日期: 2026-07-04

---

## 根因模式库

### Pattern 1: 静默吞错导致排查黑洞

**症状**: 用户操作失败、页面无反应、无任何错误提示
**根因**: `catch(e){}` 空块吞掉所有错误
**修复**: 所有 catch 块至少 `console.warn('[module]', e.message)`
**防范**: ESLint rule `no-empty` + `@typescript-eslint/no-empty-function`

### Pattern 2: 服务端错误暴露给客户端

**症状**: 用户看到 `Error: OPENAI_API_KEY 未配置` 等内部实现细节
**根因**: `res.status(500).json({ error: err.message })` 直接透传内部错误
**修复**: 生产环境返回 `{ error: '服务器内部错误' }`，实际错误只打服务端日志
**防范**: 封装 `sendError(res, err)` 统一处理

### Pattern 3: Service Worker 缓存导致用户使用旧版本

**症状**: 用户刷新后看不到新功能，开发者困惑为何"改了没用"
**根因**: SW `install` 事件缓存了 `index.html`，更新代码后缓存的仍是旧版
**修复**: 
- 每次发布 bump `CACHE` 版本号
- 或使用构建 hash 自动版本化
- 或开发时 DevTools → Application → Service Workers → Unregister
**防范**: 开发环境禁用 SW，生产环境用 Workbox 的 `injectManifest`

### Pattern 4: fire-and-forget 通知丢失

**症状**: 用户点赞/评论后对方收不到通知
**根因**: `fetch(...).catch(function(){})` 无重试机制
**修复**: 封装 `sendWithRetry(body, maxRetries=2)` 
**防范**: 所有关键写操作增加重试逻辑

### Pattern 5: 竞态条件 — JSON 文件并发写入

**症状**: 高并发下偶现数据丢失或覆盖
**根因**: `readJSON` → 修改 → `writeJSON` 不是原子操作
**修复**: 使用互斥锁或改用 SQLite
**防范**: 任何共享状态修改都应考虑并发安全

---

## 修复效果对比

| 指标 | 修复前 | 修复后 |
|------|:---:|:---:|
| 空 catch 块 | 8 | **0** |
| 无日志的错误处理 | 3 | **0** |
| 回归测试通过率 | 21/21 | **21/21** |
| 客户端可见的内部错误 | 多处 | **全部隐藏** |

---

## 自查清单

开发 CLOSD 新功能前，逐项确认：

- [ ] 每个 `.catch()` 至少 console.warn 了吗？
- [ ] API 错误不暴露内部实现细节了吗？
- [ ] `sw.js` 版本号 bump 了吗？
- [ ] 写操作有重试机制了吗？
- [ ] 测试全部通过了吗？(`npm test`)
