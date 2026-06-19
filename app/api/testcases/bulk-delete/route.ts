export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { testCases } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { z } from "zod";

const RequestSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db.delete(testCases).where(inArray(testCases.id, parsed.data.ids));
  return NextResponse.json({ deleted: parsed.data.ids.length });
}
