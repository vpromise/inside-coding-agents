import type { Agent, AgentSnapshot, Claim } from "./content";

export const DEFAULT_FRESHNESS_WINDOW_DAYS = 90;

export interface FreshnessAssessment {
  declaredState: AgentSnapshot["freshness"];
  computedState: AgentSnapshot["freshness"];
  ageDays: number;
  windowDays: number;
  reviewDueAt: string;
  overdue: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function assessFreshness(
  snapshot: AgentSnapshot,
  asOf: string,
  windowDays = DEFAULT_FRESHNESS_WINDOW_DAYS,
): FreshnessAssessment {
  const observed = utcDate(snapshot.observed_at);
  const current = utcDate(asOf);
  const ageDays = Math.floor((current.getTime() - observed.getTime()) / DAY_MS);
  const reviewDue = new Date(observed.getTime() + windowDays * DAY_MS);
  const overdue = ageDays > windowDays && snapshot.freshness !== "historical";
  const computedState = snapshot.freshness === "historical"
    ? "historical"
    : overdue
      ? "stale"
      : snapshot.freshness;

  return {
    declaredState: snapshot.freshness,
    computedState,
    ageDays,
    windowDays,
    reviewDueAt: isoDate(reviewDue),
    overdue,
  };
}

export interface SnapshotPair {
  id: string;
  from: AgentSnapshot;
  to: AgentSnapshot;
}

export function snapshotComparisonId(from: AgentSnapshot, to: AgentSnapshot): string {
  return `${from.id}__${to.id}`;
}

export function snapshotPairs(agent: Agent): SnapshotPair[] {
  const pairs: SnapshotPair[] = [];
  for (let fromIndex = 0; fromIndex < agent.snapshots.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < agent.snapshots.length; toIndex += 1) {
      const from = agent.snapshots[fromIndex];
      const to = agent.snapshots[toIndex];
      pairs.push({ id: snapshotComparisonId(from, to), from, to });
    }
  }
  return pairs;
}

function sortedDifference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function evidenceTypes(claims: Claim[]): Set<string> {
  return new Set(claims.flatMap((claim) => claim.evidence.map((item) => item.type)));
}

export interface SnapshotDiff {
  addedMechanisms: string[];
  removedMechanisms: string[];
  retainedMechanisms: string[];
  addedSourcePaths: string[];
  removedSourcePaths: string[];
  addedClaims: Claim[];
  removedClaims: Claim[];
  fromEvidenceTypes: string[];
  toEvidenceTypes: string[];
  evidenceShiftMechanisms: string[];
  crossSurface: boolean;
  sameObservationDate: boolean;
}

export function buildSnapshotDiff(
  agent: Agent,
  from: AgentSnapshot,
  to: AgentSnapshot,
  allClaims: Claim[],
): SnapshotDiff {
  const fromClaims = allClaims.filter(
    (claim) => claim.agent_id === agent.id && claim.snapshot_id === from.id,
  );
  const toClaims = allClaims.filter(
    (claim) => claim.agent_id === agent.id && claim.snapshot_id === to.id,
  );
  const fromMechanisms = new Set(fromClaims.map((claim) => claim.mechanism_id));
  const toMechanisms = new Set(toClaims.map((claim) => claim.mechanism_id));
  const retainedMechanisms = [...fromMechanisms]
    .filter((mechanismId) => toMechanisms.has(mechanismId))
    .sort();
  const evidenceShiftMechanisms = retainedMechanisms.filter((mechanismId) => {
    const before = evidenceTypes(fromClaims.filter((claim) => claim.mechanism_id === mechanismId));
    const after = evidenceTypes(toClaims.filter((claim) => claim.mechanism_id === mechanismId));
    return [...before].sort().join("|") !== [...after].sort().join("|");
  });

  return {
    addedMechanisms: sortedDifference(toMechanisms, fromMechanisms),
    removedMechanisms: sortedDifference(fromMechanisms, toMechanisms),
    retainedMechanisms,
    addedSourcePaths: sortedDifference(
      new Set(to.source_ref?.paths ?? []),
      new Set(from.source_ref?.paths ?? []),
    ),
    removedSourcePaths: sortedDifference(
      new Set(from.source_ref?.paths ?? []),
      new Set(to.source_ref?.paths ?? []),
    ),
    addedClaims: toClaims,
    removedClaims: fromClaims,
    fromEvidenceTypes: [...evidenceTypes(fromClaims)].sort(),
    toEvidenceTypes: [...evidenceTypes(toClaims)].sort(),
    evidenceShiftMechanisms,
    crossSurface: from.surface !== to.surface,
    sameObservationDate: from.observed_at === to.observed_at,
  };
}
