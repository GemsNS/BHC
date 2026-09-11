import { describe, expect, it, afterEach } from "vitest";
import {
  AGENT_HARNESS_ALLOWED_TOOLS,
  AGENT_HARNESS_DENIED_TOOLS,
  assertHarnessAllowlistValid,
  agentHarnessEnvEnabled,
  gateAgentHarnessTool,
  parseHarnessSections,
  runAgentOpsSweep,
} from "@/lib/agent-harness";
import { buildSeedData } from "@/lib/seed";

afterEach(() => {
  delete process.env.AGENT_HARNESS_ENABLED;
});

describe("agent harness allowlist", () => {
  it("every allowed tool exists on MAINFRAME_TOOL_NAMES", () => {
    expect(assertHarnessAllowlistValid()).toEqual([]);
  });

  it("refuses destructive / send / approve tools", () => {
    for (const name of AGENT_HARNESS_DENIED_TOOLS) {
      const gate = gateAgentHarnessTool(name);
      expect(gate.allowed, name).toBe(false);
      expect(gate.summary).toMatch(/REFUSED/);
    }
  });

  it("allows read + reversible write tools", () => {
    for (const name of AGENT_HARNESS_ALLOWED_TOOLS) {
      expect(gateAgentHarnessTool(name).allowed, name).toBe(true);
    }
  });
});

describe("agentHarnessEnvEnabled", () => {
  it("defaults off", () => {
    delete process.env.AGENT_HARNESS_ENABLED;
    expect(agentHarnessEnvEnabled()).toBe(false);
  });

  it("turns on with 1/true", () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    expect(agentHarnessEnvEnabled()).toBe(true);
    process.env.AGENT_HARNESS_ENABLED = "true";
    expect(agentHarnessEnvEnabled()).toBe(true);
    process.env.AGENT_HARNESS_ENABLED = "0";
    expect(agentHarnessEnvEnabled()).toBe(false);
  });
});

describe("parseHarnessSections", () => {
  it("extracts DID / NEEDS HUMAN / NOTED bullets", () => {
    const reply = `Preamble.

## DID
- listed ads
- created task for stale lead

## NEEDS HUMAN
- approve outreach draft out-1
- send outreach to lead-9

## NOTED
- IMAP still disabled
`;
    const s = parseHarnessSections(reply);
    expect(s.did).toEqual(["listed ads", "created task for stale lead"]);
    expect(s.needsHuman).toEqual([
      "approve outreach draft out-1",
      "send outreach to lead-9",
    ]);
    expect(s.noted).toEqual(["IMAP still disabled"]);
  });
});

describe("runAgentOpsSweep", () => {
  it("respects kill-switch without calling AI", async () => {
    process.env.AGENT_HARNESS_ENABLED = "0";
    const data = buildSeedData();
    let loopCalled = false;
    const r = await runAgentOpsSweep(data, {
      newId: () => "id-1",
      nowIso: () => "2026-09-11T12:00:00.000Z",
      runLoop: async () => {
        loopCalled = true;
        return null;
      },
    });
    expect(r.skipped).toBe("kill_switch");
    expect(loopCalled).toBe(false);
  });

  it("refuses denied tools inside the loop and notifies owner", async () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    const data = buildSeedData();
    let n = 0;
    const r = await runAgentOpsSweep(data, {
      newId: () => `id-${++n}`,
      nowIso: () => "2026-09-11T12:00:00.000Z",
      checkBudget: async () =>
        ({
          ok: true,
          day: {
            date: "2026-09-11",
            requests: 0,
            estimatedTokens: 0,
            byProvider: {},
            byEmployee: {},
          },
          limits: {
            dailyRequests: 200,
            dailyTokens: 500_000,
            perEmployeeDaily: 80,
            maxSteps: 6,
            maxMessageChars: 12_000,
            maxHistoryMessages: 24,
          },
        }) as never,
      recordUsage: async () =>
        ({
          date: "2026-09-11",
          requests: 1,
          estimatedTokens: 10,
          byProvider: {},
          byEmployee: {},
        }) as never,
      runLoop: async (input) => {
        await input.executeTool("send_outreach", { id: "out-1" });
        await input.executeTool("get_summary", {});
        return {
          reply: [
            "## DID",
            "- get_summary",
            "",
            "## NEEDS HUMAN",
            "- send outreach out-1",
            "",
            "## NOTED",
            "- none",
          ].join("\n"),
          toolRuns: [],
        };
      },
    });
    expect(r.ok).toBe(true);
    expect(r.toolRuns.some((t) => t.tool === "send_outreach" && t.refused)).toBe(
      true,
    );
    expect(r.needsHuman.length).toBeGreaterThan(0);
    expect(r.notifiedOwner).toBe(true);
    expect(data.notifications[0]?.title).toMatch(/needs human/i);
  });
});
