import { WalidGate } from "@/components/presentations/WalidGate";
import "./walid.css";

type PageProps = { params: Promise<{ slug: string }> };

export default async function PresentationPage({ params }: PageProps) {
  const { slug } = await params;
  return <WalidGate slug={slug} />;
}
