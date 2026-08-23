import { Suspense } from "react";
import { ShowcaseClient } from "@/components/site/ShowcaseClient";
import "@/styles/showcase.css";

function ShowcaseFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--sea-dark,#0f172a)] text-white">
      <p className="text-sm text-zinc-400">Loading showcase…</p>
    </div>
  );
}

export default function ShowcasePage() {
  return (
    <Suspense fallback={<ShowcaseFallback />}>
      <ShowcaseClient />
    </Suspense>
  );
}
