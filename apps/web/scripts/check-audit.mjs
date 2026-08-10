import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function advisoryId(advisory) {
  return advisory.url?.split("/").pop() ?? String(advisory.source ?? "unknown");
}

export function assessAudit(report, allowlist, today) {
  const errors = [];
  const exceptions = new Map();
  for (const exception of allowlist.exceptions ?? []) {
    if (exceptions.has(exception.id)) errors.push(`duplicate exception ${exception.id}`);
    if (!/^GHSA-[a-z0-9-]+$/.test(exception.id)) errors.push(`invalid exception ID ${exception.id}`);
    if (exception.expires_at < today) errors.push(`expired exception ${exception.id}`);
    exceptions.set(exception.id, exception);
  }

  const advisories = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === "string") continue;
      if ((severityRank[via.severity] ?? 0) < severityRank.high) continue;
      advisories.set(advisoryId(via), via);
    }
  }

  for (const [id, advisory] of advisories) {
    const exception = exceptions.get(id);
    if (!exception) {
      errors.push(`unexpected ${advisory.severity} advisory ${id}`);
      continue;
    }
    if (exception.package !== advisory.dependency) {
      errors.push(`exception ${id} package does not match the audit report`);
    }
    if (exception.severity !== advisory.severity) {
      errors.push(`exception ${id} severity does not match the audit report`);
    }
  }

  for (const id of exceptions.keys()) {
    if (!advisories.has(id)) errors.push(`stale exception ${id}`);
  }

  return {
    errors,
    highOrCriticalAdvisories: advisories.size,
    acceptedAdvisories: advisories.size - errors.filter((error) => error.startsWith("unexpected ")).length,
  };
}

async function main() {
  const audit = spawnSync("npm", ["audit", "--json"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!audit.stdout) {
    console.error("NPM_AUDIT_POLICY_FAILED: npm audit returned no JSON report");
    return 2;
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error("NPM_AUDIT_POLICY_FAILED: npm audit returned invalid JSON");
    return 2;
  }
  const allowlist = JSON.parse(
    await readFile(new URL("../security-audit-allowlist.json", import.meta.url), "utf8"),
  );
  const today = new Date().toISOString().slice(0, 10);
  const assessment = assessAudit(report, allowlist, today);
  if (assessment.errors.length) {
    console.error("NPM_AUDIT_POLICY_FAILED");
    for (const error of assessment.errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(
    `NPM_AUDIT_POLICY_OK high_or_critical=${assessment.highOrCriticalAdvisories} `
    + `accepted=${assessment.acceptedAdvisories}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
