import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "../components/LocaleProvider";
import { content } from "../lib/content";

const difficultyLabels = {
  beginner: "入门",
  intermediate: "进阶",
  advanced: "深入",
} as const;

export const metadata: Metadata = {
  title: "学习路线 / Learning Path",
  description: "无需 API Key，从最小循环逐步构建 Agent Harness。 Build an agent harness from the smallest loop.",
};

export default function LearnPage() {
  const lessons = content.curriculum.lessons;
  const exerciseCheckCount = lessons.reduce((total, lesson) => total + lesson.exercise_checks.length, 0);
  return (
    <main className="page-shell interior-page">
      <header className="interior-hero">
        <span className="eyebrow">ACADEMY · FOUNDATIONS</span>
        <h1><LocalizedText zh="从 40 行循环，走到" en="From a 40-line loop to" /><br /><LocalizedText zh="可观察的工具型 Agent。" en="an observable tool-using agent." /></h1>
        <p><LocalizedText zh={`${lessons.length} 篇长文教程共用一个无依赖 Python reference harness。每章从问题、心智模型和逐步实现讲到失败路径、练习与生产边界。`} en={`${lessons.length} long-form tutorials share one dependency-free Python reference harness. Each moves from the problem and mental model through implementation, failure paths, exercises, and production boundaries.`} /></p>
        <div className="metric-row">
          <span><strong>{lessons.length}</strong> <LocalizedText zh="课程" en="lessons" /></span>
          <span><strong>{lessons.length}</strong> Golden Traces</span>
          <span><strong>{exerciseCheckCount}</strong> <LocalizedText zh="验收命令" en="acceptance checks" /></span>
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
              <div className="learning-card__meta">
                <span>{lesson.estimated_minutes} MIN</span>
                <span><LocalizedText zh={difficultyLabels[lesson.difficulty]} en={lesson.difficulty} /></span>
                <span><LocalizedText zh="长文教程 · 完整源码" en="LONG-FORM · FULL SOURCE" /></span>
              </div>
              <div className="tag-row">
                {lesson.mechanism_ids.map((id) => <span key={id}>{id}</span>)}
              </div>
              <code className="run-command" role="region" aria-label="课程运行命令 / lesson run command" tabIndex={0}>{lesson.run}</code>
              <Link className="text-link" href={`/learn/${lesson.slug}`}><LocalizedText zh="进入本章" en="Open lesson" /> <span>→</span></Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
