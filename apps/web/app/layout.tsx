import type { Metadata } from "next";
import { LocaleProvider, LocalizedText } from "./components/LocaleProvider";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { withBasePath } from "./lib/paths";
import { siteUrl } from "./lib/site";
import "./globals.css";

const socialImage = `${siteUrl}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(`${siteUrl}/`),
  title: {
    default: "Inside Coding Agents",
    template: "%s · Inside Coding Agents",
  },
  description: "A visual, evidence-backed handbook and reproducible lab for coding agent architecture and agent harness engineering.",
  keywords: [
    "coding agents",
    "agent harness",
    "AI coding agents",
    "LLM agents",
    "tool calling",
    "context management",
    "Codex",
    "Claude Code",
    "OpenCode",
    "Grok Build",
  ],
  openGraph: {
    type: "website",
    siteName: "Inside Coding Agents",
    title: "Inside Coding Agents",
    description: "Model ≠ Agent. Learn the agent harness around the model.",
    images: [{ url: socialImage, width: 1728, height: 909, alt: "Inside Coding Agents — Model is not Agent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inside Coding Agents",
    description: "Model ≠ Agent. Learn the agent harness around the model.",
    images: [socialImage],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {process.env.DEPLOY_TARGET !== "github-pages" && (
          <meta
            name="description"
            content="A visual, evidence-backed handbook and reproducible lab for coding agent architecture and agent harness engineering."
          />
        )}
        <link rel="icon" href={withBasePath("/favicon.svg")} type="image/svg+xml" />
      </head>
      <body>
        <LocaleProvider>
          <a className="skip-link" href="#main-content">
            <LocalizedText zh="跳到正文" en="Skip to content" />
          </a>
          <SiteHeader />
          <div id="main-content">{children}</div>
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
