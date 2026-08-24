import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl } from "@/lib/calendar";
import { computeProposalTotal, linesFromCatalog, signProposal } from "@/lib/proposals";
import { signWebhookPayload } from "@/lib/webhooks";

describe("calendar ics", () => {
  it("builds a VEVENT with UID", () => {
    const ics = buildIcs({
      uid: "test@bhc",
      title: "Callback",
      startAt: "2026-08-24T17:00:00.000Z",
      endAt: "2026-08-24T18:00:00.000Z",
      location: "16 Harbor Lane",
    });
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:test@bhc");
    expect(ics).toContain("SUMMARY:Callback");
  });

  it("builds a Google Calendar template URL", () => {
    const url = googleCalendarUrl({
      uid: "x",
      title: "Demo",
      startAt: "2026-08-24T17:00:00.000Z",
      endAt: "2026-08-24T18:00:00.000Z",
    });
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("action=TEMPLATE");
  });
});

describe("proposals", () => {
  it("totals with tax", () => {
    expect(computeProposalTotal([{ label: "Deck", amount: 100 }], 0.1)).toBe(110);
  });

  it("signs a proposal", () => {
    const signed = signProposal(
      {
        id: "p1",
        pinId: "k1",
        productIds: [],
        serviceIds: [],
        lineItems: [],
        total: 0,
        taxRate: 0,
        notes: "",
        status: "draft",
        signedAt: null,
        signatureDataUrl: null,
        signerName: null,
        signerEmail: null,
        appointmentAt: null,
        createdAt: "t",
        createdById: "emp-admin",
      },
      {
        signerName: "Pat Homeowner",
        signatureDataUrl: "data:image/png;base64,xx",
        nowIso: "2026-08-24T00:00:00.000Z",
      },
    );
    expect(signed.status).toBe("signed");
    expect(signed.signerName).toBe("Pat Homeowner");
  });

  it("maps catalog lines", () => {
    const lines = linesFromCatalog(
      [{ id: "prod-deck", name: "Deck", sku: "D", unitPrice: 10, category: "x" }],
      [],
      ["prod-deck"],
      [],
    );
    expect(lines[0].amount).toBe(10);
  });
});

describe("webhooks", () => {
  it("signs payload HMAC", async () => {
    const sig = await signWebhookPayload("secret", "{\"ok\":true}");
    expect(sig).toHaveLength(64);
  });
});
