import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalizedText } from "../../../components/LocaleProvider";
import { claimsForSnapshot, content, findAgent, findMechanism } from "../../../lib/content";
import { assessFreshness, snapshotComparisonId } from "../../../lib/research";

export function generateStaticParams() {
  return content.agents.map((agent) => ({ agent: agent.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ agent: string }> }): Promise<Metadata> {
  const { agent: agentId } = await params;
  const agent = findAgent(agentId);
  return agent ? { title: `${agent.name} Snapshot Timeline`, description: `Versioned observation ledger for ${agent.name}.` } : {};
}

export default async function AgentTimelinePage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent: agentId } = await params;
  const agent = findAgent(agentId);
  if (!agent) notFound();
  const asOf = new Date().toISOString().slice(0, 10);

  return (
    <main className="page-shell interior-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">SNAPSHOT TIMELINE · APPEND-ONLY OBSERVATIONS</span>
        <h1>{agent.name}<br /><LocalizedText zh="时间线" en="timeline" /></h1>
        <p><LocalizedText
          zh="Timeline 展示 Registry 中实际记录的观察，不把不同 surface 或同日证据边界伪装成产品版本演进。"
          en="The timeline shows observations actually recorded in the Registry. Different surfaces or same-day evidence boundaries are not disguised as product-version evolution."
        /></p>
        <div className="metric-row">
          <span><strong>{agent.snapshots.length}</strong> snapshots</span>
          <span><strong>{content.claims.filter((claim) => claim.agent_id === agent.id).length}</strong> claims</span>
          <span><strong>{new Set(agent.snapshots.map((snapshot) => snapshot.surface)).size}</strong> surfaces</span>
          <span><strong>90</strong> day review window</span>
        </div>
        <div className="hero-inline-links">
          <Link className="text-link" href={`/agents/${agent.id}`}><LocalizedText zh="返回 Agent 档案" en="Back to profile" /> →</Link>
          <Link className="text-link" href="/compare"><LocalizedText zh="打开 Architecture Compare" en="Open Architecture Compare" /> →</Link>
        </div>
      </header>

      <ol className="snapshot-timeline">
        {agent.snapshots.map((snapshot, index) => {
          const claims = claimsForSnapshot(agent.id, snapshot.id);
          const mechanismIds = [...new Set(claims.map((claim) => claim.mechanism_id))].sort();
          const evidenceKinds = [...new Set(claims.flatMap((claim) => claim.evidence.map((item) => item.type)))].sort();
          const freshness = assessFreshness(snapshot, asOf);
          const next = agent.snapshots[index + 1];
          return (
            <li key={snapshot.id}>
              <div className="snapshot-timeline__rail"><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
              <article>
                <div className="snapshot-timeline__top">
                  <time dateTime={snapshot.observed_at}>{snapshot.observed_at}</time>
                  <span>{snapshot.surface}</span>
                  <span className={`freshness freshness--${freshness.computedState}`}>{freshness.computedState}</span>
                </div>
                <h2>{snapshot.version}</h2>
                <code>{snapshot.id}</code>
                <p>{snapshot.notes ?? "No snapshot note has been published."}</p>
                <dl>
                  <div><dt>Claims</dt><dd>{claims.length}</dd></div>
                  <div><dt>Mechanisms</dt><dd>{mechanismIds.length}</dd></div>
                  <div><dt>Evidence</dt><dd>{evidenceKinds.join(" · ") || "missing"}</dd></div>
                  <div><dt>Review due</dt><dd>{freshness.reviewDueAt}</dd></div>
                </dl>
                <div className="timeline-mechanisms">
                  {mechanismIds.map((mechanismId) => (
                    <Link href={`/mechanisms/${mechanismId}`} key={mechanismId}>{findMechanism(mechanismId)?.title ?? mechanismId}</Link>
                  ))}
                </div>
                <div className="snapshot-timeline__actions">
                  <Link href={`/agents/${agent.id}/${snapshot.id}`}><LocalizedText zh="检查 Snapshot" en="Inspect snapshot" /> →</Link>
                  {next && (
                    <Link href={`/agents/${agent.id}/diff/${snapshotComparisonId(snapshot, next)}`}>
                      <LocalizedText zh="与下一条记录做结构 Diff" en="Structural diff to next record" /> →
                    </Link>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
