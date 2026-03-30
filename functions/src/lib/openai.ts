import OpenAI from "openai";
import { defineSecret } from "firebase-functions/params";

export const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  openaiClient = new OpenAI({
    apiKey: OPENAI_API_KEY.value(),
  });

  return openaiClient;
}
