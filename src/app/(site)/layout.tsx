import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
