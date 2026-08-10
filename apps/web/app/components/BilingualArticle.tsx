"use client";

import { MarkdownArticle } from "./MarkdownArticle";
import { LanguageSwitch, useLocale } from "./LocaleProvider";

export function BilingualArticle({
  zh,
  en,
}: {
  zh: string;
  en: string;
}) {
  const { locale } = useLocale();

  return (
    <div lang={locale}>
      <LanguageSwitch />
      <MarkdownArticle source={locale === "zh-CN" ? zh : en} />
    </div>
  );
}
