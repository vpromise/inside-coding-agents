import generatedBundle from "../data/content.generated.json";

export type Locale = "zh-CN" | "en";
export type CoverageStatus = "complete" | "substantial" | "partial" | "missing" | "unknown";

export interface LocalizedText {
  "zh-CN": string;
  en: string;
}

export interface LocalizedMarkdown {
  "zh-CN": string | null;
  en: string | null;
}

export interface Evidence {
  type: "source" | "official-doc" | "reproduced" | "inference";
  title: string;
  source_url?: string;
  captured_at?: string;
  locator?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface Claim {
  id: string;
  agent_id: string;
  snapshot_id: string;
  mechanism_id: string;
  surface: string;
  statement: string;
  display_text?: Partial<LocalizedText>;
  status: string;
  evidence: Evidence[];
  reviewed_at?: string;
  notes?: string;
}

export interface SourceReference {
  repository: string;
  commit: string;
  paths?: string[];
}

export interface AgentSnapshot {
  id: string;
  observed_at: string;
  surface: string;
  version: string;
  freshness: string;
  docs_captured_at?: string;
  source_ref?: SourceReference;
  environment?: Record<string, string>;
  claims_path: string;
  supersedes?: string;
  notes?: string;
  analysis_content: LocalizedMarkdown;
}

export interface Agent {
  id: string;
  name: string;
  summary: string;
  coverage_tier: "A" | "B" | "C";
  source_availability: "open" | "partial" | "closed" | "unknown";
  homepage: string;
  upstream?: {
    documentation?: string;
    release_feed?: string;
    repositories?: Array<{ component: string; url: string; default_branch?: string }>;
  };
  licenses?: Array<{ component: string; spdx: string; url?: string }>;
  surfaces: string[];
  model_strategy: string[];
  lifecycle: string;
  tags?: string[];
  snapshots: AgentSnapshot[];
  overview_content: LocalizedMarkdown;
}

export interface MechanismImplementation {
  agent_id: string;
  snapshot_id: string;
  coverage: "unknown" | "partial" | "substantial";
  claim_ids: string[];
  notes?: string;
}

export interface Mechanism {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  prerequisites: string[];
  reference_lessons: string[];
  agent_implementations: MechanismImplementation[];
  experiments: string[];
  open_questions: string[];
  reader_layer_status?: Partial<Record<"L0" | "L1" | "L2" | "L3" | "L4", "complete" | "partial" | "missing">>;
  content: LocalizedMarkdown;
}

export interface TraceEvent {
  event_id: string;
  sequence: number;
  timestamp: string;
  type: string;
  actor: { kind: string; id: string };
  payload: Record<string, unknown>;
  redaction: { status: string; [key: string]: unknown };
  provenance: { run_id: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface Trace {
  id: string;
  title: LocalizedText;
  kind: string;
  experiment_id?: string;
  lesson_id?: string;
  run_id?: string;
  source_path: string;
  download_path: string;
  events: TraceEvent[];
}

export interface LessonChangeContract {
  previous_lesson_id: string | null;
  summary: LocalizedText;
  adds: LocalizedText[];
  preserves: LocalizedText[];
}

export interface LessonGoldenTrace {
  path: string;
  run_id: string;
  expected_event_count: number;
  focus_event_types: string[];
  download_path: string;
}

export interface LessonAgentBridge {
  relationship: "direct" | "adjacent" | "gap";
  claim_ids: string[];
  notes: LocalizedText;
}

export interface ExerciseCheck {
  id: string;
  level: "observe" | "modify" | "research";
  title: LocalizedText;
  acceptance: LocalizedText;
  command: string;
}

export interface ExperimentSubject {
  agent_id: string;
  snapshot_id: string;
  surface: string;
  model: string;
  provider?: string;
  comparison_status: "comparable" | "partially-comparable" | "not-comparable";
  configuration?: Record<string, unknown>;
  uncontrolled_variables?: string[];
}

export interface ExperimentRun {
  run_id: string;
  repetition: number;
  status: "passed" | "failed";
  trace_path: string;
  event_count: number;
  event_types: string[];
  final_text: string;
  stop_reason: string;
  metrics: Record<string, boolean>;
  deterministic_fingerprint: string;
  redaction: { status: string; fields: string[] };
}

export interface ExperimentResult {
  schema_version: string;
  experiment_id: string;
  generated_at: string;
  runner: { id: string; version: string; command: string };
  status: "passed" | "failed";
  summary: {
    total_runs: number;
    successful_runs: number;
    failed_runs: number;
    criteria_passed: boolean;
  };
  criteria: Array<{ statement: string; passed: boolean }>;
  fixture_sha256: string;
  prompt_sha256: string;
  runs: ExperimentRun[];
  limitations: string[];
}

export interface Experiment {
  schema_version: string;
  id: string;
  title: string;
  question: string;
  hypothesis?: string;
  mode: "native" | "controlled" | "adversarial";
  status: string;
  fixture: { path: string; revision: string; sha256: string };
  scenario: { path: string; prompt_sha256: string };
  subjects: ExperimentSubject[];
  controls?: Record<string, string | number | boolean | null>;
  repetitions: number;
  metrics: string[];
  success_criteria: string[];
  limitations: string[];
  outputs: { traces_path: string; results_path: string; report_path?: string };
  result: ExperimentResult | null;
  report_content: string | null;
  trace_ids: string[];
}

export interface Lesson {
  id: string;
  number: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  mechanism_ids: string[];
  status: string;
  estimated_minutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  code_path: string;
  source_code: string;
  content_paths: LocalizedText;
  run: string;
  content: LocalizedText;
  change_contract: LessonChangeContract;
  golden_trace: LessonGoldenTrace;
  agent_bridge: LessonAgentBridge;
  exercise_checks: ExerciseCheck[];
}

export interface ContentBundle {
  schema_version: string;
  curriculum: {
    schema_version: string;
    track: string;
    title: LocalizedText;
    lessons: Lesson[];
  };
  agents: Agent[];
  claims: Claim[];
  mechanisms: Mechanism[];
  experiments: Experiment[];
  traces: Trace[];
}

export const content = generatedBundle as ContentBundle;

export const architectureDimensions = [
  "loop",
  "context",
  "tools",
  "safety",
  "reliability",
  "extensibility",
  "orchestration",
  "interfaces",
  "observability",
] as const;

export function eventFamily(type: string): string {
  return type.split(".")[0] ?? "event";
}

export function localize(value: LocalizedText, locale: Locale = "zh-CN"): string {
  return value[locale];
}

export function claimText(claim: Claim, locale: Locale = "zh-CN"): string {
  return claim.display_text?.[locale] ?? claim.statement;
}

export function findAgent(agentId: string): Agent | undefined {
  return content.agents.find((agent) => agent.id === agentId);
}

export function findSnapshot(agent: Agent, snapshotId: string): AgentSnapshot | undefined {
  return agent.snapshots.find((snapshot) => snapshot.id === snapshotId);
}

export function findMechanism(mechanismId: string): Mechanism | undefined {
  return content.mechanisms.find((mechanism) => mechanism.id === mechanismId);
}

export function findExperiment(experimentId: string): Experiment | undefined {
  return content.experiments.find((experiment) => experiment.id === experimentId);
}

export function findTrace(traceId: string): Trace | undefined {
  return content.traces.find((trace) => trace.id === traceId);
}

export function findLesson(lessonId: string): Lesson | undefined {
  return content.curriculum.lessons.find((lesson) => lesson.id === lessonId);
}

export function claimsForSnapshot(agentId: string, snapshotId: string): Claim[] {
  return content.claims.filter(
    (claim) => claim.agent_id === agentId && claim.snapshot_id === snapshotId,
  );
}

export function claimsForMechanism(mechanismId: string): Claim[] {
  return content.claims.filter((claim) => claim.mechanism_id === mechanismId);
}

export function dimensionCoverage(claims: Claim[], dimension: string): "partial" | "unknown" {
  const mechanismIds = new Set(
    content.mechanisms
      .filter((mechanism) => mechanism.category === dimension)
      .map((mechanism) => mechanism.id),
  );
  return claims.some((claim) => mechanismIds.has(claim.mechanism_id)) ? "partial" : "unknown";
}
