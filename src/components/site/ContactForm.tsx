"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const LIMITS = { name: 120, email: 254, phone: 40, details: 4000 } as const;
const STORAGE_KEY = "bhcExteriorQuote";

/** Same-origin API in dev/Vercel; GitHub Pages static builds need a full URL (e.g. Vercel API). */
function contactApiUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CONTACT_API_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";
  return `${base}/api/contact`;
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function loadQuoteSummary(): string {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return "";
    const o = JSON.parse(raw) as { summary?: string };
    sessionStorage.removeItem(STORAGE_KEY);
    return typeof o.summary === "string" ? o.summary.trim() : "";
  } catch {
    return "";
  }
}

export type QuoteType = "exterior" | "other";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState("");
  const [quoteType, setQuoteType] = useState<QuoteType>("exterior");

  const applyStoredQuote = useCallback(() => {
    const block = loadQuoteSummary();
    if (!block) return;
    setDetails((prev) => (prev.trim() ? `${block}\n\n${prev}` : block));
  }, []);

  useEffect(() => {
    if (quoteType === "exterior") {
      applyStoredQuote();
    }
  }, [applyStoredQuote, quoteType]);

  const handleQuoteTypeChange = useCallback((next: QuoteType) => {
    setQuoteType(next);
    if (next === "exterior") {
      applyStoredQuote();
    } else {
      setDetails((d) =>
        d.trim().startsWith("[Exterior configuration") ? "" : d,
      );
    }
  }, [applyStoredQuote]);

  useEffect(() => {
    const onPrefill = () => {
      setQuoteType("exterior");
      applyStoredQuote();
    };
    window.addEventListener("bhc-quote-prefill", onPrefill);
    return () => window.removeEventListener("bhc-quote-prefill", onPrefill);
  }, [applyStoredQuote]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const detailsStr = details.trim();

    if (!name || name.length > LIMITS.name) {
      setStatus("error");
      setMessage("Please enter your name.");
      return;
    }
    if (!email || !isValidEmail(email) || email.length > LIMITS.email) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }
    if (!phone || phone.length > LIMITS.phone) {
      setStatus("error");
      setMessage("Please enter your phone number.");
      return;
    }
    if (!detailsStr || detailsStr.length > LIMITS.details) {
      setStatus("error");
      setMessage("Please describe your project.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(contactApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          details: detailsStr,
          quoteType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setStatus("error");
        setMessage(
          typeof data.error === "string" ? data.error : "Something went wrong. Please try again.",
        );
        return;
      }

      setStatus("success");
      setMessage("");
      setDetails("");
      form.reset();
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <fieldset className="space-y-3 rounded-sm border border-zinc-200 bg-white px-3 py-3 sm:px-4">
        <legend className="px-1 text-sm font-semibold text-base-black">
          What kind of quote do you need?
        </legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-base-black/85">
          <input
            type="radio"
            name="quoteType"
            value="exterior"
            checked={quoteType === "exterior"}
            onChange={() => handleQuoteTypeChange("exterior")}
            className="mt-1 h-4 w-4 border-base-black/20 text-primary-aqua focus:ring-primary-aqua"
          />
          <span>
            <span className="font-medium text-base-black">Exterior package</span>
            <span className="mt-0.5 block text-xs text-base-black/55">
              Siding, windows, and/or doors — optionally build selections in the designer above and
              attach the summary here.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-base-black/85">
          <input
            type="radio"
            name="quoteType"
            value="other"
            checked={quoteType === "other"}
            onChange={() => handleQuoteTypeChange("other")}
            className="mt-1 h-4 w-4 border-base-black/20 text-primary-aqua focus:ring-primary-aqua"
          />
          <span>
            <span className="font-medium text-base-black">Other services</span>
            <span className="mt-0.5 block text-xs text-base-black/55">
              Decks, roofing, renovations, general contracting, etc. No exterior configuration
              required—describe your project below.
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <label htmlFor="contact-name" className="block text-sm font-semibold text-base-black">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={LIMITS.name}
          className="mt-2 w-full rounded-sm border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-primary-aqua/25 transition-shadow focus:border-primary-aqua focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-semibold text-base-black">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={LIMITS.email}
          className="mt-2 w-full rounded-sm border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-primary-aqua/25 transition-shadow focus:border-primary-aqua focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="contact-phone" className="block text-sm font-semibold text-base-black">
          Phone
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={LIMITS.phone}
          className="mt-2 w-full rounded-sm border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-primary-aqua/25 transition-shadow focus:border-primary-aqua focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="contact-details" className="block text-sm font-semibold text-base-black">
          Project details
        </label>
        <textarea
          id="contact-details"
          name="details"
          rows={5}
          maxLength={LIMITS.details}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={
            quoteType === "exterior"
              ? "Tell us about your project, timeline, and location…"
              : "Describe the work you need (e.g. deck build, roof replacement, renovation scope), timeline, and location…"
          }
          className="mt-2 w-full resize-y rounded-sm border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-primary-aqua/25 transition-shadow focus:border-primary-aqua focus:ring-2"
        />
      </div>

      {status === "error" && message ? (
        <p className="text-sm font-medium text-red-700" role="alert">
          {message}
        </p>
      ) : null}
      {status === "success" ? (
        <p className="text-sm font-semibold text-primary-aqua" role="status">
          Thank you — we&apos;ll be in touch shortly.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary-aqua px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Sending…
          </>
        ) : (
          "Submit"
        )}
      </button>
    </form>
  );
}
