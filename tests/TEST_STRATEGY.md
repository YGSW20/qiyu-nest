# CLOSD 测试策略文档

> 生成时间: 2026-07-04 | 方法: TDD (红-绿-重构)

## 1. 测试目标

| 目标 | 指标 |
|------|------|
| 行覆盖率 | > 80% (server.js API routes) |
| P0 用例通过率 | 100% |
| CI 流水线时长 | < 5 分钟 |
| 冒烟测试时长 | < 30 秒 |

## 2. 测试层次

```
        /\
       /E2E\         ← 5 条: 登录→发帖→评论→收藏→通知
      /─────\
     /集成测试\        ← 15 条: API 端点完整链路
    /────────\
   /单元测试  \       ← 30+ 条: 每个函数/路由独立验证
  /────────────\
```

## 3. 模块 → 测试映射

### server.js API (18 个端点)

| 模块 | 端点 | 测试类型 | 优先级 |
|------|------|----------|:---:|
| Auth | POST /api/auth/register | 单元+集成 | P0 |
| Auth | POST /api/auth/login | 单元+集成 | P0 |
| Auth | GET /api/auth/me | 单元+集成 | P1 |
| Auth | POST /api/auth/phone-code | 单元 | P2 |
| Auth | POST /api/auth/phone-login | 单元+集成 | P1 |
| Users | GET /api/users/:username | 单元 | P1 |
| Users | POST /api/users/:username/follow | 集成 | P0 |
| Users | GET /api/users/:username/followers | 单元 | P2 |
| Users | GET /api/users/:username/following | 单元 | P2 |
| Notif | GET /api/notifications | 集成 | P1 |
| Notif | GET /api/notifications/unread-count | 单元 | P1 |
| Notif | POST /api/notifications | 集成 | P1 |
| Notif | POST /api/notifications/read | 单元 | P2 |
| Bookmark | GET /api/bookmarks | 集成 | P1 |
| Bookmark | POST /api/bookmarks/:postId | 集成 | P0 |
| Tags | GET /api/tags/trending | 单元 | P1 |
| Tags | POST /api/tags/use | 单元 | P2 |
| XP | GET /api/xp/leaderboard | 单元 | P1 |
| XP | POST /api/xp/add | 集成 | P1 |
| AI | POST /api/ai/chat | 集成 | P1 |
| AI | POST /api/ai/generate | 单元 | P1 |

## 4. Mock 策略

| 依赖 | Mock 方式 |
|------|----------|
| OpenAI/DeepSeek API | `jest.fn()` mock fetch |
| bcrypt | 真实调用（速度快） |
| jwt | 真实调用 |
| 文件 I/O (data/*.json) | `tmp` 目录隔离 |

## 5. 测试数据策略

- 每个测试 suite 使用独立的数据目录
- `beforeEach` 重置数据到初始状态
- `afterAll` 清理临时目录
- 使用 `Date.now()` 确保用户名/数据唯一性

## 6. E2E 关键路径 (Top 5)

| # | 用户旅程 | 验证点 |
|---|---------|--------|
| 1 | 注册 → 登录 → 发帖 | JWT签发、帖子展示 |
| 2 | 登录 → 浏览首页 → 点帖子 → 评论 | 评论通知帖主 |
| 3 | 登录 → 收藏帖子 → 我的收藏 | 收藏持久化 |
| 4 | 登录 → 关注用户 → 通知目标 | 通知创建 |
| 5 | 登录 → 发帖(带标签) → 点标签筛选 | 标签聚合 |

## 7. 覆盖率目标

| 类型 | 目标 |
|------|:---:|
| 语句 | 80% |
| 分支 | 75% |
| 函数 | 85% |
| 行 | 80% |

## 8. Bug 严重级框架

| 级别 | SLA | 定义 |
|------|-----|------|
| S1 致命 | 4小时 | 系统崩溃、数据丢失、安全漏洞 |
| S2 严重 | 24小时 | 核心功能损坏、无替代方案 |
| S3 一般 | 1迭代 | 功能受损、有替代方案 |
| S4 轻微 | 待办 | 界面美化 |
