import { NextRequest, NextResponse } from "next/server";
import { onboardSchema } from "@/lib/validation/onboard";
import { supabaseServerAnon, supabaseServerService } from "@/lib/supabase/server";

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return null;
  }

  const { data } = await supabaseServerAnon.auth.getUser(token);
  return data.user?.id ?? null;
}

export async function POST(req: NextRequest) {
  if (!supabaseServerService) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = onboardSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = { ...parsed.data, user_id: userId };

  const { data, error } = await supabaseServerService
    .from("business_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("id,user_id,industry,zip_code")
    .single();

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  return NextResponse.json({ profile: data }, { status: 200 });
}
