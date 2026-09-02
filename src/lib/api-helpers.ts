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

export function parseDate(v: unknown, fallback?: Date): Date {
  if (typeof v === "string" && v.length >= 10) {
    // Date-only strings interpreted as IST-local days consistently
    const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
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
  // to is exclusive end-of-day for inclusive day filtering
  const explicitFrom = searchParams.get("from");
  const explicitTo = searchParams.get("to");
  if (explicitFrom && explicitTo) {
    return { from: parseDate(explicitFrom), to: endOfDay(parseDate(explicitTo)) };
  }
  const now = new Date();
  const range = searchParams.get("range") ?? "today";
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (range) {
    case "yesterday": {
      const from = new Date(y, m, d - 1);
      return { from, to: endOfDay(from) };
    }
    case "week": {
      const day = now.getDay(); // 0 Sun
      const mondayOffset = day === 0 ? -6 : 1 - day;
      return { from: new Date(y, m, d + mondayOffset), to: endOfDay(now) };
    }
    case "lastweek": {
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const thisMonday = new Date(y, m, d + mondayOffset);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(lastSunday.getDate() - 1);
      return { from: lastMonday, to: endOfDay(lastSunday) };
    }
    case "month":
      return { from: new Date(y, m, 1), to: endOfDay(now) };
    case "lastmonth": {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { from: first, to: endOfDay(last) };
    }
    case "today":
    default:
      return { from: new Date(y, m, d), to: endOfDay(new Date(y, m, d)) };
  }
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function monthBounds(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new HttpError(400, "Invalid month format, expected YYYY-MM");
  return { from: new Date(y, m - 1, 1), to: endOfDay(new Date(y, m, 0)) };
}
