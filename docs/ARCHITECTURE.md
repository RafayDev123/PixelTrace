# Architecture

```
src/
  app/                    Next.js App Router (pages + API route handlers)
    api/analyze            POST single image
    api/analyze/bulk       POST several images (bounded concurrency)
    api/analysis/[id]      GET (masked unless ?reveal=), DELETE
    api/analysis/history   GET with filters, DELETE ?confirm=all
    api/reports/[id]/[format]   json | csv | pdf
    api/reports/batch/[format]  json | csv batch summary
    api/settings, api/dashboard, api/health, api/download
    (pages) / analyze bulk history reports settings about report/[id]
  components/             UI primitives, shell, upload, report, metadata explorer, indicators
  lib/
    config.ts      environment-driven limits
    validate.ts    magic-byte sniffing, size/pixel limits, decode check (sharp)
    extract.ts     exifr extraction, WebP chunk reader, field building, GPS conversion, sensitivity tagging
    indicators.ts  rule engine
    analyze.ts     pure pipeline (no DB)  ->  pipeline.ts adds persistence + masking
    mask.ts        server-side withholding of GPS / identifiers
    exports.ts     CSV / JSON  ·  pdf.ts  PDF (pdf-lib)
    store.ts       Drizzle queries, settings, retention purge
    api-utils.ts   rate limit, body-size guard, concurrency helper
  db/schema.ts            analyses, app_settings
tests/                    Vitest suites
```

## Request flow

1. Content-Length is checked before the body is read, then the multipart body is parsed in memory.
2. `validateImage`: size, magic bytes (extension and MIME are ignored), pixel limit, full decode via a downscaled thumbnail.
3. SHA-256, then metadata extraction (exifr), then rule engine, then DB insert, then **masked** response.
4. No temporary files are written: everything is in memory, so there is nothing to clean up.
   ExifTool subprocesses are not used, so no shell invocation exists.

## Data model

`analyses`: one row per analysis. Columns for filtering plus the full `result` JSON. Uploaded bytes are
never stored. An optional downscaled JPEG thumbnail (480 px, metadata stripped) can be stored.
`persisted=false` rows (history off) are purged after 60 minutes. Retention days are enforced lazily.
`app_settings`: single row.

## Forensic rules

no-exif / limited-exif, no-camera, no-gps / gps-present, editing-software, software-tag, xmp-history,
bad-timestamp, modify-before-original, modified-after-capture, create-vs-original, future-capture,
gps-time-mismatch, thumbnail-mismatch, partial-camera, settings-without-camera, exif-dimension-mismatch,
extension-mismatch, trailing-data, duplicate-hash, multiple-anomalies (High: two or more independent Medium rules; a count, not a probability).

## Optional cloud mode (design, not implemented)

* Private S3-compatible bucket, never public, objects keyed by random id
* Access only through short-lived signed URLs minted per request
* PostgreSQL with per-user ownership (accounts), saved reports, user-triggered deletion
* Retention via scheduled job using `retentionDays`
* Must be opt-in per user, never a silent upload
