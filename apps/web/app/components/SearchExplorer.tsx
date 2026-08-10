"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchKind, SearchRecord } from "../lib/search";
import { useLocale } from "./LocaleProvider";

const kinds: Array<"all" | SearchKind> = [
  "all",
  "lesson",
  "mechanism",
  "agent",
  "snapshot",
  "claim",
  "experiment",
  "trace",
];

const kindLabels: Record<"all" | SearchKind, { zh: string; en: string }> = {
  all: { zh: "全部", en: "All" },
  lesson: { zh: "课程", en: "Lessons" },
  mechanism: { zh: "机制", en: "Mechanisms" },
  agent: { zh: "Agent", en: "Agents" },
  snapshot: { zh: "快照", en: "Snapshots" },
  claim: { zh: "结论", en: "Claims" },
  experiment: { zh: "实验", en: "Experiments" },
  trace: { zh: "Trace", en: "Traces" },
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

export function SearchExplorer({ records }: { records: SearchRecord[] }) {
  const { locale, text } = useLocale();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | SearchKind>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const counts = useMemo(() => {
    const values = new Map<SearchKind, number>();
    for (const record of records) values.set(record.kind, (values.get(record.kind) ?? 0) + 1);
    return values;
  }, [records]);

  const results = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    return records.filter((record) => {
      if (kind !== "all" && record.kind !== kind) return false;
      const haystack = normalize(`${record.searchText} ${record.meta.join(" ")}`);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [kind, query, records]);

  return (
    <section className="search-explorer" aria-labelledby="search-heading">
      <form className="search-box" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="knowledge-search" id="search-heading">
          {text("搜索公开知识图谱", "Search the public knowledge graph")}
        </label>
        <div className="search-box__control">
          <input
            aria-describedby="search-help"
            aria-keyshortcuts="/"
            autoComplete="off"
            id="knowledge-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("输入 Agent、机制、代码符号或 Claim ID", "Enter an agent, mechanism, symbol, or claim ID")}
            ref={inputRef}
            type="search"
            value={query}
          />
          {query ? (
            <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>
              {text("清除", "Clear")}
            </button>
          ) : <kbd aria-hidden="true">/</kbd>}
        </div>
        <p id="search-help">
          {text("同时检索中英文正文、稳定 ID、Evidence locator 与 Trace 事件。", "Searches Chinese and English prose, stable IDs, evidence locators, and trace events.")}
        </p>
      </form>

      <div className="search-filters" aria-label={text("按记录类型筛选", "Filter by record type")}>
        {kinds.map((item) => (
          <button
            aria-pressed={kind === item}
            className={kind === item ? "is-active" : ""}
            key={item}
            onClick={() => setKind(item)}
            type="button"
          >
            {text(kindLabels[item].zh, kindLabels[item].en)}
            <span>{item === "all" ? records.length : counts.get(item) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="search-results__status">
        <output aria-live="polite">
          {text(`${results.length} 条结果`, `${results.length} results`)}
        </output>
        <span>{query ? text(`查询“${query}”`, `Query “${query}”`) : text("显示全部公开记录", "Showing all public records")}</span>
      </div>

      {results.length ? (
        <ol className="search-results">
          {results.map((record) => (
            <li key={`${record.kind}-${record.id}`}>
              <Link href={record.href}>
                <span className="search-result__kind">{text(kindLabels[record.kind].zh, kindLabels[record.kind].en)}</span>
                <div>
                  <h2>{record.title[locale]}</h2>
                  <p>{record.description[locale]}</p>
                  <div className="tag-row">
                    <span>{record.id}</span>
                    {record.meta.slice(0, 3).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
                  </div>
                </div>
                <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state" role="status">
          <strong>{text("没有匹配记录", "No matching records")}</strong>
          <p>{text("尝试稳定 ID、英文术语或更少的关键词。", "Try a stable ID, an English term, or fewer keywords.")}</p>
        </div>
      )}
    </section>
  );
}
