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
  fechaCita: string;
  horaCita: string;
  empresa: string;
  industria: string;
  anosOperacion: string;
  empleados: string;
  ciudades: string;
  participante: string;
  objetivos: string[];
  resultadoEsperado: string;
  productos: string;
  volumenMensual: string;
  clientePrincipal: string;
  clientePrincipalOtro?: string;
  canalesAdquisicion: string[];
  canalAdquisicionOtro?: string;
  canalPrincipal: string;
  herramientas: string;
  conectadas: string;
  conectadasDetalle?: string;
  nivelTech: string;
  usaIA: string;
  usaIAParaQue?: string;
  comodidadTech: string;
  familiaridad: {
    automatizacion: string;
    crm: string;
    ia: string;
    integracion: string;
    desarrollo: string;
  };
  areaPrioridad: string[];
  presupuesto: string;
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

  // Build diagnostic data rows
  const rows: (string | string[])[][] = [
    // Section: Cita
    ["INFORMACIÓN DE LA CITA", ""],
    ["Fecha de cita", data.fechaCita],
    ["Hora de cita", data.horaCita],
    ["", ""],

    // Section: General
    ["INFORMACIÓN GENERAL", ""],
    ["Empresa", data.empresa],
    ["Industria", data.industria],
    ["Años de operación", data.anosOperacion],
    ["Empleados", data.empleados],
    ["Ciudades", data.ciudades],
    ["Participante", data.participante],
    ["", ""],

    // Section: Contexto
    ["CONTEXTO DE LA AUDITORÍA", ""],
    ["Objetivos", data.objetivos.join(", ")],
    ["Resultado esperado", data.resultadoEsperado],
    ["", ""],

    // Section: Modelo de negocio
    ["MODELO DE NEGOCIO", ""],
    ["Productos/Servicios", data.productos],
    ["Volumen mensual", data.volumenMensual],
    ["Cliente principal", data.clientePrincipal],
    ...(data.clientePrincipalOtro
      ? [["Cliente principal (otro)", data.clientePrincipalOtro]]
      : []),
    ["", ""],

    // Section: Adquisición
    ["ADQUISICIÓN DE CLIENTES", ""],
    ["Canales de adquisición", data.canalesAdquisicion.join(", ")],
    ...(data.canalAdquisicionOtro
      ? [["Canal otro", data.canalAdquisicionOtro]]
      : []),
    ["Canal principal", data.canalPrincipal],
    ["", ""],

    // Section: Herramientas
    ["SISTEMAS Y HERRAMIENTAS", ""],
    ["Herramientas actuales", data.herramientas],
    ["¿Conectadas?", data.conectadas],
    ...(data.conectadasDetalle
      ? [["Detalle conexión", data.conectadasDetalle]]
      : []),
    ["", ""],

    // Section: Madurez
    ["MADUREZ TECNOLÓGICA", ""],
    ["Nivel técnico", data.nivelTech],
    ["¿Usa IA?", data.usaIA],
    ...(data.usaIAParaQue
      ? [["¿Para qué usa IA?", data.usaIAParaQue]]
      : []),
    ["Comodidad con tecnología", data.comodidadTech],
    ["Familiaridad — Automatización", data.familiaridad.automatizacion],
    ["Familiaridad — CRM", data.familiaridad.crm],
    ["Familiaridad — IA", data.familiaridad.ia],
    ["Familiaridad — Integración", data.familiaridad.integracion],
    ["Familiaridad — Desarrollo", data.familiaridad.desarrollo],
    ["", ""],

    // Section: Prioridades
    ["PRIORIDADES E INVERSIÓN", ""],
    ["Áreas prioritarias", data.areaPrioridad.join(", ")],
    ["Presupuesto", data.presupuesto],
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

  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  log(`[Drive] Completo: ${data.empresa} → ${folderUrl}`);

  return { folderUrl, sheetUrl };
}
