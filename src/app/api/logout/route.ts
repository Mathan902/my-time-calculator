import { NextResponse, type NextRequest } from "next/server";
import { SID_COOKIE } from "@/lib/session";

// Used when the stored ERP session has expired: cookies can't be modified while rendering a page,
// so the dashboard redirects here to clear them.
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SID_COOKIE);
  res.cookies.delete("erp_name");
  return res;
}
