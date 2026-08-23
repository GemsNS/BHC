import { SiteAbout } from "@/components/marketing/SiteAbout";
import { SiteContact } from "@/components/marketing/SiteContact";
import { SiteHero } from "@/components/marketing/SiteHero";
import { SiteServices } from "@/components/marketing/SiteServices";

export default function CommercialPage() {
  return (
    <>
      <SiteHero audience="commercial" />
      <SiteServices audience="commercial" />
      <SiteAbout audience="commercial" />
      <SiteContact />
    </>
  );
}
