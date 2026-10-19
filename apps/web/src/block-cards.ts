/** Editor-only illustrations: never inserted into generated page content. */
const drawings: Record<string, string> = {
  text: '<rect class="block-art-accent" x="14" y="10" width="22" height="5" rx="2"/><path d="M14 23h68M14 30h68M14 37h46"/>',
  heading:
    '<path class="block-art-heavy" d="M17 13v24m18-24v24M17 25h18"/><path d="M47 18h34M47 26h26M47 34h19"/>',
  section:
    '<rect class="block-art-surface" x="12" y="6" width="72" height="37" rx="4"/><rect class="block-art-accent" x="18" y="12" width="24" height="5" rx="2"/><path d="M18 24h58M18 31h42M18 37h49"/>',
  columns:
    '<rect class="block-art-surface" x="12" y="7" width="33" height="35" rx="4"/><rect class="block-art-accent" x="51" y="7" width="33" height="35" rx="4"/><path d="M19 17h18M19 24h18M19 31h12M58 17h18M58 24h18M58 31h12"/>',
  image:
    '<rect class="block-art-surface" x="13" y="6" width="70" height="37" rx="4"/><circle class="block-art-accent" cx="65" cy="16" r="5"/><path d="m14 36 18-17 20 20m-8-8 12-11 26 22"/>',
  link: '<path class="block-art-faint" d="M14 9h45M14 16h26"/><rect class="block-art-button" x="13" y="24" width="70" height="18" rx="9"/><path class="block-art-button-ink" d="M24 33h25m12 0h11m-4-4 4 4-4 4"/>',
  video:
    '<rect class="block-art-screen" x="13" y="6" width="70" height="37" rx="4"/><path class="block-art-play" d="m43 15 13 8-13 8Z"/><path class="block-art-track" d="M21 37h54"/><path class="block-art-progress" d="M21 37h22"/>',
  divider:
    '<path class="block-art-faint" d="M16 9h48M16 15h64M16 34h64M16 40h43"/><path class="block-art-heavy" d="M13 25h70"/><circle class="block-art-accent" cx="48" cy="25" r="3"/>',
};
const descriptions: Record<string, string> = {
  text: "段落与说明文字",
  heading: "突出页面内容层级",
  section: "组织完整内容章节",
  columns: "并排展示两组内容",
  image: "展示产品与品牌图片",
  link: "引导访问与页面跳转",
  video: "嵌入视频播放区域",
  divider: "分隔章节与内容层次",
};
export const blockGroups: Record<string, string> = {
  text: "内容排版",
  heading: "内容排版",
  section: "内容排版",
  columns: "布局与交互",
  link: "布局与交互",
  divider: "布局与交互",
  image: "图片与媒体",
  video: "图片与媒体",
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
export function blockCard(
  id: string,
  title: string,
  translate: (value: string) => string,
) {
  const description = translate(descriptions[id]);
  return {
    label: `<span class="block-card-title">${escape(title)}</span><span class="block-card-description">${escape(description)}</span>`,
    media: `<svg class="block-card-art" viewBox="0 0 96 49" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawings[id]}</svg>`,
    category: translate(blockGroups[id]),
    attributes: {
      class: `component-card component-card--${id}`,
      title: `${title} · ${description}`,
      "aria-label": `${title} · ${description}`,
      "data-block-kind": id,
      tabindex: 0,
    },
  };
}
