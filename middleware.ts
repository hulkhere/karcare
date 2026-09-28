import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken, safeEqual } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("APP_PASSWORD is not configured.", { status: 500 });
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await authToken(password))) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
