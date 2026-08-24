import { MainframeChat } from "@/components/mainframe/MainframeChat";
import { AssistantPanel } from "@/components/mainframe/AssistantPanel";

export default function AssistantPage() {
  return (
    <div className="mainframe-page mainframe-page-split">
      <AssistantPanel />
      <MainframeChat />
    </div>
  );
}
