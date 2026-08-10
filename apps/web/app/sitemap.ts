import type { MetadataRoute } from "next";
import { content } from "./lib/content";
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
      ...agent.snapshots.map((snapshot) => ({
        path: `/agents/${agent.id}/${snapshot.id}`,
        changeFrequency: "monthly" as const,
        priority: 0.7,
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
