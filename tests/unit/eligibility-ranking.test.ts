import { describe, it, expect } from "vitest";
import { eligibilityRankingAgent } from "@/lib/agents/eligibility-ranking-agent";
import type { OpportunityRecord } from "@/lib/agents/opportunity-retrieval-agent";

const makeOpportunity = (overrides: Partial<OpportunityRecord> = {}): OpportunityRecord => ({
  id: "opp-1",
  name: "Test Grant",
  type: "grant",
  amount_min: 10000,
  amount_max: 50000,
  deadline: null,
  eligibility_rules: {},
  ...overrides
});

describe("eligibilityRankingAgent", () => {
  it("returns ranked opportunities with base score of 0.5", async () => {
    const result = await eligibilityRankingAgent({
      opportunities: [makeOpportunity()],
      userProfile: {}
    });
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]!.score).toBe(0.5);
  });

  it("adds 0.1 bonus for businesses with 2+ years in operation", async () => {
    const result = await eligibilityRankingAgent({
      opportunities: [makeOpportunity()],
      userProfile: { years_in_business: 2 }
    });
    expect(result.ranked[0]!.score).toBe(0.6);
  });

  it("adds 0.2 bonus for artists when opportunity targets artists", async () => {
    const result = await eligibilityRankingAgent({
      opportunities: [makeOpportunity({ eligibility_rules: { target: "artist" } })],
      userProfile: { is_artist: true }
    });
    expect(result.ranked[0]!.score).toBeCloseTo(0.7);
  });

  it("stacks all bonuses for qualifying artists with 2+ years", async () => {
    const result = await eligibilityRankingAgent({
      opportunities: [makeOpportunity({ eligibility_rules: { type: "artist grant" } })],
      userProfile: { is_artist: true, years_in_business: 3 }
    });
    expect(result.ranked[0]!.score).toBeCloseTo(0.8);
  });

  it("does not add artist bonus when is_artist is false", async () => {
    const result = await eligibilityRankingAgent({
      opportunities: [makeOpportunity({ eligibility_rules: { target: "artist" } })],
      userProfile: { is_artist: false }
    });
    expect(result.ranked[0]!.score).toBe(0.5);
  });

  it("does not add years bonus for < 2 years in business", async () => {
    const result = await eligibilityRankingAgent({
      opportunities: [makeOpportunity()],
      userProfile: { years_in_business: 1 }
    });
    expect(result.ranked[0]!.score).toBe(0.5);
  });

  it("sorts opportunities by score descending", async () => {
    const opps = [
      makeOpportunity({ id: "low", eligibility_rules: {} }),
      makeOpportunity({ id: "high", eligibility_rules: { type: "artist fund" } })
    ];
    const result = await eligibilityRankingAgent({
      opportunities: opps,
      userProfile: { is_artist: true, years_in_business: 5 }
    });
    expect(result.ranked[0]!.id).toBe("high");
    expect(result.ranked[1]!.id).toBe("low");
  });

  it("limits results to 10 opportunities", async () => {
    const opps = Array.from({ length: 20 }, (_, i) => makeOpportunity({ id: `opp-${i}` }));
    const result = await eligibilityRankingAgent({ opportunities: opps, userProfile: {} });
    expect(result.ranked).toHaveLength(10);
  });

  it("returns reasons array on each ranked opportunity", async () => {
    const result = await eligibilityRankingAgent({
      opportunities: [makeOpportunity({ eligibility_rules: { type: "artist" } })],
      userProfile: { is_artist: true, years_in_business: 3 }
    });
    expect(result.ranked[0]!.reasons).toBeInstanceOf(Array);
    expect(result.ranked[0]!.reasons.length).toBeGreaterThan(0);
  });

  it("handles empty opportunities array", async () => {
    const result = await eligibilityRankingAgent({ opportunities: [], userProfile: {} });
    expect(result.ranked).toHaveLength(0);
  });
});
