import { About } from "@/components/site/sections/About";
import { Contact } from "@/components/site/sections/Contact";
import { ExteriorDesigner } from "@/components/site/sections/ExteriorDesigner";
import { Hero } from "@/components/site/sections/Hero";
import { JobShowcaseGallery } from "@/components/site/sections/JobShowcaseGallery";
import { QuoteInvitation } from "@/components/site/sections/QuoteInvitation";
import { Services } from "@/components/site/sections/Services";
import { ValueProposition } from "@/components/site/sections/ValueProposition";
import type { ProjectAudience } from "@/lib/site/audience";
import { getPricingItems } from "@/lib/site/pricingData";

type AudienceSiteHomeProps = {
  audience: ProjectAudience;
};

export async function AudienceSiteHome({ audience }: AudienceSiteHomeProps) {
  const pricingItems = await getPricingItems();

  return (
    <>
      <Hero audience={audience} />
      <ValueProposition audience={audience} />
      <ExteriorDesigner pricingItems={pricingItems} />
      <Services audience={audience} />
      <JobShowcaseGallery audience={audience} />
      <QuoteInvitation audience={audience} />
      <About audience={audience} />
      <Contact />
    </>
  );
}
