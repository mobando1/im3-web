import { db } from "./db";
import { contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ensureClientWorkspaceDrive, type ClientWorkspace } from "./google-drive";
import { log } from "./index";

/**
 * Resuelve-o-crea el workspace canónico de Drive de un cliente y cachea el
 * folderId en contacts.driveFolderId. Fuente de verdad de "la carpeta del cliente".
 *
 * Acepta el contacto ya cargado (evita un round-trip) o solo su id.
 */
export async function ensureClientWorkspace(
  contact: { id: string; empresa?: string | null; driveFolderId?: string | null },
): Promise<ClientWorkspace> {
  let empresa = contact.empresa ?? null;
  let cachedFolderId = contact.driveFolderId ?? null;

  // Si solo nos dieron el id, completar desde la DB.
  if ((empresa == null || contact.driveFolderId === undefined) && db) {
    const [row] = await db.select({ empresa: contacts.empresa, driveFolderId: contacts.driveFolderId })
      .from(contacts).where(eq(contacts.id, contact.id)).limit(1);
    if (row) {
      empresa = empresa ?? row.empresa;
      cachedFolderId = contact.driveFolderId !== undefined ? cachedFolderId : row.driveFolderId;
    }
  }

  const ws = await ensureClientWorkspaceDrive({
    contactId: contact.id,
    empresa: empresa || "Cliente",
    cachedFolderId,
  });

  // Cachear el folderId canónico en el contacto si cambió.
  if (db && ws.folderId !== cachedFolderId) {
    await db.update(contacts).set({ driveFolderId: ws.folderId }).where(eq(contacts.id, contact.id))
      .catch((err: unknown) => log(`[client-drive] no se pudo cachear driveFolderId de ${contact.id}: ${err}`));
  }

  return ws;
}

/** Carga el contacto por id y asegura su workspace. */
export async function ensureClientWorkspaceById(contactId: string): Promise<ClientWorkspace | null> {
  if (!db) return null;
  const [row] = await db.select({ id: contacts.id, empresa: contacts.empresa, driveFolderId: contacts.driveFolderId })
    .from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!row) return null;
  return ensureClientWorkspace(row);
}
