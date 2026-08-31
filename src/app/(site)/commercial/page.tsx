import type { Metadata } from "next";
import { CommercialSiteHome } from "@/components/site/pages/CommercialSiteHome";
import { getPricingItems } from "@/lib/site/pricingData";

export const metadata: Metadata = {
  title: "Commercial | BH Contracting LTD.",
  description:
    "Commercial building envelopes, exterior upgrades, and phased cladding and opening work for Nova Scotia properties.",
};

export default async function CommercialPage() {
  const pricingItems = await getPricingItems();
  return <CommercialSiteHome pricingItems={pricingItems} />;
}
