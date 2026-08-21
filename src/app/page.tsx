"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

/** Root redirects: logged-in → role home, else → login landing */
export default function HomePage() {
  const { authenticated, loading, homePath } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(authenticated ? homePath : "/login");
  }, [loading, authenticated, homePath, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ink)] text-white/70">
      Loading…
    </div>
  );
}
