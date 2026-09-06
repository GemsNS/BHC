"use client";

import { LiveWire } from "@/components/LiveWire";
import { RequireAuth } from "@/components/RequireAuth";
import { PageFrame } from "@/components/cc";

export default function LivePage() {
  return (
    <RequireAuth perm="dashboard">
      <PageFrame
        context="Intelligence layer"
        title="Live wire"
        subtitle="Every scan, triage, draft, send, reply, webhook and AI call as it happens. Leave it open on a second screen."
        className="live-page"
      >
        <LiveWire maxRows={400} className="live-wire-full" />
      </PageFrame>
    </RequireAuth>
  );
}
