import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "../components/LocaleProvider";
import { content } from "../lib/content";

export const metadata: Metadata = {
  title: "Agent Atlas",
  description: "按版本、surface、coverage 和证据边界浏览 coding agent harness。",
};

export default function AgentsPage() {
  const snapshotCount = content.agents.reduce((total, agent) => total + agent.snapshots.length, 0);
  return (
    <main className="page-shell interior-page">
      <header className="interior-hero">
        <span className="eyebrow">AGENT ATLAS · VERSIONED EVIDENCE</span>
        <h1><LocalizedText zh="品牌会变化，" en="Brands change." /><br /><LocalizedText zh="Snapshot 保留边界。" en="Snapshots preserve boundaries." /></h1>
        <p><LocalizedText zh="每个 Agent 页面都从 Registry 自动生成。Coverage 不是排名，而是我们目前能够用源码、官方文档或实验支持到什么深度。" en="Every agent page is generated from the Registry. Coverage is not a ranking; it states how deeply source, official documentation, or experiments support our current view." /></p>
        <div className="metric-row">
          <span><strong>{content.agents.length}</strong> agents</span>
          <span><strong>{snapshotCount}</strong> snapshots</span>
          <span><strong>{content.claims.length}</strong> claims</span>
          <span><strong>9</strong> dimensions</span>
        </div>
        <div className="hero-inline-links">
          <Link className="text-link" href="/compare"><LocalizedText zh="横向比较机制" en="Compare mechanisms" /> →</Link>
          <Link className="text-link" href="/evidence"><LocalizedText zh="检索全部证据" en="Explore all evidence" /> →</Link>
        </div>
      </header>

      <section className="atlas-grid" aria-label="Agent list">
        {content.agents.map((agent) => {
          const latest = agent.snapshots.at(-1);
          const claims = latest
            ? content.claims.filter((claim) => claim.agent_id === agent.id && claim.snapshot_id === latest.id)
            : [];
          return (
            <article className="atlas-card" key={agent.id}>
              <div className="atlas-card__top">
                <span className="agent-monogram agent-monogram--small" aria-hidden="true">
                  {agent.name.slice(0, 2).toUpperCase()}
                </span>
                <span className={`tier-badge tier-badge--${agent.coverage_tier.toLowerCase()}`}>TIER {agent.coverage_tier}</span>
              </div>
              <h2>{agent.name}</h2>
              <p>{agent.summary}</p>
              <dl className="compact-facts">
                <div><dt>Surface</dt><dd>{agent.surfaces.join(" · ")}</dd></div>
                <div><dt>Source</dt><dd>{agent.source_availability}</dd></div>
                <div><dt>Claims</dt><dd>{claims.length}</dd></div>
                <div><dt>Observed</dt><dd>{latest?.observed_at ?? "missing"}</dd></div>
              </dl>
              <Link className="text-link" href={`/agents/${agent.id}`}><LocalizedText zh="打开档案" en="Open profile" /> <span>→</span></Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
