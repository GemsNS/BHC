"use client";

import dynamic from "next/dynamic";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";

const KnockerCommandCenter = dynamic(
  () =>
    import("@/components/knocker/KnockerCommandCenter").then((m) => m.KnockerCommandCenter),
  { ssr: false, loading: () => <div className="knocker-command loading">Loading knocker…</div> },
);

export default function KnockerAppPage() {
  return (
    <AppsShell title="Knocker">
      <RequireAuth perm="knocker">
        <KnockerCommandCenter />
      </RequireAuth>
    </AppsShell>
  );
}
