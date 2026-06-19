import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  targetUrl: z.string().url(),
  scopeNotes: z.string().optional(),
  loginUsername: z.string().optional(),
  loginPassword: z.string().optional(),
  userStory: z.string().optional(),
  requirementDoc: z.string().optional(),
  apiDoc: z.string().optional(),
});

export async function GET() {
  try {
    const rows = await db.select().from(projects).orderBy(desc(projects.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { name, targetUrl, scopeNotes, loginUsername, loginPassword, userStory, requirementDoc, apiDoc } = parsed.data;
    const [project] = await db
      .insert(projects)
      .values({
        name,
        targetUrl,
        scopeNotes: scopeNotes ?? null,
        loginUsername: loginUsername ?? null,
        loginPassword: loginPassword ?? null,
        userStory: userStory ?? null,
        requirementDoc: requirementDoc ?? null,
        apiDoc: apiDoc ?? null,
      })
      .returning();
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
