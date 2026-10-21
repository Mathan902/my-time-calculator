import "server-only";
import { cookies } from "next/headers";

export const SID_COOKIE = "erp_sid";
const NAME_COOKIE = "erp_name";

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 3,
};

export async function setSession(sid: string, fullName: string) {
  const jar = await cookies();
  jar.set(SID_COOKIE, sid, cookieOpts);
  jar.set(NAME_COOKIE, fullName, cookieOpts);
}

export async function getSession() {
  const jar = await cookies();
  const sid = jar.get(SID_COOKIE)?.value;
  if (!sid) return null;
  return { sid, fullName: jar.get(NAME_COOKIE)?.value ?? "" };
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SID_COOKIE);
  jar.delete(NAME_COOKIE);
}
