import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Presentation | BH Contracting LTD.",
  robots: { index: false, follow: false },
};

export default function PresentationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
