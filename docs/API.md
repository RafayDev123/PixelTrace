# API notes

All errors: `{"error":{"code":"...","message":"..."}}` with a meaningful status
(400 invalid, 404 not found, 413 too large, 415 unsupported type, 422 corrupted, 429 rate limited, 500 internal without stack traces).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ok:true}` if DB reachable |
| POST | `/api/analyze` | multipart `file` (+ optional `sessionId`) returns 201 `AnalysisResult` (masked) |
| POST | `/api/analyze/bulk` | multipart repeated `files`, max `PIXELTRACE_MAX_FILES`; returns `{sessionId, results[], summary}`; per-file `status: ok/error` |
| GET | `/api/analysis/{id}` | masked; `?reveal=location,identifiers` returns the sensitive values |
| DELETE | `/api/analysis/{id}` | |
| GET | `/api/analysis/history` | `q, format, gps=yes/no, metadata=none/limited/rich, severity, sessionId, limit, offset` |
| DELETE | `/api/analysis/history?confirm=all` | delete everything |
| GET | `/api/reports/{id}/{json,csv,pdf}` | sensitive data excluded unless `?reveal=` |
| GET | `/api/reports/batch/{json,csv}` | `?ids=a,b` or `?sessionId=`, `&full=1` (JSON) |
| GET/PUT | `/api/settings` | `saveHistory, storeThumbnail, retentionDays, confirmBeforeReveal` |
| POST | `/api/settings?action=purge` | run retention cleanup |
| GET | `/api/dashboard` | aggregate stats from stored analyses |

Types are in `src/lib/types.ts` and are shared by the server and the client, so the contract is checked by the TypeScript compiler.

```bash
curl -F "file=@photo.jpg" http://localhost:3000/api/analyze
curl "http://localhost:3000/api/analysis/<id>?reveal=location"
curl -OJ "http://localhost:3000/api/reports/<id>/pdf"
```
