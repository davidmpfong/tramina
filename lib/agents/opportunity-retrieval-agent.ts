import { supabaseServerService } from "@/lib/supabase/server";

export interface OpportunityRetrievalInput {
  userId: string;
  zipCode?: string;
}

export interface OpportunityRecord {
  id: string;
  name: string;
  type: "grant" | "loan" | "benefit";
  amount_min: number | null;
  amount_max: number | null;
  deadline: string | null;
  eligibility_rules: Record<string, unknown>;
}

export interface OpportunityRetrievalOutput {
  opportunities: OpportunityRecord[];
}

/**
 * Fetches active opportunities from Supabase (optionally narrowed by user geography/profile).
 */
export async function opportunityRetrievalAgent(
  input: OpportunityRetrievalInput
): Promise<OpportunityRetrievalOutput> {
  if (!supabaseServerService) {
    return { opportunities: [] };
  }

  const query = supabaseServerService
    .from("opportunities")
    .select("id,name,type,amount_min,amount_max,deadline,eligibility_rules")
    .eq("is_active", true)
    .limit(50);

  const { data } = await query;

  return {
    opportunities: (data ?? []) as OpportunityRecord[]
  };
}
