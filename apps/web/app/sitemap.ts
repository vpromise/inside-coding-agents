import type { MetadataRoute } from "next";
import { content } from "./lib/content";
import { snapshotPairs } from "./lib/research";
import { absoluteSiteUrl } from "./lib/site";

export const dynamic = "force-static";

type SitemapRoute = {
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
};

const sectionRoutes: SitemapRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/learn", changeFrequency: "weekly", priority: 0.9 },
  { path: "/mechanisms", changeFrequency: "weekly", priority: 0.9 },
  { path: "/agents", changeFrequency: "weekly", priority: 0.9 },
  { path: "/compare", changeFrequency: "weekly", priority: 0.9 },
  { path: "/evidence", changeFrequency: "weekly", priority: 0.9 },
  { path: "/lab", changeFrequency: "weekly", priority: 0.8 },
  { path: "/search", changeFrequency: "weekly", priority: 0.7 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: SitemapRoute[] = [
    ...sectionRoutes,
    ...content.curriculum.lessons.map((lesson) => ({
      path: `/learn/${lesson.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...content.mechanisms.map((mechanism) => ({
      path: `/mechanisms/${mechanism.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...content.agents.flatMap((agent) => [
      {
        path: `/agents/${agent.id}`,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      },
      {
        path: `/agents/${agent.id}/timeline`,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      },
      ...agent.snapshots.map((snapshot) => ({
        path: `/agents/${agent.id}/${snapshot.id}`,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...snapshotPairs(agent).map((pair) => ({
        path: `/agents/${agent.id}/diff/${pair.id}`,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ]),
    ...content.experiments.map((experiment) => ({
      path: `/lab/experiments/${experiment.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...content.traces.map((trace) => ({
      path: `/lab/traces/${trace.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  return routes.map(({ path, changeFrequency, priority }) => ({
    url: absoluteSiteUrl(path),
    changeFrequency,
    priority,
  }));
}
