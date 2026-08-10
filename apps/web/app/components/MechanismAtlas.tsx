"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale } from "./LocaleProvider";

type LayerStatus = "complete" | "partial" | "missing";

export interface AtlasMechanism {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  prerequisites: string[];
  dependents: string[];
  lessonCount: number;
  snapshotCount: number;
  claimCount: number;
  experimentCount: number;
  hasArticle: boolean;
  layers: Record<"L0" | "L1" | "L2" | "L3" | "L4", LayerStatus>;
}

const layerIds = ["L0", "L1", "L2", "L3", "L4"] as const;

export function MechanismAtlas({ mechanisms }: { mechanisms: AtlasMechanism[] }) {
  const { text } = useLocale();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [articleState, setArticleState] = useState("all");
  const categories = useMemo(
    () => [...new Set(mechanisms.map((mechanism) => mechanism.category))].sort(),
    [mechanisms],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visible = mechanisms.filter((mechanism) => {
    const matchesQuery = !normalizedQuery || [
      mechanism.id,
      mechanism.title,
      mechanism.summary,
      mechanism.category,
      ...mechanism.prerequisites,
      ...mechanism.dependents,
    ].join(" ").toLowerCase().includes(normalizedQuery);
    const matchesCategory = category === "all" || mechanism.category === category;
    const matchesArticle = articleState === "all"
      || (articleState === "complete" && mechanism.hasArticle)
      || (articleState === "gap" && !mechanism.hasArticle);
    return matchesQuery && matchesCategory && matchesArticle;
  });

  return (
    <section className="mechanism-atlas" aria-labelledby="atlas-heading">
      <div className="atlas-controls">
        <div>
          <span className="eyebrow" id="atlas-heading">ARCHITECTURE ATLAS · {visible.length}/{mechanisms.length}</span>
          <label htmlFor="mechanism-search">{text("搜索机制、依赖或设计问题", "Search mechanisms, dependencies, or design questions")}</label>
          <input
            id="mechanism-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("例如：context、sandbox、rollback", "Try context, sandbox, or rollback")}
            type="search"
            value={query}
          />
        </div>
        <label>
          <span>{text("分类", "Category")}</span>
          <select onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="all">{text("全部分类", "All categories")}</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>{text("深度正文", "Deep article")}</span>
          <select onChange={(event) => setArticleState(event.target.value)} value={articleState}>
            <option value="all">{text("全部状态", "All states")}</option>
            <option value="complete">{text("中英正文已完成", "Bilingual article complete")}</option>
            <option value="gap">{text("正文待补", "Article gap")}</option>
          </select>
        </label>
      </div>

      {visible.length ? (
        <div className="mechanism-index" aria-live="polite">
          {visible.map((mechanism) => {
            const completeLayers = layerIds.filter((layer) => mechanism.layers[layer] === "complete").length;
            return (
              <article className="mechanism-index__item" key={mechanism.id}>
                <div>
                  <span>{mechanism.category}</span>
                  <span className={mechanism.hasArticle ? "coverage-complete" : "coverage-gap"}>
                    {mechanism.hasArticle ? text("双语正文", "bilingual") : text("正文缺口", "article gap")}
                  </span>
                </div>
                <h2>{mechanism.title}</h2>
                <p>{mechanism.summary}</p>
                <div className="atlas-layer-meter" aria-label={text(`${completeLayers} 个深度层已完成`, `${completeLayers} depth layers complete`)}>
                  {layerIds.map((layer) => (
                    <span className={`layer-${mechanism.layers[layer]}`} key={layer} title={`${layer}: ${mechanism.layers[layer]}`}>
                      {layer}
                    </span>
                  ))}
                </div>
                <dl className="atlas-card-metrics">
                  <div><dt>{text("课程", "Lessons")}</dt><dd>{mechanism.lessonCount}</dd></div>
                  <div><dt>{text("快照", "Snapshots")}</dt><dd>{mechanism.snapshotCount}</dd></div>
                  <div><dt>{text("证据", "Claims")}</dt><dd>{mechanism.claimCount}</dd></div>
                  <div><dt>{text("实验", "Experiments")}</dt><dd>{mechanism.experimentCount}</dd></div>
                </dl>
                <div className="atlas-relations">
                  <span>{text("前置", "Requires")} · {mechanism.prerequisites.length || "—"}</span>
                  <span>{text("后继", "Unlocks")} · {mechanism.dependents.length || "—"}</span>
                </div>
                <Link className="text-link" href={`/mechanisms/${mechanism.id}`}>
                  {text("进入机制研究页", "Open mechanism dossier")} <span>→</span>
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" role="status">
          <strong>{text("没有匹配项", "No matching mechanisms")}</strong>
          <p>{text("调整关键词或筛选条件，Atlas 数据并未被删除。", "Change the query or filters; no Atlas records were removed.")}</p>
        </div>
      )}
    </section>
  );
}
