import type { Metadata } from "next";
import { ArchitectureCompare } from "../components/ArchitectureCompare";
import { LocalizedText } from "../components/LocaleProvider";
import { content } from "../lib/content";

export const metadata: Metadata = {
  title: "Architecture Compare",
  description: "Compare coding-agent harness mechanisms across versioned Agent snapshots and evidence boundaries.",
};

export default function ComparePage() {
  const asOf = new Date().toISOString().slice(0, 10);
  const mappedCells = content.mechanisms.reduce(
    (total, mechanism) => total + mechanism.agent_implementations.filter((item) => item.coverage !== "unknown").length,
    0,
  );

  return (
    <main className="page-shell interior-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">ARCHITECTURE COMPARE · MECHANISM-ALIGNED</span>
        <h1><LocalizedText zh="比较设计，" en="Compare designs," /><br /><LocalizedText zh="不比较品牌声量。" en="not brand volume." /></h1>
        <p><LocalizedText
          zh="将不同 Agent 的术语对齐到同一组 Harness 机制，并把每个单元格追溯到 snapshot、Claim 与 Evidence。"
          en="Align different Agent vocabularies to the same harness mechanisms, with every cell traceable to a snapshot, Claim, and Evidence record."
        /></p>
        <div className="metric-row">
          <span><strong>{content.agents.length}</strong> agents</span>
          <span><strong>{content.mechanisms.length}</strong> mechanisms</span>
          <span><strong>{mappedCells}</strong> mapped cells</span>
          <span><strong>{content.claims.length}</strong> claims</span>
        </div>
      </header>
      <ArchitectureCompare
        agents={content.agents}
        asOf={asOf}
        claims={content.claims}
        mechanisms={content.mechanisms}
      />
    </main>
  );
}
