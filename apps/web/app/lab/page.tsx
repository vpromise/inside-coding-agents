import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "../components/LocaleProvider";
import { content, findAgent, localize } from "../lib/content";

export const metadata: Metadata = {
  title: "Lab · 可复现实验",
  description: "从固定 fixture、实验记录和结构化结果进入逐事件 Trace 回放。",
};

export default function LabPage() {
  const formalTraces = content.traces.filter((trace) => trace.experiment_id);
  const passedExperiments = content.experiments.filter(
    (experiment) => experiment.result?.status === "passed",
  );

  return (
    <main className="page-shell interior-page">
      <header className="interior-hero">
        <span className="eyebrow">LAB · FIXTURE → RUNNER → RESULT → TRACE</span>
        <h1><LocalizedText zh="从“可以运行”到“可以复现”。" en="From runnable to reproducible." /></h1>
        <p>
          <LocalizedText zh="每项正式实验先固定问题、输入、subject 和证据边界，再发布结构化结果与脱敏 Trace。合成格式样例与真实实验记录始终分开显示。" en="Every formal experiment pins its question, inputs, subject, and evidence boundary before publishing structured results and redacted traces. Synthetic format fixtures remain separate from experiment records." />
        </p>
        <div className="metric-row">
          <span><strong>{content.experiments.length}</strong> formal experiments</span>
          <span><strong>{passedExperiments.length}</strong> passed</span>
          <span><strong>{formalTraces.length}</strong> reproduced traces</span>
        </div>
      </header>

      <section className="lab-section">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow">EXPERIMENT LEDGER</span><h2><LocalizedText zh="先看研究设计，再看结果。" en="Read the design before the result." /></h2></div>
          <p><LocalizedText zh="Controlled 只能证明受控边界内的行为；Native、Controlled 与 Adversarial 不混为同一种证据。" en="Controlled experiments support behavior only within their controls; Native, Controlled, and Adversarial evidence are never conflated." /></p>
        </div>
        {content.experiments.length ? (
          <div className="experiment-grid">
            {content.experiments.map((experiment) => {
              const subject = experiment.subjects[0];
              const agent = findAgent(subject.agent_id);
              return (
                <article className="experiment-card" key={experiment.id}>
                  <div className="experiment-card__top">
                    <span>{experiment.mode.toUpperCase()}</span>
                    <strong className={`result-badge result-badge--${experiment.result?.status ?? experiment.status}`}>
                      {experiment.result?.status ?? experiment.status}
                    </strong>
                  </div>
                  <h2>{experiment.title}</h2>
                  <p>{experiment.question}</p>
                  <dl className="compact-facts">
                    <div><dt>Subject</dt><dd>{agent?.name ?? subject.agent_id}</dd></div>
                    <div><dt>Runs</dt><dd>{experiment.result?.summary.total_runs ?? experiment.repetitions}</dd></div>
                    <div><dt>Model</dt><dd>{subject.model}</dd></div>
                    <div><dt>Compare</dt><dd>{subject.comparison_status}</dd></div>
                  </dl>
                  <Link className="text-link" href={`/lab/experiments/${experiment.id}`}>
                    <LocalizedText zh="检查实验记录" en="Inspect experiment" /> <span>→</span>
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state"><strong>No formal experiments</strong><p><LocalizedText zh="Registry 中尚无可发布实验。" en="The Registry has no publishable experiments yet." /></p></div>
        )}
      </section>

      <section className="lab-section trace-ledger">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow">TRACE LEDGER</span><h2><LocalizedText zh="每次运行都有独立证据边界。" en="Every run has its own evidence boundary." /></h2></div>
          <p><LocalizedText zh="Format fixture 只测试数据格式；Reproduced run 才绑定正式 Experiment 与 Result。" en="A format fixture tests the data shape; only a reproduced run binds a formal experiment and result." /></p>
        </div>
        <div className="trace-ledger__list">
          {content.traces.map((trace) => (
            <Link href={`/lab/traces/${trace.id}`} key={trace.id}>
              <span className={`trace-kind trace-kind--${trace.kind}`}>{trace.kind}</span>
              <div><strong><LocalizedText zh={localize(trace.title, "zh-CN")} en={localize(trace.title, "en")} /></strong><small>{trace.id}</small></div>
              <span>{trace.events.length} events</span>
              <i aria-hidden="true">↗</i>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
