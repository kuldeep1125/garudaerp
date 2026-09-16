import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { HttpError, requireOwner, getSessionOwner, type SessionOwner } from "@/lib/auth";

export { HttpError };

type AuthedHandler<C> = (ctx: { owner: SessionOwner; params: Record<string, string>; req: Request } & C) => Promise<unknown>;

type PublicHandler<C> = (ctx: { owner: SessionOwner | null; params: Record<string, string>; req: Request } & C) => Promise<unknown>;

type RouteFn<C> = (req: Request, ctx?: { params?: Promise<Record<string, string>> } & C) => Promise<NextResponse>;

interface RouteOptions {
  /** skip authentication (login, demo endpoints) */
  public?: boolean;
}

// Centralized API route wrapper: auth, error mapping, JSON envelopes.
// Usage: export const GET = handleRoute(async ({ owner, req }) => { ... return data })
// Public routes: export const POST = handleRoute(handler, { public: true })
export function handleRoute<C = unknown>(handler: PublicHandler<C>, options: RouteOptions & { public: true }): RouteFn<C>;
export function handleRoute<C = unknown>(handler: AuthedHandler<C>, options?: RouteOptions): RouteFn<C>;
export function handleRoute<C = unknown>(handler: PublicHandler<C>, options?: RouteOptions): RouteFn<C> {
  return async (req: Request, ctx?: { params?: Promise<Record<string, string>> } & C): Promise<NextResponse> => {
    try {
      // requireOwner() throws 401 when unauthenticated; public routes get null instead.
      const owner = options?.public ? await getSessionOwnerSafe() : await requireOwner();
      const routeParams = ctx?.params ? await ctx.params : {};
      // Spread ctx first so awaited routeParams win (ctx.params is an un-awaited Promise).
      const result = await handler({ owner, req, ...(ctx as C), params: routeParams });
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, ...(err.extra ?? {}) }, { status: err.status });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return NextResponse.json({ error: "A record with these unique details already exists." }, { status: 409 });
        }
        if (err.code === "P2025") {
          return NextResponse.json({ error: "Record not found." }, { status: 404 });
        }
      }
      console.error("[api] Unhandled error:", err);
      const message = err instanceof Error ? err.message : "Internal server error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

async function getSessionOwnerSafe(): Promise<SessionOwner | null> {
  try {
    return await requireOwner();
  } catch {
    return null;
  }
}

// Body parsing with validation of required fields.
export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function requireFields(body: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || v === "";
  });
  if (missing.length) throw new HttpError(400, `Missing required field(s): ${missing.join(", ")}`);
}

// IST offset is UTC+5h30m (330 minutes)
const IST_OFFSET_MS = 330 * 60 * 1000;

export function getISTDateParts(): { y: number; m: number; d: number; day: number } {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return {
    y: ist.getUTCFullYear(),
    m: ist.getUTCMonth(),
    d: ist.getUTCDate(),
    day: ist.getUTCDay(),
  };
}

export function istStartOfDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
}

export function istEndOfDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS);
}

export function parseDate(v: unknown, fallback?: Date): Date {
  if (typeof v === "string" && v.length >= 10) {
    if (v.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-").map(Number);
      return istStartOfDay(y, m - 1, d);
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (v instanceof Date) return v;
  if (fallback) return fallback;
  throw new HttpError(400, "Invalid date value");
}

export function parsePage(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function parseRange(searchParams: URLSearchParams): { from: Date; to: Date } {
  const explicitFrom = searchParams.get("from");
  const explicitTo = searchParams.get("to");
  if (explicitFrom && explicitTo) {
    return { from: parseDate(explicitFrom), to: endOfDay(parseDate(explicitTo)) };
  }
  const { y, m, d, day } = getISTDateParts();
  const range = searchParams.get("range") ?? "today";
  switch (range) {
    case "yesterday": {
      const prev = new Date(Date.UTC(y, m, d - 1));
      const py = prev.getUTCFullYear(), pm = prev.getUTCMonth(), pd = prev.getUTCDate();
      return { from: istStartOfDay(py, pm, pd), to: istEndOfDay(py, pm, pd) };
    }
    case "week": {
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const mon = new Date(Date.UTC(y, m, d + mondayOffset));
      return { from: istStartOfDay(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate()), to: istEndOfDay(y, m, d) };
    }
    case "lastweek": {
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const lastMon = new Date(Date.UTC(y, m, d + mondayOffset - 7));
      const lastSun = new Date(Date.UTC(y, m, d + mondayOffset - 1));
      return {
        from: istStartOfDay(lastMon.getUTCFullYear(), lastMon.getUTCMonth(), lastMon.getUTCDate()),
        to: istEndOfDay(lastSun.getUTCFullYear(), lastSun.getUTCMonth(), lastSun.getUTCDate()),
      };
    }
    case "month":
      return { from: istStartOfDay(y, m, 1), to: istEndOfDay(y, m, d) };
    case "lastmonth": {
      const prevMonthLastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const prevMonth = m === 0 ? 11 : m - 1;
      const prevYear = m === 0 ? y - 1 : y;
      return {
        from: istStartOfDay(prevYear, prevMonth, 1),
        to: istEndOfDay(prevYear, prevMonth, prevMonthLastDay),
      };
    }
    case "today":
    default:
      return { from: istStartOfDay(y, m, d), to: istEndOfDay(y, m, d) };
  }
}

export function endOfDay(d: Date): Date {
  return new Date(d.getTime() + (23 * 3600 + 59 * 60 + 59) * 1000 + 999);
}

export function monthBounds(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new HttpError(400, "Invalid month format, expected YYYY-MM");
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: istStartOfDay(y, m - 1, 1), to: istEndOfDay(y, m - 1, lastDay) };
}
