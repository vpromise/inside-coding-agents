import type { Metadata } from "next";
import { LocalizedText } from "../components/LocaleProvider";
import { MechanismAtlas, type AtlasMechanism } from "../components/MechanismAtlas";
import { claimsForMechanism, content } from "../lib/content";

export const metadata: Metadata = {
  title: "Mechanism Atlas",
  description: "按共同设计问题理解不同 coding-agent harness 的选择与证据。",
};

export default function MechanismsPage() {
  const categories = [...new Set(content.mechanisms.map((mechanism) => mechanism.category))];
  const mechanisms: AtlasMechanism[] = content.mechanisms.map((mechanism) => ({
    id: mechanism.id,
    title: mechanism.title,
    summary: mechanism.summary,
    category: mechanism.category,
    status: mechanism.status,
    prerequisites: mechanism.prerequisites,
    dependents: content.mechanisms
      .filter((candidate) => candidate.prerequisites.includes(mechanism.id))
      .map((candidate) => candidate.id),
    lessonCount: mechanism.reference_lessons.length,
    snapshotCount: mechanism.agent_implementations.length,
    claimCount: claimsForMechanism(mechanism.id).length,
    experimentCount: mechanism.experiments.length,
    hasArticle: Boolean(mechanism.content["zh-CN"] && mechanism.content.en),
    layers: {
      L0: mechanism.reader_layer_status?.L0 ?? "missing",
      L1: mechanism.reader_layer_status?.L1 ?? "missing",
      L2: mechanism.reader_layer_status?.L2 ?? "missing",
      L3: mechanism.reader_layer_status?.L3 ?? "missing",
      L4: mechanism.reader_layer_status?.L4 ?? "missing",
    },
  }));
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

      <MechanismAtlas mechanisms={mechanisms} />
    </main>
  );
}
