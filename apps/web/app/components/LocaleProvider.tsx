"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Locale } from "../lib/content";

const STORAGE_KEY = "inside-coding-agents-locale";
const LOCALE_EVENT = "inside-coding-agents:locale-change";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  text: (zh: string, en: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function localeFrom(value: string | null): Locale | null {
  if (value === "en") return "en";
  if (value === "zh" || value === "zh-CN") return "zh-CN";
  return null;
}

function browserLocale(): Locale {
  const urlLocale = localeFrom(new URL(window.location.href).searchParams.get("lang"));
  const storedLocale = localeFrom(window.localStorage.getItem(STORAGE_KEY));
  const preferredLocale = window.navigator.languages.some((language) =>
    language.toLowerCase().startsWith("zh"),
  ) ? "zh-CN" : "en";
  return urlLocale ?? storedLocale ?? preferredLocale;
}

function subscribeToLocale(onStoreChange: () => void): () => void {
  window.addEventListener(LOCALE_EVENT, onStoreChange);
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(LOCALE_EVENT, onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    subscribeToLocale,
    browserLocale,
    () => "en",
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    const url = new URL(window.location.href);
    if (nextLocale === "zh-CN") url.searchParams.set("lang", "zh-CN");
    else url.searchParams.delete("lang");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(LOCALE_EVENT));
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      text: (zh, en) => (locale === "zh-CN" ? zh : en),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

export function LocalizedText({ zh, en }: { zh: string; en: string }) {
  const { locale } = useLocale();
  return locale === "zh-CN" ? zh : en;
}

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale, text } = useLocale();

  return (
    <div className={`language-switch ${className}`.trim()} aria-label={text("语言", "Language")}>
      <button
        aria-pressed={locale === "en"}
        className={locale === "en" ? "is-active" : ""}
        onClick={() => setLocale("en")}
        type="button"
      >
        EN
      </button>
      <button
        aria-pressed={locale === "zh-CN"}
        className={locale === "zh-CN" ? "is-active" : ""}
        onClick={() => setLocale("zh-CN")}
        type="button"
      >
        中文
      </button>
    </div>
  );
}
