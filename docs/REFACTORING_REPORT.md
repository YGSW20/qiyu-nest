# CLOSD 代码重构报告

> 方法: 六步重构工作流 | 日期: 2026-07-04

---

## 1. 代码结构分析

### 规模概览

| 文件 | 行数 | 函数数 | 大小 | 评级 |
|------|:---:|:---:|------|:---:|
| `index.html` | 2130 | 114 | 124 KB | 🔴 单体巨石 |
| `server.js` | 646 | 37 | 22 KB | 🟡 可管理 |
| `admin.html` | 1308 | 45 | 61 KB | 🟠 偏大 |

### 复杂度热力图

```
index.html ─────────────────────────────────────── 🔴🔴🔴
  CSS     ████████████ (400行)  🟡 内联样式过多
  HTML    ██████ (200行)        🟢 结构清晰
  JS      ████████████████████  🔴 114个函数拥挤在全局作用域
           (1500行)

server.js ───────────────── 🟡
  Config  ██ (60行)          🟢
  AI API  ██████ (180行)     🟡
  Auth    ██ (50行)          🟢
  Social  ██████████ (300行)  🟡 关注/收藏/通知/标签/XP 全混一起

admin.html ───────────────────── 🟠
  CSS     ████████ (350行)     🟡
  JS      ██████████████ (600行) 🟠
```

### 依赖关系

```
index.html ──fetch──> server.js ──fetch──> DeepSeek API
    │                    │
    │                    ├── data/users.json
    │                    ├── data/bookmarks.json
    │                    ├── data/notifications.json
    │                    ├── data/follows.json
    │                    ├── data/tags.json
    │                    └── data/xp.json
    │
    └── localStorage (token, current_user)
```

**高耦合标记**: index.html 中的 `apiCall` 函数被 40+ 个函数共享，但没有抽象为独立模块。

---

## 2. 技术债务评估

| # | 债务项 | 位置 | 严重级 | 优先级 |
|---|--------|------|:---:|:---:|
| D1 | **单体巨石** — 2130行单文件 | index.html | 🔴 | P0 |
| D2 | **全局函数污染** — 114个函数在 window 作用域 | index.html | 🔴 | P0 |
| D3 | **CSS/JS/HTML 混杂** — 无关注点分离 | index.html | 🟠 | P1 |
| D4 | **samplePosts 硬编码** — 14条假数据 | index.html | 🟠 | P1 |
| D5 | **renderPosts 多重覆盖** — 函数被覆写3次 | index.html | 🟠 | P1 |
| D6 | **server.js 路由扁平** — 所有路由在单文件 | server.js | 🟡 | P2 |
| D7 | **JSON 文件数据库** — 无事务/无索引 | server.js | 🟡 | P2 |
| D8 | **admin.html 与 index.html 代码重复** — toast/modal/存储模式 | 两个文件 | 🟡 | P2 |
| D9 | **无模块化** — 所有代码内联，无 import/export | 全部 | 🟠 | P1 |
| D10 | **无 Git 版本控制** — 无法追踪变更历史 | 项目级 | 🟡 | P2 |

### 重构优先级排序

```
P0 (立即): D1 拆分 index.html, D2 模块化 JS
P1 (本周): D3 CSS 外置, D4 动态数据, D5 消除函数覆写
P2 (后续): D6 路由拆分, D7 数据库升级, D8 消除重复, D10 Git
```

---

## 3. SOLID 原则合规报告

### 单一职责原则 (SRP) — ⚠️ 大量违反

| 位置 | 问题 |
|------|------|
| `index.html` | 一个文件承担: CSS引擎 + HTML渲染 + 认证 + 通知 + 收藏 + 关注 + AI + 标签 + 等级 |
| `renderPosts()` | 同时做: 筛选 + 排序 + 渲染 + 书签同步 + 关注同步 |
| `server.js` | 同时做: HTTP服务 + 静态文件 + AI代理 + 数据持久化 + 认证 + 业务逻辑 |

### 开闭原则 (OCP) — ⚠️ 部分违反

```javascript
// ❌ 每次新功能都要改 renderPosts
var originalRenderPosts = renderPosts;
renderPosts = function() { originalRenderPosts(); syncAllTier1(); };
var origRenderPosts2 = renderPosts;
renderPosts = function() { origRenderPosts2(); /* 加标签渲染 */ };

// ✅ 应该用事件/钩子系统
on('posts:rendered', syncAllTier1);
on('posts:rendered', renderTags);
```

### 依赖倒置原则 (DIP) — ⚠️ 违反

```javascript
// ❌ 高层模块直接依赖低层 fetch
async function apiCall(endpoint, opts={}){
  var resp = await fetch(url, {...});  // 硬编码 fetch
}

// ✅ 应抽象为 ApiClient 接口
const api = new ApiClient(BASE_URL);
```

### 接口隔离原则 (ISP) — 🟢 基本遵循

每个 API 端点返回的数据结构精简，前端按需取用。

---

## 4. 重构操作计划

### Phase 1: 前端模块化 (P0)

```
index.html (2130行)
  └── 拆分为 ──>
      ├── index.html          (~200行, 纯 HTML 骨架)
      ├── css/
      │   └── style.css       (~400行)
      ├── js/
      │   ├── app.js          (~50行,  初始化 + 路由)
      │   ├── auth.js         (~100行, 认证逻辑)
      │   ├── api-client.js   (~40行,  API 封装)
      │   ├── posts.js        (~200行, 帖子 CRUD)
      │   ├── notifications.js(~80行,  通知)
      │   ├── bookmarks.js    (~50行,  收藏)
      │   ├── follow.js       (~60行,  关注)
      │   ├── tags.js         (~60行,  标签)
      │   ├── xp.js           (~60行,  经验等级)
      │   ├── editor.js       (~120行, 富文本编辑器)
      │   ├── ai.js           (~150行, AI 功能)
      │   └── ui.js           (~80行,  toast/modal/通用UI)
      └── admin.html          (独立保持)
```

### Phase 2: 后端路由拆分 (P1)

```
server.js (646行)
  └── 拆分为 ──>
      ├── server.js           (~50行,  Express app 入口)
      └── routes/
          ├── auth.js         (~60行)
          ├── users.js        (~80行)
          ├── notifications.js(~50行)
          ├── bookmarks.js    (~40行)
          ├── tags.js         (~30行)
          ├── xp.js           (~40行)
          ├── ai.js           (~180行)
          └── health.js       (~10行)
```

### Phase 3: 消除重复 (P2)

| 重复代码 | 行数 | 文件 | 方案 |
|----------|:---:|------|------|
| showToast | 2 | index + admin | 提取为 `toast.js` |
| 存储模式 (get/set/clear) | 多个 | index | 提取为 `storage.js` |
| Modal 模式 | 5个 | index | 统一 `Modal` 组件 |
| API 错误处理 | 30+处 | index | 统一 error handler |

---

## 5. 目标架构设计

```
┌─────────────────────────────────────────────────┐
│                   Browser                       │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │  UI Layer │ │ AI Module│ │  State Store  │   │
│  │ (HTML/CSS)│ │ (ai.js)  │ │ (localStorage) │   │
│  └─────┬─────┘ └────┬─────┘ └───────┬───────┘   │
│        │             │               │           │
│  ┌─────┴─────────────┴───────────────┴───────┐   │
│  │           ApiClient (api-client.js)       │   │
│  └─────────────────────┬─────────────────────┘   │
└────────────────────────┼─────────────────────────┘
                         │ HTTP
┌────────────────────────┼─────────────────────────┐
│                   server.js                       │
│  ┌─────────────────────┴─────────────────────┐   │
│  │              Middleware                    │   │
│  │        (auth, rate-limit, cors)           │   │
│  └─────────────────────┬─────────────────────┘   │
│  ┌──────────┐ ┌────────┐ ┌──────┐ ┌─────────┐   │
│  │  /auth   │ │ /users │ │ /ai  │ │ /social │   │
│  └────┬─────┘ └───┬────┘ └──┬───┘ └────┬────┘   │
│       │            │         │           │        │
│  ┌────┴────────────┴─────────┴───────────┴────┐  │
│  │           JSON File Store (data/*.json)    │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 迁移路径

```
Week 1: CSS 外置 + JS 拆分为 <script src="...">
Week 2: server.js 路由拆分
Week 3: admin.html 去重 + 共享模块
Week 4: 可选: JSON → SQLite, 全部测试通过
```

---

## 6. 立即简化项

以下是今天就能做的低风险简化：

### 简化 1: 消除 renderPosts 的三重覆写

```javascript
// ❌ 当前: 三次 assign
var originalRenderPosts = renderPosts;
renderPosts = function() { originalRenderPosts(); syncAllTier1(); };
var origRenderPosts2 = renderPosts;
renderPosts = function() { origRenderPosts2(); /* ... */ };

// ✅ 改为: 单一函数 + 钩子
var postRenderHooks = [syncAllTier1, renderTags];
function renderPosts() {
  /* ... 核心渲染 ... */
  postRenderHooks.forEach(function(h) { h(); });
}
```

### 简化 2: 统一通知发送

```javascript
// ❌ 当前: 6 处重复的 fetch + catch
fetch('/api/notifications',{...}).catch(function(){});

// ✅ 改为:
async function sendNotification(type, to) {
  var me = getCurrentUser();
  if (!me || me.username === to) return;
  try {
    await apiCall('/notifications', { method: 'POST', body: { type, to, text: me.username + ' ' + typeText[type] + '你' } });
  } catch(e) { console.warn('[notif]', e.message) }
}
```

### 简化 3: 消除 samplePosts 硬编码

将 `samplePosts` 从硬编码数组改为从 `/api/posts` 动态加载（未来添加该端点时）。

---

## 重构风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|:---:|:---:|------|
| JS 拆分后加载顺序错误 | 中 | 高 | script 标签按依赖顺序排列 |
| 函数作用域变更导致 undefined | 中 | 高 | 逐步拆分，每步运行 21 项测试 |
| CSS 分离后样式丢失 | 低 | 中 | 视觉回归对比 |
| 路由拆分后中间件失效 | 低 | 中 | 测试每个端点 |
