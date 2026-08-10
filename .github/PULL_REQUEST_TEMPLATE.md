## Public outcome

Describe the reader, researcher, or maintainer outcome. Keep private execution notes and task planning out of the PR.

## Scope

- Affected Lessons, Mechanisms, Agents, Snapshots, Claims, Experiments, or routes:
- Stable IDs added or changed:
- Generated projections updated:

## Evidence boundary

- Evidence type: source / official-doc / reproduced / inference / not applicable
- Pinned version, commit, fixture, or observation date:
- What this change does **not** establish:
- Conflicts of interest or upstream affiliation:

## Validation

- [ ] `python3 scripts/check_public_safety.py`
- [ ] `python3 -m unittest discover -s curriculum/tests -v`
- [ ] `python3 -m unittest discover -s labs/tests -v`
- [ ] `python3 labs/runner.py reference-tool-roundtrip-v1 --check`
- [ ] `uv run --no-project --with 'jsonschema>=4.18,<5' python3 scripts/validate_registry.py`
- [ ] `cd apps/web && npm run lint && npm run typecheck && npm test`
- [ ] `cd apps/web && npm run audit:ci`
- [ ] New behavior has focused tests or a written reason why none apply

## Publication safety

- [ ] The diff contains no credentials, personal absolute paths, private source, local hosting bindings, internal task plans, or unredacted traces
- [ ] Generated artifacts contain only public or explicitly redistributable data
- [ ] Native, Controlled, Adversarial, synthetic, and inference boundaries are labeled accurately
- [ ] Security-sensitive details belong in the private reporting path described by `SECURITY.md`, not this PR
