import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assessAudit } from "../scripts/check-audit.mjs";

function reportWith(advisory) {
  return {
    vulnerabilities: {
      dependency: { via: [advisory] },
    },
  };
}

const advisory = {
  source: 1,
  dependency: "image-size",
  severity: "high",
  url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
};

const exception = {
  id: "GHSA-w3rx-r6r6-pgpr",
  package: "image-size",
  severity: "high",
  expires_at: "2026-09-10",
};

test("accepts an observed, current, exact advisory exception", () => {
  const result = assessAudit(
    reportWith(advisory),
    { exceptions: [exception] },
    "2026-08-10",
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.acceptedAdvisories, 1);
});

test("rejects a new high advisory", () => {
  const result = assessAudit(reportWith(advisory), { exceptions: [] }, "2026-08-10");
  assert.deepEqual(result.errors, ["unexpected high advisory GHSA-w3rx-r6r6-pgpr"]);
});

test("rejects expired and stale exceptions", () => {
  const result = assessAudit(
    { vulnerabilities: {} },
    { exceptions: [exception] },
    "2026-09-11",
  );
  assert.deepEqual(result.errors, [
    "expired exception GHSA-w3rx-r6r6-pgpr",
    "stale exception GHSA-w3rx-r6r6-pgpr",
  ]);
});

test("rejects registry errors and malformed audit reports before assessing exceptions", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "audit-policy-"));
  try {
    const npm = path.join(directory, "npm");
    for (const report of [
      { error: { code: "ENOTFOUND" } },
      { vulnerabilities: {} },
      { metadata: { vulnerabilities: {} }, vulnerabilities: [] },
      null,
    ]) {
      await writeFile(npm, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(report))});\n`);
      await chmod(npm, 0o755);
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/check-audit.mjs", import.meta.url))], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}` },
      });
      assert.equal(result.status, 2, JSON.stringify(report));
      assert.match(result.stderr, /NPM_AUDIT_POLICY_FAILED: npm audit returned an invalid report/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
