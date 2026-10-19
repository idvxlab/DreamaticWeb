import type { Project } from "./contracts.js";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function demoPage(p: Project) {
  const title = esc(
    p.messages.at(-1)?.text.slice(0, 42) || "让想法，自然生长。",
  );
  const img = p.sources
    .flatMap((s) => s.assets)
    .find((a) => a.type === "image");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>素材与灵感</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f1e8;color:#242b23;font-family:system-ui,sans-serif}nav{display:flex;justify-content:space-between;padding:28px 7%;border-bottom:1px solid #d8dacd}a{color:inherit;text-decoration:none}nav a{margin-left:24px;font-size:13px}.hero{padding:90px 7% 65px;display:grid;grid-template-columns:1.2fr 1fr;gap:48px;align-items:center}.tag{font-size:11px;letter-spacing:3px;color:#748066}h1{font-size:clamp(36px,5vw,68px);letter-spacing:-3px;line-height:1.15;font-weight:500}p{color:#737c6a;line-height:1.9}.button{display:inline-block;background:#344837;color:#fff;padding:16px 27px;border-radius:30px;margin-top:20px}.art{aspect-ratio:1;border-radius:48% 48% 8px 8px;background:radial-gradient(ellipse at 50% 100%,#293f31 0%,#637c56 35%,#a9b895 36%,#d9dfcc 63%,#e8e3d3 64%);display:flex;align-items:end;padding:32px;color:white;font-size:32px}.art img{width:100%;height:100%;object-fit:cover;border-radius:inherit}.detail{padding:50px 7% 80px;border-top:1px solid #d8dacd}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}.card{border-top:1px solid #87917c;padding-top:20px}h2{font-size:32px;font-weight:500}h3{font-size:18px;font-weight:500}footer{padding:30px 7%;background:#26372c;color:#dbe1d1;font-size:12px}@media(max-width:640px){.hero{grid-template-columns:1fr;padding-top:40px}.grid{grid-template-columns:1fr}nav a{margin-left:10px}h1{letter-spacing:-1px}}</style></head><body><nav><strong>SOIL & SOUL</strong><div><a href="#story">我们的故事</a><a href="#details">探索内容 ↗</a></div></nav><main><section class="hero" id="story"><div><span class="tag">DREAMATIC / LOCAL DEMO</span><h1>${title}</h1><p>每一份资料，都藏着值得被看见的故事。<br>从真实内容出发，让信息与设计自然相遇。</p><a class="button" href="#details">探索更多 ↗</a></div><div class="art">${img ? `<img src="${img.url}" alt="用户提供的素材">` : "Ideas take root."}</div></section><section class="detail" id="details"><span class="tag">THE MATERIALS</span><h2>从素材，走向可能。</h2><div class="grid">${(p
    .sources.length
    ? p.sources.slice(0, 6)
    : [
        {
          name: "有意义的内容",
          text: "上传你的文档、数据或图片，把真实信息转化为独特的数字体验。",
        },
        {
          name: "有温度的表达",
          text: "通过细腻的字体、留白与色彩，让每一个重要信息清晰传达。",
        },
        {
          name: "持续生长的想法",
          text: "直接选择元素进行修改，让页面随着你的想法不断完善。",
        },
      ]
  )
    .map(
      (s, i) =>
        `<article class="card"><span>0${i + 1}</span><h3>${esc(s.name)}</h3><p>${esc(s.text.slice(0, 200))}</p></article>`,
    )
    .join(
      "",
    )}</div></section></main><footer>Dreamatic · Web / 本地演示页面 · 未调用 AI 模型</footer></body></html>`;
}
