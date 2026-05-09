import { google } from "googleapis";
import { log } from "./index";
import { db } from "./db";
import { projectFiles, contactFiles, contacts } from "@shared/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { DriveAccessError } from "./google-drive";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;
  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
  });
}

/** Map MIME type / extension to file type tag */
function detectFileType(name: string, mimeType: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType.toLowerCase();

  if (mime.includes("video") || ["mp4", "webm", "mov", "avi"].includes(ext)) return "recording";
  if (mime.includes("audio") || ["mp3", "wav", "m4a", "ogg"].includes(ext)) return "recording";
  if (mime.includes("image") || ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "imagen";
  if (name.toLowerCase().includes("transcri") || ext === "txt" || ext === "vtt" || ext === "srt") return "transcript";
  if (name.toLowerCase().includes("contrato") || name.toLowerCase().includes("contract")) return "contrato";
  if (name.toLowerCase().includes("propuesta") || name.toLowerCase().includes("proposal")) return "propuesta";
  if (name.toLowerCase().includes("auditor") || name.toLowerCase().includes("audit")) return "auditoria";
  if (name.toLowerCase().includes("diseño") || name.toLowerCase().includes("design") || name.toLowerCase().includes("figma") || ext === "fig") return "design";
  if (mime.includes("pdf") || ext === "pdf") return "documento";
  if (mime.includes("document") || mime.includes("spreadsheet") || mime.includes("presentation") || ["docx", "doc", "xlsx", "pptx"].includes(ext)) return "documento";

  return "otro";
}

/** project-files use the legacy "image"/"document" labels. Map back where applicable. */
function mapTypeForProject(t: string): string {
  if (t === "imagen") return "image";
  if (t === "documento") return "document";
  if (t === "contrato") return "contract";
  if (t === "otro") return "other";
  return t;
}

export type SyncTarget =
  | { kind: "project"; id: string }
  | { kind: "contact"; id: string };

export interface SyncResult {
  synced: number;
  total: number;
  skipped: number;
}

async function listFolderFiles(folderId: string) {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");
  const drive = google.drive({ version: "v3", auth });

  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: "files(id,name,mimeType,size,webViewLink,createdTime)",
      pageSize: 100,
      orderBy: "createdTime desc",
    });
    return res.data.files || [];
  } catch (err) {
    const e = err as { code?: number; message?: string };
    if (e?.code === 404) throw new DriveAccessError("Carpeta no encontrada o eliminada", 404, "not_found");
    if (e?.code === 403) throw new DriveAccessError("Service account sin acceso a esta carpeta", 403, "forbidden");
    throw err;
  }
}

/**
 * Sync files from a Google Drive folder into the target table (projectFiles or contactFiles).
 * - projectFiles: deduplica por url (legacy)
 * - contactFiles: deduplica por driveFileId
 */
export async function syncDriveFilesToTarget(
  target: SyncTarget,
  folderId: string
): Promise<SyncResult> {
  if (!db) throw new Error("Database no disponible");
  const driveFiles = await listFolderFiles(folderId);

  let synced = 0;
  let skipped = 0;

  if (target.kind === "project") {
    const existing = await db.select({ url: projectFiles.url }).from(projectFiles)
      .where(eq(projectFiles.projectId, target.id));
    const existingUrls = new Set(existing.map(f => f.url));

    for (const file of driveFiles) {
      if (!file.id || !file.name || !file.webViewLink) continue;
      if (existingUrls.has(file.webViewLink)) { skipped++; continue; }
      await db.insert(projectFiles).values({
        projectId: target.id,
        name: file.name,
        type: mapTypeForProject(detectFileType(file.name, file.mimeType || "")),
        url: file.webViewLink,
        size: file.size ? parseInt(file.size) : null,
        uploadedBy: "team",
      });
      synced++;
    }
  } else {
    const existing = await db.select({ driveFileId: contactFiles.driveFileId }).from(contactFiles)
      .where(and(eq(contactFiles.contactId, target.id), isNotNull(contactFiles.driveFileId)));
    const existingDriveIds = new Set(existing.map(f => f.driveFileId).filter((id): id is string => !!id));

    for (const file of driveFiles) {
      if (!file.id || !file.name || !file.webViewLink) continue;
      if (existingDriveIds.has(file.id)) { skipped++; continue; }
      await db.insert(contactFiles).values({
        contactId: target.id,
        name: file.name,
        type: detectFileType(file.name, file.mimeType || ""),
        url: file.webViewLink,
        size: file.size ? parseInt(file.size) : null,
        driveFileId: file.id,
        uploadedBy: "team",
      });
      synced++;
    }
  }

  log(`Drive sync ${target.kind} ${target.id}: ${synced} new, ${skipped} skipped, ${driveFiles.length} total`);
  return { synced, total: driveFiles.length, skipped };
}

/** Legacy wrapper to preserve existing call sites. */
export async function syncDriveFilesToProject(
  projectId: string,
  folderId: string
): Promise<SyncResult> {
  return syncDriveFilesToTarget({ kind: "project", id: projectId }, folderId);
}

export async function syncDriveFilesToContact(
  contactId: string,
  folderId: string
): Promise<SyncResult> {
  return syncDriveFilesToTarget({ kind: "contact", id: contactId }, folderId);
}

/**
 * Cron runner: itera contactos activos con driveFolderId y sincroniza.
 * Filtramos status para no martillar leads viejos.
 */
export async function runContactDriveSyncCron(): Promise<{
  recordsProcessed: number;
  syncedCount: number;
  errors: number;
}> {
  if (!db) return { recordsProcessed: 0, syncedCount: 0, errors: 0 };

  const rows = await db.select({ id: contacts.id, driveFolderId: contacts.driveFolderId })
    .from(contacts)
    .where(
      and(
        isNotNull(contacts.driveFolderId),
        inArray(contacts.status, ["contacted", "scheduled", "converted"])
      )
    );

  let syncedCount = 0;
  let errors = 0;
  for (const row of rows) {
    if (!row.driveFolderId) continue;
    try {
      const result = await syncDriveFilesToContact(row.id, row.driveFolderId);
      syncedCount += result.synced;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      log(`[contact-drive-sync] Error en contacto ${row.id}: ${message}`);
    }
  }

  return { recordsProcessed: rows.length, syncedCount, errors };
}
