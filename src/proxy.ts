import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 uses `proxy` (middleware renamed). Cookie-presence gate only;
 * real auth happens in layouts and API routes.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (isProtected) {
    const session = request.cookies.get("drvowa_session")?.value;
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/onboarding/:path*"],
};
