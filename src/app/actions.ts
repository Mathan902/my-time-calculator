"use server";

import { redirect } from "next/navigation";
import { ErpAuthError, erpLogin, erpLogout } from "@/lib/erp";
import { clearSession, getSession, setSession } from "@/lib/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const usr = String(form.get("usr") ?? "").trim();
  const pwd = String(form.get("pwd") ?? "");
  if (!usr || !pwd) return { error: "Enter your ERP email and password" };

  try {
    const { sid, fullName } = await erpLogin(usr, pwd);
    await setSession(sid, fullName);
  } catch (e) {
    return { error: e instanceof ErpAuthError ? e.message : "Could not reach the ERP. Try again." };
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  const session = await getSession();
  if (session) await erpLogout(session.sid);
  await clearSession();
  redirect("/login");
}
