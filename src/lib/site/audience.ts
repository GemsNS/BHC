import type { JobShowcaseAudience, JobShowcaseImage } from "@/lib/site/jobShowcaseImages";

/** Visitor path after the landing gate. */
export type ProjectAudience = "residential" | "commercial";

export function isProjectAudience(value: string | undefined | null): value is ProjectAudience {
  return value === "residential" || value === "commercial";
}

export function showcaseMatchesAudience(tag: JobShowcaseAudience, audience: ProjectAudience): boolean {
  return tag === audience;
}

export function filterShowcaseByAudience(
  images: readonly JobShowcaseImage[],
  audience: ProjectAudience,
): JobShowcaseImage[] {
  return images.filter((img) => showcaseMatchesAudience(img.audience, audience));
}

export function audienceFromSearchParam(
  raw: string | string[] | undefined,
): ProjectAudience {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isProjectAudience(v) ? v : "residential";
}
