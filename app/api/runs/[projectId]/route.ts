export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { testRuns, testResults } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const runs = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.projectId, projectId))
    .orderBy(desc(testRuns.createdAt))
    .limit(10);

  if (runs.length === 0) return NextResponse.json([]);

  const latestRun = runs[0];
  const results = await db
    .select()
    .from(testResults)
    .where(eq(testResults.runId, latestRun.id))
    .orderBy(desc(testResults.createdAt));

  return NextResponse.json({ runs, latestResults: results });
}
