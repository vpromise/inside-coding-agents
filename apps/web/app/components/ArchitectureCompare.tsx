"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Agent, Claim, Mechanism } from "../lib/content";
import { assessFreshness } from "../lib/research";
import { useLocale } from "./LocaleProvider";

interface ArchitectureCompareProps {
  agents: Agent[];
  claims: Claim[];
  mechanisms: Mechanism[];
  asOf: string;
}

const coverageRank = { unknown: 0, partial: 1, substantial: 2 } as const;

export function ArchitectureCompare({ agents, claims, mechanisms, asOf }: ArchitectureCompareProps) {
  const { text } = useLocale();
  const defaultAgents = agents.filter((agent) => agent.id !== "reference-harness").map((agent) => agent.id);
  const [selectedAgentIds, setSelectedAgentIds] = useState(defaultAgents);
  const [category, setCategory] = useState("all");
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [query, setQuery] = useState("");

  const selectedAgents = agents.filter((agent) => selectedAgentIds.includes(agent.id));
  const categories = [...new Set(mechanisms.map((mechanism) => mechanism.category))].sort();
  const visibleMechanisms = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return mechanisms.filter((mechanism) => {
      if (category !== "all" && mechanism.category !== category) return false;
      if (normalizedQuery && !`${mechanism.id} ${mechanism.title} ${mechanism.summary}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      const mappedCount = selectedAgentIds.filter((agentId) =>
        mechanism.agent_implementations.some(
          (implementation) => implementation.agent_id === agentId && implementation.coverage !== "unknown",
        ),
      ).length;
      if (coverageFilter === "mapped" && mappedCount === 0) return false;
      if (coverageFilter === "gaps" && mappedCount === selectedAgentIds.length) return false;
      return true;
    });
  }, [category, coverageFilter, mechanisms, query, selectedAgentIds]);

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) => current.includes(agentId)
      ? current.filter((value) => value !== agentId)
      : [...current, agentId]);
  }

  return (
    <div className="architecture-compare">
      <section className="compare-boundary" aria-label={text("比较边界", "Comparison boundary")}>
        <strong>{text("不是排行榜", "Not a leaderboard")}</strong>
        <p>{text(
          "单元格只表示当前 Registry 中，某个 snapshot 对某个机制有多少可检查证据；unknown 不是零分，也不代表产品没有该能力。",
          "Cells show how much inspectable evidence a snapshot currently contributes to a mechanism. Unknown is not a zero score and does not mean the product lacks the capability.",
        )}</p>
      </section>

      <section className="compare-controls" aria-label={text("比较筛选", "Comparison filters")}>
        <fieldset>
          <legend>{text("选择 Agent", "Select agents")}</legend>
          <div className="compare-agent-toggles">
            {agents.map((agent) => (
              <label key={agent.id}>
                <input
                  checked={selectedAgentIds.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                  type="checkbox"
                />
                <span>{agent.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          <span>{text("搜索机制", "Search mechanisms")}</span>
          <input
            id="compare-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("例如 compaction", "For example, compaction")}
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>{text("架构维度", "Architecture dimension")}</span>
          <select onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="all">{text("全部维度", "All dimensions")}</option>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>{text("证据状态", "Evidence state")}</span>
          <select onChange={(event) => setCoverageFilter(event.target.value)} value={coverageFilter}>
            <option value="all">{text("全部", "All")}</option>
            <option value="mapped">{text("至少一项已映射", "At least one mapped")}</option>
            <option value="gaps">{text("包含证据缺口", "Contains evidence gaps")}</option>
          </select>
        </label>
      </section>

      <div className="compare-status" aria-live="polite">
        <span>{visibleMechanisms.length} / {mechanisms.length} mechanisms</span>
        <span>{selectedAgents.length} / {agents.length} agents</span>
        <span>{text(`新鲜度计算日 ${asOf}`, `Freshness assessed ${asOf}`)}</span>
      </div>

      {selectedAgents.length ? (
        <div className="compare-table-wrap" role="region" aria-label={text("可横向滚动的架构比较矩阵", "Scrollable architecture comparison matrix")}>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Mechanism</th>
                {selectedAgents.map((agent) => {
                  const latest = [...agent.snapshots].sort((left, right) => right.observed_at.localeCompare(left.observed_at))[0];
                  const freshness = assessFreshness(latest, asOf);
                  return (
                    <th key={agent.id} scope="col">
                      <Link href={`/agents/${agent.id}`}>{agent.name}</Link>
                      <small>Tier {agent.coverage_tier} · {agent.source_availability}</small>
                      <span className={`freshness freshness--${freshness.computedState}`}>{freshness.computedState}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleMechanisms.map((mechanism) => (
                <tr key={mechanism.id}>
                  <th scope="row">
                    <Link href={`/mechanisms/${mechanism.id}`}>{mechanism.title}</Link>
                    <small>{mechanism.category} · {mechanism.id}</small>
                  </th>
                  {selectedAgents.map((agent) => {
                    const implementations = mechanism.agent_implementations.filter((item) => item.agent_id === agent.id);
                    const strongest = implementations.reduce<"unknown" | "partial" | "substantial">(
                      (result, item) => coverageRank[item.coverage] > coverageRank[result] ? item.coverage : result,
                      "unknown",
                    );
                    const cellClaims = claims.filter(
                      (claim) => claim.agent_id === agent.id && claim.mechanism_id === mechanism.id,
                    );
                    const evidenceKinds = [...new Set(cellClaims.flatMap((claim) => claim.evidence.map((item) => item.type)))].sort();
                    const firstClaim = cellClaims[0];
                    return (
                      <td className={`compare-cell compare-cell--${strongest}`} key={agent.id}>
                        <span className={`coverage coverage--${strongest}`}>{strongest}</span>
                        <strong>{cellClaims.length} {text("条 Claim", "claims")}</strong>
                        <small>{evidenceKinds.join(" · ") || text("尚无证据记录", "no evidence record")}</small>
                        {firstClaim ? (
                          <Link href={`/agents/${agent.id}/${firstClaim.snapshot_id}#${firstClaim.id}`}>
                            {text("检查证据", "Inspect evidence")} →
                          </Link>
                        ) : (
                          <span>{text("保持 unknown", "Remain unknown")}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state"><strong>{text("请选择至少一个 Agent", "Select at least one agent")}</strong></div>
      )}
    </div>
  );
}
