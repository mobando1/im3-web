import { google } from "googleapis";
import { Readable } from "stream";
import { log } from "./index";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) return null;

  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
  });
}

/**
 * List all files owned by the service account and optionally empty trash.
 */
export async function cleanupServiceAccountDrive(): Promise<{ deleted: number; files: string[] }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google auth not configured");

  const drive = google.drive({ version: "v3", auth });

  // Empty trash first
  try {
    await drive.files.emptyTrash();
    log("[Drive Cleanup] Trash emptied");
  } catch (err: any) {
    log(`[Drive Cleanup] Trash empty failed: ${err?.message}`);
  }

  // List all files owned by the service account
  const res = await drive.files.list({
    q: `'me' in owners`,
    fields: "files(id, name, mimeType, size, trashed)",
    pageSize: 100,
  });

  const files = res.data.files || [];
  const deleted: string[] = [];

  // Delete empty folders (no children)
  for (const file of files) {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      const children = await drive.files.list({
        q: `'${file.id}' in parents and trashed = false`,
        fields: "files(id)",
        pageSize: 1,
      });

      if (!children.data.files || children.data.files.length === 0) {
        await drive.files.delete({ fileId: file.id! });
        deleted.push(file.name || file.id!);
        log(`[Drive Cleanup] Deleted empty folder: ${file.name}`);
      }
    }
  }

  return {
    deleted: deleted.length,
    files: files.map(f => `${f.name} (${f.mimeType}, trashed: ${f.trashed})`),
  };
}

export function isGoogleDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

/**
 * Create a subfolder inside the root diagnostics folder.
 * Returns the new folder's ID.
 */
async function createClientFolder(
  empresa: string,
  fecha: string
): Promise<string> {
  const auth = getAuth();
  if (!auth) throw new Error("Google auth not configured");

  const drive = google.drive({ version: "v3", auth });
  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID!;

  const folderName = `${empresa} — ${fecha}`;

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return res.data.id!;
}

interface DiagnosticData {
  // Fase 1 (obligatorios)
  fechaCita: string;
  horaCita: string;
  empresa: string;
  industria: string;
  industriaOtro?: string | null;
  empleados: string;
  participante: string;
  areaPrioridad: string[];
  presupuesto: string;
  // Fase 2 (opcionales, pueden ser null/undefined si no se completó)
  objetivos?: string[] | null;
  productos?: string | null;
  volumenMensual?: string | null;
  canalesAdquisicion?: string[] | null;
  herramientas?: string | null;
  conectadas?: string | null;
  nivelTech?: string | null;
  usaIA?: string | null;
  // Campos legacy opcionales (compat con registros viejos)
  anosOperacion?: string | null;
  ciudades?: string | null;
  resultadoEsperado?: string | null;
  clientePrincipal?: string | null;
  clientePrincipalOtro?: string | null;
  canalAdquisicionOtro?: string | null;
  canalPrincipal?: string | null;
  conectadasDetalle?: string | null;
  usaIAParaQue?: string | null;
  comodidadTech?: string | null;
  familiaridad?: {
    automatizacion: string;
    crm: string;
    ia: string;
    integracion: string;
    desarrollo: string;
  } | null;
}

/**
 * Create a Google Sheet with diagnostic data inside the given folder.
 * Returns the spreadsheet URL.
 */
async function createDiagnosticSheet(
  folderId: string,
  data: DiagnosticData
): Promise<string> {
  const auth = getAuth();
  if (!auth) throw new Error("Google auth not configured");

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  // Create spreadsheet directly in the target folder using Drive API
  // (avoids create-in-root + move pattern that fails with drive.file scope)
  log(`Creating spreadsheet in folder ${folderId}...`);
  const file = await drive.files.create({
    requestBody: {
      name: `Diagnóstico — ${data.empresa}`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    },
    fields: "id",
  });

  const spreadsheetId = file.data.id!;
  log(`Spreadsheet created: ${spreadsheetId}`);

  // Rename default "Sheet1" to "Diagnóstico" and add extra sheets
  const sheetMeta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const defaultSheetId = sheetMeta.data.sheets![0].properties!.sheetId!;

  const setupRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: defaultSheetId, title: "Diagnóstico" },
            fields: "title",
          },
        },
        { addSheet: { properties: { title: "Notas del Equipo" } } },
        { addSheet: { properties: { title: "Recomendaciones" } } },
      ],
    },
  });

  const diagnosticSheetId = defaultSheetId;
  const notesSheetId = setupRes.data.replies![1].addSheet!.properties!.sheetId!;
  const recsSheetId = setupRes.data.replies![2].addSheet!.properties!.sheetId!;

  // Build diagnostic data rows (tolerant to missing Fase 2 / legacy fields)
  const v = (x: string | null | undefined) => x ?? "—";
  const arr = (x: string[] | null | undefined) => (Array.isArray(x) && x.length ? x.join(", ") : "—");

  const rows: (string | string[])[][] = [
    ["INFORMACIÓN DE LA CITA", ""],
    ["Fecha de cita", data.fechaCita],
    ["Hora de cita", data.horaCita],
    ["", ""],

    ["INFORMACIÓN GENERAL", ""],
    ["Empresa", data.empresa],
    ["Industria", data.industria + (data.industriaOtro ? ` (${data.industriaOtro})` : "")],
    ["Empleados", data.empleados],
    ["Participante", data.participante],
    ...(data.anosOperacion ? [["Años de operación", data.anosOperacion]] : []),
    ...(data.ciudades ? [["Ciudades", data.ciudades]] : []),
    ["", ""],

    ["PRIORIDADES E INVERSIÓN", ""],
    ["Áreas prioritarias", arr(data.areaPrioridad)],
    ["Presupuesto", data.presupuesto],
    ["", ""],

    ["CONTEXTO / OBJETIVOS", ""],
    ["Objetivos", arr(data.objetivos)],
    ...(data.resultadoEsperado ? [["Resultado esperado", data.resultadoEsperado]] : []),
    ["", ""],

    ["MODELO DE NEGOCIO", ""],
    ["Productos/Servicios", v(data.productos)],
    ["Volumen mensual", v(data.volumenMensual)],
    ...(data.clientePrincipal ? [["Cliente principal", data.clientePrincipal]] : []),
    ...(data.clientePrincipalOtro ? [["Cliente principal (otro)", data.clientePrincipalOtro]] : []),
    ["", ""],

    ["ADQUISICIÓN DE CLIENTES", ""],
    ["Canales de adquisición", arr(data.canalesAdquisicion)],
    ...(data.canalAdquisicionOtro ? [["Canal otro", data.canalAdquisicionOtro]] : []),
    ...(data.canalPrincipal ? [["Canal principal", data.canalPrincipal]] : []),
    ["", ""],

    ["SISTEMAS Y HERRAMIENTAS", ""],
    ["Herramientas actuales", v(data.herramientas)],
    ["¿Conectadas?", v(data.conectadas)],
    ...(data.conectadasDetalle ? [["Detalle conexión", data.conectadasDetalle]] : []),
    ["", ""],

    ["MADUREZ TECNOLÓGICA", ""],
    ["Madurez tech", v(data.nivelTech)],
    ["¿Usa IA?", v(data.usaIA)],
    ...(data.usaIAParaQue ? [["¿Para qué usa IA?", data.usaIAParaQue]] : []),
    ...(data.comodidadTech ? [["Comodidad con tecnología", data.comodidadTech]] : []),
    ...(data.familiaridad
      ? [
          ["Familiaridad — Automatización", data.familiaridad.automatizacion],
          ["Familiaridad — CRM", data.familiaridad.crm],
          ["Familiaridad — IA", data.familiaridad.ia],
          ["Familiaridad — Integración", data.familiaridad.integracion],
          ["Familiaridad — Desarrollo", data.familiaridad.desarrollo],
        ]
      : []),
  ];

  // Write data to "Diagnóstico" sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Diagnóstico!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: rows as string[][],
    },
  });

  // Identify section header rows (0-indexed)
  const sectionRows: number[] = [];
  rows.forEach((row, i) => {
    const label = row[0] as string;
    if (label === label.toUpperCase() && label.length > 0 && row[1] === "") {
      sectionRows.push(i);
    }
  });

  // Format: bold section headers with teal background, auto-resize columns
  const formatRequests: any[] = [
    // Column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: diagnosticSheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 1,
        },
        properties: { pixelSize: 280 },
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: diagnosticSheetId,
          dimension: "COLUMNS",
          startIndex: 1,
          endIndex: 2,
        },
        properties: { pixelSize: 500 },
        fields: "pixelSize",
      },
    },
    // Bold + background for section headers
    ...sectionRows.map((rowIdx) => ({
      repeatCell: {
        range: {
          sheetId: diagnosticSheetId,
          startRowIndex: rowIdx,
          endRowIndex: rowIdx + 1,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.184, green: 0.643, blue: 0.663 }, // teal
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
              fontSize: 11,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    })),
  ];

  // Set up "Notas del Equipo" sheet headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Notas del Equipo!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["Fecha", "Autor", "Nota"],
      ],
    },
  });

  // Set up "Recomendaciones" sheet headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Recomendaciones!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["Área", "Recomendación", "Prioridad", "Estado"],
      ],
    },
  });

  // Format headers on notes and recommendations sheets
  formatRequests.push(
    // Notes headers
    {
      repeatCell: {
        range: {
          sheetId: notesSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
            textFormat: { bold: true, fontSize: 10 },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    // Recommendations headers
    {
      repeatCell: {
        range: {
          sheetId: recsSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
            textFormat: { bold: true, fontSize: 10 },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    }
  );

  // Apply all formatting
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: formatRequests },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

/**
 * Upload a JSON file with raw diagnostic data to the client folder.
 * This allows the Audit Generator to read data programmatically.
 */
async function uploadJsonFile(
  folderId: string,
  data: DiagnosticData
): Promise<void> {
  const auth = getAuth();
  if (!auth) return;

  const drive = google.drive({ version: "v3", auth });

  const jsonContent = JSON.stringify(data, null, 2);

  await drive.files.create({
    requestBody: {
      name: "diagnostico.json",
      mimeType: "application/json",
      parents: [folderId],
    },
    media: {
      mimeType: "application/json",
      body: Readable.from([jsonContent]),
    },
  });
}

/**
 * Search for a Google Meet recording in the organizer's Drive and move it
 * to the client's existing folder. Also searches for transcription docs.
 *
 * Returns URLs of moved files, or null if nothing found.
 */
export async function moveRecordingToClientFolder(
  meetingTitle: string,
  clientFolderId: string
): Promise<{ recordingUrl: string | null; transcriptUrl: string | null }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google auth not configured");

  const drive = google.drive({ version: "v3", auth });
  let recordingUrl: string | null = null;
  let transcriptUrl: string | null = null;

  // Search for video recording (Meet saves as .mp4 in "Meet Recordings" folder)
  try {
    const videoResults = await drive.files.list({
      q: `name contains '${meetingTitle.replace(/'/g, "\\'")}' and (mimeType='video/mp4' or mimeType='video/webm')`,
      fields: "files(id, name, mimeType, webViewLink)",
      pageSize: 5,
    });

    const recording = videoResults.data.files?.[0];
    if (recording?.id) {
      // Move to client folder
      const file = await drive.files.get({ fileId: recording.id, fields: "parents" });
      const previousParents = file.data.parents?.join(",") || "";
      await drive.files.update({
        fileId: recording.id,
        addParents: clientFolderId,
        removeParents: previousParents,
        fields: "id, webViewLink",
      });
      recordingUrl = recording.webViewLink || `https://drive.google.com/file/d/${recording.id}`;
      log(`[Drive] Recording moved to client folder: ${recording.name}`);
    }
  } catch (err: any) {
    log(`[Drive] Error searching for recording: ${err?.message}`);
  }

  // Search for transcript (Meet saves as Google Doc)
  try {
    const transcriptResults = await drive.files.list({
      q: `name contains '${meetingTitle.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.document'`,
      fields: "files(id, name, mimeType, webViewLink)",
      pageSize: 5,
    });

    const transcript = transcriptResults.data.files?.[0];
    if (transcript?.id) {
      const file = await drive.files.get({ fileId: transcript.id, fields: "parents" });
      const previousParents = file.data.parents?.join(",") || "";
      await drive.files.update({
        fileId: transcript.id,
        addParents: clientFolderId,
        removeParents: previousParents,
        fields: "id, webViewLink",
      });
      transcriptUrl = transcript.webViewLink || `https://docs.google.com/document/d/${transcript.id}`;
      log(`[Drive] Transcript moved to client folder: ${transcript.name}`);
    }
  } catch (err: any) {
    log(`[Drive] Error searching for transcript: ${err?.message}`);
  }

  return { recordingUrl, transcriptUrl };
}

/**
 * Extract the folder ID from a Google Drive folder URL.
 */
export function extractFolderIdFromUrl(url: string): string | null {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extract file ID from a Google Drive URL.
 * Supports: /file/d/ID, /document/d/ID, /spreadsheets/d/ID, ?id=ID
 */
export function extractFileIdFromUrl(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Read the text content of a Google Drive file.
 * Supports Google Docs (exported as plain text), Google Sheets (as CSV),
 * and plain text files. PDFs return metadata only.
 */
export async function readGoogleDriveContent(fileUrl: string): Promise<{ content: string; fileId: string; mimeType: string }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google auth not configured");

  const fileId = extractFileIdFromUrl(fileUrl);
  if (!fileId) throw new Error("Could not extract file ID from URL");

  const drive = google.drive({ version: "v3", auth });

  // Get file metadata to determine type
  const meta = await drive.files.get({ fileId, fields: "mimeType,name" });
  const mimeType = meta.data.mimeType || "";

  let content = "";

  if (mimeType === "application/vnd.google-apps.document") {
    // Google Docs → export as plain text
    const res = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
    content = res.data as string;
  } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
    // Google Sheets → export as CSV
    const res = await drive.files.export({ fileId, mimeType: "text/csv" }, { responseType: "text" });
    content = res.data as string;
  } else if (mimeType === "application/vnd.google-apps.presentation") {
    // Google Slides → export as plain text
    const res = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
    content = res.data as string;
  } else if (mimeType.startsWith("text/")) {
    // Plain text files → download directly
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
    content = res.data as string;
  } else if (mimeType === "application/pdf") {
    // PDF → convertir a Google Doc (OCR built-in de Google) → exportar como texto → borrar copia
    try {
      // 1. Crear copia del PDF como Google Doc (Google aplica OCR automáticamente)
      const copy = await drive.files.copy({
        fileId,
        requestBody: {
          name: `_temp_ocr_${meta.data.name}`,
          mimeType: "application/vnd.google-apps.document",
        },
      });
      const tempDocId = copy.data.id;

      if (tempDocId) {
        // 2. Exportar el Google Doc como texto plano
        const textRes = await drive.files.export(
          { fileId: tempDocId, mimeType: "text/plain" },
          { responseType: "text" }
        );
        content = (textRes.data as string)?.trim() || "";

        // 3. Borrar la copia temporal
        await drive.files.delete({ fileId: tempDocId }).catch(() => {});

        if (content.length < 50) {
          log(`[Drive] PDF "${meta.data.name}" OCR resultó en poco texto (${content.length} chars)`);
          content = `[PDF: ${meta.data.name} — contenido extraído muy corto, posiblemente PDF de imágenes sin OCR legible]\n${content}`;
        } else {
          log(`[Drive] PDF "${meta.data.name}" OCR exitoso: ${content.length} chars`);
        }
      } else {
        content = `[PDF: ${meta.data.name} — no se pudo crear copia para OCR]`;
      }
    } catch (pdfErr) {
      log(`[Drive] Error extrayendo texto de PDF "${meta.data.name}": ${pdfErr}`);
      content = `[PDF: ${meta.data.name} — error al extraer texto: ${(pdfErr as Error).message}]`;
    }
  } else {
    // Images, videos, etc. → can't extract text, return metadata
    content = `[Archivo: ${meta.data.name}, tipo: ${mimeType} — contenido no extraíble automáticamente]`;
  }

  log(`[Drive] Read content from ${meta.data.name} (${mimeType}): ${content.length} chars`);

  return { content, fileId, mimeType };
}

/**
 * Main entry: create folder + sheet + JSON for a diagnostic submission.
 * Returns the Google Drive folder URL and sheet URL.
 */
export async function createDiagnosticInDrive(
  data: DiagnosticData
): Promise<{ folderUrl: string; sheetUrl: string }> {
  log(`[Drive] Iniciando para ${data.empresa}...`);

  const folderId = await createClientFolder(data.empresa, data.fechaCita);
  log(`[Drive] Carpeta creada: ${folderId}`);

  const sheetUrl = await createDiagnosticSheet(folderId, data);
  log(`[Drive] Spreadsheet creado: ${sheetUrl}`);

  await uploadJsonFile(folderId, data);
  log(`[Drive] JSON subido`);

  // Notify Audit Generator to import new diagnostic
  if (process.env.AUDIT_GENERATOR_URL) {
    fetch(`${process.env.AUDIT_GENERATOR_URL}/api/drive-sync`, {
      method: 'POST',
    }).catch(err => log(`[Drive] Webhook al Audit Generator falló: ${(err as Error).message}`));
  }

  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  log(`[Drive] Completo: ${data.empresa} → ${folderUrl}`);

  return { folderUrl, sheetUrl };
}

/**
 * Upload any file to Google Drive and return its web link.
 * Creates folder if needed. Makes file accessible by link.
 */
export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");

  const drive = google.drive({ version: "v3", auth });

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from([buffer]),
    },
    fields: "id,webViewLink",
  });

  const fileId = file.data.id!;
  const webViewLink = file.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  // Make file accessible by link
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  }).catch(() => { /* permission may fail if org policy restricts it */ });

  return { fileId, webViewLink };
}

/**
 * Create a new folder in Google Drive under the main IM3 folder.
 */
export async function createProjectFolder(projectName: string): Promise<string> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");

  const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!parentFolderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID no configurado");

  const drive = google.drive({ version: "v3", auth });

  const folder = await drive.files.create({
    requestBody: {
      name: projectName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  return folder.data.id!;
}

/**
 * Find an existing client folder in Google Drive by company name, or create one if none exists.
 * Searches the root IM3 folder for folders matching the empresa name (exact or prefix match).
 */
export async function findOrCreateClientFolder(empresa: string): Promise<string> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");

  const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!parentFolderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID no configurado");

  const drive = google.drive({ version: "v3", auth });
  const escapedEmpresa = empresa.replace(/'/g, "\\'");

  // Search for existing folders containing the company name
  const results = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name contains '${escapedEmpresa}'`,
    fields: "files(id, name)",
    pageSize: 20,
  });

  const files = results.data.files || [];

  if (files.length > 0) {
    // Priority: exact match > starts with empresa (e.g. "Empresa — 2026-04-15") > contains
    const exact = files.find(f => f.name === empresa);
    if (exact) {
      log(`[Drive] Carpeta existente (exacta): "${exact.name}" → ${exact.id}`);
      return exact.id!;
    }

    const startsWith = files.find(f => f.name?.startsWith(empresa));
    if (startsWith) {
      log(`[Drive] Carpeta existente (prefijo): "${startsWith.name}" → ${startsWith.id}`);
      return startsWith.id!;
    }

    // Any contains match
    log(`[Drive] Carpeta existente (contiene): "${files[0].name}" → ${files[0].id}`);
    return files[0].id!;
  }

  // No existing folder found — create one
  const folder = await drive.files.create({
    requestBody: {
      name: empresa,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  log(`[Drive] Carpeta nueva creada: "${empresa}" → ${folder.data.id}`);
  return folder.data.id!;
}

/**
 * Lista todos los archivos dentro de una carpeta de Drive (incluye subcarpetas, recursivo).
 * Útil para que la generación de propuestas vea archivos puestos directamente en la carpeta
 * del cliente (no solo los subidos vía CRM).
 */
export async function listFolderFilesRecursive(
  folderId: string,
  options: { maxFiles?: number; skipNames?: string[] } = {}
): Promise<Array<{ id: string; name: string; mimeType: string; webViewLink: string; modifiedTime: string }>> {
  const auth = getAuth();
  if (!auth) return [];

  const drive = google.drive({ version: "v3", auth });
  const maxFiles = options.maxFiles ?? 50;
  const skipNames = options.skipNames ?? [];

  const allFiles: Array<{ id: string; name: string; mimeType: string; webViewLink: string; modifiedTime: string }> = [];
  const foldersToScan: string[] = [folderId];
  const scannedFolders = new Set<string>();

  while (foldersToScan.length > 0 && allFiles.length < maxFiles) {
    const currentFolder = foldersToScan.shift()!;
    if (scannedFolders.has(currentFolder)) continue;
    scannedFolders.add(currentFolder);

    try {
      const res = await drive.files.list({
        q: `'${currentFolder}' in parents and trashed=false`,
        fields: "files(id, name, mimeType, webViewLink, modifiedTime)",
        pageSize: 100,
      });

      for (const f of res.data.files || []) {
        if (!f.id || !f.name) continue;
        if (skipNames.includes(f.name)) continue;

        if (f.mimeType === "application/vnd.google-apps.folder") {
          foldersToScan.push(f.id);
        } else {
          allFiles.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType || "",
            webViewLink: f.webViewLink || "",
            modifiedTime: f.modifiedTime || "",
          });
          if (allFiles.length >= maxFiles) break;
        }
      }
    } catch (err) {
      log(`[Drive] Error listing folder ${currentFolder}: ${(err as Error).message}`);
    }
  }

  return allFiles;
}

// ──────────────────────────────────────────────────────────────────────────────
// Folder browser helpers (used by /api/admin/drive/* endpoints + DriveFolderPicker)
// ──────────────────────────────────────────────────────────────────────────────

export interface DriveFolderEntry {
  id: string;
  name: string;
  modifiedTime: string;
}

export interface DriveFolderSearchEntry extends DriveFolderEntry {
  parents: string[];
  path?: string;
}

export interface DriveFolderListing {
  parentId: string;
  parentName: string;
  breadcrumbs: Array<{ id: string; name: string }>;
  folders: DriveFolderEntry[];
}

export class DriveAccessError extends Error {
  status: number;
  code: "not_found" | "forbidden" | "unknown";
  constructor(message: string, status: number, code: "not_found" | "forbidden" | "unknown") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function classifyDriveError(err: unknown): DriveAccessError {
  const e = err as { code?: number; message?: string };
  const code = typeof e?.code === "number" ? e.code : 0;
  if (code === 404) return new DriveAccessError("Carpeta no encontrada o eliminada", 404, "not_found");
  if (code === 403) return new DriveAccessError("Service account sin acceso a esta carpeta", 403, "forbidden");
  return new DriveAccessError(e?.message || "Error desconocido de Drive", 500, "unknown");
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getFolderMeta(folderId: string): Promise<{ id: string; name: string; parents: string[] }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");
  const drive = google.drive({ version: "v3", auth });
  try {
    const res = await drive.files.get({ fileId: folderId, fields: "id,name,parents" });
    return {
      id: res.data.id || folderId,
      name: res.data.name || "(sin nombre)",
      parents: res.data.parents || [],
    };
  } catch (err) {
    throw classifyDriveError(err);
  }
}

/**
 * Lista subcarpetas (no archivos) de un parent. Si parentId es null/undefined,
 * usa GOOGLE_DRIVE_FOLDER_ID (root configurado).
 * Pagina hasta 1000 carpetas máx para evitar runaway.
 */
export async function listDriveFolderChildren(parentIdInput?: string | null): Promise<DriveFolderListing> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");
  const root = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!root) throw new Error("GOOGLE_DRIVE_FOLDER_ID no configurado");

  const parentId = parentIdInput || root;
  const drive = google.drive({ version: "v3", auth });

  const folders: DriveFolderEntry[] = [];
  let pageToken: string | undefined = undefined;
  const HARD_CAP = 1000;

  try {
    do {
      const res: { data: { files?: Array<{ id?: string | null; name?: string | null; modifiedTime?: string | null }>; nextPageToken?: string | null } } =
        await drive.files.list({
          q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: "nextPageToken, files(id,name,modifiedTime)",
          pageSize: 100,
          orderBy: "name",
          pageToken,
        });
      for (const f of res.data.files || []) {
        if (!f.id || !f.name) continue;
        folders.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime || "" });
        if (folders.length >= HARD_CAP) break;
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken && folders.length < HARD_CAP);
  } catch (err) {
    throw classifyDriveError(err);
  }

  // Build breadcrumbs (subiendo por parents hasta el root configurado)
  const breadcrumbs: Array<{ id: string; name: string }> = [];
  const meta = await getFolderMeta(parentId);
  let current: { id: string; name: string; parents: string[] } | null = meta;
  let depth = 0;
  while (current && depth < 15) {
    breadcrumbs.unshift({ id: current.id, name: current.name });
    if (current.id === root) break;
    const parent = current.parents[0];
    if (!parent) break;
    try {
      current = await getFolderMeta(parent);
    } catch {
      break;
    }
    depth++;
  }

  return {
    parentId,
    parentName: meta.name,
    breadcrumbs,
    folders,
  };
}

/**
 * Busca carpetas por nombre. Devuelve hasta `limit` resultados (default 50).
 * No restringe scope porque Drive API no soporta scoping recursivo en una sola query.
 */
export async function searchDriveFolders(
  query: string,
  options: { limit?: number } = {}
): Promise<{ folders: DriveFolderSearchEntry[]; truncated: boolean }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");
  const drive = google.drive({ version: "v3", auth });
  const limit = Math.min(options.limit ?? 50, 100);

  const safeQuery = escapeDriveQuery(query.trim());
  if (safeQuery.length < 2) return { folders: [], truncated: false };

  try {
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and trashed=false and name contains '${safeQuery}'`,
      fields: "nextPageToken, files(id,name,modifiedTime,parents)",
      pageSize: limit,
      orderBy: "name",
    });
    const folders: DriveFolderSearchEntry[] = (res.data.files || [])
      .filter((f): f is { id: string; name: string; modifiedTime?: string | null; parents?: string[] | null } => !!f.id && !!f.name)
      .map(f => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime || "",
        parents: f.parents || [],
      }));
    return { folders, truncated: !!res.data.nextPageToken };
  } catch (err) {
    throw classifyDriveError(err);
  }
}

/**
 * Crea una subcarpeta dentro de parentId (o root si vacío). Devuelve id + name.
 * NO valida duplicados — confiamos en el caller.
 */
export async function createSubfolder(
  parentIdInput: string | null | undefined,
  name: string
): Promise<{ id: string; name: string }> {
  const auth = getAuth();
  if (!auth) throw new Error("Google Drive no configurado");
  const root = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!root) throw new Error("GOOGLE_DRIVE_FOLDER_ID no configurado");

  const parentId = parentIdInput || root;
  const cleanName = name.trim().replace(/\//g, "-").slice(0, 200);
  if (!cleanName) throw new Error("Nombre de carpeta vacío");

  const drive = google.drive({ version: "v3", auth });
  try {
    const res = await drive.files.create({
      requestBody: {
        name: cleanName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id,name",
    });
    if (!res.data.id || !res.data.name) throw new Error("Drive no devolvió id/name");
    return { id: res.data.id, name: res.data.name };
  } catch (err) {
    throw classifyDriveError(err);
  }
}

/**
 * Resuelve el path "Mi unidad > X > Y" subiendo por parents hasta stopAtRoot
 * (o el root configurado). Cap de profundidad 15.
 */
export async function getFolderPath(folderId: string, stopAtRootInput?: string): Promise<string> {
  const stopAt = stopAtRootInput || process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  const segments: string[] = [];
  let currentId: string | undefined = folderId;
  let depth = 0;
  while (currentId && depth < 15) {
    let meta: { id: string; name: string; parents: string[] };
    try {
      meta = await getFolderMeta(currentId);
    } catch {
      break;
    }
    segments.unshift(meta.name);
    if (meta.id === stopAt) break;
    currentId = meta.parents[0];
    depth++;
  }
  return segments.join(" > ");
}
