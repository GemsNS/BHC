import { redirect } from "next/navigation";

/** Public labour sheets are retired; pricing stays internal. */
export default function PricingPage() {
  redirect("/");
}
