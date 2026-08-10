"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Agent, Claim, Evidence, Mechanism } from "../lib/content";
import { assessFreshness } from "../lib/research";
import { claimText } from "../lib/content";
import { useLocale } from "./LocaleProvider";

interface EvidenceExplorerProps {
  agents: Agent[];
  claims: Claim[];
  mechanisms: Mechanism[];
  asOf: string;
}

interface EvidenceRecord {
  id: string;
  claim: Claim;
  evidence: Evidence;
  agent: Agent;
  mechanism: Mechanism;
  freshness: ReturnType<typeof assessFreshness>;
}

export function EvidenceExplorer({ agents, claims, mechanisms, asOf }: EvidenceExplorerProps) {
  const { locale, text } = useLocale();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [agentId, setAgentId] = useState("all");
  const [mechanismId, setMechanismId] = useState("all");
  const [freshness, setFreshness] = useState("all");

  const records = useMemo(() => claims.flatMap((claim) => {
    const agent = agents.find((item) => item.id === claim.agent_id);
    const mechanism = mechanisms.find((item) => item.id === claim.mechanism_id);
    const snapshot = agent?.snapshots.find((item) => item.id === claim.snapshot_id);
    if (!agent || !mechanism || !snapshot) return [];
    return claim.evidence.map((evidence, index): EvidenceRecord => ({
      id: `${claim.id}-e${index + 1}`,
      claim,
      evidence,
      agent,
      mechanism,
      freshness: assessFreshness(snapshot, asOf),
    }));
  }), [agents, asOf, claims, mechanisms]);

  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (type !== "all" && record.evidence.type !== type) return false;
      if (agentId !== "all" && record.agent.id !== agentId) return false;
      if (mechanismId !== "all" && record.mechanism.id !== mechanismId) return false;
      if (freshness !== "all" && record.freshness.computedState !== freshness) return false;
      if (!normalizedQuery) return true;
      return [
        record.id,
        record.claim.id,
        record.claim.statement,
        record.claim.display_text?.["zh-CN"],
        record.claim.display_text?.en,
        record.evidence.title,
        record.evidence.locator,
        record.evidence.notes,
        record.agent.name,
        record.mechanism.title,
      ].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [agentId, freshness, mechanismId, query, records, type]);

  const evidenceTypes = ["source", "official-doc", "reproduced", "inference"];

  return (
    <div className="evidence-explorer">
      <section className="evidence-controls" aria-label={text("证据筛选", "Evidence filters")}>
        <label className="evidence-controls__search">
          <span>{text("搜索 Claim、定位符或源码符号", "Search Claims, locators, or source symbols")}</span>
          <input
            id="evidence-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("例如 sandbox 或 run_loop", "For example, sandbox or run_loop")}
            type="search"
            value={query}
          />
        </label>
        <label><span>Type</span><select onChange={(event) => setType(event.target.value)} value={type}>
          <option value="all">{text("全部证据类型", "All evidence types")}</option>
          {evidenceTypes.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label><span>Agent</span><select onChange={(event) => setAgentId(event.target.value)} value={agentId}>
          <option value="all">{text("全部 Agent", "All agents")}</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select></label>
        <label><span>Mechanism</span><select onChange={(event) => setMechanismId(event.target.value)} value={mechanismId}>
          <option value="all">{text("全部机制", "All mechanisms")}</option>
          {mechanisms.map((mechanism) => <option key={mechanism.id} value={mechanism.id}>{mechanism.title}</option>)}
        </select></label>
        <label><span>Freshness</span><select onChange={(event) => setFreshness(event.target.value)} value={freshness}>
          <option value="all">{text("全部新鲜度", "All freshness states")}</option>
          {["current", "needs-review", "stale", "historical"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </section>

      <div className="evidence-status" aria-live="polite">
        <output>{visibleRecords.length}</output>
        <span>{text(` / ${records.length} 条 Evidence`, ` / ${records.length} Evidence records`)}</span>
        <small>{text(`新鲜度计算日 ${asOf}`, `Freshness assessed ${asOf}`)}</small>
      </div>

      <ol className="evidence-records">
        {visibleRecords.map((record) => {
          const reproducedExperiment = record.evidence.type === "reproduced" && typeof record.evidence.experiment_id === "string"
            ? record.evidence.experiment_id
            : null;
          return (
            <li id={record.id} key={record.id}>
              <article>
                <div className="evidence-record__top">
                  <span className={`evidence-type evidence-type--${record.evidence.type}`}>{record.evidence.type}</span>
                  <span className={`freshness freshness--${record.freshness.computedState}`}>{record.freshness.computedState}</span>
                  <time dateTime={record.evidence.captured_at}>{record.evidence.captured_at ?? "capture date missing"}</time>
                </div>
                <p>{claimText(record.claim, locale)}</p>
                <h2>{record.evidence.title}</h2>
                {record.evidence.locator && <code>{record.evidence.locator}</code>}
                <dl>
                  <div><dt>Agent</dt><dd>{record.agent.name}</dd></div>
                  <div><dt>Mechanism</dt><dd>{record.mechanism.id}</dd></div>
                  <div><dt>Snapshot</dt><dd>{record.claim.snapshot_id}</dd></div>
                  <div><dt>Claim</dt><dd>{record.claim.id}</dd></div>
                </dl>
                <div className="evidence-record__links">
                  <Link href={`/agents/${record.agent.id}/${record.claim.snapshot_id}#${record.claim.id}`}>
                    {text("打开 Claim", "Open Claim")} →
                  </Link>
                  <Link href={`/mechanisms/${record.mechanism.id}`}>{text("打开机制", "Open mechanism")} →</Link>
                  {record.evidence.source_url && <a href={record.evidence.source_url} target="_blank" rel="noreferrer">{text("打开原始来源", "Open primary source")} ↗</a>}
                  {reproducedExperiment && <Link href={`/lab/experiments/${reproducedExperiment}`}>{text("打开实验", "Open experiment")} →</Link>}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
      {!visibleRecords.length && <div className="empty-state"><strong>{text("没有匹配的证据", "No matching evidence")}</strong></div>}
    </div>
  );
}
