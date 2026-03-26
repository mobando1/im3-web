import { google } from "googleapis";
import { log } from "./index";
import { db } from "./db";
import { projectFiles } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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

/** Map MIME type / extension to projectFiles type */
function detectFileType(name: string, mimeType: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType.toLowerCase();

  if (mime.includes("video") || ["mp4", "webm", "mov", "avi"].includes(ext)) return "recording";
  if (mime.includes("audio") || ["mp3", "wav", "m4a", "ogg"].includes(ext)) return "recording";
  if (mime.includes("image") || ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (name.toLowerCase().includes("transcri") || ext === "txt" || ext === "vtt" || ext === "srt") return "transcript";
  if (name.toLowerCase().includes("contrato") || name.toLowerCase().includes("contract")) return "contract";
  if (name.toLowerCase().includes("diseño") || name.toLowerCase().includes("design") || name.toLowerCase().includes("figma") || ext === "fig") return "design";
  if (mime.includes("pdf") || ext === "pdf") return "document";
  if (mime.includes("document") || mime.includes("spreadsheet") || mime.includes("presentation") || ["docx", "doc", "xlsx", "pptx"].includes(ext)) return "document";

  return "other";
}

/**
 * Sync files from a Google Drive folder into projectFiles table.
 * Only adds new files (skips those already synced by URL).
 */
export async function syncDriveFilesToProject(
  projectId: string,
  folderId: string
): Promise<{ synced: number; total: number; skipped: number }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");
  if (!db) throw new Error("Database no disponible");

  const drive = google.drive({ version: "v3", auth });

  // List all files in folder (non-trashed)
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,webViewLink,createdTime)",
    pageSize: 100,
    orderBy: "createdTime desc",
  });

  const driveFiles = res.data.files || [];

  // Get existing files for this project to avoid duplicates
  const existing = await db.select({ url: projectFiles.url }).from(projectFiles)
    .where(eq(projectFiles.projectId, projectId));
  const existingUrls = new Set(existing.map(f => f.url));

  let synced = 0;
  let skipped = 0;

  for (const file of driveFiles) {
    if (!file.id || !file.name || !file.webViewLink) continue;

    // Skip if already exists
    if (existingUrls.has(file.webViewLink)) {
      skipped++;
      continue;
    }

    const fileType = detectFileType(file.name, file.mimeType || "");

    await db.insert(projectFiles).values({
      projectId,
      name: file.name,
      type: fileType,
      url: file.webViewLink,
      size: file.size ? parseInt(file.size) : null,
      uploadedBy: "team",
    });

    synced++;
  }

  log(`Drive sync for project ${projectId}: ${synced} new, ${skipped} skipped, ${driveFiles.length} total in folder`);

  return { synced, total: driveFiles.length, skipped };
}
