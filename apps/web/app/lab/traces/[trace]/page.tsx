import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalizedText } from "../../../components/LocaleProvider";
import { TracePlayer } from "../../../components/TracePlayer";
import {
  findAgent,
  findExperiment,
  findLesson,
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
  const golden = trace.kind === "golden";
  const lesson = trace.lesson_id ? findLesson(trace.lesson_id) : undefined;

  return (
    <main className="page-shell interior-page trace-lab-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">
          LAB · {trace.kind.toUpperCase()} · {synthetic ? "FORMAT FIXTURE" : golden ? "COURSE CONTRACT" : "REPRODUCED RUN"}
        </span>
        <h1><LocalizedText zh={localize(trace.title, "zh-CN")} en={localize(trace.title, "en")} /></h1>
        <p>
          {synthetic
            ? <LocalizedText zh="这是用于验证 Trace Schema 和播放器的合成样例，不代表任何真实 Agent 的性能或内部实现。" en="This synthetic fixture validates the trace schema and player; it does not represent any real agent's performance or internal implementation." />
            : golden
              ? <LocalizedText zh={`这是 ${lesson ? `S${lesson.number} ${lesson.title["zh-CN"]}` : "课程"} 的确定性 Golden Trace：由本章可运行 demo 直接生成，并在测试中逐字节复核。`} en={`This is the deterministic Golden Trace for ${lesson ? `S${lesson.number} ${lesson.title.en}` : "the course"}. It is generated directly by the runnable demo and byte-verified in tests.`} />
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
        title={synthetic ? "格式样例，逐事件拆开" : golden ? "课程基线，逐事件复核" : "一次正式实验运行，逐事件回放"}
        titleEn={synthetic ? "A format fixture, event by event" : golden ? "Replay the course baseline, event by event" : "A formal experiment run, event by event"}
        downloadHref={trace.download_path}
      />

      <section className="run-manifest">
        <div><span>HARNESS MODE</span><strong>{String(provenance.harness_mode ?? trace.kind)}</strong></div>
        <div><span>MODEL</span><strong>{String(provenance.model ?? "unknown")}</strong></div>
        <div><span>NETWORK</span><strong>{experiment?.controls?.network === false ? "off" : "not recorded"}</strong></div>
        <div><span>COMPARABILITY</span><strong>{golden ? "reference only" : subject?.comparison_status ?? "synthetic only"}</strong></div>
      </section>

      <section className="lab-notes">
        <div>
          <span className="eyebrow">WHAT THIS PROVES</span>
          <p>
            {synthetic
              ? <LocalizedText zh="事件 Schema、sequence、parent relationship、tool request/result 往返和下载路径可以端到端工作。" en="The event schema, sequence, parent relationship, tool request/result roundtrip, and download path work end to end." />
              : golden
                ? <LocalizedText zh="本章 demo、课程数据合同、Trace Schema、下载产物和网页播放器来自同一次确定性运行。" en="The lesson demo, course data contract, trace schema, download artifact, and web player agree on one deterministic run." />
                : <LocalizedText zh="固定 fixture 和 prompt 可以通过公开 runner 产生结构化 Result、有效 Trace、相同规范化指纹与可下载网页回放。" en="A fixed fixture and prompt can produce a structured result, valid trace, identical normalized fingerprint, and downloadable replay through the public runner." />}
          </p>
        </div>
        <div>
          <span className="eyebrow">WHAT IT DOES NOT PROVE</span>
          <p>
            {synthetic
              ? <LocalizedText zh="真实模型质量、Agent 内部状态、sandbox 强度、成本、延迟或跨 Agent 优劣。" en="Real model quality, agent internals, sandbox strength, cost, latency, or cross-agent superiority." />
              : golden
                ? <LocalizedText zh="任何 Vendor Agent 的 Native 行为、模型质量、隐藏状态、性能成本或安全强度。" en="Any vendor agent's native behavior, model quality, hidden state, performance cost, or security strength." />
                : <LocalizedText zh="真实模型能力、Vendor Agent 行为、OS sandbox 强度、性能成本或跨 Agent 排名。" en="Real model capability, vendor agent behavior, OS sandbox strength, performance cost, or cross-agent ranking." />}
          </p>
        </div>
      </section>
      <Link
        className="text-link"
        href={experiment ? `/lab/experiments/${experiment.id}` : lesson ? `/learn/${lesson.slug}` : "/lab"}
      >
        <LocalizedText zh={experiment ? "查看完整实验记录" : lesson ? "回到课程" : "回到 Lab"} en={experiment ? "View full experiment record" : lesson ? "Back to lesson" : "Back to Lab"} /> <span>→</span>
      </Link>
    </main>
  );
}
