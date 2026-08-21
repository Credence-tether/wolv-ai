import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { env, requireCookieSecret, requireSessionSecret } from "./env";
import { query } from "./db";
import type { StaffUser } from "./domain";

export const VISITOR_COOKIE = "support_visitor";
export const STAFF_COOKIE = "support_staff";
const visitorTtlSeconds = 60 * 60 * 24 * 365;
const staffTtlSeconds = 60 * 60 * 12;

function secretBytes(secret: string) {
  return new TextEncoder().encode(secret);
}

function cookies(request: Request) {
  const value = request.headers.cookie ?? "";
  return Object.fromEntries(value.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf("=");
    return separator === -1 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  }));
}

async function sign(payload: Record<string, unknown>, secret: string, ttl: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${ttl}s`).sign(secretBytes(secret));
}

async function verify(token: string | undefined, secret: string) {
  if (!token) return null;
  try {
    const result = await jwtVerify(token, secretBytes(secret), { algorithms: ["HS256"] });
    return result.payload;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.secureCookies,
    path: "/",
    maxAge,
  };
}

export async function createVisitorCookie(response: Response, visitorId = randomUUID()) {
  const token = await sign({ kind: "visitor", visitorId }, requireCookieSecret(), visitorTtlSeconds);
  response.cookie(VISITOR_COOKIE, token, cookieOptions(visitorTtlSeconds));
  return visitorId;
}

export async function getVisitorId(request: Request) {
  const payload = await verify(cookies(request)[VISITOR_COOKIE], requireCookieSecret());
  return payload?.kind === "visitor" && typeof payload.visitorId === "string" ? payload.visitorId : null;
}

export async function ensureVisitorId(request: Request, response: Response) {
  const current = await getVisitorId(request);
  if (current) return current;
  return createVisitorCookie(response);
}

export async function loginStaff(response: Response, email: string, password: string) {
  const result = await query<StaffUser & { password_hash: string }>("SELECT id, email, display_name, role, active, password_hash FROM app_users WHERE lower(email) = lower($1) LIMIT 1", [email.trim()]);
  const user = result.rows[0];
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) return null;
  const token = await sign({ kind: "staff", userId: user.id }, requireSessionSecret(), staffTtlSeconds);
  response.cookie(STAFF_COOKIE, token, cookieOptions(staffTtlSeconds));
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function logoutStaff(response: Response) {
  response.clearCookie(STAFF_COOKIE, cookieOptions(0));
}

export async function getCurrentStaff(request: Request): Promise<StaffUser | null> {
  const payload = await verify(cookies(request)[STAFF_COOKIE], requireSessionSecret());
  if (payload?.kind !== "staff" || typeof payload.userId !== "string") return null;
  const result = await query<StaffUser>("SELECT id, email, display_name, role, active FROM app_users WHERE id = $1 AND active = TRUE", [payload.userId]);
  return result.rows[0] ?? null;
}
