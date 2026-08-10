# Agent Atlas Content

This directory contains bilingual Agent overviews and long-form analyses for immutable snapshots. Identity, version, surface, Claim, and Evidence records live in the [Registry](../../registry/README.md).

```text
<agent-id>/
├── overview.en.md
├── overview.zh.md
└── snapshots/
    └── <snapshot-id>/
        ├── analysis.en.md
        └── analysis.zh.md
```

An overview introduces stable product identity and available surfaces. Architecture facts that can change belong to a dated or commit-pinned snapshot.

Source-map commits and paths live in the Agent profile; atomic statements and permalinks live in Claim records. Analyses cite stable Claim IDs instead of copying large upstream source excerpts.

For closed-source products, document only public first-party material or clean-room observations. Never present black-box behavior as a verified internal implementation detail.
