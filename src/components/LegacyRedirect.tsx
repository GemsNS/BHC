"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/paths";

/** Client redirect for static GitHub Pages + legacy bookmarks */
export function LegacyRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(withBasePath(to));
  }, [router, to]);
  return (
    <p className="cc-empty jarvis-fade-in">Redirecting…</p>
  );
}
