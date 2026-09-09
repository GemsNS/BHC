import type { Metadata } from "next";
import { SnowRemovalPage } from "@/components/site/pages/SnowRemovalPage";

export const metadata: Metadata = {
  title: "Snow Removal Halifax | BH Contracting LTD.",
  description:
    "Seasonal snow removal packages for Halifax Regional Municipality—driveway, walkway, ice melt, and commercial routes. Transparent starting rates for the winter season.",
  openGraph: {
    title: "Snow Removal · BH Contracting LTD.",
    description:
      "HRM snow clearing packages from Driveway Guard to commercial routes. Book before the first storm.",
  },
};

export default function SnowRemovalRoutePage() {
  return <SnowRemovalPage />;
}
