import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BilingualArticle } from "../../components/BilingualArticle";
import { LocalizedText } from "../../components/LocaleProvider";
import { TracePlayer } from "../../components/TracePlayer";
import {
  claimText,
  content,
  findAgent,
  findMechanism,
  findTrace,
} from "../../lib/content";

export function generateStaticParams() {
  return content.curriculum.lessons.map((lesson) => ({ slug: lesson.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const lesson = content.curriculum.lessons.find((item) => item.slug === slug);
  return lesson ? { title: `s${lesson.number} ${lesson.title["zh-CN"]} / ${lesson.title.en}`, description: `${lesson.summary["zh-CN"]} ${lesson.summary.en}` } : {};
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lessons = content.curriculum.lessons;
  const lessonIndex = lessons.findIndex((item) => item.slug === slug);
  if (lessonIndex < 0) notFound();
  const lesson = lessons[lessonIndex];
  const previous = lessons[lessonIndex - 1];
  const next = lessons[lessonIndex + 1];
  const sourceLines = lesson.source_code.trimEnd().split(/\r?\n/).length;
  const sourceUrl = `https://github.com/vpromise/inside-coding-agents/blob/main/${lesson.code_path}`;
  const goldenTrace = findTrace(lesson.golden_trace.run_id);
  const bridgeClaims = lesson.agent_bridge.claim_ids.flatMap((claimId) => {
    const claim = content.claims.find((item) => item.id === claimId);
    return claim ? [claim] : [];
  });

  return (
    <main className="page-shell interior-page lesson-page">
      <header className="lesson-hero">
        <div className="lesson-hero__number">S{lesson.number}</div>
        <div>
          <span className="eyebrow">FOUNDATIONS · IMPLEMENTED</span>
          <h1><LocalizedText zh={lesson.title["zh-CN"]} en={lesson.title.en} /></h1>
          <p><LocalizedText zh={lesson.summary["zh-CN"]} en={lesson.summary.en} /></p>
          <div className="tag-row">{lesson.mechanism_ids.map((id) => <span key={id}>{id}</span>)}</div>
          <div className="lesson-hero__facts" aria-label="Lesson facts">
            <span><strong>{lesson.estimated_minutes}</strong> <LocalizedText zh="分钟" en="min" /></span>
            <span><strong>{sourceLines}</strong> <LocalizedText zh="行示例代码" en="source lines" /></span>
            <span><strong>0</strong> <LocalizedText zh="个 API Key" en="API keys" /></span>
          </div>
        </div>
      </header>
      <nav className="lesson-jump-nav" aria-label="Lesson sections">
        <a href="#change-contract"><span>01</span><LocalizedText zh="本章增量" en="What changed" /></a>
        <a href="#learn"><span>02</span><LocalizedText zh="学习目标" en="Learn" /></a>
        <a href="#mental-model"><span>03</span><LocalizedText zh="心智模型" en="Mental model" /></a>
        <a href="#build"><span>04</span><LocalizedText zh="逐步构建" en="Build" /></a>
        <a href="#run"><span>05</span><LocalizedText zh="运行观察" en="Run" /></a>
        <a href="#deep-dive"><span>06</span><LocalizedText zh="深入研究" en="Deep dive" /></a>
        <a href="#agent-bridge"><span>07</span><LocalizedText zh="Agent 对照" en="Agent bridge" /></a>
        <a href="#golden-trace"><span>08</span><LocalizedText zh="Golden Trace" en="Golden Trace" /></a>
        <a href="#exercise-checks"><span>09</span><LocalizedText zh="验收练习" en="Checks" /></a>
        <a href="#source"><span>10</span><LocalizedText zh="完整源码" en="Source" /></a>
      </nav>
      <section className="lesson-contract" id="change-contract">
        <div className="lesson-contract__header">
          <span className="eyebrow">CHAPTER DIFF · EXECUTABLE CONTRACT</span>
          <h2><LocalizedText zh="这一章究竟新增了什么？" en="What exactly changes in this chapter?" /></h2>
          <p><LocalizedText zh={lesson.change_contract.summary["zh-CN"]} en={lesson.change_contract.summary.en} /></p>
        </div>
        <div className="lesson-contract__grid">
          <article>
            <span><LocalizedText zh="相对基线" en="Compared with" /></span>
            <strong>{previous ? `S${previous.number} · ${previous.title.en}` : <LocalizedText zh="从零开始" en="Zero baseline" />}</strong>
          </article>
          <article>
            <span><LocalizedText zh="新增能力" en="Added capabilities" /></span>
            <ul>{lesson.change_contract.adds.map((item, index) => <li key={index}><LocalizedText zh={item["zh-CN"]} en={item.en} /></li>)}</ul>
          </article>
          <article>
            <span><LocalizedText zh="保持不变" en="Preserved invariants" /></span>
            <ul>{lesson.change_contract.preserves.map((item, index) => <li key={index}><LocalizedText zh={item["zh-CN"]} en={item.en} /></li>)}</ul>
          </article>
        </div>
      </section>
      <div className="article-layout">
        <aside className="article-aside">
          <span className="eyebrow"><LocalizedText zh="本地运行" en="RUN LOCALLY" /></span>
          <code>{lesson.run}</code>
          <p><LocalizedText zh="Python 3.11+ · 标准库 · 无网络" en="Python 3.11+ · standard library · offline" /></p>
          <dl>
            <div><dt><LocalizedText zh="难度" en="Difficulty" /></dt><dd>{lesson.difficulty}</dd></div>
            <div><dt><LocalizedText zh="阅读" en="Reading" /></dt><dd>{lesson.estimated_minutes} min</dd></div>
            <div><dt><LocalizedText zh="代码" en="Code" /></dt><dd>{sourceLines} LOC</dd></div>
          </dl>
          <Link href={`/lab/traces/${lesson.golden_trace.run_id}`}><LocalizedText zh="打开本章 Golden Trace" en="Open this lesson's Golden Trace" /> →</Link>
          <a href={sourceUrl} target="_blank" rel="noreferrer"><LocalizedText zh="在 GitHub 查看源码" en="View source on GitHub" /> ↗</a>
        </aside>
        <BilingualArticle zh={lesson.content["zh-CN"]} en={lesson.content.en} />
      </div>
      <section className="lesson-agent-bridge" id="agent-bridge">
        <div className="lesson-section-heading">
          <span className="eyebrow">REFERENCE HARNESS → REAL AGENTS</span>
          <h2><LocalizedText zh="教学实现如何映射到真实 Agent？" en="How does the teaching harness map to real agents?" /></h2>
          <p><LocalizedText zh={lesson.agent_bridge.notes["zh-CN"]} en={lesson.agent_bridge.notes.en} /></p>
          <span className={`relationship-badge relationship-badge--${lesson.agent_bridge.relationship}`}>{lesson.agent_bridge.relationship}</span>
        </div>
        {bridgeClaims.length ? (
          <div className="lesson-agent-grid">
            {bridgeClaims.map((claim) => {
              const agent = findAgent(claim.agent_id);
              const mechanism = findMechanism(claim.mechanism_id);
              return (
                <Link href={`/agents/${claim.agent_id}/${claim.snapshot_id}#${claim.id}`} key={claim.id}>
                  <span>{agent?.name ?? claim.agent_id} · {mechanism?.title ?? claim.mechanism_id}</span>
                  <strong>{claim.id}</strong>
                  <p><LocalizedText zh={claimText(claim, "zh-CN")} en={claimText(claim, "en")} /></p>
                  <small>{claim.evidence.map((item) => item.type).join(" + ")} · {claim.status}</small>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="lesson-evidence-gap">
            <strong><LocalizedText zh="已知未知项" en="KNOWN EVIDENCE GAP" /></strong>
            <p><LocalizedText zh="本章保留教学实现，但不会在缺少审核 Claim 时替真实 Agent 补写内部设计。" en="The teaching implementation remains useful, but the project will not invent real-agent internals without a reviewed claim." /></p>
          </div>
        )}
      </section>
      {goldenTrace && (
        <div className="lesson-golden-trace" id="golden-trace">
          <TracePlayer
            events={goldenTrace.events}
            eyebrow={`GOLDEN TRACE · S${lesson.number} · ${goldenTrace.events.length} EVENTS`}
            title="本章真实运行，逐事件复核"
            titleEn="Replay this lesson's real run, event by event"
            downloadHref={lesson.golden_trace.download_path}
          />
          <div className="golden-trace-contract">
            <span><LocalizedText zh="重点事件" en="FOCUS EVENTS" /></span>
            <div className="tag-row">{lesson.golden_trace.focus_event_types.map((type) => <code key={type}>{type}</code>)}</div>
            <Link href={`/lab/traces/${lesson.golden_trace.run_id}`}><LocalizedText zh="打开完整 Trace 证据页" en="Open the full trace evidence page" /> →</Link>
          </div>
        </div>
      )}
      <section className="lesson-exercise-checks" id="exercise-checks">
        <div className="lesson-section-heading">
          <span className="eyebrow">EXERCISES · ACCEPTANCE FIRST</span>
          <h2><LocalizedText zh="不是“试试看”，而是明确通过什么。" en="Not just “try it”: know exactly what passes." /></h2>
          <p><LocalizedText zh="长文中的开放练习保留探索空间；下面两条命令负责守住本章的可执行基线。" en="The long-form exercises leave room to explore; these commands protect the chapter's executable baseline." /></p>
        </div>
        <div className="exercise-check-grid">
          {lesson.exercise_checks.map((check, index) => (
            <article key={check.id}>
              <div><span>{String(index + 1).padStart(2, "0")}</span><span>{check.level}</span></div>
              <h3><LocalizedText zh={check.title["zh-CN"]} en={check.title.en} /></h3>
              <p><LocalizedText zh={check.acceptance["zh-CN"]} en={check.acceptance.en} /></p>
              <code role="region" aria-label="验收命令 / acceptance command" tabIndex={0}>{check.command}</code>
            </article>
          ))}
        </div>
      </section>
      <section className="lesson-source" id="source">
        <div>
          <span className="eyebrow"><LocalizedText zh="可运行源码" en="RUNNABLE SOURCE" /></span>
          <h2><LocalizedText zh="不是伪代码：这就是本章实际运行的程序。" en="Not pseudocode: this is the program the lesson actually runs." /></h2>
          <p><LocalizedText zh="教程中的每个关键步骤都能回到这份源码和自动化测试核对。" en="Every important step in the tutorial can be checked against this source and its automated tests." /></p>
        </div>
        <pre data-language="python"><code>{lesson.source_code}</code></pre>
        <a className="text-link" href={sourceUrl} target="_blank" rel="noreferrer"><LocalizedText zh="在 GitHub 打开文件" en="Open the file on GitHub" /> ↗</a>
      </section>
      <nav className="lesson-pagination" aria-label="Adjacent lessons">
        {previous ? <Link href={`/learn/${previous.slug}`}><span>← <LocalizedText zh="上一章" en="PREVIOUS" /></span><strong>S{previous.number} · <LocalizedText zh={previous.title["zh-CN"]} en={previous.title.en} /></strong></Link> : <span />}
        {next ? <Link href={`/learn/${next.slug}`}><span><LocalizedText zh="下一章" en="NEXT" /> →</span><strong>S{next.number} · <LocalizedText zh={next.title["zh-CN"]} en={next.title.en} /></strong></Link> : <Link href="/mechanisms/agent-loop"><span><LocalizedText zh="下一步" en="NEXT" /> →</span><strong>Agent Loop Mechanism</strong></Link>}
      </nav>
    </main>
  );
}
