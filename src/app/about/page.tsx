import { Download, Lock, ScanSearch, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "About" };

const CAN = [
  "Read EXIF, IPTC, XMP, ICC and file-structure metadata from JPEG, PNG, WebP and TIFF.",
  "Report what the metadata claims about camera, capture settings, timestamps and GPS, each field kept separate.",
  "Compute a SHA-256 fingerprint and detect byte-identical duplicates.",
  "Apply transparent rules that point out metadata worth a manual look, with evidence and limitations.",
];
const CANNOT = [
  "Prove that an image is authentic, original, fake or manipulated.",
  "Identify a photographer, or a device when its metadata is missing.",
  "Recover or guess GPS location from the picture or from your network.",
  "Treat file-system times as capture times. Uploads don't carry them.",
];

export default function AboutPage() {
  return (
    <>
      <PageHeader eyebrow="About" title="PixelTrace" description="Image intelligence and metadata analysis built for careful, honest reading of what an image file actually contains." actions={<LinkButton href="/analyze" variant="primary" icon={<ScanSearch className="h-4 w-4" />}>Analyze image</LinkButton>} />
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="What PixelTrace can do" />
          <ul className="list-disc space-y-2 p-5 pl-9 text-[13.5px] leading-relaxed text-muted">
            {CAN.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="What it cannot do" />
          <ul className="list-disc space-y-2 p-5 pl-9 text-[13.5px] leading-relaxed text-muted">
            {CANNOT.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader title="Privacy notice" action={<Lock className="h-4 w-4 text-ok" aria-hidden />} />
          <div className="space-y-3 p-5 text-[13.5px] leading-relaxed text-muted">
            <p className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />Images can contain sensitive metadata: GPS coordinates, device serial numbers, owner names and editing history. Anyone you share an unstripped file with can read it.</p>
            <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />PixelTrace processes uploads in memory and never stores the original file. GPS and identifiers are withheld by the server and in every export until you explicitly reveal or include them. Cloud storage is off by default and nothing is sent to third-party services, apart from an optional map you load yourself.</p>
          </div>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader title="Project source" subtitle="Complete, runnable source with Windows launch scripts, tests and documentation" />
          <div className="flex flex-wrap items-center gap-3 p-5">
            <LinkButton
              href="/api/download"
              download
              variant="primary"
              icon={<Download className="h-4 w-4" />}
              className="min-w-0 max-w-full !h-auto min-h-10 whitespace-normal py-2 text-left"
            >
              Download PixelTrace-Complete-Project.zip
            </LinkButton>
            <p className="text-[13px] text-muted">Metadata engine: exifr · Image validation: sharp/libvips · Reports: pdf-lib</p>
          </div>
        </Card>
      </div>
    </>
  );
}
