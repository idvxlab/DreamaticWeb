import { useState } from "react";
import {
  FileText,
  ChevronDown,
  Check,
  Image,
  X,
  Maximize2,
} from "lucide-react";
import type { ProjectResponse } from "../../../packages/shared/project";
import { factImages, type Fact } from "./fact-model";
import { useI18n } from "./i18n";

export default function FactCard({
  fact,
  index,
  project,
}: {
  fact: Fact;
  index: number;
  project: ProjectResponse;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null),
    [failed, setFailed] = useState<string[]>([]);
  const source = project.sources.find((s) => s.id === fact.sourceId);
  const images = factImages(project, fact).filter(
    (i) => !failed.includes(i.asset.id),
  );
  const selected = images.find((i) => i.asset.id === expanded);
  const status = !source
    ? "来源不可用"
    : !fact.evidence
      ? "未提供引用定位"
      : fact.locationVerified
        ? "引用位置已核对"
        : "引用位置未核对";
  return (
    <article className="fact-card">
      <div className="fact-card-top">
        <span className="fact-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="fact-type">
          {source?.format.toUpperCase() || t("事实")}
        </span>
        <span className="fact-status" title={t(status)}>
          {source && fact.evidence && fact.locationVerified && (
            <Check size={11} />
          )}
          {t(status)}
        </span>
      </div>
      <p className="fact-text">{fact.text}</p>
      {images.length > 0 && (
        <section className="fact-media" aria-label={t("关联图片")}>
          <div className="fact-media-label">
            <Image size={12} />
            <span>{t("关联图片")}</span>
            <small>{images.length}</small>
          </div>
          <div
            className={`fact-thumbnails ${images.length === 1 ? "single-direct" : ""}`}
          >
            {images.map(({ asset, purpose }) => (
              <button
                key={asset.id}
                type="button"
                title={purpose}
                aria-label={`${t("在卡片中查看图片")} ${asset.name}`}
                aria-pressed={expanded === asset.id}
                onClick={() =>
                  setExpanded(expanded === asset.id ? null : asset.id)
                }
              >
                <img
                  src={asset.url}
                  alt={purpose}
                  loading="lazy"
                  decoding="async"
                  onError={() => setFailed((old) => [...old, asset.id])}
                />
                <span>
                  <Maximize2 size={12} />
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <figure className="fact-image-preview">
              <button
                type="button"
                className="icon-button"
                aria-label={t("收起图片")}
                onClick={() => setExpanded(null)}
              >
                <X size={13} />
              </button>
              <img src={selected.asset.url} alt={selected.purpose} />
              <figcaption>{selected.purpose}</figcaption>
            </figure>
          )}
        </section>
      )}
      <div className="fact-source-line">
        <FileText size={12} />
        <span title={source?.name}>{source?.name || t("来源不可用")}</span>
      </div>
      <details className="fact-citation">
        <summary>
          <span>{t("查看 Markdown 依据")}</span>
          <ChevronDown size={13} />
        </summary>
        <div className="fact-detail">
          {fact.evidence?.kind === "text" ? (
            <>
              <div className="fact-citation-label">
                {t("Markdown 引用")}
                <small>
                  {t("文本范围")} [{fact.evidence.start}, {fact.evidence.end})
                </small>
              </div>
              <blockquote>{fact.evidence.quote}</blockquote>
            </>
          ) : fact.evidence?.kind === "cell" ? (
            <>
              <div className="fact-citation-label">{t("单元格原值")}</div>
              <pre>{JSON.stringify(fact.evidence.value, null, 2)}</pre>
              <small>
                {t("表格索引")} {fact.evidence.tableIndex} · {t("行索引")}{" "}
                {fact.evidence.row} · {t("列索引")} {fact.evidence.column}
                <br />
                {t("索引从 0 开始，行索引包含表头。")}
              </small>
            </>
          ) : (
            <p>{t("此事实未保存可展示的Markdown 引用。")}</p>
          )}
        </div>
      </details>
    </article>
  );
}
