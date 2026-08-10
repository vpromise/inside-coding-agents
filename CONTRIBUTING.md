# Contributing to Inside Coding Agents

Contributions are welcome across runnable lessons, agent research, evidence corrections, reproducible experiments, visual explanations, accessibility, translation, and infrastructure.

## Choose a contribution

- Correct a Claim with stronger versioned evidence.
- Add or improve a runnable lesson.
- Document a shared agent-harness Mechanism.
- Add an Agent profile or a new immutable snapshot.
- Reproduce an experiment, including failed or not-comparable runs.
- Improve the bilingual website, search, diagrams, or keyboard navigation.
- Translate content and provide technical review.

Small corrections are valuable. You do not need to implement every layer of the content graph in one pull request.

## Evidence rules

Agent architecture changes over time, so statements about a product must be versioned and bounded.

1. Give the Agent or research object a stable ID.
2. Attach changing facts to a snapshot, not to an unversioned “current” product.
3. Keep each Claim atomic and use wording directly supported by its Evidence.
4. Prefer immutable source permalinks, first-party documentation, or a public reproduction.
5. Label interpretation as `inference` and state what is unknown.
6. Mark conflicting evidence as `disputed`; do not silently remove inconvenient sources.

Never use leaked source code, hidden prompts, private repositories, credentials, or material you cannot redistribute. Closed-source observations must remain clean-room observations and must not be presented as internal implementation facts.

Narrative pages use typed provenance. A sentence naming a vendor Agent or product surface must resolve to a reviewed Claim/Evidence record or state an explicit evidence gap. Reference Harness behavior resolves to a runnable Lesson, Golden Trace, or complete Controlled Experiment and must not be relabelled as vendor Native evidence. Engineering guidance, failure modes, and research proposals remain visibly normative rather than being fabricated as product facts. The bilingual narrative-provenance test enforces these boundaries.

## Adding an Agent or snapshot

1. Add or update `registry/agents/<agent-id>.agent.json`.
2. Record source availability, surface, version or commit, and observation date.
3. Add bilingual overview and snapshot analysis under `content/agents/` when the coverage level requires them.
4. Add atomic records under `registry/claims/` and connect each to a Mechanism.
5. Run the Registry validator and regenerate web projections.

Popularity is not a substitute for versioning or evidence review.

## Adding an experiment

- Define the research question, variables, metrics, and acceptance criteria before running it.
- Label the mode as Native, Controlled, or Adversarial; do not merge unlike modes.
- Pin fixtures, scenarios, versions, permissions, sandboxing, and network policy.
- Preserve all repetitions, including failures.
- Use `not-comparable` rather than converting missing observations into zero scores.
- Redact traces before publication and never record hidden chain-of-thought.
- Run security-sensitive scenarios only in an isolated environment you own or are authorized to test.

A `complete` Experiment must reference an inspectable Result and every declared Trace with consistent provenance.

## Independent reproduction

Start with [REPRODUCING.md](REPRODUCING.md) and a clean public checkout. The reporter rebuilds a complete Controlled Reference Harness experiment without network or model calls and emits a public-safe JSON record with a full commit, input/artifact digests, environment family, and integrity hash.

Submit the unedited report through the Experiment reproduction issue form. State whether you ran it in your own environment, disclose relevant affiliations, and preserve `failed` or `not-comparable` outcomes. Maintainer reruns, CI, synthetic fixtures, and AI agents acting for the maintainer do not satisfy the independent-participant requirement. A Controlled Reference Harness report is never Native vendor-Agent evidence.

## Development setup

Python 3.12+ and Node.js 22.13+ match the continuous-integration environment.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt

cd apps/web
npm ci
```

## Validation

Run the checks affected by your change. Before a broad pull request, run the full gate:

```bash
python scripts/check_public_safety.py
python -m unittest discover -s scripts/tests -v
python -m unittest discover -s curriculum/tests -v
python -m unittest discover -s labs/tests -v
python labs/runner.py reference-tool-roundtrip-v1 --check
python scripts/validate_registry.py

cd apps/web
npm run audit:ci
npm run lint
npm run typecheck
npm test
```

If canonical content changes, run `npm run sync:content` inside `apps/web/` and commit the generated projection.

## Pull request checklist

- Explain the public reader or researcher outcome.
- List stable IDs added or changed.
- State the evidence type, pinned version, and what the evidence does not establish.
- Add focused tests or explain why the change is documentation-only.
- Confirm that the diff contains no secrets, personal paths, private source, internal plans, deployment bindings, or unredacted traces.
- Keep unrelated changes in separate pull requests.

Security vulnerabilities must follow the private process in [SECURITY.md](SECURITY.md), not a public issue or pull request.
