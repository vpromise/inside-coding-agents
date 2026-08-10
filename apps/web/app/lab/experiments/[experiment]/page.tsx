import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalizedText } from "../../../components/LocaleProvider";
import { MarkdownArticle } from "../../../components/MarkdownArticle";
import {
  content,
  findAgent,
  findExperiment,
  findTrace,
} from "../../../lib/content";

export function generateStaticParams() {
  return content.experiments.map((experiment) => ({ experiment: experiment.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ experiment: string }>;
}): Promise<Metadata> {
  const { experiment: experimentId } = await params;
  const experiment = findExperiment(experimentId);
  return experiment
    ? { title: `${experiment.title} · Lab`, description: experiment.question }
    : {};
}

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ experiment: string }>;
}) {
  const { experiment: experimentId } = await params;
  const experiment = findExperiment(experimentId);
  if (!experiment) notFound();
  const result = experiment.result;

  return (
    <main className="page-shell interior-page experiment-page">
      <header className="interior-hero interior-hero--compact">
        <span className="eyebrow">
          EXPERIMENT · {experiment.mode.toUpperCase()} · {result?.status.toUpperCase() ?? experiment.status.toUpperCase()}
        </span>
        <h1>{experiment.title}</h1>
        <p>{experiment.question}</p>
        <div className="tag-row">
          <span>{experiment.id}</span>
          <span>{experiment.repetitions} repetitions</span>
          <span>{experiment.metrics.length} metrics</span>
        </div>
      </header>

      <section className="evidence-boundary-banner">
        <strong>Evidence boundary</strong>
        <p>
          <LocalizedText
            zh={`这是 ${experiment.mode} 实验。它只能支持所列 subject、fixture、配置与输出，不能自动推广到 Native 产品行为或跨 Agent 优劣。`}
            en={`This is a ${experiment.mode} experiment. It supports only the listed subjects, fixture, configuration, and outputs; it does not generalize to native product behavior or cross-agent ranking.`}
          />
        </p>
      </section>

      {result ? (
        <section className="experiment-summary" aria-label="Experiment result summary">
          <div><span>STATUS</span><strong>{result.status}</strong></div>
          <div><span>SUCCESSFUL</span><strong>{result.summary.successful_runs}/{result.summary.total_runs}</strong></div>
          <div><span>FIXTURE</span><code>{result.fixture_sha256.slice(0, 12)}</code></div>
          <div><span>PROMPT</span><code>{result.prompt_sha256.slice(0, 12)}</code></div>
        </section>
      ) : (
        <div className="empty-state"><strong>Result pending</strong><p><LocalizedText zh="实验记录存在，但结果尚未发布。" en="The experiment record exists, but its result has not been published." /></p></div>
      )}

      <section className="experiment-section">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow">SUBJECTS + CONTROLS</span><h2><LocalizedText zh="哪些变量被固定？" en="Which variables are fixed?" /></h2></div>
          <p>{experiment.hypothesis ?? "No hypothesis was declared."}</p>
        </div>
        <div className="subject-grid">
          {experiment.subjects.map((subject) => {
            const agent = findAgent(subject.agent_id);
            return (
              <article key={`${subject.agent_id}-${subject.snapshot_id}`}>
                <span>{subject.surface.toUpperCase()}</span>
                <h3>{agent?.name ?? subject.agent_id}</h3>
                <p><code>{subject.snapshot_id}</code></p>
                <dl>
                  <div><dt>Model</dt><dd>{subject.model}</dd></div>
                  <div><dt>Provider</dt><dd>{subject.provider ?? "unknown"}</dd></div>
                  <div><dt>Comparability</dt><dd>{subject.comparison_status}</dd></div>
                </dl>
                <Link href={`/agents/${subject.agent_id}/${subject.snapshot_id}`}><LocalizedText zh="检查 Snapshot" en="Inspect snapshot" /> →</Link>
              </article>
            );
          })}
          <article className="control-card">
            <span>CONTROLS</span>
            <h3>Run manifest</h3>
            <dl>
              {Object.entries(experiment.controls ?? {}).map(([name, value]) => (
                <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>
              ))}
            </dl>
          </article>
        </div>
      </section>

      {result && (
        <section className="experiment-section">
          <div className="section-heading section-heading--split">
            <div><span className="eyebrow">RUNS + METRICS</span><h2><LocalizedText zh="重复运行是否一致？" en="Are repeated runs consistent?" /></h2></div>
            <code className="run-command" role="region" aria-label="实验运行命令 / experiment runner command" tabIndex={0}>{result.runner.command}</code>
          </div>
          <div className="run-result-grid">
            {result.runs.map((run) => {
              const trace = findTrace(run.run_id);
              return (
                <article key={run.run_id}>
                  <div><span>RUN {String(run.repetition).padStart(2, "0")}</span><strong>{run.status}</strong></div>
                  <h3>{run.run_id}</h3>
                  <ul>
                    {Object.entries(run.metrics).map(([metric, passed]) => (
                      <li key={metric}><span>{metric}</span><strong>{passed ? "pass" : "fail"}</strong></li>
                    ))}
                  </ul>
                  <code>{run.deterministic_fingerprint}</code>
                  {trace && <Link className="text-link" href={`/lab/traces/${trace.id}`}><LocalizedText zh={`回放 ${run.event_count} 个事件`} en={`Replay ${run.event_count} events`} /> <span>→</span></Link>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="experiment-section criteria-layout">
        <div>
          <span className="eyebrow">SUCCESS CRITERIA</span>
          <ol>
            {experiment.success_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
          </ol>
        </div>
        <div>
          <span className="eyebrow">LIMITATIONS</span>
          <ul>
            {experiment.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </div>
      </section>

      {experiment.report_content && (
        <section className="experiment-report">
          <span className="eyebrow">GENERATED REPORT</span>
          <MarkdownArticle source={experiment.report_content} />
        </section>
      )}

      <Link className="text-link" href="/lab"><LocalizedText zh="回到 Lab" en="Back to Lab" /> <span>→</span></Link>
    </main>
  );
}
