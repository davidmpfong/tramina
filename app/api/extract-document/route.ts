import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseServerAnon } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Auth check
  const token = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: authData } = await supabaseServerAnon.auth.getUser(token);
  if (!authData.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const imageFile = formData.get("image");
  const fieldsRaw = formData.get("fields");
  const documentType = formData.get("documentType");

  if (!(imageFile instanceof File)) {
    return Response.json({ error: "Missing image file" }, { status: 400 });
  }

  if (typeof fieldsRaw !== "string" || typeof documentType !== "string") {
    return Response.json({ error: "Missing fields or documentType" }, { status: 400 });
  }

  let fields: string[];
  try {
    fields = JSON.parse(fieldsRaw) as string[];
    if (!Array.isArray(fields) || fields.length === 0) throw new Error();
  } catch {
    return Response.json({ error: "fields must be a non-empty JSON array of strings" }, { status: 400 });
  }

  // Size limit: 10MB
  if (imageFile.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Image too large. Maximum 10MB." }, { status: 413 });
  }

  const mimeType = imageFile.type || "image/jpeg";
  const buffer = Buffer.from(await imageFile.arrayBuffer());
  const base64 = buffer.toString("base64");

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API not configured" }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const fieldList = fields.map((f) => `  - ${f}`).join("\n");
  const prompt = [
    `You are a document data extraction assistant. The user has provided an image of a ${documentType}.`,
    `Extract the following fields from the document and return them as a JSON object:`,
    fieldList,
    `Rules:`,
    `- Return ONLY a valid JSON object with the field names as keys and extracted values as strings.`,
    `- If a field cannot be found in the document, use null as the value.`,
    `- Do not include any explanation or markdown fences.`,
    `- Field names should match exactly as listed above.`
  ].join("\n");

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64,
          mimeType
        }
      }
    ]);

    const text = result.response.text();
    const clean = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();

    let extracted: Record<string, string | null>;
    try {
      extracted = JSON.parse(clean) as Record<string, string | null>;
    } catch {
      return Response.json({ error: "Could not parse extraction result", raw: text }, { status: 422 });
    }

    return Response.json({ extracted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
