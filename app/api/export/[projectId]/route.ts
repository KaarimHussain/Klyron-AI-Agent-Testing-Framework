export const runtime = "nodejs";

import { db } from "@/lib/db/client";
import { automationScripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import JSZip from "jszip";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const scripts = await db
    .select()
    .from(automationScripts)
    .where(eq(automationScripts.projectId, projectId));

  if (scripts.length === 0) {
    return new Response(JSON.stringify({ error: "No scripts found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const zip = new JSZip();
  for (const s of scripts) {
    zip.file(s.fileName, s.code);
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const zipBuffer = zipBytes.buffer.slice(
    zipBytes.byteOffset,
    zipBytes.byteOffset + zipBytes.byteLength
  );

  return new Response(zipBuffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="testforge-${projectId}.zip"`,
    },
  });
}
