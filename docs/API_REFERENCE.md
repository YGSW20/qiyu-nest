# CLOSD API 参考文档 v1.0

> Base URL: `http://localhost:8080` | 协议: REST/JSON | 认证: Bearer JWT

---

## 1. 认证 API

### POST /api/auth/register — 用户注册

注册新用户，返回 JWT token。

**Request**
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "string (2-12 chars)",
  "password": "string (>= 6 chars)"
}
```

**Response** `200`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "username": "newuser", "joinDate": "2026-07-04" }
}
```

**Errors**
| 状态码 | 说明 |
|:---:|------|
| 400 | 用户名已存在 / 用户名长度不符 / 密码过短 |

---

### POST /api/auth/login — 用户登录

**Request**
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response** `200`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "username": "admin", "joinDate": "2026-01-01" }
}
```

**Errors**
| 状态码 | 说明 |
|:---:|------|
| 401 | 用户名或密码错误 |

---

### GET /api/auth/me — 当前用户信息

**Request**
```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response** `200`
```json
{
  "username": "admin",
  "joinDate": "2026-01-01",
  "following": 1,
  "followers": 0
}
```

**Errors**: `401` 未登录 | `404` 用户不存在

---

### POST /api/auth/phone-code — 发送手机验证码

```
POST /api/auth/phone-code
{ "phone": "13800138000" }

→ 200 { "code": "483921" }  // 开发环境返回验证码
```

### POST /api/auth/phone-login — 手机号登录

```
POST /api/auth/phone-login
{ "phone": "13800138000", "code": "483921" }

→ 200 { "token": "...", "user": {...} }
```

---

## 2. 用户 API

### GET /api/users/:username — 用户主页

```
GET /api/users/admin

→ 200
{
  "username": "admin",
  "joinDate": "2026-01-01",
  "following": 1,
  "followers": 0
}
```

### POST /api/users/:username/follow — 关注/取关

```
POST /api/users/closd_helper/follow
Authorization: Bearer <token>

→ 200 { "following": true }   // 关注成功
→ 200 { "following": false }  // 取消关注
```

**副作用**: 关注时向目标用户发送通知

### GET /api/users/:username/followers — 粉丝列表

```
GET /api/users/admin/followers
→ 200 ["user1", "user2", ...]
```

### GET /api/users/:username/following — 关注列表

```
GET /api/users/admin/following
→ 200 ["testuser", ...]
```

### GET /api/users/:username/is-following — 关注状态

```
GET /api/users/testuser/is-following
Authorization: Bearer <token>
→ 200 { "following": true }
```

### GET /api/users/:username/xp — 经验值

```
GET /api/users/admin/xp
→ 200
{
  "xp": 70,
  "level": { "lv": 2, "name": "见习", "min": 50 },
  "nextLevel": { "lv": 3, "name": "成员", "min": 150 }
}
```

---

## 3. 通知 API

| 方法 | 端点 | 认证 | 说明 |
|------|------|:---:|------|
| GET | `/api/notifications` | ✅ | 当前用户通知列表 (最近50条) |
| GET | `/api/notifications/unread-count` | ✅ | 未读通知数 |
| POST | `/api/notifications` | ✅ | 创建通知 |
| POST | `/api/notifications/read` | ✅ | 标记已读 (body: `{ids?: [123,456]}` 不传则全部已读) |

**通知对象**
```json
{
  "id": 1783134594898,
  "type": "follow|like|reply",
  "from": "admin",
  "to": "testuser",
  "text": "admin 关注了你",
  "time": "2026-07-04T03:09:54.898Z",
  "read": false
}
```

---

## 4. 收藏 API

| 方法 | 端点 | 认证 | 说明 |
|------|------|:---:|------|
| GET | `/api/bookmarks` | ✅ | 获取收藏帖子ID列表 → `[3, 7, 12]` |
| POST | `/api/bookmarks/:postId` | ✅ | 切换收藏/取消 → `{bookmarked: true/false}` |
| GET | `/api/bookmarks/check/:postId` | ✅ | 检查是否已收藏 → `{bookmarked: true/false}` |

---

## 5. 标签 API

| 方法 | 端点 | 认证 | 说明 |
|------|------|:---:|------|
| GET | `/api/tags/trending` | ❌ | 热门标签 Top15 |
| POST | `/api/tags/use` | ❌ | 记录标签使用 `{tags: ["React","前端"]}` |

---

## 6. 经验值 API

| 方法 | 端点 | 认证 | 说明 |
|------|------|:---:|------|
| POST | `/api/xp/add` | ✅ | 添加经验 `{amount: 10}` → `{xp, level}` |
| GET | `/api/xp/leaderboard` | ❌ | 排行榜 Top20 |

**等级体系**
| Lv | 名称 | 所需 XP |
|:--:|------|:---:|
| 1 | 萌新 | 0 |
| 2 | 见习 | 50 |
| 3 | 成员 | 150 |
| 4 | 活跃 | 400 |
| 5 | 达人 | 1000 |
| 6 | 大佬 | 2500 |

---

## 7. AI API

| 方法 | 端点 | 认证 | 说明 |
|------|------|:---:|------|
| POST | `/api/ai/chat` | ❌ | AI 对话 `{messages: [{role,content}], context?}` |
| POST | `/api/ai/generate` | ❌ | 内容生成 `{type: "title"|"polish"|"outline"|"reply", input}` |
| POST | `/api/ai/moderate` | ❌ | 内容审核 `{items: [{id, text}]}` |
| POST | `/api/ai/summarize` | ❌ | 内容摘要 `{text}` |
| GET | `/api/ai/trending` | ❌ | AI 热点分析 `?topics=a,b,c` |

**限流**: 30 次/分钟/全局

---

## 8. 系统 API

### GET /api/health — 健康检查

```
GET /api/health
→ 200
{
  "status": "ok",
  "aiConfigured": true,
  "model": "deepseek-chat",
  "timestamp": "2026-07-04T00:00:00.000Z"
}
```

---

## 认证机制

所有需要认证的端点需在 Header 中携带 JWT：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

- Token 有效期: **7 天**
- 获取方式: `/api/auth/login` 或 `/api/auth/register`
- 签名算法: HS256

## 错误格式

所有错误响应统一格式：

```json
{
  "error": "人类可读的错误描述"
}
```

| 状态码 | 含义 |
|:---:|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未登录或 Token 过期 |
| 404 | 资源不存在 |
| 429 | 请求频率过高 |
| 500 | 服务器内部错误 |
