import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BilingualArticle } from "../../../components/BilingualArticle";
import { LocalizedText } from "../../../components/LocaleProvider";
import {
  architectureDimensions,
  claimText,
  claimsForSnapshot,
  content,
  dimensionCoverage,
  findAgent,
  findMechanism,
  findSnapshot,
} from "../../../lib/content";

export function generateStaticParams() {
  return content.agents.flatMap((agent) =>
    agent.snapshots.map((snapshot) => ({ agent: agent.id, snapshot: snapshot.id })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ agent: string; snapshot: string }> }): Promise<Metadata> {
  const values = await params;
  const agent = findAgent(values.agent);
  const snapshot = agent ? findSnapshot(agent, values.snapshot) : undefined;
  return agent && snapshot
    ? { title: `${agent.name} · ${snapshot.id}`, description: snapshot.notes ?? agent.summary }
    : {};
}

export default async function SnapshotPage({ params }: { params: Promise<{ agent: string; snapshot: string }> }) {
  const values = await params;
  const agent = findAgent(values.agent);
  if (!agent) notFound();
  const snapshot = findSnapshot(agent, values.snapshot);
  if (!snapshot) notFound();
  const claims = claimsForSnapshot(agent.id, snapshot.id);
  const evidenceKinds = [...new Set(claims.flatMap((claim) => claim.evidence.map((evidence) => evidence.type)))];

  return (
    <main className="page-shell interior-page">
      <header className="agent-hero">
        <div className="agent-monogram" aria-hidden="true">{agent.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <span className="eyebrow">SNAPSHOT · TIER {agent.coverage_tier} · {snapshot.surface.toUpperCase()}</span>
          <h1>{agent.name} <small>{snapshot.version}</small></h1>
          <p>{snapshot.notes ?? agent.summary}</p>
          <div className="tag-row"><span>{snapshot.id}</span><span>{snapshot.freshness}</span><span>{claims.length} claims</span></div>
        </div>
      </header>

      <section className="evidence-boundary-banner">
        <strong>Evidence boundary</strong>
        <p>
          {snapshot.source_ref
            ? <LocalizedText zh={`源码结论固定到 commit ${snapshot.source_ref.commit.slice(0, 12)}；产品行为仍需独立实验支持。`} en={`Source claims are pinned to commit ${snapshot.source_ref.commit.slice(0, 12)}; product behavior still requires independent experiments.`} />
            : <LocalizedText zh="本快照没有固定 source commit，因此源码结构、隐藏协议和内部状态机保持 unknown。" en="This snapshot has no pinned source commit, so source structure, hidden protocols, and internal state machines remain unknown." />}
        </p>
      </section>

      <section className="dimension-grid" aria-label="Nine-dimension coverage status">
        {architectureDimensions.map((dimension) => {
          const status = dimensionCoverage(claims, dimension);
          return <div key={dimension}><span>{dimension}</span><strong className={`coverage coverage--${status}`}>{status}</strong></div>;
        })}
      </section>

      <div className="article-layout agent-article-layout">
        <aside className="article-aside">
          <span className="eyebrow">SNAPSHOT FACTS</span>
          <dl>
            <div><dt>Observed</dt><dd>{snapshot.observed_at}</dd></div>
            <div><dt>Surface</dt><dd>{snapshot.surface}</dd></div>
            <div><dt>Version</dt><dd>{snapshot.version}</dd></div>
            <div><dt>Evidence</dt><dd>{evidenceKinds.join(" · ") || "missing"}</dd></div>
          </dl>
          <Link href={`/agents/${agent.id}`}><LocalizedText zh="返回 Agent 档案" en="Back to agent profile" /> →</Link>
        </aside>
        {snapshot.analysis_content["zh-CN"] && snapshot.analysis_content.en ? (
          <BilingualArticle zh={snapshot.analysis_content["zh-CN"]} en={snapshot.analysis_content.en} />
        ) : (
          <section className="empty-state"><strong>Analysis coverage missing</strong><p><LocalizedText zh="Snapshot 元数据已存在，但双语分析尚未通过审核。" en="Snapshot metadata exists, but the bilingual analysis has not been reviewed." /></p></section>
        )}
      </div>

      {snapshot.source_ref && (
        <section className="source-map-panel">
          <span className="eyebrow">PINNED SOURCE MAP</span>
          <h2>{snapshot.source_ref.repository.replace(/^https?:\/\//, "")}</h2>
          <code>{snapshot.source_ref.commit}</code>
          <ul>{snapshot.source_ref.paths?.map((path) => <li key={path}><code>{path}</code></li>)}</ul>
        </section>
      )}

      <section className="claim-ledger">
        <div className="claim-ledger__header"><span>CLAIM LEDGER</span><span>{claims.filter((claim) => claim.status === "reviewed").length} REVIEWED · {claims.filter((claim) => claim.status === "disputed").length} DISPUTED</span></div>
        {claims.length ? claims.map((claim) => (
          <article id={claim.id} key={claim.id}>
            <div><span className="evidence-type">{claim.evidence.map((evidence) => evidence.type).join(" + ")}</span><span>{claim.status}</span></div>
            <h2>{claim.id}</h2>
            <p><LocalizedText zh={claimText(claim, "zh-CN")} en={claimText(claim, "en")} /></p>
            <dl>
              <div><dt>Mechanism</dt><dd><Link href={`/mechanisms/${claim.mechanism_id}`}>{findMechanism(claim.mechanism_id)?.title ?? claim.mechanism_id}</Link></dd></div>
              <div><dt>Reviewed</dt><dd>{claim.reviewed_at ?? "pending"}</dd></div>
              <div><dt>Sources</dt><dd>{claim.evidence.length}</dd></div>
            </dl>
            <div className="evidence-links">
              {claim.evidence.filter((item) => item.source_url).map((item) => (
                <a href={item.source_url} key={`${claim.id}-${item.title}`} target="_blank" rel="noreferrer">{item.title} ↗</a>
              ))}
            </div>
          </article>
        )) : <div className="empty-state"><strong>No reviewed claims</strong><p><LocalizedText zh="在加入 Evidence 记录前，Coverage 保持 unknown。" en="Coverage remains unknown until evidence records are added." /></p></div>}
      </section>
    </main>
  );
}
