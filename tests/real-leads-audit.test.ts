import { describe, expect, it } from "vitest";
import { buildDemoSeedData } from "@/lib/demo-seed";
import { buildSeedData } from "@/lib/seed";
import { huntLeadsFromCriteria } from "@/lib/mainframe-prospects";
import { findProspectsForLead, scoreLead } from "@/lib/lead-automation";
import {
  isJunkAdTitle,
  isRealContactEmail,
  isRealHttpUrl,
  looksFabricatedProspect,
  purgeSyntheticOutreachAndAds,
} from "@/lib/outreach-guard";
import { parseAlertEmail } from "@/lib/ad-ingest";
import type { Lead } from "@/lib/types";

describe("outreach guard", () => {
  it("flags fabricated HRM demo contacts", () => {
    expect(
      looksFabricatedProspect({
        name: "Cole Harbour Community Board",
        email: "projects@coleharbour.ca",
        phone: "(902) 555-4600",
      }),
    ).toBe(true);
    expect(isRealContactEmail("projects@coleharbour.ca")).toBe(false);
    expect(isRealContactEmail("homeowner@gmail.com")).toBe(true);
    expect(isRealHttpUrl("https://www.kijiji.ca/v-view-details.html?adId=1")).toBe(true);
    expect(isRealHttpUrl("")).toBe(false);
    expect(isJunkAdTitle("Today’s search results for exterior")).toBe(true);
  });

  it("purges synthetic outreach, junk ads, and fake CRM leads", () => {
    const data = buildSeedData();
    data.outreachQueue = [
      {
        id: "out-region-Halifax",
        leadId: null,
        prospectName: "Peninsula Property Managers",
        prospectEmail: "ops@peninsulapm.ca",
        prospectPhone: "(902) 555-4100",
        channel: "email",
        subject: "Envelope",
        message: "Professional Nova Scotia contractor.\n\nReaching out regarding Envelope in Halifax, NS.",
        status: "approved",
        workflowRunId: null,
        scheduledAt: new Date().toISOString(),
        sentAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    data.adListings = [
      {
        id: "ad-junk",
        sourceId: "x",
        sourceName: "x",
        externalId: "x",
        url: "",
        title: "Today's search results for siding",
        body: "",
        location: "",
        postedAt: null,
        fetchedAt: new Date().toISOString(),
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
        leadId: "lead-junk-1",
        outreachIds: [],
        repliedAt: null,
        notes: "",
      },
    ];
    data.leads = [
      {
        id: "lead-junk-1",
        name: "Ad poster — Today's search results for siding",
        phone: "",
        email: "",
        address: "See ad",
        city: "HRM",
        source: "Ad · x",
        status: "new",
        jobType: "residential",
        notes: "Ad: Today's search results for siding\n",
        assignedToId: null,
        companyId: null,
        leadScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "lead-real",
        name: "Real Client",
        phone: "(902) 809-1234",
        email: "client@gmail.com",
        address: "1 Main",
        city: "Halifax",
        source: "Referral",
        status: "new",
        jobType: "residential",
        notes: "",
        assignedToId: null,
        companyId: null,
        leadScore: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const r = purgeSyntheticOutreachAndAds(data);
    expect(r.cancelledOutreach).toBe(1);
    expect(r.removedAds).toBe(1);
    expect(r.removedLeads).toBe(1);
    expect(data.outreachQueue[0].status).toBe("cancelled");
    expect(data.leads.map((l) => l.id)).toEqual(["lead-real"]);
  });
});

describe("hunt leads — no invented contacts", () => {
  it("does not invent coleharbour/sackville-style emails", () => {
    const data = buildSeedData();
    data.outreachQueue = [];
    const before = data.outreachQueue.length;
    const r = huntLeadsFromCriteria(data, undefined, 5);
    const invented = data.outreachQueue.filter((o) =>
      /coleharbour\.ca|sackvillebp\.ca|bedfordres\.ca|dartmouthparks\.ca|peninsulapm\.ca/i.test(
        o.prospectEmail,
      ),
    );
    expect(invented).toHaveLength(0);
    // With empty CRM leads matching, queued should be 0
    expect(r.queued).toBe(0);
    expect(data.outreachQueue.length).toBe(before);
    expect(r.notes.join(" ")).toMatch(/no longer invents|No matching CRM leads/i);
  });

  it("queues outreach only to real CRM leads with email", () => {
    const data = buildSeedData();
    data.outreachQueue = [];
    const stamp = new Date().toISOString();
    const lead: Lead = {
      id: "lead-real-1",
      name: "Jamie Homeowner",
      phone: "(902) 555-0101", // placeholder phone ok if email is real
      email: "jamie.homeowner@gmail.com",
      address: "12 Main St",
      city: "Halifax",
      source: "Kijiji",
      status: "qualified",
      jobType: "residential",
      notes: "needs roof and siding",
      assignedToId: null,
      companyId: null,
      leadScore: 80,
      createdAt: stamp,
      updatedAt: stamp,
    };
    data.leads = [lead];
    // Fix phone to non-555 so leadHasReachableContact via email still works
    lead.phone = "(902) 809-1234";
    const r = huntLeadsFromCriteria(data, undefined, 5);
    expect(r.queued).toBe(1);
    expect(data.outreachQueue[0].prospectEmail).toBe("jamie.homeowner@gmail.com");
    expect(data.outreachQueue[0].leadId).toBe(lead.id);
  });
});

describe("findProspectsForLead", () => {
  it("only returns similar real CRM leads — never demo templates", () => {
    const data = buildDemoSeedData();
    const lead = data.leads[0];
    const prospects = findProspectsForLead(data, lead, 5);
    expect(
      prospects.every((p) => isRealContactEmail(p.prospectEmail)),
    ).toBe(true);
    expect(
      prospects.every(
        (p) => !/coastalhoa|driftwoodgroup|harborcityretail|bayareapm/i.test(p.prospectEmail),
      ),
    ).toBe(true);
  });

  it("scores referral commercial leads higher", () => {
    const lead: Lead = {
      ...buildDemoSeedData().leads[0],
      source: "Referral",
      jobType: "commercial",
      email: "a@b.com",
      phone: "9028091234",
    };
    expect(scoreLead(lead)).toBeGreaterThan(70);
  });
});

describe("ad alert ingest", () => {
  it("does not invent listings from search-result digest subjects", () => {
    const ads = parseAlertEmail({
      subject: "Today's search results for exterior",
      text: "No listings matched in the body.",
      html: "",
      from: "alerts@kijiji.ca",
    });
    expect(ads).toHaveLength(0);
  });
});
