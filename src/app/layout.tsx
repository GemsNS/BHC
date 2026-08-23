import type { Metadata } from "next";
import { Share_Tech_Mono, Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import { SessionProvider } from "@/lib/session";
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
  title: "Big Hoss Contracting | All-in-One CRM",
  description:
    "Operations CRM and field apps for Big Hoss Contracting — knocker, jobs, fleet, fuel, materials, and payroll.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BHC Apps",
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
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
