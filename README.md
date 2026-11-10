# PixelTrace: Image Intelligence & Metadata Analyzer

PixelTrace lets you upload one or many images and inspect the metadata embedded in the files:
EXIF, IPTC, XMP, ICC and file structure. It adds a transparent, rule-based set of forensic
indicators, SHA-256 fingerprints, duplicate detection, bulk analysis, and JSON / CSV / PDF reports.

It reports only what is in the file. It never guesses a device, a photographer or a location, and it
never declares an image authentic or fake.

## IMPORTANT: how this build differs from the original brief

The brief asked for React + Vite + FastAPI + Python + ExifTool + SQLite. This project was built in an
environment whose runtime is fixed to **Next.js (App Router) + Node.js + PostgreSQL (Drizzle ORM)**, so
the product was implemented on that stack instead. Mapping:

| Brief | This build |
|---|---|
| React + TypeScript + Vite | React 19 + TypeScript on Next.js 16 (Tailwind CSS 4, lucide-react) |
| FastAPI backend (`/api/...`) | Next.js route handlers with the same endpoints (`/api/analyze`, `/api/analyze/bulk`, `/api/analysis/{id}`, `/api/analysis/history`, `/api/reports/{id}/{json,csv,pdf}`, `/api/settings`, `/api/health`) |
| ExifTool (primary engine) | **exifr** (pure JavaScript) for EXIF/IPTC/XMP/ICC. ExifTool is NOT used. MakerNotes and some proprietary tags are not decoded |
| Pillow | **sharp / libvips** for validation, decoding, dimensions, thumbnails |
| ReportLab | **pdf-lib** |
| SQLite (dev) / PostgreSQL | **PostgreSQL** only, via Drizzle ORM |
| Folium map | Optional OpenStreetMap embed, loaded only after explicit consent |
| Pytest / Vitest | **Vitest** for backend logic and API handlers. There are no browser component tests (see Limitations) |
| Recharts | Lightweight CSS bar charts |
| HEIC | Reported as unsupported (no decoder available) |

## Requirements (Windows)

* Node.js 20 or newer (22 recommended)
* PostgreSQL 14+ (local install, or Docker Desktop via the included `docker-compose.yml`)

## Quick start (Windows)

```bat
:: 1. extract PixelTrace-Complete-Project.zip, then:
cd PixelTrace

:: 2. start a database (skip if you already run PostgreSQL)
docker compose up -d db

:: 3. install dependencies, create .env, create tables
setup.bat

:: 4. run
start-dev.bat
```

Open http://localhost:3000. `start-all.bat` does steps 2-4 in one go.

If you use your own PostgreSQL, edit `DATABASE_URL` in `.env` **and** the `url` in `drizzle.config.json`
(used by `drizzle-kit push`), then run `setup.bat`.

### Manual commands (any OS)

```bash
cp .env.example .env          # Windows: copy .env.example .env
npm ci
npx drizzle-kit push          # creates the tables
npm run dev                   # http://localhost:3000
```

### Production build

```bash
npm run build
npm run start                 # or start-prod.bat
```

Health check: `GET /api/health` returns `{"ok":true}` when the database is reachable.

## Tests

```bash
npm test            # Vitest: 39 tests (validation, extraction, indicators, masking, exports, API handlers)
npx tsc --noEmit    # types
npx eslint .        # lint
test.bat            # all of the above on Windows
```

The API tests call the route handlers directly and need `DATABASE_URL` (they are skipped without it).
Fixtures are generated synthetically with sharp at test time. No real photos are included.

## Configuration

See `.env.example`. Limits default to 10 images per batch, 20 MB per image and 40 megapixels per image.

## Deployment

* Any Node host (Docker, Render, Railway, Fly.io, a VM) running `npm run build && npm run start` with
  `DATABASE_URL` pointing at a managed PostgreSQL. Run `npx drizzle-kit push` once against it.
* On Vercel, the project now includes a `vercel-build` hook that runs `drizzle-kit push` before `next build`,
  so the required PostgreSQL tables are created automatically when `DATABASE_URL` is set in Project Settings.
* `sharp` ships prebuilt binaries for common platforms. Use a standard glibc or musl Node image.
* The in-memory rate limiter is per instance. Use a shared limiter (for example Redis) behind several instances.
* Deployment has **not** been performed or verified as part of this delivery.

## Features

* Drag-and-drop and browse upload, previews, per-file removal, real upload progress
* Content-based validation (magic bytes + decode), rejection of corrupt, SVG/XML/HTML, ZIP, executable and HEIC files
* Metadata in 8 explorable sections with search, copy, expand/collapse and raw JSON
* Camera, capture (each timestamp kept separate), GPS (DMS to decimal), IPTC/XMP, authoring and rights
* Serial numbers and GPS **hidden by default** (withheld server-side), explicit reveal, excluded from exports unless selected
* 15+ forensic rules, each with evidence, trigger explanation, why it matters, limitation, recommendation
* Bulk analysis with bounded concurrency, per-file status, retry, duplicate (SHA-256) groups, comparison table
* Dashboard from real data only, history with filters, reports page, settings and privacy controls
* JSON, CSV (formula-injection safe) and PDF exports, plus batch summaries

## Limitations (honest list)

* ExifTool is not used, so MakerNotes and some vendor tags are not decoded. XMP in WebP is read by a simplified reader.
* HEIC/HEIF, AVIF, GIF and BMP are not supported.
* TIFF-with-EXIF extraction is exercised only structurally in tests (the fixture tool cannot write EXIF into TIFF). PNG, JPEG and WebP EXIF are tested.
* No user accounts, S3 storage or signed URLs are implemented. Cloud mode is documented as an architecture only (`docs/ARCHITECTURE.md`), and the Settings page reports it as disabled.
* No frontend component tests or automated browser tests are included. The UI was checked manually with a headless browser at desktop, tablet and mobile widths.
* Thumbnail check compares dimensions only, not pixels.
* The rate limiter is in-memory.
* Metadata is self-reported and editable. Nothing here proves authenticity or manipulation.

## Troubleshooting

* `DATABASE_URL is required`: create `.env` from `.env.example`.
* `ECONNREFUSED 5432` or push fails: PostgreSQL isn't running. Run `docker compose up -d db` or start your service.
* `relation "analyses" does not exist`: run `npx drizzle-kit push`.
* `sharp` install errors: use Node 20+ and `npm ci` without `--ignore-scripts`.
* Port 3000 busy: `set PORT=3001 && npm run dev`.
* Docker on Windows: Docker Desktop must be running before `docker compose up`.
