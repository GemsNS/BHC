"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";

/**
 * Full-page routes (e.g. immersive showcase) render without the global chrome.
 */
export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isShowcase = pathname === "/showcase" || pathname === "/showcase/";

  if (isShowcase) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
