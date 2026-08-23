"use client";

import { useState } from "react";
import Link from "next/link";

export function SiteContact() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <section className="site-section site-section-dark" id="contact">
      <div className="site-container site-contact-grid">
        <div>
          <h2 className="site-section-title site-section-title-light">Contact</h2>
          <p className="site-contact-lead">
            Tell us about your project — residential or commercial. We respond within one business day.
          </p>
          <p className="site-contact-detail">info@bighoss.com · (303) 555-0100</p>
          <Link href="/login" className="site-ghost-btn site-ghost-light">
            Staff login →
          </Link>
        </div>
        {sent ? (
          <p className="site-form-success">Thanks — our team will reach out shortly.</p>
        ) : (
          <form className="site-contact-form" onSubmit={onSubmit}>
            <label>
              Name
              <input name="name" required autoComplete="name" />
            </label>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Project type
              <select name="type" defaultValue="residential">
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </label>
            <label>
              Message
              <textarea name="message" rows={4} required />
            </label>
            <button type="submit" className="site-cta-btn">
              Send message
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
