import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { eq, sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db } from "./db";
import { clientUsers, clientMagicTokens } from "@shared/schema";
import { comparePasswords } from "./auth";
import { sendEmail } from "./email-sender";
import { buildProjectNotificationEmail } from "./email-ai";

const BASE_URL = process.env.BASE_URL || "https://im3systems.com";

// TTL para magic links generados desde notificaciones / login passwordless
export const MAGIC_LINK_TTL_MINUTES = 30;

/**
 * Registers a Passport strategy named "client-local" that authenticates
 * client_users by email + password. Uses the same shared session store/cookie
 * as the admin auth — `kind: "client"` is written into the serialized
 * principal so deserialize can route correctly. See auth.ts for serialize.
 */
export function setupClientAuth() {
  passport.use(
    "client-local",
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          if (!db) return done(null, false, { message: "DB not configured" });
          const lower = String(email || "").toLowerCase().trim();
          const [u] = await db
            .select()
            .from(clientUsers)
            .where(eq(clientUsers.email, lower));
          if (!u) return done(null, false, { message: "Credenciales inválidas" });
          if (u.status === "disabled") return done(null, false, { message: "Cuenta deshabilitada" });
          if (!u.passwordHash) return done(null, false, { message: "Aún no has configurado tu contraseña" });
          const ok = await comparePasswords(password, u.passwordHash);
          if (!ok) return done(null, false, { message: "Credenciales inválidas" });
          // Update lastLoginAt (best-effort, no await blocking)
          await db
            .update(clientUsers)
            .set({ lastLoginAt: sql`now()`, updatedAt: sql`now()` })
            .where(eq(clientUsers.id, u.id))
            .catch(() => {});
          return done(null, { ...u, kind: "client" });
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );
}

/** Middleware: requires an authenticated client_user (rejects admins). */
export const requireClient: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || (req.user as any)?.kind !== "client") {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
};

/** Public-safe shape returned to frontend. */
export function publicClientUser(u: any) {
  return { id: u.id, email: u.email, name: u.name ?? null };
}

// ───────────────────────────────────────────────────────────────
// Email helpers — reuse buildProjectNotificationEmail (no new HTML)
// ───────────────────────────────────────────────────────────────

export async function sendInviteEmail(opts: {
  to: string;
  name?: string | null;
  inviteToken: string;
  projectName?: string | null;
}) {
  const link = `${BASE_URL}/portal/accept-invite?token=${encodeURIComponent(opts.inviteToken)}`;
  const html = buildProjectNotificationEmail({
    projectName: opts.projectName || "tu proyecto",
    clientName: opts.name || "cliente",
    title: "Tu acceso al portal",
    headerEmoji: "🔐",
    bodyLines: [
      "El equipo de IM3 Systems te invitó a ver el avance de tu proyecto en tiempo real desde nuestro portal.",
      "Configura tu contraseña en el siguiente botón. El link es válido por 7 días.",
    ],
    ctaText: "Configurar mi acceso →",
    ctaUrl: link,
    footerNote: "Si no esperabas este email, puedes ignorarlo.",
  });
  return sendEmail(opts.to, "Tu acceso al portal de IM3 Systems", html);
}

// ───────────────────────────────────────────────────────────────
// Magic-link tokens — acceso passwordless single-use
// ───────────────────────────────────────────────────────────────

/** Crea un magic-link token en DB. Devuelve el token (UUID). */
export async function createMagicToken(opts: {
  clientUserId: string;
  clientProjectId?: string | null;
  ttlMinutes?: number;
}): Promise<string> {
  if (!db) throw new Error("DB not configured");
  const expiresAt = new Date(Date.now() + (opts.ttlMinutes ?? MAGIC_LINK_TTL_MINUTES) * 60 * 1000);
  const [row] = await db
    .insert(clientMagicTokens)
    .values({
      clientUserId: opts.clientUserId,
      clientProjectId: opts.clientProjectId ?? null,
      expiresAt: expiresAt as any,
    })
    .returning();
  return row.token;
}

/** Construye la URL absoluta del magic link a partir de un token. */
export function magicLinkUrl(token: string): string {
  return `${BASE_URL}/portal/magic/${encodeURIComponent(token)}`;
}

/** Email "envíame un link" disparado desde /portal/login. */
export async function sendMagicLinkLoginEmail(opts: {
  to: string;
  name?: string | null;
  magicToken: string;
}) {
  const link = magicLinkUrl(opts.magicToken);
  const html = buildProjectNotificationEmail({
    projectName: "Portal IM3",
    clientName: opts.name || "cliente",
    title: "Tu link de acceso",
    headerEmoji: "🔐",
    bodyLines: [
      "Recibimos una solicitud para acceder al portal con un link directo.",
      `Haz click abajo para entrar — el link es válido por <strong>${MAGIC_LINK_TTL_MINUTES} minutos</strong> y solo se puede usar una vez.`,
    ],
    ctaText: "Entrar al portal →",
    ctaUrl: link,
    footerNote: "Si no solicitaste este link, puedes ignorarlo de forma segura.",
  });
  return sendEmail(opts.to, "Tu link de acceso — Portal IM3", html);
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name?: string | null;
  resetToken: string;
  projectName?: string | null;
}) {
  const link = `${BASE_URL}/portal/reset-password?token=${encodeURIComponent(opts.resetToken)}`;
  const html = buildProjectNotificationEmail({
    projectName: opts.projectName || "Portal IM3",
    clientName: opts.name || "cliente",
    title: "Restablecer tu contraseña",
    headerEmoji: "🔄",
    bodyLines: [
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta.",
      "Si fuiste tú, haz click en el botón. El link es válido por 1 hora.",
    ],
    ctaText: "Restablecer contraseña →",
    ctaUrl: link,
    footerNote: "Si no solicitaste este cambio, ignora este email — tu contraseña no se modificará.",
  });
  return sendEmail(opts.to, "Restablece tu contraseña — Portal IM3", html);
}
