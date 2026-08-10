export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function absoluteSiteUrl(path = "/"): string {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  return normalizedPath ? `${siteUrl}/${normalizedPath}/` : `${siteUrl}/`;
}
