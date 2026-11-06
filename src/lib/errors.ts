/** Error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
    );
  }
  // Never leak internals or stack traces.
  console.error("[pixeltrace] unexpected error:", err instanceof Error ? err.name : "unknown");
  return Response.json(
    { error: { code: "internal_error", message: "Something went wrong while processing the request." } },
    { status: 500 },
  );
}
