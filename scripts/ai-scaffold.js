/**
 * AI 功能脚手架生成器
 * 用法: node scripts/ai-scaffold.js "<功能描述>"
 * 示例: node scripts/ai-scaffold.js "用户积分排行榜组件，显示前10名用户"
 */

const fs = require('fs');
const path = require('path');

// ─── 加载 .env ───────────────────────────────────────────────────
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const API_KEY = process.env.OPENAI_API_KEY || '';
const API_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const prompt = process.argv.slice(2).join(' ');

if (!prompt || prompt === '--help' || prompt === '-h') {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   CLOSD AI Feature Scaffolder           ║
  ╚══════════════════════════════════════════╝

  用法: node scripts/ai-scaffold.js "<功能描述>"
  示例: node scripts/ai-scaffold.js "用户积分排行榜，显示前10名"

  生成: HTML + CSS + JS 代码片段，可直接嵌入 CLOSD 项目
  `);
  process.exit(0);
}

async function scaffold() {
  if (!API_KEY || API_KEY === 'sk-your-api-key-here') {
    console.error('\x1b[31m错误: 请先在 .env 文件中设置 OPENAI_API_KEY\x1b[0m');
    process.exit(1);
  }

  console.log(`\n🏗️  正在生成: ${prompt}\n⏳ AI 设计中...\n`);

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
            content: `你是 CLOSD 社区平台的前端开发专家。CLOSD 使用纯 HTML/CSS/JS（不依赖框架），遵循 Apple Design System：

设计规范:
- CSS 变量: --blue(#007AFF), --bg(#F2F2F7), --card(#FFFFFF), --text(#1D1D1F), --text-secondary(#6E6E73), --border(#E5E5EA), --fill(#F2F2F7)
- 字体: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC"
- 圆角: --radius-sm(8px), --radius(12px), --radius-lg(16px)
- 阴影: --shadow(0 1px 3px rgba), --shadow-md, --shadow-lg
- 动画: --transition(0.25s cubic-bezier(0.25,0.1,0.25,1))

根据用户的功能描述，生成高质量的代码。返回格式:

\`\`\`html
<!-- 完整的 HTML 代码，可嵌入 index.html -->
\`\`\`

\`\`\`css
/* 需要的 CSS，可添加到 <style> 中 */
\`\`\`

\`\`\`js
// 需要的 JavaScript 函数
\`\`\`

代码要求:
1. 复用 CLOSD 现有的 CSS 变量和设计模式
2. 包含 hover 效果和过渡动画
3. 响应式设计（移动端适配）
4. 实用的、可直接使用的代码
5. 中文注释`
          },
          { role: 'user', content: `请为 CLOSD 平台生成以下功能: ${prompt}` }
        ],
        temperature: 0.7,
        max_tokens: 3072,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 错误 (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    const result = data.choices[0]?.message?.content || '';

    console.log('='.repeat(60));
    console.log(result);
    console.log('='.repeat(60));

    // 保存
    const filename = `scaffold-${prompt.replace(/[^a-zA-Z一-鿿0-9]/g, '-').substring(0, 40)}-${Date.now().toString(36)}.md`;
    const report = `# AI Scaffold: ${prompt}\n\n**日期**: ${new Date().toLocaleString('zh-CN')}\n\n---\n\n${result}\n\n---\n\n*由 CLOSD AI Scaffolder 生成 · 模型: ${MODEL}*`;
    fs.writeFileSync(filename, report, 'utf-8');
    console.log(`\n📄 已保存: ${filename}`);

  } catch (err) {
    console.error(`\x1b[31m生成失败: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

scaffold();
