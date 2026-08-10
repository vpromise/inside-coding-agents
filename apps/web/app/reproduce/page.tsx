import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "../components/LocaleProvider";
import { content } from "../lib/content";

export const metadata: Metadata = {
  title: "Reproduce · 独立复现实验",
  description:
    "Reproduce deterministic coding-agent harness experiments offline, verify their integrity, and submit a public-safe report.",
};

const publicGuideUrl =
  "https://github.com/vpromise/inside-coding-agents/blob/main/REPRODUCING.md";
const reproductionIssueUrl =
  "https://github.com/vpromise/inside-coding-agents/issues/new?template=experiment-reproduction.yml";

const experimentLabels: Record<string, { zh: string; en: string }> = {
  "reference-approval-binding-v1": {
    zh: "审批绑定",
    en: "Approval binding",
  },
  "reference-checkpoint-rollback-v1": {
    zh: "检查点与回滚",
    en: "Checkpoint and rollback",
  },
  "reference-context-budget-v1": {
    zh: "上下文预算与截断",
    en: "Context budget and truncation",
  },
  "reference-context-compaction-v1": {
    zh: "上下文压缩",
    en: "Context compaction",
  },
  "reference-memory-retrieval-v1": {
    zh: "记忆检索",
    en: "Memory retrieval",
  },
  "reference-project-trust-v1": {
    zh: "项目指令信任边界",
    en: "Project trust boundary",
  },
  "reference-sandbox-network-v1": {
    zh: "沙箱与网络策略",
    en: "Sandbox and network policy",
  },
  "reference-session-replay-v1": {
    zh: "会话回放与分支",
    en: "Session replay and branch",
  },
  "reference-stream-normalization-v1": {
    zh: "流式事件归一化",
    en: "Stream normalization",
  },
  "reference-tool-roundtrip-v1": {
    zh: "工具请求与结果闭环",
    en: "Tool request/result roundtrip",
  },
};

const steps = [
  {
    zh: "固定源码状态",
    en: "Pin the source state",
    detailZh: "使用公开仓库的完整 Git commit，并确认 tracked worktree 没有改动。",
    detailEn:
      "Use a full public Git commit and confirm that the tracked worktree is clean.",
  },
  {
    zh: "重建声明产物",
    en: "Rebuild declared artifacts",
    detailZh: "选择一个 Controlled 实验；脚本在内存中重建 Trace、Result 与 Report。",
    detailEn:
      "Choose one Controlled experiment; the script rebuilds its traces, result, and report in memory.",
  },
  {
    zh: "校验完整性",
    en: "Verify integrity",
    detailZh: "逐字节比较提交产物，并验证生成报告的 report_sha256。",
    detailEn:
      "Compare committed artifacts byte-for-byte and verify the generated report_sha256.",
  },
  {
    zh: "如实提交结果",
    en: "Submit the outcome as observed",
    detailZh: "保留 reproduced、failed 或 not-comparable，不把负结果改写成成功。",
    detailEn:
      "Keep reproduced, failed, or not-comparable exactly as observed; never rewrite a negative result as success.",
  },
];

const outcomes = [
  {
    id: "reproduced",
    zh: "干净、固定的源码准确重建了全部声明产物，可以进入人工提交审核。",
    en: "Clean, pinned source rebuilt every declared artifact exactly and is ready for human submission review.",
  },
  {
    id: "failed",
    zh: "运行具备可比性，但输入、执行或产物比较中至少一项失败；这个结果同样有价值。",
    en: "The run was comparable, but an input, execution, or artifact check failed; that result is still valuable.",
  },
  {
    id: "not-comparable",
    zh: "当前观察无法绑定到干净、固定的 Git 状态；先修复环境，不要提升证据等级。",
    en: "The observation could not bind to a clean, pinned Git state; fix the environment without raising the evidence level.",
  },
];

export default function ReproducePage() {
  const reproducibleExperiments = content.experiments.filter(
    (experiment) =>
      experiment.mode === "controlled" &&
      experiment.status === "complete" &&
      experiment.subjects.length === 1 &&
      experiment.subjects[0].agent_id === "reference-harness",
  );

  return (
    <main className="page-shell interior-page reproduce-page">
      <header className="interior-hero reproduce-hero">
        <div>
          <span className="eyebrow">REPRODUCE · OFFLINE · PUBLIC-SAFE</span>
          <h1>
            <span><LocalizedText zh="不要只相信结果，" en="Do not merely trust the result." /></span>{" "}
            <span><LocalizedText zh="亲手重建一次。" en="Rebuild it yourself." /></span>
          </h1>
          <p>
            <LocalizedText
              zh="从一个干净的公开仓库 checkout 出发，用 Python 标准库离线重建确定性实验，逐字节核对已提交产物，再生成可公开检查的复现报告。"
              en="Start from a clean public-repository checkout, rebuild a deterministic experiment offline with the Python standard library, compare every committed artifact byte-for-byte, and emit a public-reviewable reproduction report."
            />
          </p>
          <div className="reproduce-actions">
            <a className="button button--primary" href={publicGuideUrl} rel="noreferrer" target="_blank">
              <LocalizedText zh="打开完整指南" en="Open the full guide" /> <span aria-hidden="true">↗</span>
            </a>
            <a className="button button--ghost" href={reproductionIssueUrl} rel="noreferrer" target="_blank">
              <LocalizedText zh="提交复现报告" en="Submit a reproduction" /> <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <dl className="reproduce-facts" aria-label="Reproduction guarantees">
          <div><dt>MODEL CALLS</dt><dd>0</dd></div>
          <div><dt>NETWORK</dt><dd>NOT REQUIRED</dd></div>
          <div><dt>DEPENDENCIES</dt><dd>PYTHON STDLIB</dd></div>
          <div><dt>EXPERIMENTS</dt><dd>{reproducibleExperiments.length}</dd></div>
        </dl>
      </header>

      <aside className="reproduce-boundary" aria-labelledby="reproduce-boundary-title">
        <span aria-hidden="true">BOUNDARY / 01</span>
        <div>
          <h2 id="reproduce-boundary-title">
            <LocalizedText zh="先读证据边界" en="Read the evidence boundary first" />
          </h2>
          <p>
            <LocalizedText
              zh="这里复现的是本地 Reference Harness 的确定性 Controlled 实验。它不复现 Codex、Claude Code、OpenCode、Grok Build 或其他产品的 Native 行为。"
              en="This reproduces deterministic Controlled experiments in the local Reference Harness. It does not reproduce Native behavior from Codex, Claude Code, OpenCode, Grok Build, or any other vendor product."
            />
          </p>
          <p>
            <LocalizedText
              zh="报告也不证明模型质量、Provider 可靠性、生产安全性或产品排名。它只证明：在一个明确的 commit 与环境中，声明的本地产物是否能够被准确重建。"
              en="The report does not establish model quality, provider reliability, production security, or product ranking. It establishes only whether the declared local artifacts can be rebuilt exactly at one explicit commit and environment."
            />
          </p>
        </div>
      </aside>

      <section className="reproduce-section" aria-labelledby="reproduce-flow-title">
        <div className="section-heading section-heading--split">
          <div>
            <span className="eyebrow">CLEAN COMMIT → RUN → VERIFY → SUBMIT</span>
            <h2 id="reproduce-flow-title">
              <LocalizedText zh="四步完成一次可审核复现" en="Four steps to a reviewable reproduction" />
            </h2>
          </div>
          <p>
            <LocalizedText
              zh="不需要 API key、模型账号、网络访问或依赖安装。Git 与 Python 3.12+ 即可完成这条路径。"
              en="No API key, model account, network access, or dependency installation is needed. Git and Python 3.12+ are enough."
            />
          </p>
        </div>

        <ol className="reproduce-flow">
          {steps.map((step, index) => (
            <li key={step.en}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3><LocalizedText zh={step.zh} en={step.en} /></h3>
              <p><LocalizedText zh={step.detailZh} en={step.detailEn} /></p>
            </li>
          ))}
        </ol>

        <div className="reproduce-terminal">
          <div>
            <span>QUICK START</span>
            <strong>reference-tool-roundtrip-v1</strong>
          </div>
          <code aria-label="Quick-start reproduction commands" role="region" tabIndex={0}>
            {`git status --short\npython3 labs/reproduce.py reference-tool-roundtrip-v1 --output reproduction-report.json\npython3 labs/reproduce.py --verify-report reproduction-report.json`}
          </code>
        </div>
      </section>

      <section className="reproduce-section" aria-labelledby="reproduce-experiments-title">
        <div className="section-heading section-heading--split">
          <div>
            <span className="eyebrow">{reproducibleExperiments.length} CONTROLLED EXPERIMENTS</span>
            <h2 id="reproduce-experiments-title">
              <LocalizedText zh="选择一个机制开始" en="Choose a mechanism to begin" />
            </h2>
          </div>
          <p>
            <LocalizedText
              zh="清单直接来自实验 Registry。每个入口都具有固定 fixture、场景、两次运行和已提交的结构化产物。"
              en="This inventory comes directly from the experiment Registry. Every entry has a fixed fixture, scenario, two runs, and committed structured artifacts."
            />
          </p>
        </div>

        <div className="reproduce-grid">
          {reproducibleExperiments.map((experiment, index) => {
            const label = experimentLabels[experiment.id] ?? {
              zh: experiment.title,
              en: experiment.title,
            };
            const command = `python3 labs/reproduce.py ${experiment.id} --output reproduction-report.json`;
            return (
              <article className="reproduce-card" key={experiment.id}>
                <div className="reproduce-card__top">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>CONTROLLED · COMPLETE</strong>
                </div>
                <h3><LocalizedText zh={label.zh} en={label.en} /></h3>
                <p>{experiment.id}</p>
                <dl>
                  <div><dt>Runs</dt><dd>{experiment.repetitions}</dd></div>
                  <div><dt>Model calls</dt><dd>0</dd></div>
                  <div><dt>Network</dt><dd>off</dd></div>
                  <div><dt>Artifacts</dt><dd>{experiment.trace_ids.length + 2}</dd></div>
                </dl>
                <code
                  aria-label={`Reproduce ${experiment.id}`}
                  role="region"
                  tabIndex={0}
                >
                  {command}
                </code>
                <Link className="text-link" href={`/lab/experiments/${experiment.id}`}>
                  <LocalizedText zh="先检查实验设计" en="Inspect the experiment first" /> <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="reproduce-section" aria-labelledby="reproduce-outcomes-title">
        <div className="section-heading section-heading--split">
          <div>
            <span className="eyebrow">OUTCOME IS EVIDENCE</span>
            <h2 id="reproduce-outcomes-title">
              <LocalizedText zh="三种结果都必须保留" en="All three outcomes must be preserved" />
            </h2>
          </div>
          <p>
            <LocalizedText
              zh="复现不是一张只接受绿色结果的成绩单。失败与不可比结果可以揭示平台差异、陈旧假设或工具缺陷。"
              en="Reproduction is not a scorecard that accepts only green results. Failures and non-comparable runs can expose platform differences, stale assumptions, or tooling defects."
            />
          </p>
        </div>
        <div className="reproduce-outcomes">
          {outcomes.map((outcome) => (
            <article className={`reproduce-outcome reproduce-outcome--${outcome.id}`} key={outcome.id}>
              <span>{outcome.id}</span>
              <p><LocalizedText zh={outcome.zh} en={outcome.en} /></p>
            </article>
          ))}
        </div>
      </section>

      <section className="reproduce-submit" aria-labelledby="reproduce-submit-title">
        <span className="eyebrow">INDEPENDENT HUMAN ATTESTATION</span>
        <h2 id="reproduce-submit-title">
          <LocalizedText zh="自动化能验报告，不能证明你是谁。" en="Automation can verify the report, not who ran it." />
        </h2>
        <p>
          <LocalizedText
            zh="只有在你自己的环境中亲自运行后，才应声明独立复现。提交时附上原始 JSON、实际命令、差异说明、相关从属关系，以及你并非代表项目维护者提交的明确声明。CI、维护者重跑和代维护者执行的 AI Agent 都不满足外部参与者要求。"
            en="Claim independent reproduction only after running it yourself in your own environment. Submit the original JSON, actual command, deviations, relevant affiliations, and an explicit statement that you are not acting for the project maintainer. CI, maintainer reruns, and AI agents acting for the maintainer do not satisfy the external-participant requirement."
          />
        </p>
        <div className="reproduce-actions">
          <a className="button button--primary" href={reproductionIssueUrl} rel="noreferrer" target="_blank">
            <LocalizedText zh="打开公开 Issue 表单" en="Open the public issue form" /> <span aria-hidden="true">↗</span>
          </a>
          <a className="button button--ghost" href={publicGuideUrl} rel="noreferrer" target="_blank">
            <LocalizedText zh="阅读提交与安全规则" en="Read submission and safety rules" /> <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>
    </main>
  );
}
