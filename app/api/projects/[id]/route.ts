import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { projects, sitePages, testCases, automationScripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const pages = await db.select().from(sitePages).where(eq(sitePages.projectId, id));
    const cases = await db.select().from(testCases).where(eq(testCases.projectId, id));
    const scripts = await db
      .select()
      .from(automationScripts)
      .where(eq(automationScripts.projectId, id));

    return NextResponse.json({ ...project, pages, testCases: cases, scripts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
