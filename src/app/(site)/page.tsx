import type { Metadata } from "next";
import { AudienceGate } from "@/components/site/landing/AudienceGate";

export const metadata: Metadata = {
  title: "Big Hoss Contracting | Residential & Commercial",
  description:
    "Halifax and coastal Nova Scotia contracting—choose a residential or commercial path for exteriors, renovations, and envelope work.",
};

export default function HomePage() {
  return <AudienceGate />;
}
