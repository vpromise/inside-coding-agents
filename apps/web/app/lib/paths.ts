const publicBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function withBasePath(path: string): string {
  if (!publicBasePath || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === publicBasePath || path.startsWith(`${publicBasePath}/`)) return path;
  return `${publicBasePath}${path}`;
}
