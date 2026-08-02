/**
 * AI 代码审查脚本
 * 用法: node scripts/ai-review.js <文件路径> [--save]
 * 示例: node scripts/ai-review.js index.html
 *       node scripts/ai-review.js server.js --save
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
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     CLOSD AI Code Review                ║
  ╚══════════════════════════════════════════╝

  用法: node scripts/ai-review.js <文件路径> [选项]

  选项:
    --save    保存审查报告为 Markdown 文件
    --help    显示此帮助

  示例:
    node scripts/ai-review.js index.html
    node scripts/ai-review.js server.js --save
  `);
  process.exit(0);
}

const filePath = args[0];
const shouldSave = args.includes('--save');

// ─── 读取文件 ───────────────────────────────────────────────────
if (!fs.existsSync(filePath)) {
  console.error(`\x1b[31m错误: 文件不存在 — ${filePath}\x1b[0m`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const fileName = path.basename(filePath);
const ext = path.extname(filePath);

// ─── 语言检测 ───────────────────────────────────────────────────
const langMap = { '.js': 'JavaScript', '.html': 'HTML/CSS/JS', '.css': 'CSS', '.py': 'Python', '.mjs': 'JavaScript (ES Module)', '.json': 'JSON' };
const language = langMap[ext] || ext.slice(1).toUpperCase();

// ─── 调用 AI ───────────────────────────────────────────────────
async function review() {
  if (!API_KEY || API_KEY === 'sk-your-api-key-here') {
    console.error('\x1b[31m错误: 请先在 .env 文件中设置 OPENAI_API_KEY\x1b[0m');
    process.exit(1);
  }

  console.log(`\n🔍 正在审查 ${fileName} (${language})...\n`);
  console.log(`📏 文件大小: ${(content.length / 1024).toFixed(1)} KB | ${content.split('\n').length} 行`);
  console.log('⏳ AI 分析中...\n');

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
            content: `你是一个资深代码审查员。请审查以下 ${language} 代码，找出:

1. 🐛 Bug 和潜在错误
2. 🔒 安全问题
3. ⚡ 性能优化机会
4. 🧹 代码风格/可维护性建议
5. ♻️ 可复用性改进

用中文回复，格式如下:
## 总体评价
(1-2句话总体评价)

## 发现问题
### [严重程度] 问题标题
- 位置: 函数/区域
- 问题: 描述
- 建议: 如何修复

如果没有发现问题，回复"✅ 未发现明显问题"。

请保持简洁，只报告值得关注的真实问题。`
          },
          { role: 'user', content: `审查以下文件: ${fileName}\n\n\`\`\`${language.toLowerCase()}\n${content}\n\`\`\`` }
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 错误 (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    const result = data.choices[0]?.message?.content || '无结果';

    // ─── 输出结果 ───────────────────────────────────────────────
    console.log('='.repeat(60));
    console.log(result);
    console.log('='.repeat(60));
    console.log(`\n📊 Token 使用: ${data.usage?.total_tokens || 'N/A'} (提示: ${data.usage?.prompt_tokens || 'N/A'}, 补全: ${data.usage?.completion_tokens || 'N/A'})`);

    // ─── 保存文件 ───────────────────────────────────────────────
    if (shouldSave) {
      const reportName = `code-review-${fileName.replace(/\./g, '-')}-${new Date().toISOString().split('T')[0]}.md`;
      const report = `# AI Code Review: ${fileName}\n\n**日期**: ${new Date().toLocaleString('zh-CN')}\n**文件**: ${filePath}\n**行数**: ${content.split('\n').length}\n\n---\n\n${result}\n\n---\n\n*由 CLOSD AI Code Review 生成 · 模型: ${MODEL}*`;
      fs.writeFileSync(reportName, report, 'utf-8');
      console.log(`\n📄 报告已保存: ${reportName}`);
    }

  } catch (err) {
    console.error(`\x1b[31m审查失败: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

review();
