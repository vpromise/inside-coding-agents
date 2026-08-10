import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the product homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Inside Coding Agents/);
  assert.match(html, /Open the agent shell/);
  assert.match(html, /TRACE 0\.1/);
  assert.match(html, /<strong>13<\/strong>.*runnable lessons/);
  assert.match(html, /href="\/search"/);
  assert.match(html, /aria-controls="primary-navigation"/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("renders every vertical-slice route", async () => {
  const generated = JSON.parse(
    await readFile(new URL("../app/data/content.generated.json", import.meta.url), "utf8"),
  );
  const routes = [
    "/learn",
    ...generated.curriculum.lessons.map((lesson) => `/learn/${lesson.slug}`),
    "/mechanisms",
    ...generated.mechanisms.map((mechanism) => `/mechanisms/${mechanism.id}`),
    "/agents",
    ...generated.agents.flatMap((agent) => [
      `/agents/${agent.id}`,
      ...agent.snapshots.map((snapshot) => `/agents/${agent.id}/${snapshot.id}`),
    ]),
    "/lab",
    "/search",
    ...generated.experiments.map((experiment) => `/lab/experiments/${experiment.id}`),
    ...generated.traces.map((trace) => `/lab/traces/${trace.id}`),
  ];

  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /Inside Coding Agents/, route);
  }
});

test("renders a long-form lesson with rich reading primitives and runnable source", async () => {
  const response = await render("/learn/agent-loop");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /href="#mental-model"/);
  assert.match(html, /href="#deep-dive"/);
  assert.match(html, /id="change-contract"/);
  assert.match(html, /id="agent-bridge"/);
  assert.match(html, /id="golden-trace"/);
  assert.match(html, /id="exercise-checks"/);
  assert.match(html, /id="mental-model"/);
  assert.match(html, /id="source"/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<table>/);
  assert.match(html, /<ol>/);
  assert.match(html, /data-language="python"/);
  assert.match(html, /Not pseudocode/);
  assert.match(html, /def build_demo/);
  assert.match(html, /run-s01-agent-loop-golden/);
  assert.match(html, /codex-source-agent-loop/);
  assert.match(html, /python3 -m curriculum\.golden verify s01-agent-loop/);
});

test("renders an interactive Architecture Atlas and deep mechanism dossiers", async () => {
  const atlasResponse = await render("/mechanisms");
  assert.equal(atlasResponse.status, 200);
  const atlasHtml = await atlasResponse.text();
  assert.match(atlasHtml, /id="mechanism-search"/);
  assert.match(atlasHtml, /ARCHITECTURE ATLAS · [\s\S]*20[\s\S]*20/);
  assert.match(atlasHtml, /href="\/mechanisms\/context-budget"/);
  assert.match(atlasHtml, /href="\/mechanisms\/checkpoint-rollback"/);
  assert.match(atlasHtml, /L0/);
  assert.match(atlasHtml, /bilingual/);

  const gapResponse = await render("/mechanisms/context-budget");
  assert.equal(gapResponse.status, 200);
  const gapHtml = await gapResponse.text();
  assert.match(gapHtml, /DEPENDENCY GRAPH · READER PATH/);
  assert.match(gapHtml, /id="definition"/);
  assert.match(gapHtml, /id="failure-modes"/);
  assert.match(gapHtml, /id="research"/);
  assert.match(gapHtml, /UNKNOWN · EVIDENCE GAP/);
  assert.match(gapHtml, /href="\/lab\/experiments\/reference-context-budget-v1"/);
  assert.match(gapHtml, /href="\/learn\/context-budget#source"/);
  assert.match(gapHtml, /href="\/lab\/traces\/run-s06-context-budget-golden"/);

  const mappedResponse = await render("/mechanisms/context-compaction");
  assert.equal(mappedResponse.status, 200);
  const mappedHtml = await mappedResponse.text();
  assert.match(mappedHtml, /codex-2026-08-10-source/);
  assert.match(mappedHtml, /pi-2026-08-10-source/);
  assert.match(mappedHtml, /reasonix-2026-08-10-source/);
  assert.match(mappedHtml, /Codex pre- and mid-turn compaction routing|run_pre_sampling_compact/);
});

test("renders a cross-entity bilingual search index", async () => {
  const generated = JSON.parse(
    await readFile(new URL("../app/data/content.generated.json", import.meta.url), "utf8"),
  );
  const recordCount = generated.curriculum.lessons.length
    + generated.mechanisms.length
    + generated.agents.length
    + generated.agents.reduce((total, agent) => total + agent.snapshots.length, 0)
    + generated.claims.length
    + generated.experiments.length
    + generated.traces.length;
  const response = await render("/search");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="knowledge-search"/);
  assert.match(html, new RegExp(`${recordCount} results`));
  assert.match(html, /href="\/learn\/agent-loop"/);
  assert.match(html, /href="\/mechanisms\/agent-loop"/);
  assert.match(html, /href="\/agents\/codex\/[^"#]+#codex-source-agent-loop"/);
  assert.match(html, /href="\/lab\/experiments\/reference-tool-roundtrip-v1"/);
  assert.match(html, /runToolLoop/);
});

test("generated content resolves the shared source graph", async () => {
  const generated = JSON.parse(
    await readFile(new URL("../app/data/content.generated.json", import.meta.url), "utf8"),
  );
  assert.equal(generated.curriculum.lessons.length, 13);
  assert.equal(generated.mechanisms.length, 20);
  assert.equal(generated.agents.length, 5);
  assert.equal(generated.claims.length, 30);
  assert.equal(generated.experiments.length, 10);
  assert.equal(generated.traces.length, 34);

  for (const lesson of generated.curriculum.lessons) {
    assert.ok(lesson.estimated_minutes >= 20, `${lesson.id} reading time`);
    assert.match(lesson.source_code, /def build_demo/);
    assert.match(lesson.content.en, /\{#deep-dive\}/);
    assert.match(lesson.content["zh-CN"], /\{#deep-dive\}/);
    assert.equal(lesson.exercise_checks.length, 2);
    assert.equal(lesson.golden_trace.expected_event_count,
      generated.traces.find((trace) => trace.id === lesson.golden_trace.run_id).events.length);
  }

  const goldenTraces = generated.traces.filter((trace) => trace.kind === "golden");
  assert.equal(goldenTraces.length, generated.curriculum.lessons.length);
  assert.ok(goldenTraces.every((trace) => trace.lesson_id));

  const mechanism = generated.mechanisms.find((item) => item.id === "agent-loop");
  const agent = generated.agents.find((item) => item.id === "codex");
  const claim = generated.claims.find((item) => item.id === "codex-cli-terminal-loop");
  const trace = generated.traces.find((item) => item.id === "example-tool-roundtrip");
  assert.equal(claim.mechanism_id, mechanism.id);
  assert.equal(claim.snapshot_id, agent.snapshots[0].id);
  assert.deepEqual(trace.events.map((event) => event.sequence), [0, 1, 2, 3]);

  const experiment = generated.experiments.find(
    (item) => item.id === "reference-tool-roundtrip-v1",
  );
  assert.equal(experiment.result.status, "passed");
  assert.equal(experiment.result.summary.successful_runs, 2);
  assert.equal(experiment.trace_ids.length, 2);
  assert.equal(new Set(experiment.result.runs.map((run) => run.deterministic_fingerprint)).size, 1);
  assert.ok(generated.experiments.every((item) => item.mode === "controlled"));
  assert.ok(generated.experiments.every((item) => item.status === "complete"));
  assert.ok(generated.experiments.every((item) => item.result?.status === "passed"));
  assert.ok(generated.experiments.every((item) => item.trace_ids.length === 2));
  for (const traceId of experiment.trace_ids) {
    const reproducedTrace = generated.traces.find((item) => item.id === traceId);
    assert.equal(reproducedTrace.kind, "controlled");
    assert.equal(reproducedTrace.events.length, 9);
    assert.ok(reproducedTrace.download_path.startsWith("/data/traces/"));
    assert.ok(reproducedTrace.events.every(
      (event) => event.provenance.experiment_id === experiment.id,
    ));
  }

  for (const profile of generated.agents) {
    assert.ok(profile.overview_content["zh-CN"], `${profile.id} Chinese overview`);
    assert.ok(profile.overview_content.en, `${profile.id} English overview`);
    for (const snapshot of profile.snapshots) {
      assert.ok(snapshot.analysis_content["zh-CN"], `${snapshot.id} Chinese analysis`);
      assert.ok(snapshot.analysis_content.en, `${snapshot.id} English analysis`);
      assert.ok(
        generated.claims.some(
          (item) => item.agent_id === profile.id && item.snapshot_id === snapshot.id,
        ),
        `${snapshot.id} claim coverage`,
      );
    }
  }

  for (const sourceClaim of generated.claims.filter((item) =>
    item.evidence.some((evidence) => evidence.type === "source"),
  )) {
    const snapshot = generated.agents
      .find((item) => item.id === sourceClaim.agent_id)
      .snapshots.find((item) => item.id === sourceClaim.snapshot_id);
    assert.ok(snapshot.source_ref, `${sourceClaim.id} pinned snapshot`);
    for (const evidence of sourceClaim.evidence.filter((item) => item.type === "source")) {
      assert.equal(evidence.commit, snapshot.source_ref.commit, `${sourceClaim.id} commit`);
      assert.match(evidence.source_url, new RegExp(evidence.commit), `${sourceClaim.id} permalink`);
    }
  }
});

test("content synchronization is collection-driven rather than brand-specific", async () => {
  const source = await readFile(new URL("../scripts/sync-content.mjs", import.meta.url), "utf8");
  assert.match(source, /readJsonCollection\("registry\/agents"/);
  assert.match(source, /agentRecords\.map/);
  assert.match(source, /listFilesRecursive\("labs\/results", "\.trace\.jsonl"\)/);
  assert.doesNotMatch(source, /codex\.agent\.json|content\/agents\/codex/);
});

test("removes disposable starter assets and publishes the trace download", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.rejects(access(new URL("../public/favicon.svg", import.meta.url)));
  const trace = await readFile(
    new URL("../public/data/example-trace.jsonl", import.meta.url),
    "utf8",
  );
  assert.equal(trace.trim().split(/\r?\n/).length, 4);
  for (const run of ["reference-tool-roundtrip-v1-run-001", "reference-tool-roundtrip-v1-run-002"]) {
    const reproducedTrace = await readFile(
      new URL(`../public/data/traces/${run}.jsonl`, import.meta.url),
      "utf8",
    );
    assert.equal(reproducedTrace.trim().split(/\r?\n/).length, 9);
  }
  const generated = JSON.parse(
    await readFile(new URL("../app/data/content.generated.json", import.meta.url), "utf8"),
  );
  for (const lesson of generated.curriculum.lessons) {
    const goldenTrace = await readFile(
      new URL(`../public/data/traces/${lesson.golden_trace.run_id}.jsonl`, import.meta.url),
      "utf8",
    );
    assert.equal(
      goldenTrace.trim().split(/\r?\n/).length,
      lesson.golden_trace.expected_event_count,
    );
  }
});
