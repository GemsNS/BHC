"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { ContactForm } from "@/components/site/ContactForm";
import { Reveal } from "@/components/site/motion/Reveal";

export function Contact() {
  return (
    <section
      id="contact"
      className="scroll-mt-32 border-t border-zinc-200/80 bg-white py-20 sm:scroll-mt-36 sm:py-28"
      aria-labelledby="contact-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal>
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                Contact
              </p>
              <h2
                id="contact-heading"
                className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.35rem] lg:leading-snug"
              >
                Start your project
              </h2>
              <p className="mt-5 text-base leading-relaxed text-zinc-600 sm:text-lg">
                Tell us what you need—choose{" "}
                <strong className="font-semibold text-zinc-900">Exterior package</strong> for siding,
                windows, or doors (optionally use the designer above), or{" "}
                <strong className="font-semibold text-zinc-900">Other services</strong> for everything
                else.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-x-20 lg:gap-y-12">
            <Reveal delay={0.05} y={20}>
              <div className="min-w-0">
                <div className="rounded-sm border border-zinc-200 bg-zinc-50/80 p-6 shadow-sm sm:p-8 lg:p-10">
                  <ContactForm />
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.08} y={20}>
              <aside className="min-w-0 border-l border-zinc-200 pl-0 lg:border-l lg:pl-12">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                  Direct
                </p>
                <ul className="mt-6 space-y-6 text-base text-zinc-700">
                  <li className="flex gap-4">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary-aqua" strokeWidth={2} aria-hidden />
                    <a
                      href="tel:+19028099412"
                      className="font-semibold text-zinc-900 transition-colors hover:text-primary-aqua"
                    >
                      (902) 809-9412
                    </a>
                  </li>
                  <li className="flex gap-4">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary-aqua" strokeWidth={2} aria-hidden />
                    <a
                      href="mailto:info@bhcontracting.co"
                      className="transition-colors hover:text-primary-aqua"
                    >
                      info@bhcontracting.co
                    </a>
                  </li>
                  <li className="flex gap-4">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary-aqua" strokeWidth={2} aria-hidden />
                    <span>Halifax, Nova Scotia</span>
                  </li>
                </ul>
              </aside>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
