"use client";

import { Eye, EyeOff, ExternalLink, Lock, MapPin } from "lucide-react";
import { useState } from "react";
import type { Field, GpsInfo, RevealOptions } from "@/lib/types";
import { Alert, Badge, Button, Card, CardHeader, CopyButton } from "../ui";

export type RevealKind = keyof RevealOptions;

export function FieldList({ fields, onReveal }: { fields: Field[]; onReveal?: (kind: RevealKind) => void }) {
  return (
    <dl className="divide-y divide-line">
      {fields.map((f) => (
        <div key={f.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
          <dt className="text-[13px] text-muted">{f.label}</dt>
          <dd className="min-w-0 text-sm">
            {f.masked ? (
              <span className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-faint">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Present, hidden for privacy
                </span>
                {onReveal && f.sensitiveKind && (
                  <Button size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => onReveal(f.sensitiveKind === "location" ? "location" : "identifiers")}>
                    Reveal
                  </Button>
                )}
              </span>
            ) : f.present ? (
              <span className="flex items-start gap-1 break-words">
                <span className="min-w-0 break-words text-fg">{f.value}</span>
                <CopyButton text={f.value ?? ""} label={`Copy ${f.label}`} className="-my-0.5" />
              </span>
            ) : (
              <span className="italic text-faint">Not available in file</span>
            )}
            {f.note && f.present && !f.masked && <p className="mt-0.5 text-[12px] leading-snug text-faint">{f.note}</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function LocationPanel({ gps, onReveal, onHide }: { gps: GpsInfo; onReveal: () => void; onHide: () => void }) {
  const [mapOn, setMapOn] = useState(false);
  const revealed = gps.present && !gps.masked && gps.latitude !== null && gps.longitude !== null;

  if (!gps.present) {
    return (
      <Card>
        <div className="flex items-start gap-3 p-5">
          <MapPin className="mt-0.5 h-5 w-5 text-faint" aria-hidden />
          <div>
            <p className="text-sm font-medium text-fg">GPS location metadata was not found in this image.</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">PixelTrace never estimates or guesses a location from the picture, your IP address or any other source. Many devices disable geotagging and many platforms strip it.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!revealed) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
          <div className="marks grid h-16 w-16 shrink-0 place-items-center text-cyan">
            <Lock className="h-7 w-7" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-fg">GPS coordinates are present and hidden</p>
              <Badge tone="ok" icon={<Lock className="h-3 w-3" />}>
                Privacy protected
              </Badge>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Coordinates can reveal where a photo was taken, which may include a home or workplace. They are withheld by the server until you choose to reveal them. No map is loaded and nothing is sent to any third party.</p>
          </div>
          <Button variant="primary" icon={<Eye className="h-4 w-4" />} onClick={onReveal}>
            Reveal location
          </Button>
        </div>
      </Card>
    );
  }

  const lat = gps.latitude as number;
  const lon = gps.longitude as number;
  const d = 0.008;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  const rows: [string, string | null][] = [
    ["Latitude", String(lat)],
    ["Longitude", String(lon)],
    ["Altitude", gps.altitude],
    ["GPS timestamp (UTC)", gps.timestamp],
    ["Direction", gps.direction],
    ["Speed", gps.speed],
  ];

  return (
    <div className="space-y-4">
      <Alert tone="warn" title="Location is visible on screen">
        These coordinates are reported by the device and are not independently verified. They may be inaccurate or edited.
      </Alert>
      <Card>
        <CardHeader
          title="GPS information"
          action={
            <div className="flex gap-2">
              <CopyButton text={`${lat}, ${lon}`} label="Copy coordinates" className="h-8 w-8 border border-line2" />
              <Button size="sm" icon={<EyeOff className="h-3.5 w-3.5" />} onClick={onHide}>
                Hide again
              </Button>
            </div>
          }
        />
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className={`font-mono text-sm ${v ? "text-fg" : "italic text-faint font-sans"}`}>{v ?? "Not available in file"}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <CardHeader title="Map" subtitle="Optional. Loading the map contacts openstreetmap.org." />
        {mapOn ? (
          <div className="p-4">
            <iframe title="Map of the embedded GPS coordinates" src={embed} referrerPolicy="no-referrer" loading="lazy" className="h-[320px] w-full rounded-lg border border-line2 bg-canvas" />
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={osm} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line2 bg-raised px-3 text-[13px] font-medium hover:bg-[#1d2a47]">
                Open in OpenStreetMap <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button size="sm" variant="ghost" onClick={() => setMapOn(false)}>
                Remove map
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg text-[13px] leading-relaxed text-muted">Showing the map sends these coordinates to OpenStreetMap&apos;s servers (a third party) in order to draw tiles. Nothing is loaded until you agree.</p>
            <Button variant="primary" icon={<MapPin className="h-4 w-4" />} onClick={() => setMapOn(true)}>
              Load map
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
