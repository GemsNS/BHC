import { afterEach, describe, expect, it } from "vitest";
import {
  adMatchesSource,
  canonicalUrl,
  ensureBuiltinSource,
  extractContacts,
  ingestRawAds,
  listingIdFromUrl,
  newAdSource,
  parseAlertEmail,
  parseFeed,
  stripHtml,
} from "../src/lib/ad-ingest";
import { classifyAdLocal, draftFollowUpLocal, draftReplyLocal } from "../src/lib/ad-classify";
import { qualifyListing, runAdIngest } from "../src/lib/ad-pipeline";
import {
  inQuietHours,
  markAdReplied,
  processOutreachQueue,
  queueFollowUps,
  sendPolicy,
  type SendPolicy,
} from "../src/lib/outreach-send";
import { sendSms, toE164 } from "../src/lib/sms";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import type { AdListing, AppData } from "../src/lib/types";

let n = 0;
const ctx = { newId: () => `ad-${++n}`, nowIso: () => new Date().toISOString() };

function store(): AppData {
  const d = normalizeStore(buildDemoSeedData());
  d.adSources = [];
  d.adListings = [];
  d.outreachQueue = [];
  return d;
}

const DEMAND_AD = {
  title: "Looking for someone to replace vinyl siding on bungalow",
  body: "Need a quote to replace the siding on our 1200 sq ft bungalow in Dartmouth. Some rot on the north side. Call or text 902-555-0142 or email jane.doe@example.com. Hoping to get it done this fall.",
};
const SUPPLY_AD = {
  title: "Professional siding installers — free estimates",
  body: "We offer siding, soffit and fascia installation across HRM. Licensed and insured, 15 years experience. Call us today!",
};

const noSendPolicy: SendPolicy = {
  autosend: new Set(),
  autosendMinScore: 75,
  dailyCap: 25,
  quietStart: 0,
  quietEnd: 0,
  followUpDays: 3,
  maxFollowUps: 1,
};

afterEach(() => {
  delete process.env.OUTREACH_AUTOSEND;
  delete process.env.ADS_MIN_SCORE;
});

describe("ad parsing", () => {
  it("strips html and decodes entities", () => {
    expect(stripHtml("<p>Need &amp; want <b>siding</b><br/>Dartmouth &#39;NS&#39;</p>")).toBe("Need & want siding\nDartmouth 'NS'");
  });

  it("canonicalizes listing URLs and extracts ids", () => {
    const u = "https://www.kijiji.ca/v-skilled-trades/city-of-halifax/need-siding-replaced/1712345678?utm_source=alert&siteLocale=en_CA#top";
    expect(canonicalUrl(u)).toBe("https://www.kijiji.ca/v-skilled-trades/city-of-halifax/need-siding-replaced/1712345678");
    expect(listingIdFromUrl(u)).toBe("kijiji:1712345678");
    expect(listingIdFromUrl("https://halifax.craigslist.org/lbs/d/dartmouth-deck-rebuild/7712345678.html")).toBe("craigslist:7712345678");
  });

  it("extracts phone + email", () => {
    expect(extractContacts("text me at (902) 555-0142 or jane@example.com")).toEqual({ phone: "902-555-0142", email: "jane@example.com" });
  });

  it("parses RSS items and Atom entries", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title><![CDATA[Need deck rebuilt &amp; stairs]]></title><link>https://example.test/ads/1?utm_source=x</link><description><![CDATA[<p>Looking for a quote, Bedford. 902-555-0100</p>]]></description><pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate><guid>ad-1</guid></item>
      <item><title>Windows install wanted</title><link>https://example.test/ads/2</link><description>Six windows, Sackville</description></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Need deck rebuilt & stairs");
    expect(items[0].url).toBe("https://example.test/ads/1");
    expect(items[0].externalId).toBe("ad-1");
    expect(items[0].contactPhone).toBe("902-555-0100");
    expect(items[0].postedAt).toBe("2026-09-01T12:00:00.000Z");

    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Fence quote</title><link rel="alternate" href="https://example.test/a/9"/><summary>Cole Harbour backyard fence</summary><updated>2026-09-02T10:00:00Z</updated><id>tag:9</id></entry></feed>`;
    const a = parseFeed(atom);
    expect(a).toHaveLength(1);
    expect(a[0].url).toBe("https://example.test/a/9");
    expect(a[0].externalId).toBe("tag:9");
  });

  it("parses a Kijiji-style alert email into one ad per listing", () => {
    const html = `<html><body><h2>New ads matching "siding wanted"</h2>
      <a href="https://www.kijiji.ca/v-skilled-trades/city-of-halifax/need-siding-replaced/1712345678?utm_source=alert">Need siding replaced on bungalow</a>
      <p>Dartmouth · Posted today</p><p>Some rot on north side, looking for quotes. 902-555-0142</p>
      <a href="https://www.kijiji.ca/v-skilled-trades/city-of-halifax/need-siding-replaced/1712345678">View ad</a>
      <a href="https://www.kijiji.ca/v-skilled-trades/bedford/deck-stairs-repair/1712345999">Deck stairs repair</a>
      <p>Bedford · small job</p>
      <a href="https://www.kijiji.ca/my/alerts">Manage alerts</a>
    </body></html>`;
    const ads = parseAlertEmail({ subject: "2 new ads", html, from: "Kijiji Alerts <alerts@kijiji.ca>" });
    expect(ads).toHaveLength(2);
    expect(ads[0].externalId).toBe("kijiji:1712345678");
    expect(ads[0].title).toBe("Need siding replaced on bungalow");
    expect(ads[0].body).toContain("Dartmouth");
    expect(ads[0].contactPhone).toBe("902-555-0142");
    expect(ads[1].title).toBe("Deck stairs repair");
  });

  it("does not treat a platform sender as the poster's contact and cleans alert prefixes", () => {
    const ads = parseAlertEmail({
      subject: "New ad: Deck rebuild wanted in Bedford",
      text: "Looking for someone to rebuild a deck in Bedford. Call 902-555-0177",
      from: "Kijiji Alerts <alerts@kijiji.ca>",
    });
    expect(ads).toHaveLength(1);
    expect(ads[0].title).toBe("Deck rebuild wanted in Bedford");
    expect(ads[0].contactName).toBe("");
    expect(ads[0].contactEmail).toBe("");
    expect(ads[0].contactPhone).toBe("902-555-0177");
  });

  it("falls back to one ad for a plain forwarded email", () => {
    const ads = parseAlertEmail({
      subject: "Quote for soffit and fascia",
      text: "Hi, I have a two storey in Fall River and need soffit replaced. 902-555-0199",
      from: "Bob Smith <bob@example.com>",
      messageId: "<abc@mail>",
    });
    expect(ads).toHaveLength(1);
    expect(ads[0].externalId).toBe("mail:<abc@mail>");
    expect(ads[0].contactEmail).toBe("bob@example.com");
    expect(ads[0].contactName).toBe("Bob Smith");
    expect(ads[0].contactPhone).toBe("902-555-0199");
  });
});

describe("ingest + dedupe", () => {
  it("ingests once and skips duplicates by id or url", () => {
    const d = store();
    const src = newAdSource({ name: "Test", type: "rss", excludeKeywords: ["for sale"] }, ctx);
    d.adSources.push(src);
    const raws = [
      { externalId: "k:1", url: "https://x.test/1", ...DEMAND_AD },
      { externalId: "k:1", url: "https://x.test/1", ...DEMAND_AD },
      { externalId: "k:2", url: "https://x.test/1?utm_source=y", title: "dup by url", body: "" },
      { externalId: "k:3", url: "https://x.test/3", title: "Truck for sale", body: "for sale $5000" },
    ];
    expect(ingestRawAds(d, src, raws, ctx)).toHaveLength(1);
    expect(ingestRawAds(d, src, raws, ctx)).toHaveLength(0);
    expect(d.adListings).toHaveLength(1);
    expect(adMatchesSource({ ...src, keywords: ["deck"] }, { title: "siding", body: "" })).toBe(false);
  });

  it("ensureBuiltinSource is idempotent", () => {
    const d = store();
    const a = ensureBuiltinSource(d, "manual", ctx);
    const b = ensureBuiltinSource(d, "manual", ctx);
    expect(a.id).toBe(b.id);
    expect(d.adSources).toHaveLength(1);
  });
});

describe("local classifier + drafts", () => {
  const base = (over: Partial<AdListing>): AdListing => ({
    id: "a",
    sourceId: "s",
    sourceName: "Kijiji",
    externalId: "x",
    url: "",
    title: "",
    body: "",
    location: "",
    postedAt: null,
    fetchedAt: ctx.nowIso(),
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    status: "new",
    score: 0,
    category: "other",
    jobType: null,
    summary: "",
    reasons: [],
    classifiedBy: null,
    leadId: null,
    outreachIds: [],
    repliedAt: null,
    notes: "",
    ...over,
  });

  it("scores a homeowner request high and a competitor ad low", () => {
    const demand = classifyAdLocal(base({ ...DEMAND_AD, contactPhone: "902-555-0142" }));
    expect(demand.isJobRequest).toBe(true);
    expect(demand.score).toBeGreaterThanOrEqual(75);
    expect(demand.category).toBe("siding");
    expect(demand.jobType).toBe("residential");
    expect(demand.reasons.join(" ")).toMatch(/asking for help/);

    const supply = classifyAdLocal(base(SUPPLY_AD));
    expect(supply.isJobRequest).toBe(false);
    expect(supply.score).toBeLessThan(55);
    expect(supply.reasons.join(" ")).toMatch(/advertising services/);

    const commercial = classifyAdLocal(base({ title: "Warehouse needs new metal cladding", body: "Commercial building in Burnside, need quotes for exterior cladding replacement." }));
    expect(commercial.jobType).toBe("commercial");
  });

  it("drafts include the ad, a next step, and opt-out language", () => {
    const ad = base({ ...DEMAND_AD, contactName: "Jane Doe", location: "Dartmouth", category: "siding" });
    const profile = { name: "BH Contracting LTD.", shortName: "BH Contracting", signer: "Cameron", phone: "902-555-0000", email: "info@bhcontracting.ca", website: "https://bhcontracting.ca", area: "Halifax Regional Municipality", services: "siding and decks" };
    const d = draftReplyLocal(ad, profile);
    expect(d.emailBody).toContain("Hi Jane,");
    expect(d.emailBody).toContain(DEMAND_AD.title.slice(0, 40));
    expect(d.emailBody).toMatch(/free|no charge/);
    expect(d.emailBody).toContain("no thanks");
    expect(d.smsBody.length).toBeLessThanOrEqual(320);
    expect(d.smsBody).toMatch(/STOP to opt out/);
    const fu = draftFollowUpLocal(ad, "sms", profile);
    expect(fu.body).toMatch(/STOP/);
  });
});

describe("pipeline", () => {
  it("qualifies a demand ad → lead + email + sms drafts pending approval; skips a supply ad", async () => {
    const d = store();
    const src = newAdSource({ name: "Kijiji", type: "manual" }, ctx);
    d.adSources.push(src);
    const [demand, supply] = ingestRawAds(
      d,
      src,
      [
        { externalId: "d1", ...DEMAND_AD, contactEmail: "jane.doe@example.com", contactPhone: "902-555-0142", contactName: "Jane" },
        { externalId: "s1", ...SUPPLY_AD },
      ],
      ctx,
    );
    const leadsBefore = d.leads.length;
    const r1 = await qualifyListing(d, demand, { ...ctx, ai: false, policy: noSendPolicy });
    expect(r1.qualified).toBe(true);
    expect(demand.status).toBe("drafted");
    expect(d.leads.length).toBe(leadsBefore + 1);
    expect(d.leads[0].source).toBe("Ad · Kijiji");
    expect(d.leads[0].email).toBe("jane.doe@example.com");
    expect(r1.drafts.map((x) => x.channel).sort()).toEqual(["email", "sms"]);
    expect(r1.drafts.every((x) => x.status === "pending_approval")).toBe(true);
    expect(r1.drafts.every((x) => x.adId === demand.id)).toBe(true);

    // Re-qualifying does not duplicate the lead or the drafts
    await qualifyListing(d, demand, { ...ctx, ai: false, policy: noSendPolicy });
    expect(d.leads.length).toBe(leadsBefore + 1);
    expect(d.outreachQueue.filter((o) => o.adId === demand.id)).toHaveLength(2);

    const r2 = await qualifyListing(d, supply, { ...ctx, ai: false, policy: noSendPolicy });
    expect(r2.qualified).toBe(false);
    expect(supply.status).toBe("skipped");
  });

  it("creates a platform draft when the ad has no contact info", async () => {
    const d = store();
    const src = newAdSource({ name: "Marketplace", type: "manual" }, ctx);
    d.adSources.push(src);
    const [ad] = ingestRawAds(d, src, [{ externalId: "p1", title: "Need a deck built in Bedford", body: "Looking for quotes for a 12x16 pressure treated deck." }], ctx);
    const r = await qualifyListing(d, ad, { ...ctx, ai: false, policy: noSendPolicy });
    expect(r.qualified).toBe(true);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].channel).toBe("platform");
  });

  it("auto-approves when policy allows the channel and score is high enough", async () => {
    const d = store();
    const src = newAdSource({ name: "Kijiji", type: "manual" }, ctx);
    d.adSources.push(src);
    const [ad] = ingestRawAds(d, src, [{ externalId: "a1", ...DEMAND_AD, contactEmail: "jane@example.com", contactPhone: "902-809-0142" }], ctx);
    const policy: SendPolicy = { ...noSendPolicy, autosend: new Set(["email"]), autosendMinScore: 70 };
    const r = await qualifyListing(d, ad, { ...ctx, ai: false, policy });
    const email = r.drafts.find((x) => x.channel === "email")!;
    const sms = r.drafts.find((x) => x.channel === "sms")!;
    expect(email.status).toBe("approved");
    expect(sms.status).toBe("pending_approval");
  });

  it("runAdIngest polls an RSS source through the injected fetcher", async () => {
    const d = store();
    d.adSources.push(newAdSource({ name: "Feed", type: "rss", url: "https://feed.test/rss" }, ctx));
    const xml = `<rss><channel><item><title>${DEMAND_AD.title}</title><link>https://feed.test/1</link><description>${DEMAND_AD.body}</description><guid>f1</guid></item></channel></rss>`;
    const fetcher = (async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
    const r = await runAdIngest(d, { ...ctx, ai: false, fetcher, policy: noSendPolicy });
    expect(r.polled).toBe(1);
    expect(r.created).toBe(1);
    expect(r.qualified).toBe(1);
    expect(r.leads).toBe(1);
    expect(r.drafts).toBe(2);
    expect(d.adSources[0].lastPolledAt).toBeTruthy();
    expect(d.adSources[0].lastError).toBeNull();

    const failing = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const r2 = await runAdIngest(d, { ...ctx, ai: false, fetcher: failing, policy: noSendPolicy });
    expect(r2.errors[0]).toContain("HTTP 503");
    expect(d.adSources[0].lastError).toContain("HTTP 503");
  });
});

describe("sending", () => {
  function seededQueue() {
    const d = store();
    const src = newAdSource({ name: "Kijiji", type: "manual" }, ctx);
    d.adSources.push(src);
    const [ad] = ingestRawAds(d, src, [{ externalId: "q1", ...DEMAND_AD, contactEmail: "jane@example.com", contactPhone: "902-809-0142" }], ctx);
    return { d, ad };
  }

  it("never sends pending_approval; sends approved via injected senders and records provider ids", async () => {
    const { d, ad } = seededQueue();
    await qualifyListing(d, ad, { ...ctx, ai: false, policy: noSendPolicy });
    const emailCalls: string[] = [];
    const senders = {
      email: async (m: { to: string }) => {
        emailCalls.push(m.to);
        return { ok: true, provider: "smtp", id: "<m1>" };
      },
      sms: async () => ({ ok: true, provider: "twilio", id: "SM1" }),
    };
    let r = await processOutreachQueue(d, ctx, senders, noSendPolicy);
    expect(r.sent).toBe(0);
    expect(emailCalls).toHaveLength(0);

    const email = d.outreachQueue.find((o) => o.channel === "email")!;
    email.status = "approved";
    r = await processOutreachQueue(d, ctx, senders, noSendPolicy);
    expect(r.sent).toBe(1);
    expect(emailCalls).toEqual(["jane@example.com"]);
    expect(email.status).toBe("sent");
    expect(email.provider).toBe("smtp");
    expect(email.providerMessageId).toBe("<m1>");
    expect(ad.status).toBe("sent");
    expect(d.activities[0].relatedId).toBe(ad.leadId);
  });

  it("respects the daily cap, SMS quiet hours, and records failures", async () => {
    const { d, ad } = seededQueue();
    await qualifyListing(d, ad, { ...ctx, ai: false, policy: noSendPolicy });
    for (const o of d.outreachQueue) o.status = "approved";
    const quiet: SendPolicy = { ...noSendPolicy, quietStart: 0, quietEnd: 24 }; // always quiet
    const senders = {
      email: async () => ({ ok: false, error: "550 mailbox unavailable" }),
      sms: async () => ({ ok: true, provider: "twilio", id: "SM2" }),
    };
    const r = await processOutreachQueue(d, ctx, senders, quiet);
    expect(r.failed).toBe(1);
    expect(r.deferred).toBe(1); // sms deferred by quiet hours
    expect(d.outreachQueue.find((o) => o.channel === "email")!.error).toContain("550");

    const capped: SendPolicy = { ...noSendPolicy, dailyCap: 0 };
    const r2 = await processOutreachQueue(d, ctx, senders, capped);
    expect(r2.sent).toBe(0);
    expect(r2.deferred).toBeGreaterThan(0);
  });

  it("queues exactly one follow-up after N days and stops when the poster replies", () => {
    const { d, ad } = seededQueue();
    ad.status = "sent";
    ad.leadId = null;
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString();
    d.outreachQueue.unshift({
      id: "sent-1",
      leadId: null,
      prospectName: "Jane",
      prospectEmail: "jane@example.com",
      prospectPhone: "",
      channel: "email",
      subject: "Re: siding",
      message: "hi",
      status: "sent",
      workflowRunId: null,
      scheduledAt: fourDaysAgo,
      sentAt: fourDaysAgo,
      createdAt: fourDaysAgo,
      adId: ad.id,
    });
    expect(queueFollowUps(d, ctx, noSendPolicy).created).toBe(1);
    expect(queueFollowUps(d, ctx, noSendPolicy).created).toBe(0);
    const fu = d.outreachQueue.find((o) => o.followUpOf === "sent-1")!;
    expect(fu.status).toBe("pending_approval");
    expect(fu.message).toMatch(/follow-up|still/i);

    expect(markAdReplied(d, ad.id, ctx)).toBe(true);
    expect(ad.status).toBe("replied");
    d.outreachQueue = d.outreachQueue.filter((o) => !o.followUpOf);
    expect(queueFollowUps(d, ctx, noSendPolicy).created).toBe(0);
  });

  it("sendPolicy parses env", () => {
    process.env.OUTREACH_AUTOSEND = "email, sms";
    expect([...sendPolicy().autosend].sort()).toEqual(["email", "sms"]);
    process.env.OUTREACH_AUTOSEND = "";
    expect(sendPolicy().autosend.size).toBe(0);
    expect(inQuietHours({ ...noSendPolicy, quietStart: 21, quietEnd: 8 }, new Date("2026-09-01T23:30:00"))).toBe(true);
    expect(inQuietHours({ ...noSendPolicy, quietStart: 21, quietEnd: 8 }, new Date("2026-09-01T12:00:00"))).toBe(false);
  });
});

describe("twilio sender", () => {
  it("normalizes to E.164 and posts form-encoded with basic auth", async () => {
    expect(toE164("(902) 555-0142")).toBe("+19025550142");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("12345")).toBeNull();

    process.env.TWILIO_ENABLED = "1";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+19025550000";
    let captured: { url: string; init: RequestInit } | null = null;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
    }) as unknown as typeof fetch;
    const r = await sendSms({ to: "902-555-0142", body: "hello" }, fetcher);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("SM123");
    const c = captured!;
    expect(c.url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    expect((c.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("ACtest:tok").toString("base64")}`);
    const params = new URLSearchParams(String(c.init.body));
    expect(params.get("To")).toBe("+19025550142");
    expect(params.get("From")).toBe("+19025550000");
    expect(params.get("Body")).toBe("hello");

    const failing = (async () => new Response(JSON.stringify({ code: 21211, message: "Invalid 'To'" }), { status: 400 })) as unknown as typeof fetch;
    const bad = await sendSms({ to: "902-555-0142", body: "x" }, failing);
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("21211");
    delete process.env.TWILIO_ENABLED;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });
});
