import { AppError } from "./errors";

const OWNER_HEADER = "x-pixeltrace-owner";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ownerFromRequest(request: Request): string {
  const ownerId = request.headers.get(OWNER_HEADER);
  if (!ownerId || !UUID_RE.test(ownerId)) {
    throw new AppError(500, "owner_context_missing", "The browser ownership context is missing.");
  }
  return ownerId;
}
