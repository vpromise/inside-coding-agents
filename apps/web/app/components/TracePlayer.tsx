"use client";

import { useEffect, useMemo, useState } from "react";
import type { TraceEvent } from "../lib/content";
import { eventFamily } from "../lib/content";
import { withBasePath } from "../lib/paths";
import { useLocale } from "./LocaleProvider";

const familyLabel: Record<string, string> = {
  session: "SESSION",
  user: "USER",
  model: "MODEL",
  tool: "TOOL",
  approval: "POLICY",
  context: "CONTEXT",
  error: "ERROR",
};

interface TracePlayerProps {
  events: TraceEvent[];
  eyebrow?: string;
  title?: string;
  titleEn?: string;
  downloadHref?: string;
}

export function TracePlayer({
  events,
  eyebrow = "TRACE 0.1 · CONTROLLED",
  title = "一次 Tool Roundtrip，逐事件拆开",
  titleEn = "A tool roundtrip, event by event",
  downloadHref = "/data/example-trace.jsonl",
}: TracePlayerProps) {
  const { text } = useLocale();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = events[currentIndex];
  const visible = useMemo(() => events.slice(0, currentIndex + 1), [events, currentIndex]);

  useEffect(() => {
    if (!playing || currentIndex >= events.length - 1) return;
    const timer = window.setTimeout(() => {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      if (nextIndex >= events.length - 1) setPlaying(false);
    }, 950);
    return () => window.clearTimeout(timer);
  }, [currentIndex, events.length, playing]);

  if (!current) return null;

  const family = eventFamily(current.type);
  return (
    <section className="trace-player" aria-label={text("交互式 Trace 播放器", "Interactive trace player")}>
      <div className="trace-player__topbar">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{text(title, titleEn)}</h2>
        </div>
        <div className="trace-controls">
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setCurrentIndex(0);
            }}
          >
            {text("重置", "Reset")}
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
            disabled={currentIndex === 0}
          >
            {text("上一步", "Prev")}
          </button>
          <button
            className="trace-controls__primary"
            type="button"
            onClick={() => {
              if (currentIndex === events.length - 1) setCurrentIndex(0);
              setPlaying((value) => !value);
            }}
          >
            {playing ? text("暂停", "Pause") : text("播放", "Play")}
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((value) => Math.min(events.length - 1, value + 1))}
            disabled={currentIndex === events.length - 1}
          >
            {text("下一步", "Next")}
          </button>
        </div>
      </div>

      <div className="trace-progress" aria-hidden="true">
        <span style={{ width: `${((currentIndex + 1) / events.length) * 100}%` }} />
      </div>

      <div className="trace-player__body">
        <ol className="trace-timeline" aria-label={text("Trace 事件", "Trace events")}>
          {events.map((event, index) => {
            const eventFamilyName = eventFamily(event.type);
            return (
              <li key={event.event_id}>
                <button
                  type="button"
                  className={index === currentIndex ? "is-current" : index < currentIndex ? "is-past" : ""}
                  onClick={() => {
                    setPlaying(false);
                    setCurrentIndex(index);
                  }}
                  aria-current={index === currentIndex ? "step" : undefined}
                >
                  <span className={`event-glyph event-glyph--${eventFamilyName}`} />
                  <span className="event-sequence">{String(event.sequence).padStart(2, "0")}</span>
                  <span>
                    <strong>{event.type}</strong>
                    <small>{event.actor.kind} · {event.actor.id}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="trace-inspector" aria-live="polite">
          <div className="trace-inspector__header">
            <span className={`family-pill family-pill--${family}`}>
              {familyLabel[family] ?? family.toUpperCase()}
            </span>
            <span>{current.event_id}</span>
            <span>{current.timestamp.replace("2026-08-10T", "T+")}</span>
          </div>
          <h3>{current.type}</h3>
          <p className="trace-inspector__summary">
            {text("执行者", "Actor")} <code>{current.actor.id}</code>{" "}
            {text(`产生了序列 ${current.sequence}。脱敏状态为`, `produced sequence ${current.sequence}. Redaction status is`)}{" "}
            <code>{current.redaction.status}</code>.
          </p>
          <pre><code>{JSON.stringify(current.payload, null, 2)}</code></pre>
          <div className="trace-inspector__footer">
            <span>run · {current.provenance.run_id}</span>
            <span>{currentIndex + 1} / {events.length}</span>
          </div>
        </div>
      </div>

      <div className="trace-player__foot">
        <p>{text(`${visible.length} 个事件已进入可见状态；隐藏 chain-of-thought 不属于 Trace。`, `${visible.length} events are visible; hidden chain-of-thought is not part of the trace.`)}</p>
        <a href={withBasePath(downloadHref)} download>{text("下载 JSONL", "Download JSONL")}</a>
      </div>
    </section>
  );
}
