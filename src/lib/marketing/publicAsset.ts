import { withBasePath } from "@/lib/paths";

/** Prefix static asset paths for GitHub Pages hosting */
export function publicAsset(path: string): string {
  return withBasePath(path.startsWith("/") ? path : `/${path}`);
}
