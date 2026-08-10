# s02 · Streaming and Events

## Objective

Translate provider streaming deltas into stable harness events while preserving one complete assistant message.

## Key design

A transport chunk is not a new conversation message. The reference harness records each delta as `model.response`, exposes `accumulated` text, and appends one assistant message only after the stream ends.

## Run

`python3 -m curriculum.lessons.s02_events_streaming.demo`

## Exercise

Make the second chunk empty. Acceptance: sequences remain strict, final content has no duplication, and the last response event has `final: true`.

## Engineering note

Production systems also handle broken streams, duplicate deltas, partial tool-call JSON, and cancellation. String concatenation must not hide these states.
