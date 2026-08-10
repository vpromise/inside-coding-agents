import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BilingualArticle } from "../../components/BilingualArticle";
import { LocalizedText } from "../../components/LocaleProvider";
import { claimsForSnapshot, content, findAgent } from "../../lib/content";

export function generateStaticParams() {
  return content.agents.map((agent) => ({ agent: agent.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ agent: string }> }): Promise<Metadata> {
  const { agent: agentId } = await params;
  const agent = findAgent(agentId);
  return agent ? { title: `${agent.name} Agent Atlas`, description: agent.summary } : {};
}

export default async function AgentPage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent: agentId } = await params;
  const agent = findAgent(agentId);
  if (!agent) notFound();
  const latest = agent.snapshots.at(-1);

  return (
    <main className="page-shell interior-page">
      <header className="agent-hero">
        <div className="agent-monogram" aria-hidden="true">{agent.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <span className="eyebrow">AGENT ATLAS · TIER {agent.coverage_tier}</span>
          <h1>{agent.name}</h1>
          <p>{agent.summary}</p>
          <div className="tag-row">
            {agent.surfaces.map((surface) => <span key={surface}>{surface}</span>)}
            <span>{agent.source_availability} source</span>
            <span>{agent.lifecycle}</span>
          </div>
          <div className="hero-inline-links">
            <Link className="text-link" href={`/agents/${agent.id}/timeline`}><LocalizedText zh="查看 Snapshot Timeline" en="View Snapshot Timeline" /> →</Link>
            <Link className="text-link" href="/compare"><LocalizedText zh="进入 Architecture Compare" en="Open Architecture Compare" /> →</Link>
          </div>
        </div>
      </header>

      {agent.overview_content["zh-CN"] && agent.overview_content.en ? (
        <div className="article-layout agent-article-layout">
          <aside className="article-aside">
            <span className="eyebrow">ATLAS FACTS</span>
            <dl>
              <div><dt>ID</dt><dd>{agent.id}</dd></div>
              <div><dt>Tier</dt><dd>{agent.coverage_tier}</dd></div>
              <div><dt>Snapshots</dt><dd>{agent.snapshots.length}</dd></div>
              <div><dt>Latest</dt><dd>{latest?.observed_at ?? "missing"}</dd></div>
            </dl>
            <a href={agent.homepage} target="_blank" rel="noreferrer"><LocalizedText zh="打开上游主页" en="Open upstream homepage" /> ↗</a>
            <Link href={`/agents/${agent.id}/timeline`}><LocalizedText zh="打开 Timeline" en="Open timeline" /> →</Link>
          </aside>
          <BilingualArticle zh={agent.overview_content["zh-CN"]} en={agent.overview_content.en} />
        </div>
      ) : (
        <section className="empty-state"><strong>Overview coverage missing</strong><p><LocalizedText zh="Registry 身份已存在，但双语概览尚未通过审核。" en="The Registry identity exists, but the bilingual overview has not been reviewed." /></p></section>
      )}

      <section className="snapshot-list">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow">IMMUTABLE OBSERVATIONS</span><h2>Snapshots</h2></div>
          <p><LocalizedText zh="事实绑定到日期、surface 和版本；新观察只追加，不覆盖旧结论。" en="Facts are bound to a date, surface, and version. New observations append rather than overwrite history." /></p>
        </div>
        {agent.snapshots.map((snapshot) => {
          const claims = claimsForSnapshot(agent.id, snapshot.id);
          return (
            <article className="snapshot-card" key={snapshot.id}>
              <div>
                <span className={`coverage coverage--${snapshot.freshness === "current" ? "partial" : "unknown"}`}>{snapshot.freshness}</span>
                <h3>{snapshot.id}</h3>
                <p>{snapshot.notes ?? "No snapshot note has been published."}</p>
              </div>
              <dl className="compact-facts">
                <div><dt>Observed</dt><dd>{snapshot.observed_at}</dd></div>
                <div><dt>Surface</dt><dd>{snapshot.surface}</dd></div>
                <div><dt>Version</dt><dd>{snapshot.version}</dd></div>
                <div><dt>Claims</dt><dd>{claims.length}</dd></div>
              </dl>
              <Link className="text-link" href={`/agents/${agent.id}/${snapshot.id}`}><LocalizedText zh="检查 Snapshot" en="Inspect snapshot" /> <span>→</span></Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
