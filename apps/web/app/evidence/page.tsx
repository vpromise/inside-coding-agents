import type { Metadata } from "next";
import { EvidenceExplorer } from "../components/EvidenceExplorer";
import { LocalizedText } from "../components/LocaleProvider";
import { content } from "../lib/content";

export const metadata: Metadata = {
  title: "Evidence Explorer",
  description: "Filter every coding-agent harness Claim by Agent, mechanism, evidence type, snapshot, and freshness.",
};

export default function EvidencePage() {
  const asOf = new Date().toISOString().slice(0, 10);
  const evidenceCount = content.claims.reduce((total, claim) => total + claim.evidence.length, 0);
  const sourceCount = content.claims.reduce(
    (total, claim) => total + claim.evidence.filter((item) => item.type === "source").length,
    0,
  );

  return (
    <main className="page-shell interior-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">EVIDENCE EXPLORER · CLAIM-LEVEL PROVENANCE</span>
        <h1><LocalizedText zh="每个结论，" en="Every conclusion" /><br /><LocalizedText zh="都能回到证据。" en="returns to evidence." /></h1>
        <p><LocalizedText
          zh="跨 Agent、Snapshot 与 Mechanism 检索原子 Claim。源码、官方文档、复现实验和推断始终使用不同标签。"
          en="Search atomic Claims across Agents, snapshots, and mechanisms. Source, official documentation, reproduced evidence, and inference always keep distinct labels."
        /></p>
        <div className="metric-row">
          <span><strong>{content.claims.length}</strong> claims</span>
          <span><strong>{evidenceCount}</strong> evidence records</span>
          <span><strong>{sourceCount}</strong> source records</span>
          <span><strong>90</strong> day freshness window</span>
        </div>
      </header>
      <EvidenceExplorer agents={content.agents} asOf={asOf} claims={content.claims} mechanisms={content.mechanisms} />
    </main>
  );
}
