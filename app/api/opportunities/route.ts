import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { supabaseServerAnon, supabaseServerService } from "@/lib/supabase/server";
import { eligibilityRankingAgent } from "@/lib/agents/eligibility-ranking-agent";
import { opportunityRetrievalAgent } from "@/lib/agents/opportunity-retrieval-agent";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    })
  : null;

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) {
    return null;
  }

  const { data } = await supabaseServerAnon.auth.getUser(token);
  return data.user?.id ?? null;
}

export async function GET(req: NextRequest) {
  if (!supabaseServerService) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `opportunities:${userId}`;
  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json({ source: "cache", ranked: cached }, { status: 200 });
    }
  }

  const { data: profile } = await supabaseServerService
    .from("business_profiles")
    .select("industry,is_artist,years_in_business,zip_code")
    .eq("user_id", userId)
    .single();

  const retrieved = await opportunityRetrievalAgent({
    userId,
    zipCode: profile?.zip_code ?? undefined
  });

  const ranked = await eligibilityRankingAgent({
    opportunities: retrieved.opportunities,
    userProfile: {
      industry: profile?.industry,
      is_artist: profile?.is_artist,
      years_in_business: profile?.years_in_business
    }
  });

  if (redis) {
    await redis.set(cacheKey, ranked.ranked, { ex: 60 * 15 });
  }

  return NextResponse.json({ source: "db", ranked: ranked.ranked }, { status: 200 });
}
