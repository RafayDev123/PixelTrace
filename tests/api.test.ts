import { describe, expect, it } from "vitest";
import { POST as analyzePost } from "@/app/api/analyze/route";
import { POST as bulkPost } from "@/app/api/analyze/bulk/route";
import { GET as analysisGet, DELETE as analysisDelete } from "@/app/api/analysis/[id]/route";
import { GET as historyGet } from "@/app/api/analysis/history/route";
import { GET as reportGet } from "@/app/api/reports/[id]/[format]/route";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as settingsGet } from "@/app/api/settings/route";
import { EXIF_FULL, makeImage } from "./fixtures";

const hasDb = Boolean(process.env.DATABASE_URL);

function form(files: { name: string; data: Buffer; field?: string }[]): Request {
  const fd = new FormData();
  for (const f of files) fd.append(f.field ?? "file", new File([new Uint8Array(f.data)], f.name));
  return new Request("http://localhost/api/x", { method: "POST", body: fd });
}
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

describe.skipIf(!hasDb)("API integration (requires DATABASE_URL)", () => {
  it("health endpoint is ok", async () => {
    expect((await healthGet()).status).toBe(200);
  });

  it("analyses a valid JPEG and hides GPS/serial by default", async () => {
    const res = await analyzePost(form([{ name: "gps.jpg", data: await makeImage("jpeg", { exif: EXIF_FULL }) }]));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.file.detectedFormat).toBe("JPEG");
    expect(body.gps.present).toBe(true);
    expect(body.gps.latitude).toBeNull();
    expect(JSON.stringify(body)).not.toContain("SN-TEST-123");

    const again = await analysisGet(new Request(`http://localhost/api/analysis/${body.id}`), params({ id: body.id }));
    expect((await again.json()).gps.latitude).toBeNull();
    const revealed = await analysisGet(new Request(`http://localhost/api/analysis/${body.id}?reveal=location,identifiers`), params({ id: body.id }));
    const rb = await revealed.json();
    expect(rb.gps.latitude).toBe(51.5);
    expect(rb.camera.find((f: { id: string }) => f.id === "serial").value).toBe("SN-TEST-123");

    for (const fmt of ["json", "csv", "pdf"]) {
      const r = await reportGet(new Request(`http://localhost/api/reports/${body.id}/${fmt}`), params({ id: body.id, format: fmt }));
      expect(r.status).toBe(200);
      const text = Buffer.from(await r.arrayBuffer()).toString("latin1");
      expect(text).not.toContain("SN-TEST-123");
      if (fmt === "pdf") expect(text.startsWith("%PDF-")).toBe(true);
    }
    expect((await analysisDelete(new Request("http://localhost"), params({ id: body.id }))).status).toBe(200);
  });

  it("analyses PNG and WebP", async () => {
    for (const fmt of ["png", "webp"] as const) {
      const res = await analyzePost(form([{ name: `a.${fmt}`, data: await makeImage(fmt, { color: fmt === "png" ? "#aa2200" : "#00aa22" }) }]));
      expect(res.status).toBe(201);
    }
  });

  it("returns structured errors for invalid, corrupted and unsupported files", async () => {
    const invalid = await analyzePost(form([{ name: "notes.jpg", data: Buffer.from("plain text, not an image at all") }]));
    expect(invalid.status).toBe(415);
    expect((await invalid.json()).error.code).toBe("unsupported_format");
    const good = await makeImage("jpeg", { width: 300, height: 300 });
    const corrupt = await analyzePost(form([{ name: "bad.jpg", data: Buffer.concat([good.subarray(0, 250), Buffer.alloc(20, 9)]) }]));
    expect(corrupt.status).toBe(422);
    const none = await analyzePost(new Request("http://localhost/api/analyze", { method: "POST", body: new FormData() }));
    expect(none.status).toBe(400);
  });

  it("bulk: continues after a failure and detects duplicates", async () => {
    const dup = await makeImage("png", { color: "#112233" });
    const res = await bulkPost(
      form([
        { name: "one.png", data: dup, field: "files" },
        { name: "broken.jpg", data: Buffer.from("nope nope nope nope"), field: "files" },
        { name: "copy.png", data: dup, field: "files" },
      ]),
    );
    const body = await res.json();
    expect(body.summary).toMatchObject({ total: 3, succeeded: 2, failed: 1, duplicateGroups: 1 });
    expect(body.results[1].status).toBe("error");
    const hist = await historyGet(new Request(`http://localhost/api/analysis/history?sessionId=${body.sessionId}`));
    expect((await hist.json()).items.length).toBe(2);
  });

  it("bulk rejects more than the configured number of files", async () => {
    const img = await makeImage("png");
    const files = Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.png`, data: img, field: "files" }));
    expect((await bulkPost(form(files))).status).toBe(413);
  });

  it("settings expose limits", async () => {
    const body = await (await settingsGet()).json();
    expect(body.limits.maxFiles).toBe(10);
    expect(body.limits.maxFileBytes).toBe(20 * 1024 * 1024);
    expect(body.cloud.enabled).toBe(false);
  });
});
