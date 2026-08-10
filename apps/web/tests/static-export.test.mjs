import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDirectory = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = path.join(webDirectory, "out");
const content = JSON.parse(
  await readFile(path.join(webDirectory, "app/data/content.generated.json"), "utf8"),
);
const basePath = "/inside-coding-agents";
const siteUrl = `https://vpromise.github.io${basePath}`;

const expectedRoutes = [
  "",
  "learn",
  "mechanisms",
  "agents",
  "compare",
  "evidence",
  "lab",
  "search",
  ...content.curriculum.lessons.map((lesson) => `learn/${lesson.slug}`),
  ...content.mechanisms.map((mechanism) => `mechanisms/${mechanism.id}`),
  ...content.agents.flatMap((agent) => [
    `agents/${agent.id}`,
    `agents/${agent.id}/timeline`,
    ...agent.snapshots.map((snapshot) => `agents/${agent.id}/${snapshot.id}`),
    ...agent.snapshots.flatMap((snapshot, index) =>
      agent.snapshots.slice(index + 1).map((next) =>
        `agents/${agent.id}/diff/${snapshot.id}__${next.id}`
      )
    ),
  ]),
  ...content.experiments.map((experiment) => `lab/experiments/${experiment.id}`),
  ...content.traces.map((trace) => `lab/traces/${trace.id}`),
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
    }),
  );
  return files.flat();
}

test("GitHub Pages export contains every content route with repository-safe URLs", async () => {
  assert.equal(expectedRoutes.length, 115, "the route inventory changed; review the export contract");
  assert.equal(new Set(expectedRoutes).size, expectedRoutes.length, "route inventory contains duplicates");

  for (const route of expectedRoutes) {
    const htmlPath = path.join(outputDirectory, route, "index.html");
    const html = await readFile(htmlPath, "utf8");
    assert.match(html, /Inside Coding Agents/, `${route || "/"} is not a rendered project page`);

    for (const [, url] of html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) {
      assert.ok(
        url === basePath || url.startsWith(`${basePath}/`),
        `${route || "/"} contains an unprefixed root URL: ${url}`,
      );
    }
  }

  const allFiles = await collectFiles(outputDirectory);
  const indexFiles = allFiles.filter((file) => path.basename(file) === "index.html");
  assert.equal(indexFiles.length, expectedRoutes.length + 2, "unexpected static route count");

  await access(path.join(outputDirectory, "404.html"));
  await access(path.join(outputDirectory, "404/index.html"));
  await access(path.join(outputDirectory, "_not-found/index.html"));
  await access(path.join(outputDirectory, ".nojekyll"));
  await access(path.join(outputDirectory, "icon.svg"));
  await access(path.join(outputDirectory, "og.png"));

  for (const trace of content.traces) {
    await access(path.join(outputDirectory, trace.download_path.replace(/^\/+/, "")));
  }
});

test("GitHub Pages export publishes discoverability metadata and working deep links", async () => {
  const home = await readFile(path.join(outputDirectory, "index.html"), "utf8");
  const trace = await readFile(
    path.join(outputDirectory, "lab/traces/example-tool-roundtrip/index.html"),
    "utf8",
  );
  const goldenTrace = await readFile(
    path.join(outputDirectory, "lab/traces/run-s01-agent-loop-golden/index.html"),
    "utf8",
  );
  const robots = await readFile(path.join(outputDirectory, "robots.txt"), "utf8");
  const sitemap = await readFile(path.join(outputDirectory, "sitemap.xml"), "utf8");

  assert.match(home, new RegExp(`href="${basePath}/learn/agent-loop/"`));
  assert.match(home, new RegExp(`${basePath}/_next/`));
  assert.match(home, new RegExp(`${siteUrl}/og\\.png`));
  assert.match(home, new RegExp(`href="${basePath}/favicon\\.svg"`));
  assert.equal((home.match(/name="description"/g) ?? []).length, 1);
  assert.doesNotMatch(home, /rel="canonical"/, "a shared root canonical would mislabel deep pages");
  assert.match(trace, new RegExp(`href="${basePath}/data/example-trace\\.jsonl"`));
  assert.match(goldenTrace, new RegExp(`href="${basePath}/data/traces/run-s01-agent-loop-golden\\.jsonl"`));
  assert.match(robots, new RegExp(`Sitemap: ${siteUrl}/sitemap\\.xml`));

  const sitemapUrls = sitemap.match(/<url>/g) ?? [];
  assert.equal(sitemapUrls.length, expectedRoutes.length);
  for (const route of expectedRoutes) {
    const suffix = route ? `${route}/` : "";
    assert.match(sitemap, new RegExp(`<loc>${siteUrl}/${suffix}</loc>`));
  }
});
