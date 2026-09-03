import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

export { hashPassword, verifyPassword } from "@/lib/password";

export const SESSION_COOKIE = "bizhub_session";
const SESSION_DAYS = 30;

// ---- Password hashing ----
// (re-exported from lib/password)

// ---- Session management ----

export async function createSession(ownerId: string, meta?: { userAgent?: string; ip?: string }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: { token, ownerId, expiresAt, userAgent: meta?.userAgent, ip: meta?.ip },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // sandbox runs behind proxy without https termination info
    expires: expiresAt,
    path: "/",
  });
  return token;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export type SessionOwner = {
  id: string;
  name: string;
  username: string;
  mobile: string | null;
  isActive: boolean;
};

// Centralized auth check — the ONLY place session resolution happens.
export async function getSessionOwner(): Promise<SessionOwner | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { owner: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.owner.isActive) return null;
  return {
    id: session.owner.id,
    name: session.owner.name,
    username: session.owner.username,
    mobile: session.owner.mobile,
    isActive: session.owner.isActive,
  };
}

export class HttpError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Throws 401 HttpError when unauthenticated. Use inside handleRoute.
export async function requireOwner(): Promise<SessionOwner> {
  const owner = await getSessionOwner();
  if (!owner) throw new HttpError(401, "Unauthorized");
  return owner;
}
