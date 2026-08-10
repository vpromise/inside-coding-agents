import { claimText, content, type LocalizedText } from "./content";

export type SearchKind =
  | "lesson"
  | "mechanism"
  | "agent"
  | "snapshot"
  | "claim"
  | "experiment"
  | "trace";

export interface SearchRecord {
  id: string;
  kind: SearchKind;
  href: string;
  title: LocalizedText;
  description: LocalizedText;
  meta: string[];
  searchText: string;
}

function searchable(...values: Array<unknown>): string {
  return values
    .flat(Infinity)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .replace(/[`#*_>[\](){}|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameText(value: string): LocalizedText {
  return { "zh-CN": value, en: value };
}

export function buildSearchIndex(): SearchRecord[] {
  const lessons: SearchRecord[] = content.curriculum.lessons.map((lesson) => ({
    id: lesson.id,
    kind: "lesson",
    href: `/learn/${lesson.slug}`,
    title: lesson.title,
    description: lesson.summary,
    meta: [`S${lesson.number}`, ...lesson.mechanism_ids],
    searchText: searchable(
      lesson.id,
      lesson.slug,
      lesson.title["zh-CN"],
      lesson.title.en,
      lesson.summary["zh-CN"],
      lesson.summary.en,
      lesson.mechanism_ids,
      lesson.content["zh-CN"],
      lesson.content.en,
      lesson.run,
    ),
  }));

  const mechanisms: SearchRecord[] = content.mechanisms.map((mechanism) => ({
    id: mechanism.id,
    kind: "mechanism",
    href: `/mechanisms/${mechanism.id}`,
    title: sameText(mechanism.title),
    description: sameText(mechanism.summary),
    meta: [mechanism.category, mechanism.status],
    searchText: searchable(
      mechanism.id,
      mechanism.title,
      mechanism.summary,
      mechanism.category,
      mechanism.prerequisites,
      mechanism.reference_lessons,
      mechanism.open_questions,
      mechanism.content["zh-CN"],
      mechanism.content.en,
      mechanism.agent_implementations.flatMap((item) => [item.agent_id, item.snapshot_id, item.claim_ids]),
    ),
  }));

  const agents: SearchRecord[] = content.agents.map((agent) => ({
    id: agent.id,
    kind: "agent",
    href: `/agents/${agent.id}`,
    title: sameText(agent.name),
    description: sameText(agent.summary),
    meta: [`Tier ${agent.coverage_tier}`, agent.source_availability, ...agent.surfaces],
    searchText: searchable(
      agent.id,
      agent.name,
      agent.summary,
      agent.tags,
      agent.surfaces,
      agent.model_strategy,
      agent.overview_content["zh-CN"],
      agent.overview_content.en,
    ),
  }));

  const snapshots: SearchRecord[] = content.agents.flatMap((agent) =>
    agent.snapshots.map((snapshot) => ({
      id: snapshot.id,
      kind: "snapshot" as const,
      href: `/agents/${agent.id}/${snapshot.id}`,
      title: sameText(`${agent.name} · ${snapshot.version}`),
      description: sameText(snapshot.notes ?? `${agent.name} ${snapshot.surface} snapshot`),
      meta: [snapshot.observed_at, snapshot.surface, snapshot.freshness],
      searchText: searchable(
        agent.id,
        agent.name,
        snapshot.id,
        snapshot.version,
        snapshot.surface,
        snapshot.notes,
        snapshot.source_ref?.repository,
        snapshot.source_ref?.commit,
        snapshot.source_ref?.paths,
        snapshot.analysis_content["zh-CN"],
        snapshot.analysis_content.en,
      ),
    })),
  );

  const claims: SearchRecord[] = content.claims.map((claim) => ({
    id: claim.id,
    kind: "claim",
    href: `/agents/${claim.agent_id}/${claim.snapshot_id}#${claim.id}`,
    title: {
      "zh-CN": claimText(claim, "zh-CN"),
      en: claimText(claim, "en"),
    },
    description: {
      "zh-CN": `${claim.agent_id} · ${claim.mechanism_id} · ${claim.status}`,
      en: `${claim.agent_id} · ${claim.mechanism_id} · ${claim.status}`,
    },
    meta: [claim.mechanism_id, claim.surface, ...claim.evidence.map((item) => item.type)],
    searchText: searchable(
      claim.id,
      claim.agent_id,
      claim.snapshot_id,
      claim.mechanism_id,
      claim.surface,
      claim.statement,
      claim.display_text?.["zh-CN"],
      claim.display_text?.en,
      claim.notes,
      claim.evidence.flatMap((item) => [item.type, item.title, item.locator, item.notes]),
    ),
  }));

  const experiments: SearchRecord[] = content.experiments.map((experiment) => ({
    id: experiment.id,
    kind: "experiment",
    href: `/lab/experiments/${experiment.id}`,
    title: sameText(experiment.title),
    description: sameText(experiment.question),
    meta: [experiment.mode, experiment.status, `${experiment.repetitions} runs`],
    searchText: searchable(
      experiment.id,
      experiment.title,
      experiment.question,
      experiment.hypothesis,
      experiment.mode,
      experiment.metrics,
      experiment.success_criteria,
      experiment.limitations,
      experiment.subjects.flatMap((item) => [item.agent_id, item.snapshot_id, item.surface, item.model]),
      experiment.result?.runner.command,
      experiment.report_content,
    ),
  }));

  const traces: SearchRecord[] = content.traces.map((trace) => ({
    id: trace.id,
    kind: "trace",
    href: `/lab/traces/${trace.id}`,
    title: trace.title,
    description: {
      "zh-CN": `${trace.kind} trace · ${trace.events.length} 个事件`,
      en: `${trace.kind} trace · ${trace.events.length} events`,
    },
    meta: [trace.kind, trace.experiment_id ?? "format fixture"],
    searchText: searchable(
      trace.id,
      trace.title["zh-CN"],
      trace.title.en,
      trace.kind,
      trace.experiment_id,
      trace.run_id,
      trace.events.flatMap((event) => [
        event.event_id,
        event.type,
        event.actor.kind,
        event.actor.id,
        JSON.stringify(event.payload),
      ]),
    ),
  }));

  return [
    ...lessons,
    ...mechanisms,
    ...agents,
    ...snapshots,
    ...claims,
    ...experiments,
    ...traces,
  ];
}
