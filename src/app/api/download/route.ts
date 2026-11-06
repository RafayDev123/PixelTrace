import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const file = await readFile(path.join(process.cwd(), "PixelTrace-Complete-Project.zip"));
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="PixelTrace-Complete-Project.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "not_found", message: "The project archive has not been generated yet." } }, { status: 404 });
  }
}
