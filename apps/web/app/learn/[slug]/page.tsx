import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BilingualArticle } from "../../components/BilingualArticle";
import { LocalizedText } from "../../components/LocaleProvider";
import { content } from "../../lib/content";

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
        <a href="#learn"><span>01</span><LocalizedText zh="学习目标" en="Learn" /></a>
        <a href="#mental-model"><span>02</span><LocalizedText zh="心智模型" en="Mental model" /></a>
        <a href="#build"><span>03</span><LocalizedText zh="逐步构建" en="Build" /></a>
        <a href="#run"><span>04</span><LocalizedText zh="运行观察" en="Run" /></a>
        <a href="#deep-dive"><span>05</span><LocalizedText zh="深入研究" en="Deep dive" /></a>
        <a href="#source"><span>06</span><LocalizedText zh="完整源码" en="Source" /></a>
      </nav>
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
          <Link href="/lab/traces/example-tool-roundtrip"><LocalizedText zh="打开代表性 Trace" en="Open a representative trace" /> →</Link>
          <a href={sourceUrl} target="_blank" rel="noreferrer"><LocalizedText zh="在 GitHub 查看源码" en="View source on GitHub" /> ↗</a>
        </aside>
        <BilingualArticle zh={lesson.content["zh-CN"]} en={lesson.content.en} />
      </div>
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
