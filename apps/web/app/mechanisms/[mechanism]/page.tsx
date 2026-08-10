import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BilingualArticle } from "../../components/BilingualArticle";
import { LocalizedText } from "../../components/LocaleProvider";
import { LoopDiagram } from "../../components/LoopDiagram";
import { MechanismFlow } from "../../components/MechanismFlow";
import {
  claimText,
  claimsForMechanism,
  content,
  findAgent,
  findExperiment,
  findMechanism,
} from "../../lib/content";

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
  const prerequisites = mechanism.prerequisites
    .map((id) => findMechanism(id))
    .filter((item) => item !== undefined);
  const dependents = content.mechanisms.filter((item) => item.prerequisites.includes(mechanism.id));
  const experiments = mechanism.experiments
    .map((id) => findExperiment(id))
    .filter((item) => item !== undefined);
  const reviewedDates = claims.flatMap((claim) => [
    ...(claim.reviewed_at ? [claim.reviewed_at] : []),
    ...claim.evidence.flatMap((evidence) => evidence.captured_at ? [evidence.captured_at] : []),
  ]).sort();
  const lastReviewed = reviewedDates.at(-1) ?? null;

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

      <section className="mechanism-graph-section" aria-labelledby="mechanism-graph-title">
        <div className="section-heading section-heading--split">
          <div>
            <span className="eyebrow">DEPENDENCY GRAPH · READER PATH</span>
            <h2 id="mechanism-graph-title"><LocalizedText zh="它从哪里来，又通向哪里？" en="What feeds it, and what does it unlock?" /></h2>
          </div>
          <p><LocalizedText zh="箭头表示学习与设计依赖，不表示运行时的数据流；点击节点可以沿机制图谱继续研究。" en="Arrows show learning and design dependencies, not runtime data flow. Follow any node to continue through the Atlas." /></p>
        </div>
        <MechanismFlow
          current={{ id: mechanism.id, title: mechanism.title }}
          prerequisites={prerequisites.map((item) => ({ id: item.id, title: item.title }))}
          dependents={dependents.map((item) => ({ id: item.id, title: item.title }))}
        />
      </section>

      <div className="article-layout mechanism-article-layout">
        <aside className="article-aside">
          <span className="eyebrow">CONTENT GRAPH</span>
          <dl>
            <div><dt>ID</dt><dd>{mechanism.id}</dd></div>
            <div><dt>Category</dt><dd>{mechanism.category}</dd></div>
            <div><dt>Status</dt><dd>{mechanism.status}</dd></div>
            <div><dt>Claims</dt><dd>{claims.length}</dd></div>
            <div><dt>Reviewed</dt><dd>{lastReviewed ?? "evidence gap"}</dd></div>
          </dl>
          <nav aria-label="Mechanism article sections">
            <a href="#definition">L0 · <LocalizedText zh="定义" en="Definition" /></a>
            <a href="#reference">L1 · <LocalizedText zh="最小实现" en="Reference" /></a>
            <a href="#engineering">L2 · <LocalizedText zh="工程化" en="Engineering" /></a>
            <a href="#comparison">L3 · <LocalizedText zh="对照" en="Comparison" /></a>
            <a href="#research">L4 · <LocalizedText zh="研究" en="Research" /></a>
          </nav>
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
        <div className="mapping-grid">
          {content.agents.map((agent) => {
            const implementation = mechanism.agent_implementations.find((item) => item.agent_id === agent.id);
            const implementationClaims = implementation
              ? claims.filter((claim) => implementation.claim_ids.includes(claim.id))
              : [];
            return (
              <article className={implementation ? "" : "mapping-grid__unknown"} key={agent.id}>
                <span>{implementation ? implementation.coverage.toUpperCase() : "UNKNOWN · EVIDENCE GAP"}</span>
                <strong>{agent.name}</strong>
                <p>{implementation
                  ? implementation.notes ?? `${implementationClaims.length} evidence-backed claim${implementationClaims.length === 1 ? "" : "s"}.`
                  : <LocalizedText zh="当前没有满足 Snapshot + Claim 门槛的实现记录；这不是对产品能力的否定。" en="No implementation currently clears the Snapshot + Claim threshold; this is not a claim that the product lacks the capability." />}
                </p>
                <Link href={implementation ? `/agents/${agent.id}/${implementation.snapshot_id}` : `/agents/${agent.id}`}>
                  {implementation?.snapshot_id ?? <LocalizedText zh="查看覆盖边界" en="Inspect coverage boundary" />} →
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="claim-ledger compact-claim-ledger">
        <div className="claim-ledger__header"><span>CLAIMS · EVIDENCE LEDGER</span><span>{claims.length} RECORDS</span></div>
        {claims.length ? (
          <>
          {claims.map((claim) => (
            <article key={claim.id}>
              <div><span className="evidence-type">{claim.evidence.map((evidence) => evidence.type).join(" + ")}</span><span>{claim.status}</span></div>
              <h2>{claim.id}</h2><p><LocalizedText zh={claimText(claim, "zh-CN")} en={claimText(claim, "en")} /></p>
              <dl>
                <div><dt>Agent</dt><dd>{findAgent(claim.agent_id)?.name ?? claim.agent_id}</dd></div>
                <div><dt>Snapshot</dt><dd>{claim.snapshot_id}</dd></div>
                <div><dt>Reviewed</dt><dd>{claim.reviewed_at ?? "not recorded"}</dd></div>
              </dl>
              <div className="evidence-links">
                <Link href={`/agents/${claim.agent_id}/${claim.snapshot_id}#${claim.id}`}>Snapshot claim →</Link>
                {claim.evidence.map((evidence, index) => evidence.source_url ? (
                  <a href={evidence.source_url} key={`${claim.id}-${index}`} rel="noreferrer" target="_blank">
                    {evidence.type} · {evidence.locator ?? evidence.title} ↗
                  </a>
                ) : (
                  <span key={`${claim.id}-${index}`}>{evidence.type} · {evidence.locator ?? evidence.title}</span>
                ))}
              </div>
            </article>
          ))}
          </>
        ) : (
          <div className="claim-ledger__gap">
            <strong><LocalizedText zh="没有通过审核的 Agent Claim" en="No reviewed Agent claims" /></strong>
            <p><LocalizedText zh="本页的参考实现来自教学 harness，不能自动升级成任何厂商 Agent 的架构结论。" en="The teaching-harness reference does not automatically become an architectural claim about any vendor agent." /></p>
          </div>
        )}
      </section>

      <section className="mechanism-lessons" id="related-lessons">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow">RUNNABLE REFERENCES</span><h2><LocalizedText zh="从解释进入代码与 Trace。" en="Move from explanation into code and traces." /></h2></div>
          <p><LocalizedText zh="这里复用课程事实源：每个入口都带运行命令、Golden Trace 与验收练习，不复制另一套伪代码。" en="These links reuse the curriculum source of truth: every entry carries a run command, Golden Trace, and acceptance checks instead of a second pseudocode implementation." /></p>
        </div>
        {lessons.length ? (
          <div className="mechanism-lesson-grid">
            {lessons.map((lesson) => (
              <article key={lesson.id}>
                <div><span>S{lesson.number}</span><span>{lesson.difficulty}</span></div>
                <h3><LocalizedText zh={lesson.title["zh-CN"]} en={lesson.title.en} /></h3>
                <p><LocalizedText zh={lesson.change_contract.summary["zh-CN"]} en={lesson.change_contract.summary.en} /></p>
                <code>{lesson.run}</code>
                <div className="mechanism-lesson-links">
                  <Link href={`/learn/${lesson.slug}`}><LocalizedText zh="教程" en="Tutorial" /> →</Link>
                  <Link href={`/learn/${lesson.slug}#source`}><LocalizedText zh="源码" en="Source" /> →</Link>
                  <Link href={`/lab/traces/${lesson.golden_trace.run_id}`}>Golden Trace →</Link>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><strong>No runnable lesson yet</strong><p>{mechanism.summary}</p></div>}
      </section>

      <section className="mechanism-experiments" id="experiments">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow">EXPERIMENTS · EXERCISES</span><h2><LocalizedText zh="哪些结论真正被测过？" en="What has actually been tested?" /></h2></div>
          <p><LocalizedText zh="正式 Experiment 与课程练习分开展示。练习可以验证参考实现，却不能替代真实 Agent 的 Native 证据。" en="Formal experiments are separate from course exercises. Exercises can validate the reference implementation but cannot replace Native evidence from a real agent." /></p>
        </div>
        {experiments.length ? (
          <div className="experiment-grid">
            {experiments.map((experiment) => (
              <Link href={`/lab/experiments/${experiment.id}`} key={experiment.id}>
                <span>{experiment.mode} · {experiment.status}</span><strong>{experiment.title}</strong><small>{experiment.question}</small>
              </Link>
            ))}
          </div>
        ) : (
          <div className="experiment-backlog">
            <strong><LocalizedText zh="Formal experiment · 待注册" en="Formal experiment · not registered" /></strong>
            <p><LocalizedText zh="没有实验记录意味着未测试，不代表测试通过。下方课程检查只覆盖确定性 reference harness。" en="No experiment record means untested, not passed. The course checks below cover only the deterministic reference harness." /></p>
          </div>
        )}
        <div className="mechanism-check-list">
          {lessons.flatMap((lesson) => lesson.exercise_checks.map((check) => (
            <article key={`${lesson.id}-${check.id}`}>
              <div><span>{lesson.id}</span><span>{check.level}</span></div>
              <strong><LocalizedText zh={check.title["zh-CN"]} en={check.title.en} /></strong>
              <p><LocalizedText zh={check.acceptance["zh-CN"]} en={check.acceptance.en} /></p>
              <code role="region" aria-label="机制验收命令 / mechanism acceptance command" tabIndex={0}>{check.command}</code>
            </article>
          )))}
        </div>
      </section>

      <section className="open-questions">
        <span className="eyebrow">OPEN QUESTIONS · L4</span>
        {mechanism.open_questions.map((question, index) => (
          <div key={question}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></div>
        ))}
      </section>
    </main>
  );
}
