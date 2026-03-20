import OpenAI from "openai";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY must be set. (or AI_INTEGRATIONS_OPENAI_API_KEY for Replit)",
  );
}

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

export const openai = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});
