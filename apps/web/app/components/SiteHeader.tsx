"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageSwitch, useLocale } from "./LocaleProvider";

const navigation = [
  { href: "/learn", zh: "学习", en: "Learn" },
  { href: "/mechanisms", zh: "机制", en: "Mechanisms" },
  { href: "/compare", zh: "比较", en: "Compare" },
  { href: "/agents", zh: "图谱", en: "Agents" },
  { href: "/evidence", zh: "证据", en: "Evidence" },
  { href: "/lab", zh: "实验", en: "Lab" },
  { href: "/reproduce", zh: "复现", en: "Reproduce" },
  { href: "/search", zh: "搜索", en: "Search" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { text } = useLocale();

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" href="/" aria-label={text("Inside Coding Agents 首页", "Inside Coding Agents home")}>
          <span className="brand__mark" aria-hidden="true">
            ICA
          </span>
          <span className="brand__name">Inside Coding Agents</span>
        </Link>
        <nav
          className={`site-nav${menuOpen ? " is-open" : ""}`}
          id="primary-navigation"
          aria-label={text("主导航", "Primary navigation")}
        >
          {navigation.map((item) => (
            <Link
              aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
              href={item.href}
              key={item.href}
              onClick={() => setMenuOpen(false)}
            >
              {text(item.zh, item.en)}
            </Link>
          ))}
        </nav>
        <div className="site-header__tools">
          <LanguageSwitch className="language-switch--header" />
          <span className="header-status" aria-label={text("v0.2 预览状态", "v0.2 preview status")}>
            <span className="status-dot" aria-hidden="true" />
            v0.2 preview
          </span>
          <button
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            aria-label={text(menuOpen ? "关闭菜单" : "打开菜单", menuOpen ? "Close menu" : "Open menu")}
            className="mobile-nav-toggle"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            {text(menuOpen ? "关闭" : "菜单", menuOpen ? "Close" : "Menu")}
          </button>
        </div>
      </div>
    </header>
  );
}
