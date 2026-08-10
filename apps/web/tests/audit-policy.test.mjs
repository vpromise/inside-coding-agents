import assert from "node:assert/strict";
import test from "node:test";
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
