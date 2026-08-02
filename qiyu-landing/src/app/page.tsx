const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:8080";

const features = [
  { icon: "🤖", title: "AI 写作助手", desc: "智能生成帖子标题、润色正文、提供大纲建议——DeepSeek 驱动，秒级响应。" },
  { icon: "💬", title: "多元社区板块", desc: "技术交流、游戏天地、AI 探索、生活日常……10+ 板块，找到你的同类。" },
  { icon: "🏆", title: "成长体系", desc: "发帖、评论、获赞都能攒经验值。从萌新到大佬，6 个等级见证你的社区之路。" },
  { icon: "🔔", title: "实时通知", desc: "关注、回复、点赞——第一时间推送，不错过任何互动。" },
  { icon: "🎨", title: "Apple 风格设计", desc: "精心打磨的界面，白天/夜间模式自动切换，手机上体验同样出色。" },
  { icon: "💰", title: "免费开始", desc: "免费版每天 5 次 AI 调用。升级到基础版（¥29/月）或专业版（¥99/月）解锁更多。" },
];

const plans = [
  {
    name: "免费版", price: "0", period: "永久免费", ai: "5 次/天",
    features: ["AI 写作助手", "基础板块访问", "社区互动", "夜间模式"],
    cta: "开始使用", href: APP_URL, primary: false,
  },
  {
    name: "基础版", price: "29", period: "元/月", ai: "50 次/天",
    features: ["全部免费版功能", "AI 优先响应", "AI 内容审核", "高级搜索", "去除 AI 水印"],
    cta: "订阅基础版", href: "#", primary: true, popular: true,
  },
  {
    name: "专业版", price: "99", period: "元/月", ai: "无限使用",
    features: ["全部基础版功能", "AI 无限调用", "自定义 AI 风格", "API 访问", "优先技术支持"],
    cta: "订阅专业版", href: "#", primary: false,
  },
];

export default function Home() {
  return (
    <>
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-gray-200/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="text-lg font-bold tracking-tight text-[#1D1D1F]">
            🪹 栖语 Nest
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="#features" className="text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">功能</a>
            <a href="#pricing" className="text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">定价</a>
            <a href={APP_URL} className="bg-[#007AFF] text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-[#0066D6] transition-colors">打开应用</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-[#007AFF] text-sm font-medium mb-8">
          🤖 由 DeepSeek 驱动
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-[#1D1D1F] leading-tight mb-6">
          话语栖息之地<br />
          <span className="text-[#007AFF]">AI 让创作更简单</span>
        </h1>
        <p className="text-lg text-[#6E6E73] max-w-2xl mx-auto mb-10 leading-relaxed">
          栖语 Nest 是一个 AI 驱动的中文社区平台。写帖子没灵感？AI 帮你起标题、润色文字、搭大纲。连接志同道合的人，让每一次表达都更有价值。
        </p>
        <div className="flex items-center justify-center gap-4">
          <a href={APP_URL} className="bg-[#007AFF] text-white px-8 py-3 rounded-full text-base font-semibold hover:bg-[#0066D6] transition-colors shadow-lg shadow-blue-500/25">
            免费开始使用
          </a>
          <a href="#features" className="bg-white text-[#1D1D1F] px-8 py-3 rounded-full text-base font-medium border border-[#E5E5EA] hover:bg-gray-50 transition-colors">
            了解更多
          </a>
        </div>
        <p className="mt-5 text-xs text-[#AEAEB2]">无需下载，浏览器打开即用。支持 PWA 添加到桌面。</p>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1D1D1F] mb-4">为创作者而生</h2>
          <p className="text-[#6E6E73] text-base max-w-xl mx-auto">不只是社区——AI 深度融入每一个创作环节，让想法自然地变成文字。</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-6 border border-[#E5E5EA] hover:shadow-md transition-shadow">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">{f.title}</h3>
              <p className="text-sm text-[#6E6E73] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1D1D1F] mb-4">简单透明的定价</h2>
          <p className="text-[#6E6E73] text-base max-w-xl mx-auto">从免费开始。需要更多 AI 能力时，升级就好。随时取消。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.name} className={`relative bg-white rounded-2xl p-8 border-2 ${plan.popular ? "border-[#007AFF] shadow-lg shadow-blue-500/10" : "border-[#E5E5EA]"}`}>
              {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#007AFF] text-white text-xs font-semibold px-4 py-1 rounded-full">最受欢迎</div>}
              <h3 className="text-xl font-bold text-[#1D1D1F] mb-2">{plan.name}</h3>
              <div className="mb-5">
                <span className="text-4xl font-extrabold text-[#1D1D1F]">¥{plan.price}</span>
                <span className="text-[#6E6E73] text-sm ml-1">/{plan.period}</span>
              </div>
              <div className="mb-5 inline-block bg-blue-50 text-[#007AFF] text-sm font-medium px-3 py-1 rounded-full">AI: {plan.ai}</div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm text-[#6E6E73]">
                    <span className="text-[#34C759] mt-0.5 shrink-0">✓</span> {feat}
                  </li>
                ))}
              </ul>
              <a href={plan.href} className={`block text-center py-3 rounded-full text-sm font-semibold transition-colors ${plan.primary ? "bg-[#007AFF] text-white hover:bg-[#0066D6]" : "bg-[#F2F2F7] text-[#1D1D1F] hover:bg-gray-200"}`}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-[#AEAEB2]">基础版和专业版通过 Lemon Squeezy 安全支付，支持微信/支付宝。</p>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="bg-[#007AFF] rounded-3xl px-10 py-16 text-white">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">准备好了吗？</h2>
          <p className="text-white/80 text-base max-w-md mx-auto mb-8">加入栖语 Nest，和 AI 一起创作。免费开始，无需下载。</p>
          <a href={APP_URL} className="inline-block bg-white text-[#007AFF] px-10 py-3.5 rounded-full text-base font-bold hover:bg-gray-100 transition-colors shadow-lg">
            立即开始 🚀
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E5E5EA] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[#6E6E73]">
            <span className="font-semibold text-[#1D1D1F]">🪹 栖语 Nest</span>
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#6E6E73]">
            <a href={APP_URL} className="hover:text-[#1D1D1F] transition-colors">社区</a>
            <a href={`${APP_URL}/admin`} className="hover:text-[#1D1D1F] transition-colors">管理</a>
            <a href="mailto:hi@qiyu-nest.com" className="hover:text-[#1D1D1F] transition-colors">联系</a>
          </div>
        </div>
      </footer>
    </>
  );
}
