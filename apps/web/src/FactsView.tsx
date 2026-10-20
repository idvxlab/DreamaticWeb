import { useState } from "react";
import { ScanText, Search } from "lucide-react";
import type { ProjectResponse } from "../../../packages/agents/src/contracts";
import { useI18n } from "./i18n";
import { factsFor } from "./fact-model";
import FactCard from "./FactCard";

export default function FactsView({
  project,
}: {
  project: ProjectResponse | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(""),
    [sourceId, setSourceId] = useState("");
  const facts = factsFor(project);
  const analysis = project?.analysis as
    { summary?: string; limitations?: string[] } | undefined;
  const sources = project?.sources || [];
  const needle = query.trim().toLocaleLowerCase();
  const filtered = facts
    .map((fact, index) => ({
      fact,
      index,
      source: sources.find((s) => s.id === fact.sourceId),
    }))
    .filter(
      ({ fact, source }) =>
        (!sourceId || fact.sourceId === sourceId) &&
        (!needle ||
          `${fact.text} ${source?.name || ""}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
  return (
    <div className="sources-view facts-view" aria-label={t("事实列表")}>
      <div className="sources-intro">
        <h3>{t("从资料中发现事实。")}</h3>
        <p>
          {t(
            "查看 Analyst 已保存的事实与来源。引用位置核对不代表事实解读已被独立证实。",
          )}
        </p>
      </div>
      {analysis && (
        <details className="facts-analysis">
          <summary>{t("分析摘要与限制")}</summary>
          {analysis.summary && <p>{analysis.summary}</p>}
          {analysis.limitations?.map((item, i) => (
            <p key={i}>{item}</p>
          ))}
        </details>
      )}
      {project?.status === "running" &&
        analysis &&
        !project.run?.checkpoints.analyst && (
          <p className="facts-notice" role="status">
            {t("当前展示上次已保存的分析结果，本次分析完成后将更新。")}
          </p>
        )}
      {facts.length > 0 && (
        <>
          <div className="facts-filters">
            <label className="facts-search">
              <Search size={14} />
              <input
                aria-label={t("搜索事实")}
                placeholder={t("搜索事实或来源")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label={t("按来源筛选事实")}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">{t("全部来源")}</option>
              {[...new Set(facts.map((f) => f.sourceId))].map((id) => (
                <option key={id} value={id}>
                  {sources.find((s) => s.id === id)?.name || t("来源不可用")}
                </option>
              ))}
            </select>
          </div>
          <p className="facts-count">
            {t("显示事实")} {filtered.length} / {facts.length}
          </p>
        </>
      )}
      {filtered.map(({ fact, index }) => (
        <FactCard
          key={`${index}-${fact.sourceId}`}
          fact={fact}
          index={index}
          project={project!}
        />
      ))}
      {filtered.length === 0 && (
        <div className="empty-sources">
          <ScanText size={32} />
          <p>
            {t(
              facts.length
                ? "没有匹配的事实，请调整搜索或来源筛选。"
                : !project
                  ? "选择或创建项目后查看分析事实。"
                  : analysis
                    ? "本次分析暂无已提取的事实。"
                    : project.status === "running"
                      ? "正在等待 Analyst 保存分析结果。"
                      : "分析完成后，相关事实将在这里展示。",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
