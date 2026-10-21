import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const loggedIn = req.cookies.has("erp_sid");
  const { pathname } = req.nextUrl;

  if (!loggedIn && pathname !== "/login") return NextResponse.redirect(new URL("/login", req.url));
  if (loggedIn && (pathname === "/login" || pathname === "/"))
    return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*"],
};
