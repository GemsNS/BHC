import { SiteAbout } from "@/components/marketing/SiteAbout";
import { SiteContact } from "@/components/marketing/SiteContact";
import { SiteHero } from "@/components/marketing/SiteHero";
import { SiteServices } from "@/components/marketing/SiteServices";

export default function ResidentialPage() {
  return (
    <>
      <SiteHero audience="residential" />
      <SiteServices audience="residential" />
      <SiteAbout audience="residential" />
      <SiteContact />
    </>
  );
}
