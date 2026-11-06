# Privacy and security notes

## What is retained
* **Never**: the uploaded image file.
* **History on (default)**: the metadata report (including GPS and serial values, which the API withholds unless explicitly requested) and an optional 480 px thumbnail (EXIF stripped). Controlled in Settings.
* **History off**: the report is kept for 60 minutes (needed to display it), then deleted.
* Users can delete one analysis, all analyses, or set automatic retention (1 day to 1 year).
* Logs never contain metadata values.

## Sensitive fields
GPS tags, GPS-like IPTC/XMP location text, serial numbers, unique IDs, owner names and contact fields
are tagged sensitive at extraction. `maskResult` removes their values on the server for the UI, JSON, CSV and
PDF. The CSV omits those rows entirely. Reveal and export-inclusion are explicit, separate actions.

## Third parties
Nothing is sent anywhere by default. The optional map is an OpenStreetMap iframe loaded only after a
second consent click and states that coordinates are shared with OpenStreetMap.

## Security controls
* Content validation by magic bytes plus a full decode. Extension and MIME ignored.
* Rejects SVG/XML/HTML, ZIP, PDF, executables, scripts, HEIC/AVIF/GIF/BMP.
* Limits: files per batch, bytes, megapixels (pixel bomb guard via `limitInputPixels`), Content-Length pre-check.
* Filenames sanitised; download names restricted to `[A-Za-z0-9._-]`; analysis IDs must be UUIDs (no path handling exists).
* No shell, no subprocess, no temp files. Metadata is treated as untrusted text and never executed.
* CSV formula-injection neutralised. JSON/PDF output sanitised.
* Security headers, non-public storage (no uploaded files on disk), structured errors without stack traces, in-memory rate limiting.
* CORS: API routes are same-origin only (no CORS headers are emitted).
* Not implemented: authentication, CSRF tokens for the settings endpoints, a shared rate limiter. Put the app behind auth before exposing it publicly.
