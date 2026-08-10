import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const repoRootUrl = new URL("../../../", import.meta.url);
const appRootUrl = new URL("../", import.meta.url);
const canonicalCatalog = new URL("curriculum/catalog.json", repoRootUrl);

try {
  await access(canonicalCatalog);
} catch {
  await Promise.all([
    access(new URL("app/data/content.generated.json", appRootUrl)),
    access(new URL("public/data/example-trace.jsonl", appRootUrl)),
  ]);
  console.log("Canonical monorepo sources are unavailable; using the validated deployment projection.");
  process.exit(0);
}

function fromRepo(relativePath) {
  return new URL(relativePath, repoRootUrl);
}

async function exists(relativePath) {
  try {
    await access(fromRepo(relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  const value = await readFile(fromRepo(relativePath), "utf8");
  return JSON.parse(value);
}

async function readText(relativePath) {
  return readFile(fromRepo(relativePath), "utf8");
}

async function readJsonCollection(directory, suffix) {
  const entries = await readdir(fromRepo(directory), { withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => `${directory}/${entry.name}`)
    .sort();
  return Promise.all(paths.map(readJson));
}

async function listFilesRecursive(directory, suffix) {
  const paths = [];
  async function visit(relativeDirectory) {
    const entries = await readdir(fromRepo(relativeDirectory), { withFileTypes: true });
    for (const entry of entries) {
      const path = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      if (entry.isFile() && entry.name.endsWith(suffix)) paths.push(path);
    }
  }
  await visit(directory);
  return paths.sort();
}

async function readLocalizedMarkdown(stem) {
  const paths = {
    "zh-CN": `${stem}.zh.md`,
    en: `${stem}.en.md`,
  };
  const entries = await Promise.all(
    Object.entries(paths).map(async ([locale, path]) => [
      locale,
      (await exists(path)) ? await readText(path) : null,
    ]),
  );
  return Object.fromEntries(entries);
}

function parseJsonl(text, sourcePath) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${sourcePath}:${index + 1}: ${error.message}`);
      }
    });
}

function assertUnique(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`Duplicate ${label} ID: ${record.id}`);
    ids.add(record.id);
  }
  return ids;
}

const [
  curriculum,
  agentRecords,
  claimRecords,
  mechanismRecords,
  experimentRecords,
  syntheticTraceText,
  formalTracePaths,
] = await Promise.all([
  readJson("curriculum/catalog.json"),
  readJsonCollection("registry/agents", ".agent.json"),
  readJsonCollection("registry/claims", ".claim.json"),
  readJsonCollection("registry/mechanisms", ".mechanism.json"),
  readJsonCollection("registry/experiments", ".experiment.json"),
  readText("registry/examples/example-trace.jsonl"),
  listFilesRecursive("labs/results", ".trace.jsonl"),
]);

const lessonTraceSources = await Promise.all(
  curriculum.lessons.map(async (lesson) => {
    const sourcePath = lesson.golden_trace.path;
    const text = await readText(sourcePath);
    const events = parseJsonl(text, sourcePath);
    if (!events.length) throw new Error(`Lesson Golden Trace has no events: ${sourcePath}`);
    if (events.some((event) => event.provenance?.run_id !== lesson.golden_trace.run_id)) {
      throw new Error(`Lesson Golden Trace run_id mismatch: ${sourcePath}`);
    }
    return {
      lesson,
      text,
      trace: {
        id: lesson.golden_trace.run_id,
        title: {
          "zh-CN": `S${lesson.number} ${lesson.title["zh-CN"]} · Golden Trace`,
          en: `S${lesson.number} ${lesson.title.en} · Golden Trace`,
        },
        kind: "golden",
        lesson_id: lesson.id,
        run_id: lesson.golden_trace.run_id,
        source_path: sourcePath,
        download_path: `/data/traces/${lesson.golden_trace.run_id}.jsonl`,
        events,
      },
    };
  }),
);

const curriculumWithContent = {
  ...curriculum,
  lessons: await Promise.all(
    curriculum.lessons.map(async (lesson) => ({
      ...lesson,
      golden_trace: {
        ...lesson.golden_trace,
        download_path: `/data/traces/${lesson.golden_trace.run_id}.jsonl`,
      },
      source_code: await readText(lesson.code_path),
      content: {
        "zh-CN": await readText(lesson.content_paths["zh-CN"]),
        en: await readText(lesson.content_paths.en),
      },
    })),
  ),
};

const agents = await Promise.all(
  agentRecords.map(async (agent) => ({
    ...agent,
    overview_content: await readLocalizedMarkdown(`content/agents/${agent.id}/overview`),
    snapshots: await Promise.all(
      agent.snapshots.map(async (snapshot) => ({
        ...snapshot,
        analysis_content: await readLocalizedMarkdown(
          `content/agents/${agent.id}/snapshots/${snapshot.id}/analysis`,
        ),
      })),
    ),
  })),
);

const mechanisms = await Promise.all(
  mechanismRecords.map(async (mechanism) => ({
    ...mechanism,
    content: await readLocalizedMarkdown(`content/mechanisms/${mechanism.id}/mechanism`),
  })),
);

const experimentRecordsById = new Map(experimentRecords.map((experiment) => [experiment.id, experiment]));
const traceSources = [
  {
    trace: {
      id: "example-tool-roundtrip",
      title: {
        "zh-CN": "确定性工具往返（格式样例）",
        en: "Deterministic tool roundtrip (format example)",
      },
      kind: "synthetic",
      source_path: "registry/examples/example-trace.jsonl",
      download_path: "/data/example-trace.jsonl",
      events: parseJsonl(syntheticTraceText, "registry/examples/example-trace.jsonl"),
    },
    text: syntheticTraceText,
  },
  ...lessonTraceSources.map(({ trace, text }) => ({ trace, text })),
  ...(await Promise.all(
    formalTracePaths.map(async (sourcePath) => {
      const text = await readText(sourcePath);
      const events = parseJsonl(text, sourcePath);
      if (!events.length) throw new Error(`Trace has no events: ${sourcePath}`);
      const provenance = events[0].provenance ?? {};
      const experiment = experimentRecordsById.get(provenance.experiment_id);
      if (!experiment) throw new Error(`Trace ${sourcePath} references an unknown experiment.`);
      if (!provenance.run_id) throw new Error(`Trace ${sourcePath} has no run_id.`);
      return {
        trace: {
          id: provenance.run_id,
          title: {
            "zh-CN": `${experiment.title} · ${provenance.run_id}`,
            en: `${experiment.title} · ${provenance.run_id}`,
          },
          kind: provenance.harness_mode,
          experiment_id: experiment.id,
          run_id: provenance.run_id,
          source_path: sourcePath,
          download_path: `/data/traces/${provenance.run_id}.jsonl`,
          events,
        },
        text,
      };
    }),
  )),
];

traceSources.splice(1, traceSources.length - 1, ...traceSources.slice(1).sort((a, b) =>
  a.trace.id.localeCompare(b.trace.id),
));
const traces = traceSources.map(({ trace }) => trace);

const experiments = await Promise.all(
  experimentRecords.map(async (experiment) => {
    const result = (await exists(experiment.outputs.results_path))
      ? await readJson(experiment.outputs.results_path)
      : null;
    const reportContent = experiment.outputs.report_path && await exists(experiment.outputs.report_path)
      ? await readText(experiment.outputs.report_path)
      : null;
    return {
      ...experiment,
      result,
      report_content: reportContent,
      trace_ids: traces
        .filter((trace) => trace.experiment_id === experiment.id)
        .map((trace) => trace.id),
    };
  }),
);

const lessonIds = assertUnique(curriculumWithContent.lessons, "Lesson");
const agentIds = assertUnique(agents, "Agent");
const claimIds = assertUnique(claimRecords, "Claim");
const mechanismIds = assertUnique(mechanisms, "Mechanism");
const experimentIds = assertUnique(experiments, "Experiment");
assertUnique(traces, "Trace");

const snapshotsByAgent = new Map(
  agents.map((agent) => [agent.id, new Set(agent.snapshots.map((snapshot) => snapshot.id))]),
);

for (const claim of claimRecords) {
  if (!agentIds.has(claim.agent_id)) throw new Error(`Claim ${claim.id} references an unknown Agent.`);
  if (!snapshotsByAgent.get(claim.agent_id)?.has(claim.snapshot_id)) {
    throw new Error(`Claim ${claim.id} references an unknown Agent snapshot.`);
  }
  if (!mechanismIds.has(claim.mechanism_id)) {
    throw new Error(`Claim ${claim.id} references an unknown Mechanism.`);
  }
}

for (const experiment of experiments) {
  for (const subject of experiment.subjects) {
    if (!snapshotsByAgent.get(subject.agent_id)?.has(subject.snapshot_id)) {
      throw new Error(`Experiment ${experiment.id} references an unknown Agent snapshot.`);
    }
  }
  if (experiment.status === "complete" && !experiment.result) {
    throw new Error(`Complete experiment ${experiment.id} has no result.`);
  }
}

for (const mechanism of mechanisms) {
  for (const prerequisite of mechanism.prerequisites) {
    if (!mechanismIds.has(prerequisite)) {
      throw new Error(`Mechanism ${mechanism.id} references unknown prerequisite ${prerequisite}.`);
    }
  }
  for (const lessonId of mechanism.reference_lessons) {
    if (!lessonIds.has(lessonId)) {
      throw new Error(`Mechanism ${mechanism.id} references unknown lesson ${lessonId}.`);
    }
  }
  for (const implementation of mechanism.agent_implementations) {
    if (!snapshotsByAgent.get(implementation.agent_id)?.has(implementation.snapshot_id)) {
      throw new Error(`Mechanism ${mechanism.id} references an unknown Agent snapshot.`);
    }
    for (const claimId of implementation.claim_ids) {
      if (!claimIds.has(claimId)) {
        throw new Error(`Mechanism ${mechanism.id} references unknown Claim ${claimId}.`);
      }
    }
  }
  for (const experimentId of mechanism.experiments) {
    if (!experimentIds.has(experimentId)) {
      throw new Error(`Mechanism ${mechanism.id} references unknown Experiment ${experimentId}.`);
    }
  }
}

const bundle = {
  schema_version: "0.3.0",
  sources: {
    curriculum: "curriculum/catalog.json",
    agents: "registry/agents/*.agent.json",
    claims: "registry/claims/*.claim.json",
    mechanisms: "registry/mechanisms/*.mechanism.json",
    experiments: "registry/experiments/*.experiment.json",
    experiment_results: "labs/results/**/result.json",
    lesson_traces: "curriculum/lessons/**/golden.trace.jsonl",
    traces: traceSources.map(({ trace }) => trace.source_path),
  },
  curriculum: curriculumWithContent,
  agents,
  claims: claimRecords,
  mechanisms,
  experiments,
  traces,
};

const generatedDirectory = new URL("app/data/", appRootUrl);
const publicDataDirectory = new URL("public/data/", appRootUrl);
const publicTraceDirectory = new URL("traces/", publicDataDirectory);
await Promise.all([
  mkdir(generatedDirectory, { recursive: true }),
  mkdir(publicTraceDirectory, { recursive: true }),
]);
await writeFile(
  new URL("content.generated.json", generatedDirectory),
  `${JSON.stringify(bundle, null, 2)}\n`,
  "utf8",
);
await Promise.all(
  traceSources.map(({ trace, text }) => writeFile(
    trace.download_path === "/data/example-trace.jsonl"
      ? new URL("example-trace.jsonl", publicDataDirectory)
      : new URL(`${trace.id}.jsonl`, publicTraceDirectory),
    text.endsWith("\n") ? text : `${text}\n`,
    "utf8",
  )),
);

console.log(
  [
    `Synced ${curriculumWithContent.lessons.length} lessons`,
    `${mechanisms.length} mechanisms`,
    `${agents.length} agents`,
    `${claimRecords.length} claims`,
    `${experiments.length} experiments`,
    `${traces.length} traces`,
  ].join(", "),
);
