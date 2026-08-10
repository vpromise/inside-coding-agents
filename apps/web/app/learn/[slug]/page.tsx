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

  return (
    <main className="page-shell interior-page lesson-page">
      <header className="lesson-hero">
        <div className="lesson-hero__number">S{lesson.number}</div>
        <div>
          <span className="eyebrow">FOUNDATIONS · IMPLEMENTED</span>
          <h1><LocalizedText zh={lesson.title["zh-CN"]} en={lesson.title.en} /></h1>
          <p><LocalizedText zh={lesson.summary["zh-CN"]} en={lesson.summary.en} /></p>
          <div className="tag-row">{lesson.mechanism_ids.map((id) => <span key={id}>{id}</span>)}</div>
        </div>
      </header>
      <div className="article-layout">
        <aside className="article-aside">
          <span className="eyebrow"><LocalizedText zh="本地运行" en="RUN LOCALLY" /></span>
          <code>{lesson.run}</code>
          <p><LocalizedText zh="Python 3.11+ · 标准库 · 无网络" en="Python 3.11+ · standard library · offline" /></p>
          <Link href="/lab/traces/example-tool-roundtrip"><LocalizedText zh="打开代表性 Trace" en="Open a representative trace" /> →</Link>
        </aside>
        <BilingualArticle zh={lesson.content["zh-CN"]} en={lesson.content.en} />
      </div>
      <nav className="lesson-pagination" aria-label="Adjacent lessons">
        {previous ? <Link href={`/learn/${previous.slug}`}><span>← <LocalizedText zh="上一章" en="PREVIOUS" /></span><strong>S{previous.number} · <LocalizedText zh={previous.title["zh-CN"]} en={previous.title.en} /></strong></Link> : <span />}
        {next ? <Link href={`/learn/${next.slug}`}><span><LocalizedText zh="下一章" en="NEXT" /> →</span><strong>S{next.number} · <LocalizedText zh={next.title["zh-CN"]} en={next.title.en} /></strong></Link> : <Link href="/mechanisms/agent-loop"><span><LocalizedText zh="下一步" en="NEXT" /> →</span><strong>Agent Loop Mechanism</strong></Link>}
      </nav>
    </main>
  );
}
