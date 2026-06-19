import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import { DEFAULT_MODEL } from "@/lib/llm/client";
import { z } from "zod";

export async function GET() {
  try {
    const [row] = await db.select().from(appSettings);
    return NextResponse.json({ selectedModel: row?.selectedModel ?? DEFAULT_MODEL });
  } catch {
    return NextResponse.json({ selectedModel: DEFAULT_MODEL });
  }
}

const PatchSchema = z.object({
  selectedModel: z.string().min(1),
});

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { selectedModel } = parsed.data;

  await db
    .insert(appSettings)
    .values({ id: "global", selectedModel, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { selectedModel, updatedAt: new Date() },
    });

  return NextResponse.json({ selectedModel });
}
