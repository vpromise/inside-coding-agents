import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "../components/LocaleProvider";
import { content } from "../lib/content";

export const metadata: Metadata = {
  title: "Mechanism Atlas",
  description: "按共同设计问题理解不同 coding-agent harness 的选择与证据。",
};

export default function MechanismsPage() {
  const categories = [...new Set(content.mechanisms.map((mechanism) => mechanism.category))];
  return (
    <main className="page-shell interior-page">
      <header className="interior-hero">
        <span className="eyebrow">MECHANISM ATLAS · BRAND-NEUTRAL</span>
        <h1><LocalizedText zh="先对齐问题，" en="Align the questions" /><br /><LocalizedText zh="再比较答案。" en="before comparing answers." /></h1>
        <p><LocalizedText zh="Mechanism 是课程、Agent snapshot、Claim 和 Experiment 的连接点。缺少证据的实现不会因为界面相似就被写成相同设计。" en="Mechanisms connect lessons, agent snapshots, claims, and experiments. Similar interfaces are not treated as identical designs without evidence." /></p>
        <div className="metric-row">
          <span><strong>{content.mechanisms.length}</strong> mechanisms</span>
          <span><strong>{categories.length}</strong> categories</span>
          <span><strong>{content.claims.length}</strong> claims</span>
          <span><strong>{content.experiments.length}</strong> experiments</span>
        </div>
      </header>

      <section className="mechanism-index" aria-label="Mechanism list">
        {content.mechanisms.map((mechanism) => (
          <article className="mechanism-index__item" key={mechanism.id}>
            <div><span>{mechanism.category}</span><span>{mechanism.status}</span></div>
            <h2>{mechanism.title}</h2>
            <p>{mechanism.summary}</p>
            <div className="tag-row">
              <span>{mechanism.reference_lessons.length} lessons</span>
              <span>{mechanism.agent_implementations.length} snapshots</span>
              <span>{mechanism.experiments.length} experiments</span>
            </div>
            <Link className="text-link" href={`/mechanisms/${mechanism.id}`}><LocalizedText zh="查看机制" en="View mechanism" /> <span>→</span></Link>
          </article>
        ))}
      </section>
    </main>
  );
}
