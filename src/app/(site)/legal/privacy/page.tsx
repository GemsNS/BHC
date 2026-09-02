import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | BH Contracting LTD.",
  description: "Privacy policy for BH Contracting LTD. staff and customer applications.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-zinc-200">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-aqua">
        BH Contracting LTD.
      </p>
      <h1 className="mt-4 text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-400">Last updated: September 2, 2026</p>

      <div className="prose prose-invert mt-10 max-w-none space-y-6 text-sm leading-relaxed text-zinc-300">
        <p>
          BH Contracting LTD. (&quot;we&quot;, &quot;us&quot;) operates internal staff tools and
          customer-facing services for Halifax Regional Municipality contracting operations.
          This policy describes how we collect, use, and protect information when you use our
          applications, including integrations with third-party services such as Intuit
          QuickBooks Online.
        </p>
        <h2 className="text-lg font-semibold text-white">Information we collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Account information (name, email, login) for authorized staff</li>
          <li>CRM and job data entered by staff (leads, jobs, contracts, invoices)</li>
          <li>
            QuickBooks connection tokens when you connect accounting — stored securely on our
            server, not in public pages
          </li>
          <li>Technical logs (IP address, browser type) for security and troubleshooting</li>
        </ul>
        <h2 className="text-lg font-semibold text-white">How we use information</h2>
        <p>
          We use data to operate our CRM, schedule work, generate invoices, and sync accounting
          with QuickBooks when you authorize that connection. We do not sell personal information.
        </p>
        <h2 className="text-lg font-semibold text-white">Third-party services</h2>
        <p>
          When you connect QuickBooks, Intuit&apos;s privacy policy applies to data processed by
          Intuit. See{" "}
          <a
            href="https://www.intuit.com/privacy/"
            className="text-primary-aqua underline-offset-2 hover:underline"
          >
            intuit.com/privacy
          </a>
          .
        </p>
        <h2 className="text-lg font-semibold text-white">Contact</h2>
        <p>
          Questions:{" "}
          <a href="mailto:info@bhcontracting.co" className="text-primary-aqua hover:underline">
            info@bhcontracting.co
          </a>{" "}
          · (902) 809-9412
        </p>
      </div>

      <p className="mt-12 text-sm text-zinc-500">
        <Link href="/" className="text-primary-aqua hover:underline">
          ← Home
        </Link>
      </p>
    </main>
  );
}
