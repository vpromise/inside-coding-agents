import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "../components/LocaleProvider";
import { content } from "../lib/content";

export const metadata: Metadata = {
  title: "学习路线 / Learning Path",
  description: "无需 API Key，从最小循环逐步构建 Agent Harness。 Build an agent harness from the smallest loop.",
};

export default function LearnPage() {
  const lessons = content.curriculum.lessons;
  return (
    <main className="page-shell interior-page">
      <header className="interior-hero">
        <span className="eyebrow">ACADEMY · FOUNDATIONS</span>
        <h1><LocalizedText zh="从 40 行循环，走到" en="From a 40-line loop to" /><br /><LocalizedText zh="可观察的工具型 Agent。" en="an observable tool-using agent." /></h1>
        <p><LocalizedText zh="六章共用一个无依赖 Python reference harness。每章只增加一个机制，并保留失败路径、验收条件和规范化 Trace。" en="Six lessons share one dependency-free Python reference harness. Each adds one mechanism while preserving failure paths, acceptance criteria, and normalized traces." /></p>
        <div className="metric-row">
          <span><strong>6</strong> <LocalizedText zh="课程" en="lessons" /></span>
          <span><strong>8</strong> <LocalizedText zh="测试" en="tests" /></span>
          <span><strong>0</strong> API keys</span>
          <span><strong>2</strong> <LocalizedText zh="语言" en="languages" /></span>
        </div>
      </header>

      <section className="learning-path" aria-label="Course list">
        {lessons.map((lesson, index) => (
          <article className="learning-card" id={lesson.id} key={lesson.id}>
            <div className="learning-card__rail">
              <span>S{lesson.number}</span>
              <i aria-hidden="true" />
            </div>
            <div className="learning-card__body">
              <div className="learning-card__top">
                <span>FOUNDATIONS · {String(index + 1).padStart(2, "0")}</span>
                <span className="implemented-badge"><LocalizedText zh="已实现" en="IMPLEMENTED" /></span>
              </div>
              <h2><LocalizedText zh={lesson.title["zh-CN"]} en={lesson.title.en} /></h2>
              <p><LocalizedText zh={lesson.summary["zh-CN"]} en={lesson.summary.en} /></p>
              <div className="tag-row">
                {lesson.mechanism_ids.map((id) => <span key={id}>{id}</span>)}
              </div>
              <code className="run-command">{lesson.run}</code>
              <Link className="text-link" href={`/learn/${lesson.slug}`}><LocalizedText zh="进入本章" en="Open lesson" /> <span>→</span></Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
