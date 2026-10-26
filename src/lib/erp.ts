import "server-only";

const BASE_URL = (process.env.ERP_BASE_URL ?? "https://erp.softsuave.in").replace(/\/$/, "");

export class ErpAuthError extends Error {}
export class ErpError extends Error {}

export type Checkin = {
  name: string;
  employee?: string;
  log_type: "IN" | "OUT" | null;
  time: string; // "YYYY-MM-DD HH:mm:ss[.ffffff]" in ERP timezone
  device_id?: string | null;
};

export type Employee = {
  name: string;
  employee_name: string;
  designation?: string | null;
  holiday_list?: string | null;
  company?: string | null;
};

export type Attendance = {
  name: string;
  employee: string;
  attendance_date: string;
  status: "Present" | "Absent" | "On Leave" | "Half Day" | "Work From Home";
  working_hours?: number | null; // computed by the ERP from check-ins via the employee's shift
};

export type LeaveApplication = {
  name: string;
  employee: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  status: "Open" | "Approved" | "Rejected" | "Cancelled";
  half_day: 0 | 1;
  half_day_date: string | null;
};

export type AttendanceRequest = {
  name: string;
  employee: string;
  from_date: string;
  to_date: string;
  reason: string;
  docstatus: 0 | 1 | 2; // draft (awaiting approval) / submitted (approved) / cancelled
};

const EMPLOYEE_FIELDS = ["name", "employee_name", "designation", "holiday_list", "company"];

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
    fields: EMPLOYEE_FIELDS,
    limit_page_length: 1,
  });
  if (!rows?.length) throw new ErpError(`No Employee record is linked to ${userId}`);
  return rows[0];
}

/** Active employees who report to the given employee. */
export function getTeamMembers(sid: string, manager: string) {
  return erpGet<Employee[]>(sid, "/api/resource/Employee", {
    filters: [
      ["reports_to", "=", manager],
      ["status", "=", "Active"],
    ],
    fields: EMPLOYEE_FIELDS,
    order_by: "employee_name asc",
    limit_page_length: 0,
  });
}

function employeeFilter(employee: string | string[]) {
  return Array.isArray(employee) ? ["employee", "in", employee] : ["employee", "=", employee];
}

/** Check-ins for one or more employees between two dates (inclusive, "YYYY-MM-DD"). */
export function getCheckins(sid: string, employee: string | string[], fromDate: string, toDate: string) {
  return erpGet<Checkin[]>(sid, "/api/resource/Employee Checkin", {
    filters: [employeeFilter(employee), ["time", "between", [`${fromDate} 00:00:00`, `${toDate} 23:59:59`]]],
    fields: ["name", "employee", "log_type", "time", "device_id"],
    order_by: "time asc",
    limit_page_length: 0,
  });
}

export function getAttendance(sid: string, employee: string | string[], fromDate: string, toDate: string) {
  return erpGet<Attendance[]>(sid, "/api/resource/Attendance", {
    filters: [employeeFilter(employee), ["attendance_date", "between", [fromDate, toDate]], ["docstatus", "!=", 2]],
    // "*" rather than a list: working_hours only exists when HRMS shift tracking is set up
    fields: ["*"],
    limit_page_length: 0,
  });
}

/** Leave applications overlapping the date range. */
export function getLeaveApplications(sid: string, employee: string | string[], fromDate: string, toDate: string) {
  return erpGet<LeaveApplication[]>(sid, "/api/resource/Leave Application", {
    filters: [employeeFilter(employee), ["from_date", "<=", toDate], ["to_date", ">=", fromDate]],
    fields: ["name", "employee", "leave_type", "from_date", "to_date", "status", "half_day", "half_day_date"],
    order_by: "from_date asc",
    limit_page_length: 0,
  });
}

/** Attendance requests (WFH / on duty) overlapping the date range. */
export function getAttendanceRequests(sid: string, employee: string | string[], fromDate: string, toDate: string) {
  return erpGet<AttendanceRequest[]>(sid, "/api/resource/Attendance Request", {
    filters: [employeeFilter(employee), ["from_date", "<=", toDate], ["to_date", ">=", fromDate]],
    fields: ["name", "employee", "from_date", "to_date", "reason", "docstatus"],
    order_by: "from_date asc",
    limit_page_length: 0,
  });
}

/** Holidays (including weekly offs) of a holiday list, keyed by date → description. */
export async function getHolidays(sid: string, holidayList: string) {
  const doc = await erpGet<{ holidays?: { holiday_date: string; description?: string | null }[] }>(
    sid,
    `/api/resource/Holiday List/${encodeURIComponent(holidayList)}`,
  );
  return new Map((doc.holidays ?? []).map((h) => [h.holiday_date, stripHtml(h.description ?? "") || "Holiday"]));
}

export async function getCompanyHolidayList(sid: string, company: string) {
  const doc = await erpGet<{ default_holiday_list?: string | null }>(
    sid,
    `/api/resource/Company/${encodeURIComponent(company)}`,
  );
  return doc.default_holiday_list ?? null;
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, "").trim();
}
