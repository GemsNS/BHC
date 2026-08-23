import { Inter } from "next/font/google";
import { ConditionalLayout } from "@/components/site/ConditionalLayout";
import "@/styles/seaside-site.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/**
 * Public marketing shell — 1:1 Seaside Contracting port, rebranded BH Contracting.
 * CRM routes live outside this group (`/login`, `/admin`, `/apps`).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`seaside-root ${inter.variable} font-sans antialiased`}>
      <ConditionalLayout>{children}</ConditionalLayout>
    </div>
  );
}
