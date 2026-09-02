"use client";

import { MainframeChat } from "@/components/mainframe/MainframeChat";
import { AssistantPanel } from "@/components/mainframe/AssistantPanel";
import { AiKeyPanel } from "@/components/mainframe/AiKeyPanel";
import { isStaticDemo } from "@/lib/paths";

export default function AssistantPage() {
  const staticDemo = isStaticDemo();
  return (
    <div className="mainframe-page mainframe-page-split">
      <div className="mainframe-side-stack">
        {staticDemo ? <AiKeyPanel /> : null}
        <AssistantPanel />
      </div>
      <MainframeChat />
    </div>
  );
}
