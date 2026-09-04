import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use | BH Contracting LTD.",
  description: "End-user license agreement and terms of use for BH Contracting LTD. applications.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-zinc-200">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-aqua">
        BH Contracting LTD.
      </p>
      <h1 className="mt-4 text-3xl font-bold text-white">Terms of Use (EULA)</h1>
      <p className="mt-2 text-sm text-zinc-400">Last updated: September 2, 2026</p>

      <div className="prose prose-invert mt-10 max-w-none space-y-6 text-sm leading-relaxed text-zinc-300">
        <p>
          These Terms of Use (&quot;Terms&quot;) govern access to BH Contracting LTD. internal
          operations software and connected services (the &quot;Application&quot;). By signing in
          or connecting third-party accounts (including Intuit QuickBooks), you agree to these
          Terms on behalf of your organization.
        </p>
        <h2 className="text-lg font-semibold text-white">Authorized use</h2>
        <p>
          The Application is for authorized BH Contracting LTD. staff and contractors only. You
          must keep login credentials confidential and notify us of unauthorized access.
        </p>
        <h2 className="text-lg font-semibold text-white">QuickBooks integration</h2>
        <p>
          Connecting QuickBooks grants the Application permission to read and write accounting
          data according to the scopes you approve during OAuth. You may disconnect at any time
          via Admin → Books or the disconnect URL configured in your Intuit app settings.
        </p>
        <h2 className="text-lg font-semibold text-white">Disclaimer</h2>
        <p>
          The Application is provided &quot;as is&quot; for business operations. Local P&amp;L and
          CRM reports are not certified financial statements unless sourced from QuickBooks
          Online.
        </p>
        <h2 className="text-lg font-semibold text-white">Contact</h2>
        <p>
          BH Contracting LTD. · Halifax, Nova Scotia ·{" "}
          <a href="mailto:info@bhcontracting.ca" className="text-primary-aqua hover:underline">
            info@bhcontracting.ca
          </a>
        </p>
      </div>

      <p className="mt-12 text-sm text-zinc-500">
        <Link href="/legal/privacy" className="text-primary-aqua hover:underline">
          Privacy Policy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/" className="text-primary-aqua hover:underline">
          Home
        </Link>
      </p>
    </main>
  );
}
