import { WalidPresentation } from "@/components/presentations/WalidPresentation";
import "../walid.css";

type PageProps = { params: Promise<{ slug: string }> };

/** Raw package browser — Cursor presentation UI with full file inventory. */
export default async function RawPresentationPage({ params }: PageProps) {
  const { slug } = await params;
  return <WalidPresentation slug={slug} />;
}
