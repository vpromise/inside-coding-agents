import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BilingualArticle } from "../../components/BilingualArticle";
import { LocalizedText } from "../../components/LocaleProvider";
import { LoopDiagram } from "../../components/LoopDiagram";
import { claimText, claimsForMechanism, content, findAgent, findMechanism } from "../../lib/content";

const depthLabels = [
  ["L0", "Intuition"],
  ["L1", "Build"],
  ["L2", "Engineering"],
  ["L3", "Architecture"],
  ["L4", "Research"],
] as const;

export function generateStaticParams() {
  return content.mechanisms.map((mechanism) => ({ mechanism: mechanism.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ mechanism: string }> }): Promise<Metadata> {
  const { mechanism: mechanismId } = await params;
  const mechanism = findMechanism(mechanismId);
  return mechanism ? { title: `${mechanism.title} 机制`, description: mechanism.summary } : {};
}

export default async function MechanismPage({ params }: { params: Promise<{ mechanism: string }> }) {
  const { mechanism: mechanismId } = await params;
  const mechanism = findMechanism(mechanismId);
  if (!mechanism) notFound();
  const claims = claimsForMechanism(mechanism.id);
  const lessons = mechanism.reference_lessons
    .map((id) => content.curriculum.lessons.find((lesson) => lesson.id === id))
    .filter((lesson) => lesson !== undefined);

  return (
    <main className="page-shell interior-page">
      <header className="mechanism-hero">
        <div>
          <span className="eyebrow">MECHANISM · {mechanism.category.toUpperCase()} · {mechanism.status.toUpperCase()}</span>
          <h1>{mechanism.title}</h1>
          <p>{mechanism.summary}</p>
          <div className="tag-row">
            <span>{mechanism.reference_lessons.length} lessons</span>
            <span>{mechanism.agent_implementations.length} agent snapshots</span>
            <span>{mechanism.experiments.length} experiments</span>
          </div>
        </div>
        {mechanism.id === "agent-loop" ? <LoopDiagram /> : (
          <div className="mechanism-glyph" aria-label={`${mechanism.title} structured record`}>
            <span>{mechanism.category}</span><strong>{mechanism.id}</strong><small>problem → policy → evidence</small>
          </div>
        )}
      </header>

      <section className="depth-rail" aria-label="Content depth">
        {depthLabels.map(([id, label]) => {
          const status = mechanism.reader_layer_status?.[id] ?? "missing";
          return <div key={id} className={status === "complete" ? "is-complete" : ""}><span>{id}</span><strong>{label}</strong><small>{status}</small></div>;
        })}
      </section>

      <div className="article-layout mechanism-article-layout">
        <aside className="article-aside">
          <span className="eyebrow">CONTENT GRAPH</span>
          <dl>
            <div><dt>ID</dt><dd>{mechanism.id}</dd></div>
            <div><dt>Category</dt><dd>{mechanism.category}</dd></div>
            <div><dt>Status</dt><dd>{mechanism.status}</dd></div>
            <div><dt>Claims</dt><dd>{claims.length}</dd></div>
          </dl>
          {lessons[0] ? <Link href={`/learn/${lessons[0].slug}`}><LocalizedText zh="运行" en="Run" /> {lessons[0].id} →</Link> : <span><LocalizedText zh="暂无课程" en="No lesson yet" /></span>}
        </aside>
        {mechanism.content["zh-CN"] && mechanism.content.en ? (
          <BilingualArticle zh={mechanism.content["zh-CN"]} en={mechanism.content.en} />
        ) : (
          <section className="empty-state">
            <strong>Bilingual deep dive missing</strong>
            <p>{mechanism.summary}</p>
            <p><LocalizedText zh="结构化记录已进入 Atlas，但 L0–L4 正文尚未通过内容审核。" en="The structured record is in the Atlas, but the L0–L4 article has not passed content review." /></p>
          </section>
        )}
      </div>

      <section className="snapshot-mapping">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow">AGENT MAPPING · EVIDENCE ONLY</span><h2>Snapshot implementations</h2></div>
          <p><LocalizedText zh="同一机制只有在 Snapshot 和 Claim 共同存在时才进入实现映射；未知项保持可见。" en="An implementation enters the map only when both a snapshot and claims exist; unknowns remain visible." /></p>
        </div>
        {mechanism.agent_implementations.length ? (
          <div className="mapping-grid">
            {mechanism.agent_implementations.map((implementation) => {
              const agent = findAgent(implementation.agent_id);
              const implementationClaims = claims.filter((claim) => implementation.claim_ids.includes(claim.id));
              return (
                <article key={`${implementation.agent_id}-${implementation.snapshot_id}`}>
                  <span>{implementation.coverage.toUpperCase()}</span>
                  <strong>{agent?.name ?? implementation.agent_id}</strong>
                  <p>{implementation.notes ?? `${implementationClaims.length} evidence-backed claims.`}</p>
                  <Link href={`/agents/${implementation.agent_id}/${implementation.snapshot_id}`}>{implementation.snapshot_id} →</Link>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><strong>No Agent mapping yet</strong><p><LocalizedText zh="该空白是 coverage 状态，不会由营销资料自动补全。" en="This gap is a coverage state; marketing material will not fill it automatically." /></p></div>}
      </section>

      {claims.length > 0 && (
        <section className="claim-ledger compact-claim-ledger">
          <div className="claim-ledger__header"><span>CLAIMS</span><span>{claims.length} RECORDS</span></div>
          {claims.map((claim) => (
            <article key={claim.id}>
              <div><span className="evidence-type">{claim.evidence.map((evidence) => evidence.type).join(" + ")}</span><span>{claim.status}</span></div>
              <h2>{claim.id}</h2><p><LocalizedText zh={claimText(claim, "zh-CN")} en={claimText(claim, "en")} /></p>
            </article>
          ))}
        </section>
      )}

      <section className="open-questions">
        <span className="eyebrow">OPEN QUESTIONS · L4</span>
        {mechanism.open_questions.map((question, index) => (
          <div key={question}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></div>
        ))}
      </section>
    </main>
  );
}
