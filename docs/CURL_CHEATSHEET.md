# CLOSD API — curl 命令速查表

```bash
BASE=http://localhost:8080

# ═══════════════════ Auth ═══════════════════

# 注册
curl -s -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}'

# 登录 (保存 token)
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 获取当前用户
curl -s $BASE/api/auth/me -H "Authorization: Bearer $TOKEN"

# 手机验证码
curl -s -X POST $BASE/api/auth/phone-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000"}'

# 手机号登录
curl -s -X POST $BASE/api/auth/phone-login \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","code":"123456"}'

# ═══════════════════ Users ═══════════════════

# 用户主页
curl -s $BASE/api/users/admin

# 关注
curl -s -X POST $BASE/api/users/testuser/follow \
  -H "Authorization: Bearer $TOKEN"

# 取关 (再发一次)
curl -s -X POST $BASE/api/users/testuser/follow \
  -H "Authorization: Bearer $TOKEN"

# 粉丝列表
curl -s $BASE/api/users/admin/followers

# 关注列表
curl -s $BASE/api/users/admin/following

# 是否已关注
curl -s $BASE/api/users/testuser/is-following \
  -H "Authorization: Bearer $TOKEN"

# 经验值
curl -s $BASE/api/users/admin/xp

# ═══════════════ Notifications ═══════════════

# 通知列表
curl -s $BASE/api/notifications \
  -H "Authorization: Bearer $TOKEN"

# 未读数量
curl -s $BASE/api/notifications/unread-count \
  -H "Authorization: Bearer $TOKEN"

# 全部已读
curl -s -X POST $BASE/api/notifications/read \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 发送通知 (like)
curl -s -X POST $BASE/api/notifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"like","to":"testuser","text":"admin 赞了你的帖子"}'

# ═══════════════════ Bookmarks ═══════════════

# 收藏帖子 42
curl -s -X POST $BASE/api/bookmarks/42 \
  -H "Authorization: Bearer $TOKEN"

# 取消收藏 (再发一次)
curl -s -X POST $BASE/api/bookmarks/42 \
  -H "Authorization: Bearer $TOKEN"

# 收藏列表
curl -s $BASE/api/bookmarks \
  -H "Authorization: Bearer $TOKEN"

# 检查收藏
curl -s $BASE/api/bookmarks/check/42 \
  -H "Authorization: Bearer $TOKEN"

# ═══════════════════ Tags ═══════════════════

# 热门标签
curl -s $BASE/api/tags/trending

# 记录标签
curl -s -X POST $BASE/api/tags/use \
  -H "Content-Type: application/json" \
  -d '{"tags":["React","前端","教程"]}'

# ═══════════════════ XP ═══════════════════

# 加分
curl -s -X POST $BASE/api/xp/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":10}'

# 排行榜
curl -s $BASE/api/xp/leaderboard

# ═══════════════════ AI ═══════════════════

# AI 对话
curl -s -X POST $BASE/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'

# AI 标题生成
curl -s -X POST $BASE/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"title","input":"React 18 新特性","forum":"技术交流"}'

# AI 润色
curl -s -X POST $BASE/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"polish","input":"这个功能很好用推荐大家试试"}'

# AI 内容审核
curl -s -X POST $BASE/api/ai/moderate \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":1,"text":"加我微信xxx买课"}]}'

# AI 摘要
curl -s -X POST $BASE/api/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"text":"这是一段很长的文章内容..."}'

# ═══════════════════ System ═══════════════════

# 健康检查
curl -s $BASE/api/health
```

## SDK 快速入门

### JavaScript
```javascript
const BASE = 'http://localhost:8080';

async function closdApi(endpoint, opts = {}) {
  const token = localStorage.getItem('closd_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${endpoint}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

// 使用
const { token } = await closdApi('/api/auth/login', {
  method: 'POST', body: { username: 'admin', password: 'admin123' }
});
localStorage.setItem('closd_token', token);
```

### Python
```python
import requests

BASE = 'http://localhost:8080'
token = None

def api(endpoint, method='GET', body=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    r = requests.request(method, f'{BASE}{endpoint}', headers=headers, json=body)
    r.raise_for_status()
    return r.json()

# 使用
result = api('/api/auth/login', 'POST', {'username': 'admin', 'password': 'admin123'})
token = result['token']
```
