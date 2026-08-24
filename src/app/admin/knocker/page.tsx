"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/PageHeader";

const KnockerCommandCenter = dynamic(
  () =>
    import("@/components/knocker/KnockerCommandCenter").then((m) => m.KnockerCommandCenter),
  { ssr: false, loading: () => <div className="knocker-command loading">Loading map…</div> },
);

export default function AdminKnockerPage() {
  return (
    <div className="knocker-admin-wrap">
      <PageHeader
        title="Active Knocker command"
        subtitle="Map turfs, assign territories, track reps, and sync door pins across the team."
      />
      <KnockerCommandCenter admin />
    </div>
  );
}
