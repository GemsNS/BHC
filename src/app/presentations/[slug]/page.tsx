import { WalidPresentation } from "@/components/presentations/WalidPresentation";
import "./walid.css";

type PageProps = { params: Promise<{ slug: string }> };

export default async function PresentationPage({ params }: PageProps) {
  const { slug } = await params;
  return <WalidPresentation slug={slug} />;
}
