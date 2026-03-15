/* eslint-disable no-console */

/**
 * Grant Hunter CLI
 * 
 * Discovers and scores potential grants for ingestion.
 * 
 * Usage:
 *   ADMIN_SECRET=... npx tsx scripts/hunt-grants.ts
 * 
 * Optional env vars:
 *   BASE_URL         — defaults to https://tramina.vercel.app
 *   AUDIENCE         — target audience description
 *   GEOGRAPHY        — geographic focus
 *   INDUSTRIES       — comma-separated industry list
 *   MAX_CANDIDATES   — number of candidates (default 10)
 *   BYPASS_TOKEN     — Vercel protection bypass token
 */

export {};

const BASE_URL = process.env.BASE_URL || "https://tramina.vercel.app";
const BYPASS_TOKEN = process.env.BYPASS_TOKEN || "Ebf916hL4CtthHhWr1tYHyoSRz6rNMLl";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("ERROR: ADMIN_SECRET env var is required");
  process.exit(1);
}

const AUDIENCE = process.env.AUDIENCE ?? "immigrant-owned small businesses, including restaurant, food, arts, and retail businesses";
const GEOGRAPHY = process.env.GEOGRAPHY ?? "Lynn, Massachusetts and surrounding areas";
const INDUSTRIES = process.env.INDUSTRIES ? process.env.INDUSTRIES.split(",").map(s => s.trim()) : ["restaurant", "food", "arts", "culture", "retail", "general small business"];
const MAX_CANDIDATES = parseInt(process.env.MAX_CANDIDATES ?? "10", 10);

type ScoredCandidate = {
  name: string;
  funder: string;
  description: string;
  applicationUrl: string | null;
  programUrl: string | null;
  deadline: string | null;
  isCurrentlyOpen: boolean | null;
  eligibilitySummary: string | null;
  requiredDocuments: string[];
  totalScore: number;
  recommendation: "INGEST_READY" | "REVIEW_NEEDED" | "SKIP";
  recommendationReason: string;
};

function formatScore(score: number): string {
  const bar = "█".repeat(Math.round(score)) + "░".repeat(10 - Math.round(score));
  return `[${bar}] ${score.toFixed(1)}/10`;
}

function formatRecommendation(rec: ScoredCandidate["recommendation"]): string {
  switch (rec) {
    case "INGEST_READY": return "✅ INGEST READY";
    case "REVIEW_NEEDED": return "⚠️  REVIEW NEEDED";
    case "SKIP": return "❌ SKIP";
  }
}

async function main() {
  console.log("\n🔍 Grant Hunter");
  console.log("═".repeat(60));
  console.log(`Audience:  ${AUDIENCE}`);
  console.log(`Geography: ${GEOGRAPHY}`);
  console.log(`Industries: ${INDUSTRIES.join(", ")}`);
  console.log(`Candidates: up to ${MAX_CANDIDATES}`);
  console.log("═".repeat(60));
  console.log("\nSearching for grant candidates...\n");

  const startedAt = Date.now();

  const response = await fetch(`${BASE_URL}/api/admin/hunt-grants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-protection-bypass": BYPASS_TOKEN
    },
    body: JSON.stringify({
      adminSecret: ADMIN_SECRET,
      audience: AUDIENCE,
      geography: GEOGRAPHY,
      industries: INDUSTRIES,
      maxCandidates: MAX_CANDIDATES
    })
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "<no body>");
    console.error(`Request failed (${response.status}): ${text}`);
    process.exit(1);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const candidates: ScoredCandidate[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const eventLine = part.split("\n").find(l => l.startsWith("event: "));
      const dataLine = part.split("\n").find(l => l.startsWith("data: "));
      if (!eventLine || !dataLine) continue;

      const event = eventLine.slice(7).trim();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (event === "started") {
        console.log("Hunt started.\n");
      } else if (event === "candidate") {
        const c = data as ScoredCandidate;
        candidates.push(c);
        const icon = c.recommendation === "INGEST_READY" ? "✅" : c.recommendation === "REVIEW_NEEDED" ? "⚠️ " : "❌";
        console.log(`${icon} ${c.name}`);
        console.log(`   Score: ${formatScore(c.totalScore)}`);
        console.log(`   Funder: ${c.funder}`);
        if (c.applicationUrl) console.log(`   Apply: ${c.applicationUrl}`);
        if (c.deadline) console.log(`   Deadline: ${c.deadline}`);
        console.log(`   Note: ${c.recommendationReason}`);
        console.log();
      } else if (event === "done") {
        const summary = data.summary as { total: number; ingestReady: number; reviewNeeded: number; skip: number };
        const ms = Date.now() - startedAt;
        console.log("═".repeat(60));
        console.log("SUMMARY");
        console.log("═".repeat(60));
        console.log(`Total candidates: ${summary.total}`);
        console.log(`✅ Ingest ready:  ${summary.ingestReady}`);
        console.log(`⚠️  Review needed: ${summary.reviewNeeded}`);
        console.log(`❌ Skip:          ${summary.skip}`);
        console.log(`\nCompleted in ${(ms / 1000).toFixed(1)}s`);

        // Ingest commands for ready grants
        const ready = candidates.filter(c => c.recommendation === "INGEST_READY");
        if (ready.length > 0) {
          console.log("\n📋 Ingest commands for ready grants:");
          for (const c of ready) {
            const urlArg = c.applicationUrl || c.programUrl;
            const sourceArg = urlArg ? `, "sourceUrl": "${urlArg}"` : "";
            console.log(`\n  # ${c.name}`);
            console.log(`  curl -s -N -X POST ${BASE_URL}/api/admin/ingest-grant \\`);
            console.log(`    -H 'Content-Type: application/json' \\`);
            console.log(`    -d '{"grantName": "${c.name}"${sourceArg}, "adminSecret": "${ADMIN_SECRET}", "locale": "en"}'`);
          }
        }
      } else if (event === "error") {
        console.error(`\nError: ${data.message as string}`);
        process.exit(1);
      }
    }
  }
}

void main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
