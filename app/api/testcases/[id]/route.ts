export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const PatchSchema = z.object({
  title: z.string().optional(),
  module: z.string().optional(),
  type: z.enum(["functional", "ui", "negative", "edge-case"]).optional(),
  preconditions: z.string().nullable().optional(),
  steps: z.array(z.string()).optional(),
  expectedResult: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["draft", "approved"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(testCases)
    .set(parsed.data)
    .where(eq(testCases.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(testCases).where(eq(testCases.id, id));
  return NextResponse.json({ ok: true });
}
