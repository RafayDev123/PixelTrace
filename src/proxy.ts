import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const OWNER_COOKIE = "pixeltrace_owner";
const OWNER_HEADER = "x-pixeltrace-owner";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function proxy(request: NextRequest) {
  const cookieValue = request.cookies.get(OWNER_COOKIE)?.value;
  const ownerId = cookieValue && UUID_RE.test(cookieValue) ? cookieValue : randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(OWNER_HEADER, ownerId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (ownerId !== cookieValue) {
    response.cookies.set(OWNER_COOKIE, ownerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
