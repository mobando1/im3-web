import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { users, clientUsers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { Express, RequestHandler } from "express";

const scryptAsync = promisify(scrypt);

// Sessions store both admin and client users; `kind` tells them apart.
type SessionPrincipal = { kind: "admin" | "client"; id: string };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(buf, Buffer.from(hashed, "hex"));
}

export async function setupAuth(app: Express) {
  // Create session table manually — connect-pg-simple's createTableIfMissing
  // tries to read table.sql from its package dir, which doesn't exist in bundled builds
  if (db) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
  }

  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
      }),
      secret: process.env.SESSION_SECRET || "im3-admin-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        if (!db) return done(null, false, { message: "DB not configured" });

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username));

        if (!user) return done(null, false, { message: "Usuario no encontrado" });

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) return done(null, false, { message: "Contraseña incorrecta" });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    // Admin user serialization (client serialization is set in client-auth.ts).
    // Both write { kind, id } so deserialize can route correctly.
    const principal: SessionPrincipal = {
      kind: user?.kind === "client" ? "client" : "admin",
      id: user.id,
    };
    done(null, principal);
  });

  passport.deserializeUser(async (raw: SessionPrincipal | string, done) => {
    try {
      if (!db) return done(null, false);
      // Backwards compat: legacy sessions stored just the id (string) → treat as admin.
      const principal: SessionPrincipal =
        typeof raw === "string" ? { kind: "admin", id: raw } : raw;

      if (principal.kind === "client") {
        const [u] = await db
          .select()
          .from(clientUsers)
          .where(eq(clientUsers.id, principal.id));
        if (!u || u.status === "disabled") return done(null, false);
        return done(null, { ...u, kind: "client" });
      }

      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, principal.id));
      done(null, u ? { ...u, kind: "admin" } : false);
    } catch (err) {
      done(err);
    }
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || (req.user as any)?.kind !== "admin") {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
};
