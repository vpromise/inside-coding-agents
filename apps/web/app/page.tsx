import type { Metadata } from "next";
import Link from "next/link";
import { LoopDiagram } from "./components/LoopDiagram";
import { LocalizedText } from "./components/LocaleProvider";
import { TracePlayer } from "./components/TracePlayer";
import { claimText, content } from "./lib/content";

export const metadata: Metadata = {
  title: "Inside Coding Agents — Coding Agent Harness Architecture",
  description: "Explore coding agent architecture through runnable lessons, versioned evidence, and reproducible agent harness experiments.",
};

const products = [
  { index: "01", name: "Academy", zh: "从零构建", en: "Build from zero", copyZh: "9 章可运行课程，从 loop 走到 replay、compaction 与 memory。", copyEn: "Nine runnable lessons, from the agent loop to replay, compaction, and memory." },
  { index: "02", name: "Mechanisms", zh: "横向拆解", en: "Compare designs", copyZh: "按 loop、context、tools、safety 等设计问题组织。", copyEn: "Organized by shared problems such as loops, context, tools, and safety." },
  { index: "03", name: "Atlas", zh: "版本档案", en: "Versioned records", copyZh: "每条架构事实绑定 Agent snapshot 与 surface。", copyEn: "Every architecture fact is bound to an agent snapshot and surface." },
  { index: "04", name: "Lab", zh: "复现实验", en: "Reproduce experiments", copyZh: "固定 fixture、变量、trace 与失败运行。", copyEn: "Pin fixtures, variables, traces, and failed runs." },
];

export default function Home() {
  const { curriculum } = content;
  const mechanism = content.mechanisms.find((item) => item.id === "agent-loop") ?? content.mechanisms[0];
  const claim = content.claims[0];
  const trace = content.traces.find((item) => item.experiment_id) ?? content.traces[0];

  return (
    <main>
      <section className="hero page-shell">
        <div className="hero__copy">
          <span className="eyebrow">OPEN TEXTBOOK · ATLAS · LABORATORY</span>
          <h1>
            <LocalizedText zh="拆开 Agent 的外壳，" en="Open the agent shell." />
            <span><LocalizedText zh="看见真正的系统。" en="See the real system." /></span>
          </h1>
          <p className="hero__lede">
            <LocalizedText
              zh="模型只是引擎。这里研究让 coding agent 能读代码、调用工具、控制权限、管理上下文并可靠收尾的 Harness。"
              en="The model is only the engine. Study the harness that lets a coding agent read code, call tools, enforce permissions, manage context, and finish reliably."
            />
          </p>
          <div className="hero__actions">
            <Link className="button button--primary" href="/learn/agent-loop">
              <LocalizedText zh="30 分钟造出第一个 Agent" en="Build your first agent in 30 minutes" />
              <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button button--ghost" href="/mechanisms/agent-loop">
              <LocalizedText zh="探索 Harness 全景" en="Explore the harness map" />
            </Link>
          </div>
          <div className="hero__proof" aria-label="Vertical slice status">
            <span><strong>{curriculum.lessons.length}</strong> <LocalizedText zh="可运行课程" en="runnable lessons" /></span>
            <span><strong>0</strong> <LocalizedText zh="所需 API keys" en="API keys required" /></span>
            <span><strong>{trace?.events.length ?? 0}</strong> <LocalizedText zh="可回放事件" en="replayable events" /></span>
          </div>
        </div>
        <div className="hero__visual">
          <div className="hero__visual-header">
            <span>MECHANISM / {mechanism?.id ?? "coverage-missing"}</span>
            <span className="live-label"><i /> executable</span>
          </div>
          <LoopDiagram />
          <div className="hero__visual-footer">
            <span>MODEL ≠ AGENT</span>
            <span>THE HARNESS OWNS STATE + EFFECTS</span>
          </div>
        </div>
      </section>

      <section className="manifesto-strip" aria-label="Project principles">
        <div className="page-shell manifesto-strip__inner">
          <span>RUNNABLE</span><i />
          <span>VERSIONED</span><i />
          <span>EVIDENCE-BACKED</span><i />
          <span>REPRODUCIBLE</span><i />
          <span>BEGINNER → RESEARCHER</span>
        </div>
      </section>

      <section className="section page-shell">
        <div className="section-heading section-heading--split">
          <div>
              <span className="eyebrow">ONE CONTENT GRAPH · FOUR VIEWS</span>
            <h2><LocalizedText zh="不是资料堆积，" en="Not a pile of links." /><br /><LocalizedText zh="是一套知识基础设施。" en="A knowledge infrastructure." /></h2>
          </div>
          <p>
            <LocalizedText
              zh="Lesson、Mechanism、Agent、Claim、Experiment 和 Trace 通过稳定 ID 连接。网页只是视图，Registry 才是事实层。"
              en="Lessons, mechanisms, agents, claims, experiments, and traces connect through stable IDs. Pages are views; the Registry is the fact layer."
            />
          </p>
        </div>
        <div className="product-grid">
          {products.map((product) => (
            <article className="product-card" key={product.name}>
              <span>{product.index}</span>
              <div>
                <h3>{product.name}</h3>
                <strong><LocalizedText zh={product.zh} en={product.en} /></strong>
              </div>
              <p><LocalizedText zh={product.copyZh} en={product.copyEn} /></p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--ink">
        <div className="page-shell">
          <div className="section-heading section-heading--split section-heading--light">
            <div>
              <span className="eyebrow">FOUNDATIONS · S01—S06</span>
              <h2><LocalizedText zh="先亲手造一个，" en="Build one yourself" /><br /><LocalizedText zh="再去评价任何 Agent。" en="before judging any agent." /></h2>
            </div>
            <Link className="text-link text-link--light" href="/learn"><LocalizedText zh="查看学习路线" en="View the learning path" /> <span>→</span></Link>
          </div>
          <div className="lesson-stack">
            {curriculum.lessons.map((lesson) => (
              <Link className="lesson-row" href={`/learn/${lesson.slug}`} key={lesson.id}>
                <span className="lesson-row__number">S{lesson.number}</span>
                <div>
                  <h3><LocalizedText zh={lesson.title["zh-CN"]} en={lesson.title.en} /></h3>
                  <p><LocalizedText zh={lesson.summary["zh-CN"]} en={lesson.summary.en} /></p>
                </div>
                <span className="lesson-row__mechanism">{lesson.mechanism_ids[0]}</span>
                <span className="lesson-row__arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section page-shell evidence-section">
        <div className="section-heading">
          <span className="eyebrow">CLAIM → EVIDENCE → SNAPSHOT</span>
          <h2><LocalizedText zh="把“据说如此”变成可检查的结论。" en="Turn hearsay into inspectable claims." /></h2>
        </div>
        <div className="evidence-layout">
          <article className="claim-card">
            <div className="claim-card__top">
              <span className="evidence-type">OFFICIAL DOC</span>
              <span>{claim?.reviewed_at ?? "review pending"}</span>
            </div>
            <blockquote>“{claim ? <LocalizedText zh={claimText(claim, "zh-CN")} en={claimText(claim, "en")} /> : "No reviewed claim has been published."}”</blockquote>
            <div className="claim-card__meta">
              <div><span>CLAIM</span><strong>{claim?.id ?? "missing"}</strong></div>
              <div><span>SNAPSHOT</span><strong>{claim?.snapshot_id ?? "missing"}</strong></div>
              <div><span>STATUS</span><strong>{claim?.status ?? "missing"}</strong></div>
            </div>
            <Link className="text-link" href={claim ? `/agents/${claim.agent_id}/${claim.snapshot_id}` : "/agents"}><LocalizedText zh="检查证据边界" en="Inspect the evidence boundary" /> <span>→</span></Link>
          </article>
          <div className="evidence-rules">
            <h3><LocalizedText zh="四种证据，绝不混写" en="Four evidence types, never conflated" /></h3>
            {[
              ["01", "source", "固定 commit 与源码定位", "Pinned commit and source locator"],
              ["02", "official-doc", "厂商或项目正式说明", "Official vendor or project documentation"],
              ["03", "reproduced", "固定环境中的可复现实验", "Reproduction in a pinned environment"],
              ["04", "inference", "明确标记的解释与未知", "Explicit interpretation and unknowns"],
            ].map(([number, name, copyZh, copyEn]) => (
              <div className="evidence-rule" key={name}>
                <span>{number}</span><strong>{name}</strong><p><LocalizedText zh={copyZh} en={copyEn} /></p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section page-shell" id="trace">
        {trace ? (
          <TracePlayer
            events={trace.events}
            eyebrow={`TRACE 0.1 · ${trace.kind.toUpperCase()}`}
            title="正式受控实验，逐事件拆开"
            titleEn="A formal controlled experiment, event by event"
            downloadHref={trace.download_path}
          />
        ) : <p>No trace has been published.</p>}
      </section>

      <section className="closing-cta page-shell">
        <span className="eyebrow">THE V0.1 PUBLIC PREVIEW IS RUNNING</span>
        <h2><LocalizedText zh="读懂一个机制。运行一条 Trace。" en="Understand one mechanism. Run one trace." /><br /><LocalizedText zh="然后再深入源码。" en="Then go deeper into the source." /></h2>
        <div>
          <Link className="button button--primary" href="/learn/agent-loop"><LocalizedText zh="从 s01 开始" en="Start with s01" /></Link>
          <Link className="button button--ghost" href="/lab"><LocalizedText zh="打开 Experiment Lab" en="Open the Experiment Lab" /></Link>
        </div>
      </section>
    </main>
  );
}
