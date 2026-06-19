import { db } from "./client";
import { appSettings } from "./schema";
import { DEFAULT_MODEL } from "@/lib/llm/client";

export async function getActiveModel(): Promise<string> {
  try {
    const [row] = await db.select().from(appSettings);
    return row?.selectedModel ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}
