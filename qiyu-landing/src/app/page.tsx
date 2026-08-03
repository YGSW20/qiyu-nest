const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:8080";

const features = [
  { icon: "💬", title: "多元社区板块", desc: "技术交流、游戏天地、AI 探索、生活日常……10+ 板块，找到你的同类。" },
  { icon: "🤖", title: "AI 写作助手", desc: "智能生成帖子标题、润色正文、提供大纲建议——DeepSeek 驱动，免费使用。" },
  { icon: "🏆", title: "成长体系", desc: "发帖、评论、获赞都能攒经验值。从萌新到大佬，6 个等级见证你的社区之路。" },
  { icon: "🔔", title: "实时通知", desc: "关注、回复、点赞——第一时间推送，不错过任何互动。" },
  { icon: "📱", title: "随时随地", desc: "支持 PWA 添加到手机桌面，体验和原生 App 一样流畅。" },
  { icon: "🎨", title: "Apple 风格设计", desc: "精心打磨的界面，白天/夜间模式自动切换，视觉舒适。" },
];

export default function Home() {
  return (
    <>
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-gray-200/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="text-lg font-bold tracking-tight text-[#1D1D1F]">
            🪹 栖语 Nest
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="#features" className="text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">功能</a>
            <a href={APP_URL} className="bg-[#007AFF] text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-[#0066D6] transition-colors">开始体验</a>
          </div>
        </div>
      </nav>

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-[#007AFF] text-sm font-medium mb-8">
          🤖 AI 赋能 · 完全免费
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-[#1D1D1F] leading-tight mb-6">
          话语栖息之地<br />
          <span className="text-[#007AFF]">连接有趣的灵魂</span>
        </h1>
        <p className="text-lg text-[#6E6E73] max-w-2xl mx-auto mb-10 leading-relaxed">
          栖语 Nest 是一个免费的中文兴趣社区。技术交流、游戏攻略、AI 探索、生活日常——找到属于你的圈子。AI 写作助手帮你把想法变成好文章。
        </p>
        <a href={APP_URL} className="inline-block bg-[#007AFF] text-white px-10 py-3.5 rounded-full text-lg font-semibold hover:bg-[#0066D6] transition-colors shadow-lg shadow-blue-500/25">
          开始体验
        </a>
        <p className="mt-5 text-xs text-[#AEAEB2]">完全免费 · 浏览器打开即用 · 支持添加到手机桌面</p>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1D1D1F] mb-4">一个纯粹的兴趣社区</h2>
          <p className="text-[#6E6E73] text-base max-w-xl mx-auto">发帖、评论、交流——最本质的社区体验，加上 AI 帮你写得更轻松。</p>
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

      <footer className="border-t border-[#E5E5EA] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[#6E6E73]">
            <span className="font-semibold text-[#1D1D1F]">🪹 栖语 Nest</span>
            <span>© 2026 · 完全免费的兴趣社区</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#6E6E73]">
            <a href="#features" className="hover:text-[#1D1D1F] transition-colors">功能</a>
            <a href={APP_URL} className="hover:text-[#1D1D1F] transition-colors">社区</a>
          </div>
        </div>
      </footer>
    </>
  );
}
