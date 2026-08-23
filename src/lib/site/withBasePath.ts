import { withBasePath as withAppBasePath } from "@/lib/paths";

/**
 * Prefix `public/` URLs when the app is served under a subpath (GitHub Pages).
 * Delegates to the shared BHC path helper so CRM and public site stay in sync.
 */
export function withBasePath(path: string): string {
  return withAppBasePath(path);
}
