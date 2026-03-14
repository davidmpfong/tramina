import { z } from "zod";

export const onboardSchema = z.object({
  business_name: z.string().min(1).max(150).default("My Business"),
  industry: z.string().min(1).max(80),
  zip_code: z.string().min(3).max(12),
  years_in_business: z.coerce.number().int().min(0).max(100),
  employee_count: z.coerce.number().int().min(0).max(10000),
  revenue_range: z.enum(["under_50k", "50k_100k", "100k_250k", "250k_500k", "500k_plus"]),
  is_artist: z.boolean(),
  is_immigrant_owned: z.boolean().default(true),
  is_minority_owned: z.boolean().default(false),
  is_woman_owned: z.boolean().default(false)
});

export type OnboardInput = z.infer<typeof onboardSchema>;
