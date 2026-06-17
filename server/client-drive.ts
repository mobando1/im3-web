import { db } from "./db";
import { contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ensureClientWorkspaceDrive, listClientesFolders, type ClientWorkspace } from "./google-drive";
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

export type ReconcileReport = {
  dryRun: boolean;
  totalContacts: number;
  totalFolders: number;
  // Contactos con >1 carpeta en 03.clientes (candidatos a duplicado — revisar/mergear a mano).
  duplicates: Array<{ contactId: string; empresa: string | null; email: string; folders: Array<{ id: string; name: string; url: string }> }>;
  // Carpetas en 03.clientes que no matchean ningún contacto.
  orphans: Array<{ id: string; name: string; url: string }>;
  // Contactos sin carpeta detectada.
  missing: Array<{ contactId: string; empresa: string | null; email: string }>;
  ensured: number; // cuántos workspaces se aseguraron (solo si dryRun=false)
};

/**
 * Reconciliación conservadora de carpetas de cliente. Por defecto (dryRun) NO toca Drive:
 * solo reporta duplicados, huérfanas y faltantes. Con dryRun=false, asegura (taggea/adopta/crea)
 * el workspace canónico de cada contacto — NO borra ni mueve archivos.
 */
export async function reconcileClientWorkspaces(opts: { dryRun: boolean }): Promise<ReconcileReport> {
  const empty: ReconcileReport = { dryRun: opts.dryRun, totalContacts: 0, totalFolders: 0, duplicates: [], orphans: [], missing: [], ensured: 0 };
  if (!db) return empty;

  const folders = await listClientesFolders();
  const allContacts = await db.select({ id: contacts.id, empresa: contacts.empresa, email: contacts.email, driveFolderId: contacts.driveFolderId }).from(contacts);
  const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
  const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

  // Mapear cada carpeta a un contacto: por properties.im3ContactId, si no por nombre (exacto/prefijo).
  const byContact = new Map<string, Array<{ id: string; name: string }>>();
  const orphans: ReconcileReport["orphans"] = [];
  for (const f of folders) {
    let cid = f.contactId && allContacts.some(c => c.id === f.contactId) ? f.contactId : null;
    if (!cid) {
      const fname = norm(f.name);
      const match = allContacts.find(c => { const e = norm(c.empresa); return !!e && (fname === e || fname.startsWith(e)); });
      cid = match?.id ?? null;
    }
    if (cid) {
      const arr = byContact.get(cid) ?? [];
      arr.push({ id: f.id, name: f.name });
      byContact.set(cid, arr);
    } else {
      orphans.push({ id: f.id, name: f.name, url: folderUrl(f.id) });
    }
  }

  const duplicates: ReconcileReport["duplicates"] = [];
  const missing: ReconcileReport["missing"] = [];
  for (const c of allContacts) {
    const fs = byContact.get(c.id) ?? [];
    if (fs.length > 1) {
      duplicates.push({ contactId: c.id, empresa: c.empresa, email: c.email, folders: fs.map(f => ({ id: f.id, name: f.name, url: folderUrl(f.id) })) });
    } else if (fs.length === 0) {
      missing.push({ contactId: c.id, empresa: c.empresa, email: c.email });
    }
  }

  let ensured = 0;
  if (!opts.dryRun) {
    // Solo consolidar los clientes con DUPLICADOS: ensureClientWorkspace elige una carpeta
    // canónica y la taggea con im3ContactId (las demás quedan en el reporte para merge manual).
    // NO toca contactos sin carpeta (evita crear carpetas en masa para leads fríos) ni borra/mueve nada.
    // Secuencial para respetar rate limits de Drive.
    const toFix = duplicates.map(d => d.contactId);
    for (const cid of toFix) {
      const c = allContacts.find(x => x.id === cid);
      if (!c) continue;
      try {
        await ensureClientWorkspace(c);
        ensured++;
      } catch (err) {
        log(`[reconcile] falló ensureClientWorkspace(${c.id}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { dryRun: opts.dryRun, totalContacts: allContacts.length, totalFolders: folders.length, duplicates, orphans, missing, ensured };
}
