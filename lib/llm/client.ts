import OpenAI from "openai";

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "placeholder",
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "Klyron",
  },
});

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat";
