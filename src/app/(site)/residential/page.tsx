import type { Metadata } from "next";
import { AudienceSiteHome } from "@/components/site/pages/AudienceSiteHome";

export const metadata: Metadata = {
  title: "Residential | BH Contracting Co.",
  description:
    "Residential renovations, custom exteriors, and coastal-durable craftsmanship for Halifax and Nova Scotia homeowners.",
};

export default function ResidentialPage() {
  return <AudienceSiteHome audience="residential" />;
}
