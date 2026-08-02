/**
 * AI 测试数据生成器
 * 用法: node scripts/generate-mock-data.js [选项]
 * 示例: node scripts/generate-mock-data.js --posts 20 --forum tech
 *       node scripts/generate-mock-data.js --users 10
 */

const fs = require('fs');
const path = require('path');

// ─── 加载 .env ───────────────────────────────────────────────────
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const API_KEY = process.env.OPENAI_API_KEY || '';
const API_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ─── 参数解析 ───────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  if (idx === -1) return def;
  const val = args[idx + 1];
  return val && !val.startsWith('--') ? val : def;
}

const numPosts = parseInt(getArg('posts', '10'));
const numUsers = parseInt(getArg('users', '5'));
const targetForum = getArg('forum', '');
const outputFile = getArg('output', 'mock-data.json');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   CLOSD AI Mock Data Generator          ║
  ╚══════════════════════════════════════════╝

  用法: node scripts/generate-mock-data.js [选项]

  选项:
    --posts <N>     生成帖子数量（默认 10）
    --users <N>     生成用户数量（默认 5）
    --forum <name>  指定板块（tech/game/life/design/music/ai，默认随机）
    --output <file> 输出文件名（默认 mock-data.json）
    --help          显示此帮助

  输出格式: JSON，可导入 CLOSD Admin 面板
  `);
  process.exit(0);
}

// ─── 现有内容结构 ────────────────────────────────────────────────
const forums = ['tech', 'game', 'life', 'design', 'music', 'ai', 'frontend', 'indie-game', 'food', 'pet'];
const forumNames = { tech: '技术交流', game: '游戏天地', life: '生活日常', design: '设计创意', music: '音乐分享', ai: 'AI 探索', frontend: '前端开发', 'indie-game': '独立游戏', food: '美食分享', pet: '萌宠乐园' };

// ─── 生成函数 ───────────────────────────────────────────────────
async function generate() {
  if (!API_KEY || API_KEY === 'sk-your-api-key-here') {
    console.error('\x1b[31m错误: 请先在 .env 文件中设置 OPENAI_API_KEY\x1b[0m');
    process.exit(1);
  }

  console.log(`\n🎲 正在生成测试数据...`);
  console.log(`   📝 ${numPosts} 条帖子 | 👤 ${numUsers} 个用户`);
  if (targetForum) console.log(`   📂 板块: ${targetForum}`);
  console.log('   ⏳ AI 思考中...\n');

  const forumStr = targetForum
    ? `只生成"${forumNames[targetForum] || targetForum}"板块的帖子`
    : `帖子可以随机属于以下板块: ${forums.map(f => forumNames[f] + '(' + f + ')').join(', ')}`;

  try {
    const resp = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `你是一个测试数据生成器。为 CLOSD 中文社区平台生成逼真的测试数据。

${forumStr}

请生成:
1. ${numUsers} 个用户（用户名用有趣的中文昵称）
2. ${numPosts} 条帖子（标题吸引人，内容真实有料，50-300字）

以 JSON 格式返回:
{
  "users": [{ "username": "...", "role": "user", "posts": <随机10-200>, "joinDate": "2026-0X-XX", "status": "active" }],
  "posts": [{ "title": "...", "content": "...", "author": "<从users中选>", "forum": "<板块ID>" }]
}

只返回合法的 JSON，不要加其他文字。`
          }
        ],
        temperature: 0.9,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 错误 (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    const text = data.choices[0]?.message?.content || '';

    // 解析 JSON
    let result;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      throw new Error('AI 返回的不是合法 JSON，请重试');
    }

    // 添加 ID 和时间戳
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    result.users = (result.users || []).map((u, i) => ({
      id: i + 1,
      ...u,
      joinDate: u.joinDate || today,
    }));

    result.posts = (result.posts || []).map((p, i) => ({
      id: i + 1,
      ...p,
      time: '刚刚',
      replies: Math.floor(Math.random() * 50),
      likes: Math.floor(Math.random() * 200),
      views: (Math.random() * 20).toFixed(1),
      pinned: false,
      status: 'published',
    }));

    // 写入文件
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');

    console.log('✅ 生成完成!');
    console.log(`   👤 用户: ${result.users.length} 个`);
    console.log(`   📝 帖子: ${result.posts.length} 条`);
    console.log(`   📄 已保存: ${outputFile}`);
    console.log(`   💡 可在 Admin 面板 → 系统设置 → 导入数据 中导入此文件\n`);

  } catch (err) {
    console.error(`\x1b[31m生成失败: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

generate();
