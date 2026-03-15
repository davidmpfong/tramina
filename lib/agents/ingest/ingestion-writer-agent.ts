import { supabaseServerService } from "@/lib/supabase/server";
import { IngestionWriterInput, IngestionWriterOutput, IngestionWriteError } from "@/lib/ingest/types";
import { sanitizeRawContent, validateSourceUrl } from "@/lib/sanitize";

function safeParseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return value;
}

/**
 * Writes ingested opportunity and workflow definition records to Supabase.
 */
export async function ingestionWriterAgent(input: IngestionWriterInput): Promise<IngestionWriterOutput> {
  if (!supabaseServerService) {
    throw new IngestionWriteError("Supabase service client not available");
  }

  const { data: opportunityData, error: opportunityError } = await supabaseServerService
    .from("opportunities")
    .upsert(
      {
        name: input.extractedData.name,
        funder: input.extractedData.funder,
        type: input.extractedData.type,
        description: input.extractedData.description,
        amount_min: input.extractedData.amountMin,
        amount_max: input.extractedData.amountMax,
        deadline: safeParseDate(input.extractedData.deadline),
        deadline_text: input.extractedData.deadlineText ?? null,
        eligibility_rules: input.extractedData.eligibilityRules,
        geographic_scope: input.extractedData.geographicScope,
        languages_available: input.extractedData.languagesAvailable,
        source_url: validateSourceUrl(input.extractedData.sourceUrl),
        raw_content: sanitizeRawContent(input.extractedData.rawContent ?? ""),
        ingest_run_id: input.ingestRunId,
        application_url: input.extractedData.applicationUrl,
        contact_email: input.extractedData.contactEmail,
        required_documents: input.extractedData.requiredDocuments,
        application_window_start: input.extractedData.applicationWindowStart,
        application_window_end: input.extractedData.applicationWindowEnd,
        award_type: input.extractedData.awardType,
        matching_tags: input.extractedData.matchingTags,
        wizard_estimated_minutes: input.estimatedMinutes ?? null,
        application_overview: input.applicationOverview ?? null,
        is_active: true
      },
      {
        onConflict: "name,funder",
        ignoreDuplicates: false
      }
    )
    .select("id")
    .single();

  if (opportunityError || !opportunityData?.id) {
    throw new IngestionWriteError(opportunityError?.message ?? "Failed to upsert opportunity");
  }

  let workflowDefinitionId: string;

  const { data: existingWorkflow, error: existingWorkflowError } = await supabaseServerService
    .from("workflow_definitions")
    .select("id, version")
    .eq("opportunity_id", opportunityData.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingWorkflowError) {
    throw new IngestionWriteError(existingWorkflowError.message);
  }

  if (existingWorkflow) {
    const { data: updatedWorkflow, error: updateWorkflowError } = await supabaseServerService
      .from("workflow_definitions")
      .update({
        steps: input.workflowSteps,
        locale: input.locale,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingWorkflow.id)
      .select("id")
      .single();

    if (updateWorkflowError || !updatedWorkflow?.id) {
      throw new IngestionWriteError(updateWorkflowError?.message ?? "Failed to update workflow definition");
    }

    workflowDefinitionId = updatedWorkflow.id;
  } else {
    const { data: insertedWorkflow, error: insertWorkflowError } = await supabaseServerService
      .from("workflow_definitions")
      .insert({
        opportunity_id: opportunityData.id,
        version: 1,
        steps: input.workflowSteps,
        locale: input.locale
      })
      .select("id")
      .single();

    if (insertWorkflowError || !insertedWorkflow?.id) {
      throw new IngestionWriteError(insertWorkflowError?.message ?? "Failed to insert workflow definition");
    }

    workflowDefinitionId = insertedWorkflow.id;
  }

  return {
    opportunityId: opportunityData.id,
    workflowDefinitionId
  };
}
