# s05 · Instructions and Project Discovery

## Objective

Understand how a harness discovers project constraints and why directory precedence needs a deterministic order.

## Run

`python3 -m curriculum.lessons.s05_instructions.demo`

The example walks from the workspace root to the current package and loads `AGENTS.md` files root-to-leaf. Each file is bounded and the current directory must remain inside the workspace.

## Exercise

Add a third instruction under `fixture/package/child/`. Acceptance: the system prompt orders root, package, then child.

## Risk

Repository instructions are untrusted input. They cannot grant permissions or override platform safety policy and higher-priority user intent.
