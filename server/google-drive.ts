import { google } from "googleapis";
import { log } from "./index";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
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

  // Create spreadsheet
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `Diagnóstico — ${data.empresa}`,
      },
      sheets: [
        { properties: { title: "Diagnóstico", index: 0 } },
        { properties: { title: "Notas del Equipo", index: 1 } },
        { properties: { title: "Recomendaciones", index: 2 } },
      ],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;
  const diagnosticSheetId = spreadsheet.data.sheets![0].properties!.sheetId!;
  const notesSheetId = spreadsheet.data.sheets![1].properties!.sheetId!;
  const recsSheetId = spreadsheet.data.sheets![2].properties!.sheetId!;

  // Move to client folder
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: folderId,
    removeParents: "root",
    fields: "id, parents",
  });

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
 * Main entry: create folder + sheet for a diagnostic submission.
 * Returns the Google Drive folder URL and sheet URL.
 */
export async function createDiagnosticInDrive(
  data: DiagnosticData
): Promise<{ folderUrl: string; sheetUrl: string }> {
  const folderId = await createClientFolder(data.empresa, data.fechaCita);
  const sheetUrl = await createDiagnosticSheet(folderId, data);
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

  log(`Google Drive creado: ${data.empresa} → ${folderUrl}`);

  return { folderUrl, sheetUrl };
}
