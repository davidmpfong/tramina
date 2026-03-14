export type ChatPhase =
  | "greeting"
  | "matching"
  | "selection"
  | "collection"
  | "review"
  | "done";

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
}

export interface CollectedField {
  stepId: string;
  stepTitle: string;
  prompt: string;
  answer: string;
}

export interface ChatState {
  phase: ChatPhase;
  messages: ChatMessage[];
  matchedOpportunities: MatchedOpportunity[];
  selectedOpportunityId: string | null;
  workflowSteps: WorkflowStep[];
  currentStepIndex: number;
  collectedFields: CollectedField[];
  locale: "en" | "es" | "km";
}

export interface MatchedOpportunity {
  id: string;
  name: string;
  funder: string;
  type: string;
  description: string;
  amount_min: number | null;
  amount_max: number | null;
  deadline: string | null;
  deadline_text: string | null;
  score: number;
}

export interface WorkflowStep {
  id: string;
  stepType: string;
  order: number;
  title: string;
  description: string;
  inputPrompt?: string;
  isOptional: boolean;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  phase: ChatPhase;
  locale: "en" | "es" | "km";
  selectedOpportunityId?: string;
  workflowSteps?: WorkflowStep[];
  currentStepIndex?: number;
  collectedFields?: CollectedField[];
  userId: string;
}

export interface ChatResponseChunk {
  type: "text" | "phase_change" | "opportunities" | "workflow" | "done";
  content?: string;
  phase?: ChatPhase;
  opportunities?: MatchedOpportunity[];
  workflowSteps?: WorkflowStep[];
}
