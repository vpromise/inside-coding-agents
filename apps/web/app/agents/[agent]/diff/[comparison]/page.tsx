import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalizedText } from "../../../../components/LocaleProvider";
import { claimText, content, findAgent, findMechanism } from "../../../../lib/content";
import { buildSnapshotDiff, snapshotPairs } from "../../../../lib/research";

export function generateStaticParams() {
  return content.agents.flatMap((agent) =>
    snapshotPairs(agent).map((pair) => ({ agent: agent.id, comparison: pair.id })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ agent: string; comparison: string }> }): Promise<Metadata> {
  const values = await params;
  const agent = findAgent(values.agent);
  const pair = agent ? snapshotPairs(agent).find((item) => item.id === values.comparison) : undefined;
  return agent && pair
    ? { title: `${agent.name} Snapshot Diff`, description: `Structural evidence diff from ${pair.from.id} to ${pair.to.id}.` }
    : {};
}

function MechanismList({ ids, empty }: { ids: string[]; empty: React.ReactNode }) {
  if (!ids.length) return <p>{empty}</p>;
  return <ul>{ids.map((id) => <li key={id}><Link href={`/mechanisms/${id}`}>{findMechanism(id)?.title ?? id}</Link></li>)}</ul>;
}

export default async function SnapshotDiffPage({ params }: { params: Promise<{ agent: string; comparison: string }> }) {
  const values = await params;
  const agent = findAgent(values.agent);
  if (!agent) notFound();
  const pair = snapshotPairs(agent).find((item) => item.id === values.comparison);
  if (!pair) notFound();
  const diff = buildSnapshotDiff(agent, pair.from, pair.to, content.claims);

  return (
    <main className="page-shell interior-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">SNAPSHOT DIFF · STRUCTURAL, NOT SEMANTIC</span>
        <h1>{agent.name}<br />Diff</h1>
        <p><LocalizedText
          zh="自动 Diff 只比较 Registry 中的机制集合、Claim、Source Map 和证据类型。没有人工审核记录时，系统不会把结构差异标成行为 changed。"
          en="The automatic diff compares only Registry mechanism sets, Claims, Source Maps, and evidence types. Without a reviewed change record, structural differences are never labeled as changed behavior."
        /></p>
      </header>

      <section className="diff-boundary">
        <strong>{diff.crossSurface ? "CROSS-SURFACE COMPARISON" : "SAME-SURFACE COMPARISON"}</strong>
        <p>{diff.sameObservationDate
          ? <LocalizedText zh="两条记录在同一天观察；这是证据边界比较，不是先后发布顺序。" en="Both records were observed on the same day. This compares evidence boundaries, not release chronology." />
          : <LocalizedText zh="日期提供观察顺序，但不自动证明上游因果或 breaking change。" en="Dates provide observation order but do not prove upstream causality or a breaking change." />}
        </p>
      </section>

      <section className="diff-heads">
        {[{ label: "FROM", snapshot: pair.from }, { label: "TO", snapshot: pair.to }].map(({ label, snapshot }) => (
          <article key={label}>
            <span>{label} · {snapshot.observed_at}</span>
            <h2>{snapshot.version}</h2>
            <code>{snapshot.id}</code>
            <dl><div><dt>Surface</dt><dd>{snapshot.surface}</dd></div><div><dt>Freshness</dt><dd>{snapshot.freshness}</dd></div></dl>
            <Link href={`/agents/${agent.id}/${snapshot.id}`}><LocalizedText zh="打开 Snapshot" en="Open snapshot" /> →</Link>
          </article>
        ))}
      </section>

      <section className="diff-classifications">
        <article className="diff-classification diff-classification--added">
          <span>ADDED · STRUCTURAL</span><strong>{diff.addedMechanisms.length}</strong>
          <h2><LocalizedText zh="新增机制记录" en="Added mechanism records" /></h2>
          <MechanismList ids={diff.addedMechanisms} empty={<LocalizedText zh="没有新增机制记录。" en="No mechanism records were added." />} />
        </article>
        <article className="diff-classification diff-classification--removed">
          <span>REMOVED · STRUCTURAL</span><strong>{diff.removedMechanisms.length}</strong>
          <h2><LocalizedText zh="移出当前证据边界" en="Removed from this evidence boundary" /></h2>
          <MechanismList ids={diff.removedMechanisms} empty={<LocalizedText zh="没有移出的机制记录。" en="No mechanism records were removed." />} />
        </article>
        <article className="diff-classification diff-classification--evidence">
          <span>EVIDENCE-ONLY CANDIDATE</span><strong>{diff.evidenceShiftMechanisms.length}</strong>
          <h2><LocalizedText zh="证据类型发生迁移" en="Evidence type shifted" /></h2>
          <MechanismList ids={diff.evidenceShiftMechanisms} empty={<LocalizedText zh="共同机制没有证据类型迁移。" en="No evidence-type shift exists on retained mechanisms." />} />
        </article>
        <article className="diff-classification diff-classification--changed">
          <span>CHANGED · REVIEW REQUIRED</span><strong>—</strong>
          <h2><LocalizedText zh="行为变化不自动推断" en="Behavior change is not inferred" /></h2>
          <p><LocalizedText zh="需要独立、人工审核的 diff 记录后才能标为 changed。" en="A separate human-reviewed diff record is required before labeling behavior as changed." /></p>
        </article>
      </section>

      <section className="source-diff">
        <div className="section-heading section-heading--split"><div><span className="eyebrow">SOURCE MAP DIFF</span><h2><LocalizedText zh="路径变化" en="Path changes" /></h2></div><p><LocalizedText zh="路径变化只说明取证范围变化，不说明文件功能发生变化。" en="Path changes describe the inspection boundary, not a change in file behavior." /></p></div>
        <div>
          <article><span>+ {diff.addedSourcePaths.length} paths</span><ul>{diff.addedSourcePaths.map((path) => <li key={path}><code>{path}</code></li>)}</ul>{!diff.addedSourcePaths.length && <p>None</p>}</article>
          <article><span>− {diff.removedSourcePaths.length} paths</span><ul>{diff.removedSourcePaths.map((path) => <li key={path}><code>{path}</code></li>)}</ul>{!diff.removedSourcePaths.length && <p>None</p>}</article>
        </div>
      </section>

      <section className="diff-claim-ledger">
        <div className="section-heading"><span className="eyebrow">CLAIM RECORD SETS</span><h2><LocalizedText zh="两侧原子结论" en="Atomic claims on both sides" /></h2></div>
        <div>
          {[{ label: "FROM", claims: diff.removedClaims }, { label: "TO", claims: diff.addedClaims }].map((group) => (
            <article key={group.label}>
              <span>{group.label} · {group.claims.length} claims</span>
              {group.claims.map((claim) => (
                <Link href={`/agents/${agent.id}/${claim.snapshot_id}#${claim.id}`} key={claim.id}>
                  <code>{claim.mechanism_id}</code><strong><LocalizedText zh={claimText(claim, "zh-CN")} en={claimText(claim, "en")} /></strong>
                </Link>
              ))}
            </article>
          ))}
        </div>
      </section>

      <div className="hero-inline-links">
        <Link className="text-link" href={`/agents/${agent.id}/timeline`}><LocalizedText zh="返回 Timeline" en="Back to Timeline" /> →</Link>
        <Link className="text-link" href="/evidence"><LocalizedText zh="打开 Evidence Explorer" en="Open Evidence Explorer" /> →</Link>
      </div>
    </main>
  );
}
