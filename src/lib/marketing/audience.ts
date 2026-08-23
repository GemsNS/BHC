export type ProjectAudience = "residential" | "commercial";

export function audienceFromPath(pathname: string): ProjectAudience | null {
  if (pathname === "/commercial" || pathname.startsWith("/commercial/")) return "commercial";
  if (pathname === "/residential" || pathname.startsWith("/residential/")) return "residential";
  return null;
}
