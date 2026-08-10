"use client";

import Link from "next/link";
import { useLocale } from "./LocaleProvider";

export function SiteFooter() {
  const { text } = useLocale();
  return (
    <footer className="site-footer">
      <div>
        <span className="eyebrow">OPEN KNOWLEDGE INFRASTRUCTURE</span>
        <p>{text("课程、证据、实验和 Trace 使用同一组稳定 ID。", "Lessons, evidence, experiments, and traces share stable IDs.")}</p>
        <Link className="site-footer__link" href="/reproduce">
          {text("独立复现指南", "Independent reproduction guide")} <span aria-hidden="true">→</span>
        </Link>
      </div>
      <p className="site-footer__meta">{text("Core Atlas 公开快照", "Core Atlas public snapshot")} · v0.2</p>
    </footer>
  );
}
