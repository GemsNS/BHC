"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageFrame } from "@/components/cc";
import { AutomationPanel } from "@/components/sales/AutomationPanel";
import { ClientsPanel } from "@/components/sales/ClientsPanel";
import { OutreachPanel } from "@/components/sales/OutreachPanel";
import { PipelinePanel } from "@/components/sales/PipelinePanel";
import { SupportPanel } from "@/components/sales/SupportPanel";
import { SALES_TABS, type SalesTab } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import Link from "next/link";

function SalesHubInner() {
  const params = useSearchParams();
  const { can } = useSession();
  const tabs = SALES_TABS.filter((t) => can(t.perm));
  const requested = (params.get("tab") as SalesTab) || "pipeline";
  const tab = tabs.some((t) => t.id === requested)
    ? requested
    : tabs[0]?.id ?? "pipeline";

  const subtitle = useMemo(() => {
    switch (tab) {
      case "pipeline":
        return "Leads, deals, and stage movement — scored and workflow-ready.";
      case "clients":
        return "360° contact view with calls, emails, and tasks on one timeline.";
      case "automation":
        return "Workflows, sequences, and future GoDaddy email sends.";
      case "support":
        return "Client support tickets from first message to resolution.";
      case "outreach":
        return "AI-drafted outreach — you approve before anything sends.";
      default:
        return "";
    }
  }, [tab]);

  if (!tabs.length) {
    return <p className="cc-empty">Your role does not include sales tools.</p>;
  }

  return (
    <PageFrame
      context="Sales & clients"
      title="Pipeline & clients"
      subtitle={subtitle}
    >
      <nav className="jarvis-tab-bar" aria-label="Sales sections">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/admin/sales?tab=${t.id}`}
            className={cn("jarvis-tab", tab === t.id && "jarvis-tab-active")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="jarvis-tab-panel jarvis-fade-in" key={tab}>
        {tab === "pipeline" ? <PipelinePanel /> : null}
        {tab === "clients" ? <ClientsPanel /> : null}
        {tab === "automation" ? <AutomationPanel /> : null}
        {tab === "support" ? <SupportPanel /> : null}
        {tab === "outreach" ? <OutreachPanel /> : null}
      </div>
    </PageFrame>
  );
}

export default function SalesHubPage() {
  return (
    <Suspense fallback={<p className="cc-empty">Loading sales hub…</p>}>
      <SalesHubInner />
    </Suspense>
  );
}
