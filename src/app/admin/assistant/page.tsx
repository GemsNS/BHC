import { MainframeChat } from "@/components/mainframe/MainframeChat";
import { AssistantPanel } from "@/components/mainframe/AssistantPanel";
import { AiKeyPanel } from "@/components/mainframe/AiKeyPanel";

export default function AssistantPage() {
  return (
    <div className="mainframe-page mainframe-page-split">
      <div className="mainframe-side-stack">
        <AiKeyPanel />
        <AssistantPanel />
      </div>
      <MainframeChat />
    </div>
  );
}
