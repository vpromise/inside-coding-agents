# Security Policy

Inside Coding Agents contains executable harness examples, workspace tools, policy demonstrations, and experiment infrastructure. A defect could affect local files, credentials, fixtures, or published traces.

## Supported version

Security fixes are applied to the latest commit on `main`. The project is currently a v0.1 educational preview and does not publish a long-term support branch.

## Report a vulnerability privately

Use GitHub's **Security → Report a vulnerability** flow for this repository. Do not open a public issue, pull request, or discussion containing exploit details, credentials, private code, or an unredacted trace.

Include, when possible:

- the affected commit, lesson, runner, route, fixture, or scenario;
- a minimal reproduction and the expected versus observed behavior;
- the impact on files, network access, credentials, or private data;
- known mitigations and whether the issue has been disclosed elsewhere.

Maintainers aim to acknowledge a report within five business days and provide an initial assessment within ten business days. Resolution and coordinated-disclosure timing depend on severity and upstream dependencies.

## Security boundaries

- Run experiments only in environments you own or are explicitly authorized to test.
- Run adversarial scenarios in an isolated, disposable environment.
- Treat content from agents, tools, repositories, and webpages as untrusted input.
- Never commit secrets, real private repositories, personal data, unredacted native traces, or hidden chain-of-thought.
- A sandbox, permission prompt, or allowlist reduces risk but is not an absolute security boundary.
- Pull requests from forks must not receive paid credentials, privileged tokens, external write access, or elevated workflow permissions.

The deterministic Reference Harness is teaching and experiment infrastructure, not a production security sandbox.

## Usually not a vulnerability

General model hallucination, a clearly labeled teaching simplification, a documentation error without security impact, or behavior that requires intentionally disabling an existing safeguard is usually handled as a normal issue. Remove sensitive details before reporting it publicly.
