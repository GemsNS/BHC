import type { Metadata } from "next";
import { Share_Tech_Mono, Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const hud = Share_Tech_Mono({
  variable: "--font-hud",
  subsets: ["latin"],
  weight: ["400"],
});

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BH Contracting LTD. | All-in-One CRM",
  description:
    "Operations CRM and field apps for BH Contracting LTD. — knocker, jobs, fleet, fuel, materials, and payroll.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BH Apps",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${hud.variable} antialiased`}>
        <SessionProvider>
          <ServiceWorkerRegister />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
