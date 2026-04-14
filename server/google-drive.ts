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
  } else {
    // PDFs, images, etc. → can't extract text, return metadata
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
