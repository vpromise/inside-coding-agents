import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalizedText } from "../../../components/LocaleProvider";
import { TracePlayer } from "../../../components/TracePlayer";
import {
  findAgent,
  findExperiment,
  findTrace,
  localize,
  content,
} from "../../../lib/content";

export function generateStaticParams() {
  return content.traces.map((trace) => ({ trace: trace.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trace: string }>;
}): Promise<Metadata> {
  const { trace: traceId } = await params;
  const trace = findTrace(traceId);
  return trace
    ? {
        title: `${localize(trace.title)} · Trace Lab`,
        description: `逐事件回放 ${trace.id}，并检查其 provenance 与证据边界。`,
      }
    : {};
}

export default async function TraceLabPage({
  params,
}: {
  params: Promise<{ trace: string }>;
}) {
  const { trace: traceId } = await params;
  const trace = findTrace(traceId);
  if (!trace) notFound();
  const events = trace.events;
  const provenance = events[0]?.provenance ?? { run_id: "missing" };
  const experiment = trace.experiment_id ? findExperiment(trace.experiment_id) : undefined;
  const subject = experiment?.subjects[0];
  const agent = subject ? findAgent(subject.agent_id) : undefined;
  const synthetic = trace.kind === "synthetic";

  return (
    <main className="page-shell interior-page trace-lab-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">
          LAB · {trace.kind.toUpperCase()} · {synthetic ? "FORMAT FIXTURE" : "REPRODUCED RUN"}
        </span>
        <h1><LocalizedText zh={localize(trace.title, "zh-CN")} en={localize(trace.title, "en")} /></h1>
        <p>
          {synthetic
            ? <LocalizedText zh="这是用于验证 Trace Schema 和播放器的合成样例，不代表任何真实 Agent 的性能或内部实现。" en="This synthetic fixture validates the trace schema and player; it does not represent any real agent's performance or internal implementation." />
            : <LocalizedText zh={`这是 ${agent?.name ?? subject?.agent_id ?? "controlled subject"} 的受控实验产物；它证明公开 runner 链路可复现，不代表任何厂商 Agent 的 Native 行为。`} en={`This is a controlled experiment artifact for ${agent?.name ?? subject?.agent_id ?? "the controlled subject"}. It demonstrates the public runner pipeline, not any vendor agent's native behavior.`} />}
        </p>
        <div className="tag-row">
          <span>{String(provenance.run_id)}</span>
          <span>{events.length} events</span>
          <span>{events[0]?.redaction.status ?? "unknown"}</span>
        </div>
      </header>

      <TracePlayer
        events={events}
        eyebrow={`TRACE 0.1 · ${trace.kind.toUpperCase()}`}
        title={synthetic ? "格式样例，逐事件拆开" : "一次正式实验运行，逐事件回放"}
        titleEn={synthetic ? "A format fixture, event by event" : "A formal experiment run, event by event"}
        downloadHref={trace.download_path}
      />

      <section className="run-manifest">
        <div><span>HARNESS MODE</span><strong>{String(provenance.harness_mode ?? trace.kind)}</strong></div>
        <div><span>MODEL</span><strong>{String(provenance.model ?? "unknown")}</strong></div>
        <div><span>NETWORK</span><strong>{experiment?.controls?.network === false ? "off" : "not recorded"}</strong></div>
        <div><span>COMPARABILITY</span><strong>{subject?.comparison_status ?? "synthetic only"}</strong></div>
      </section>

      <section className="lab-notes">
        <div>
          <span className="eyebrow">WHAT THIS PROVES</span>
          <p>
            {synthetic
              ? <LocalizedText zh="事件 Schema、sequence、parent relationship、tool request/result 往返和下载路径可以端到端工作。" en="The event schema, sequence, parent relationship, tool request/result roundtrip, and download path work end to end." />
              : <LocalizedText zh="固定 fixture 和 prompt 可以通过公开 runner 产生结构化 Result、有效 Trace、相同规范化指纹与可下载网页回放。" en="A fixed fixture and prompt can produce a structured result, valid trace, identical normalized fingerprint, and downloadable replay through the public runner." />}
          </p>
        </div>
        <div>
          <span className="eyebrow">WHAT IT DOES NOT PROVE</span>
          <p>
            {synthetic
              ? <LocalizedText zh="真实模型质量、Agent 内部状态、sandbox 强度、成本、延迟或跨 Agent 优劣。" en="Real model quality, agent internals, sandbox strength, cost, latency, or cross-agent superiority." />
              : <LocalizedText zh="真实模型能力、Vendor Agent 行为、OS sandbox 强度、性能成本或跨 Agent 排名。" en="Real model capability, vendor agent behavior, OS sandbox strength, performance cost, or cross-agent ranking." />}
          </p>
        </div>
      </section>
      <Link
        className="text-link"
        href={experiment ? `/lab/experiments/${experiment.id}` : "/lab"}
      >
        <LocalizedText zh={experiment ? "查看完整实验记录" : "回到 Lab"} en={experiment ? "View full experiment record" : "Back to Lab"} /> <span>→</span>
      </Link>
    </main>
  );
}
