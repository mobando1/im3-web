import { db } from "./db";
import { systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

// ───────────────────────────────────────────────────────────────
// Config central editable en runtime (Fase B agente ingeniero).
// Los valores viven en la tabla system_config y se cachean en memoria al boot.
// Getters SÍNCRONOS para no volver async los ~50 call-sites de model IDs.
// Si la DB no responde al boot, se usan los FALLBACKS (la IA nunca queda sin modelo).
// ───────────────────────────────────────────────────────────────

// Mantener en sync con el seed de runMigrations() en server/db.ts
const FALLBACKS: Record<string, string> = {
  "model.generation": "claude-sonnet-4-6",
  "model.classification": "claude-haiku-4-5-20251001",
  "flag.gmail-sync": "true",
  "flag.whatsapp-send": "true",
  "flag.newsletter": "true",
};

let cache: Record<string, string> = { ...FALLBACKS };
let loaded = false;

// Carga toda la config a memoria (una query). Llamar en el bootstrap del server.
export async function loadConfig(): Promise<void> {
  if (!db) return;
  try {
    const rows = await db.select().from(systemConfig);
    const next: Record<string, string> = { ...FALLBACKS };
    for (const r of rows) next[r.key] = r.value;
    cache = next;
    loaded = true;
  } catch {
    // Se queda con FALLBACKS; getters siguen funcionando.
  }
}

function get(key: string): string {
  return cache[key] ?? FALLBACKS[key] ?? "";
}

export function getModelGeneration(): string {
  return get("model.generation");
}

export function getModelClassification(): string {
  return get("model.classification");
}

export function getFlag(key: string): boolean {
  // Acepta tanto "gmail-sync" como "flag.gmail-sync"
  const k = key.startsWith("flag.") ? key : `flag.${key}`;
  return get(k) === "true";
}

export function getConfig(key: string): string {
  return get(key);
}

export function getAllConfig(): Record<string, string> {
  return { ...cache };
}

export function isConfigLoaded(): boolean {
  return loaded;
}

// Escribe un valor: actualiza DB (upsert) + fila de auditoría + muta el cache (efecto inmediato).
export async function setConfig(
  key: string,
  value: string,
  updatedBy: string,
): Promise<{ ok: true; oldValue: string | null } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "DB no disponible" };
  try {
    const [existing] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
    const oldValue = existing?.value ?? null;
    const category = existing?.category ?? (key.startsWith("flag.") ? "flag" : key.startsWith("model.") ? "model" : "other");

    if (existing) {
      await db.update(systemConfig).set({ value, updatedAt: new Date(), updatedBy }).where(eq(systemConfig.key, key));
    } else {
      await db.insert(systemConfig).values({ key, value, category, updatedBy });
    }

    // La auditoría unificada (admin_action_audit) la escribe el endpoint de apply.
    cache[key] = value; // efecto inmediato, sin redeploy
    return { ok: true, oldValue };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
