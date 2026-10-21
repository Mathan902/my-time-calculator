import "server-only";

const BASE_URL = (process.env.ERP_BASE_URL ?? "https://erp.softsuave.in").replace(/\/$/, "");

export class ErpAuthError extends Error {}
export class ErpError extends Error {}

export type Checkin = {
  name: string;
  log_type: "IN" | "OUT" | null;
  time: string; // "YYYY-MM-DD HH:mm:ss[.ffffff]" in ERP timezone
  device_id?: string | null;
};

export type Employee = {
  name: string;
  employee_name: string;
};

/** Logs in with the user's ERP credentials and returns the Frappe session id. */
export async function erpLogin(usr: string, pwd: string) {
  const res = await fetch(`${BASE_URL}/api/method/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ usr, pwd }),
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) throw new ErpAuthError("Invalid username or password");
  if (!res.ok) throw new ErpError(`ERP login failed (${res.status})`);

  const sid = res.headers
    .getSetCookie()
    .map((c) => /^sid=([^;]+)/.exec(c)?.[1])
    .find((v) => v && v !== "Guest");
  if (!sid) throw new ErpAuthError("ERP did not return a session");

  const data = (await res.json()) as { full_name?: string };
  return { sid, fullName: data.full_name ?? usr };
}

export async function erpLogout(sid: string) {
  await fetch(`${BASE_URL}/api/method/logout`, {
    method: "POST",
    headers: { Cookie: `sid=${sid}` },
    cache: "no-store",
  }).catch(() => {});
}

async function erpGet<T>(sid: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }

  const res = await fetch(url, {
    headers: { Cookie: `sid=${sid}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 401) throw new ErpAuthError("Session expired");
  if (res.status === 403) {
    const body = await res.text();
    // Frappe returns 403 for both "not logged in" and "no permission on this doctype"
    if (/Login to access|session/i.test(body)) throw new ErpAuthError("Session expired");
    throw new ErpError("You don't have permission to read this data in the ERP");
  }
  if (!res.ok) throw new ErpError(`ERP request failed (${res.status}) for ${path}`);

  const json = (await res.json()) as { message?: T; data?: T };
  return (json.data ?? json.message) as T;
}

export function getLoggedUser(sid: string) {
  return erpGet<string>(sid, "/api/method/frappe.auth.get_logged_user");
}

export async function getEmployeeForUser(sid: string, userId: string): Promise<Employee> {
  const rows = await erpGet<Employee[]>(sid, "/api/resource/Employee", {
    filters: [["user_id", "=", userId]],
    fields: ["name", "employee_name"],
    limit_page_length: 1,
  });
  if (!rows?.length) throw new ErpError(`No Employee record is linked to ${userId}`);
  return rows[0];
}

/** Check-ins for an employee between two dates (inclusive, "YYYY-MM-DD"). */
export function getCheckins(sid: string, employee: string, fromDate: string, toDate: string) {
  return erpGet<Checkin[]>(sid, "/api/resource/Employee Checkin", {
    filters: [
      ["employee", "=", employee],
      ["time", "between", [`${fromDate} 00:00:00`, `${toDate} 23:59:59`]],
    ],
    fields: ["name", "log_type", "time", "device_id"],
    order_by: "time asc",
    limit_page_length: 0,
  });
}
