import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { type EnvConfig } from "../config.js";
import {
  extractionResultSchema,
  type ExtractionResult,
} from "./schemas.js";

export async function extractWithOpenAI(
  env: EnvConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ result: ExtractionResult; modelName: string; rawJson: string }> {
  if (!env.AI_API_KEY) {
    throw new Error("AI_API_KEY is required for AI extraction");
  }

  const client = new OpenAI({ apiKey: env.AI_API_KEY });
  const modelName = env.AI_MODEL;

  const completion = await client.chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(extractionResultSchema, "extraction"),
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("AI extraction failed: empty response");
  }

  const parsedJson = JSON.parse(content) as unknown;
  const validated = extractionResultSchema.parse(parsedJson);
  const rawJson = content;

  return { result: validated, modelName, rawJson };
}
