import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { contacts, diagnostics, sentEmails, contactNotes, activityLog, aiInsightsCache, gmailEmails, contactFiles } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { log } from "./index";
import { readGoogleDriveContent } from "./google-drive";
import { getIndustriaLabel } from "@shared/industrias";
import { proposalDataSchema, type ProposalData, type ProposalSectionKey, type ProposalSourcesReport } from "@shared/proposal-template/types";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load voice guide, cost reference, hardware catalog and case studies once at module load
let VOICE_GUIDE = "";
let COST_REFERENCE = "";
let HARDWARE_CATALOG = "";
let CASE_STUDIES = "";
try {
  VOICE_GUIDE = readFileSync(resolve(process.cwd(), "shared/proposal-voice-guide.md"), "utf-8");
} catch (err) {
  log(`[proposal-ai] could not load voice guide: ${err}`);
}
try {
  COST_REFERENCE = readFileSync(resolve(process.cwd(), "shared/proposal-cost-reference.md"), "utf-8");
} catch (err) {
  log(`[proposal-ai] could not load cost reference: ${err}`);
}
try {
  HARDWARE_CATALOG = readFileSync(resolve(process.cwd(), "shared/proposal-hardware-catalog.md"), "utf-8");
} catch (err) {
  log(`[proposal-ai] could not load hardware catalog: ${err}`);
}
try {
  CASE_STUDIES = readFileSync(resolve(process.cwd(), "shared/proposal-case-studies.md"), "utf-8");
} catch (err) {
  log(`[proposal-ai] could not load case studies: ${err}`);
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Gather ALL available context for a contact to feed to the proposal AI.
 */
async function gatherContactContext(contactId: string): Promise<string> {
  if (!db) return "";

  const parts: string[] = [];

  // Contact info
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (contact) {
    parts.push(`CONTACTO:\n- Nombre: ${contact.nombre}\n- Empresa: ${contact.empresa}\n- Email: ${contact.email}\n- Teléfono: ${contact.telefono || "N/A"}\n- Lead Score: ${contact.leadScore}`);
  }

  // Diagnostic
  if (contact?.diagnosticId) {
    const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
    if (diag) {
      const diagData = diag as Record<string, unknown>;
      const industriaLabel = getIndustriaLabel(diag.industria);
      const industriaExtra = diag.industria === "otro" && diag.industriaOtro ? ` (${diag.industriaOtro})` : "";
      const diagLines = [
        `DIAGNÓSTICO TECNOLÓGICO:`,
        `- Empresa: ${diag.empresa}`,
        `- Industria: ${industriaLabel}${industriaExtra}`,
        `- Empleados: ${diag.empleados}`,
        `- Área prioritaria: ${(diag.areaPrioridad as string[] | null)?.join(", ") || "N/A"}`,
        `- Presupuesto: ${diag.presupuesto}`,
      ];
      if (diag.objetivos) diagLines.push(`- Objetivos: ${(diag.objetivos as string[]).join(", ")}`);
      if (diag.productos) diagLines.push(`- Productos: ${diag.productos}`);
      if (diag.volumenMensual) diagLines.push(`- Volumen mensual: ${diag.volumenMensual}`);
      if (diag.herramientas) diagLines.push(`- Herramientas actuales: ${diag.herramientas}`);
      if (diag.conectadas) diagLines.push(`- Herramientas conectadas: ${diag.conectadas}`);
      if (diag.nivelTech) diagLines.push(`- Madurez tech: ${diag.nivelTech}`);
      if (diag.usaIA) diagLines.push(`- Usa IA: ${diag.usaIA}`);
      // Campos legacy: si existen en diagData, los incluimos por si hay registros viejos
      if (diagData.frustraciones) diagLines.push(`- Frustraciones: ${diagData.frustraciones}`);
      if (diagData.expectativas) diagLines.push(`- Expectativas: ${diagData.expectativas}`);
      if (diagData.timeline) diagLines.push(`- Timeline deseado: ${diagData.timeline}`);
      if (diagData.tomadorDecision) diagLines.push(`- Decisor: ${diagData.tomadorDecision}`);
      parts.push(diagLines.join("\n"));
    }
  }

  // Notes from meetings
  const notes = await db.select().from(contactNotes).where(eq(contactNotes.contactId, contactId)).orderBy(desc(contactNotes.createdAt)).limit(10);
  if (notes.length > 0) {
    parts.push(`NOTAS DE REUNIONES (${notes.length}):\n${notes.map(n => `- ${n.content}`).join("\n")}`);
  }

  // AI insights / mini audit
  const [insights] = await db.select().from(aiInsightsCache).where(eq(aiInsightsCache.contactId, contactId)).limit(1);
  if (insights) {
    parts.push(`MINI AUDITORÍA IA:\n${JSON.stringify(insights.insight, null, 2)}`);
  }

  // Email history
  const emails = await db.select().from(sentEmails).where(eq(sentEmails.contactId, contactId)).orderBy(desc(sentEmails.sentAt)).limit(10);
  if (emails.length > 0) {
    parts.push(`EMAILS ENVIADOS (${emails.length}):\n${emails.map(e => `- [${e.status}] ${e.subject || "Sin asunto"}`).join("\n")}`);
  }

  // Gmail conversation history
  const gmailMessages = await db.select().from(gmailEmails).where(eq(gmailEmails.contactId, contactId)).orderBy(desc(gmailEmails.gmailDate)).limit(15);
  if (gmailMessages.length > 0) {
    parts.push(`HISTORIAL DE EMAILS GMAIL (${gmailMessages.length}):\n${gmailMessages.map(m =>
      `- [${m.direction === "inbound" ? "RECIBIDO" : "ENVIADO"}] ${m.subject || "Sin asunto"} (${m.gmailDate.toLocaleDateString("es-CO")})\n  ${m.bodyText || m.snippet || ""}`
    ).join("\n")}`);
  }

  // Contact documents/files — solo los explícitamente subidos vía CRM (contactFiles).
  // Para incluir archivos directos del Drive, el admin debe usar el chat conversacional
  // y pedirle a Claude que lea archivos específicos con list_drive_folder/read_drive_file.
  const docs = await db.select().from(contactFiles).where(eq(contactFiles.contactId, contactId));
  if (docs.length > 0) {
    const docParts: string[] = [];
    for (const d of docs) {
      let content = d.content || "";

      // Auto-sync from Google Drive if: no content yet, or re-sync to get latest version
      const isGoogleUrl = d.url && (d.url.includes("google.com") || d.url.includes("docs.google"));
      if (isGoogleUrl) {
        try {
          const result = await readGoogleDriveContent(d.url);
          if (result.content && result.content.length > 0) {
            content = result.content;
            await db.update(contactFiles).set({
              content: result.content,
              driveFileId: result.fileId,
            }).where(eq(contactFiles.id, d.id));
            log(`[Proposal] Drive auto-sync for "${d.name}": ${result.content.length} chars`);
          }
        } catch (err) {
          log(`[Proposal] Drive sync failed for "${d.name}": ${(err as Error).message}`);
        }
      }

      if (content) {
        docParts.push(`- [${d.type}] ${d.name}:\n  ${content}`);
      } else {
        docParts.push(`- [${d.type}] ${d.name} (sin contenido extraíble)`);
      }
    }
    parts.push(`DOCUMENTOS DEL CLIENTE (${docs.length}):\n${docParts.join("\n")}`);
  }

  // Activity log
  const activity = await db.select().from(activityLog).where(eq(activityLog.contactId, contactId)).orderBy(desc(activityLog.createdAt)).limit(15);
  if (activity.length > 0) {
    parts.push(`ACTIVIDAD RECIENTE (${activity.length}):\n${activity.map(a => `- [${a.type}] ${a.description}`).join("\n")}`);
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Generate a complete ProposalData object matching shared/proposal-template/types.ts.
 * Uses Claude Sonnet 4 with a strict schema-matching prompt.
 */
export async function generateProposal(contactId: string, adminNotes?: string): Promise<{
  proposalData: ProposalData;
  sourcesReport: ProposalSourcesReport;
} | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const context = await gatherContactContext(contactId);
  if (!context) return null;

  // Resolve dates for meta
  const today = new Date();
  const validUntil = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 días
  const todayStr = today.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  const validUntilStr = validUntil.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 10000,
    temperature: 0.35,
    system: `Eres un consultor senior de IM3 Systems, agencia de tecnología especializada en IA, automatización y desarrollo de software para empresas en Latinoamérica.

Tu tarea: generar una propuesta comercial ESTRUCTURADA que se va a renderizar en un template React premium (secciones Hero, Summary, Problem, Solution, Tech, Timeline, ROI, Authority, Testimonials, Pricing, OperationalCosts, CTA).

═══════════════════════════════════════════════════════════════
VOICE GUIDE — aplica TODAS estas reglas al escribir cada sección:
═══════════════════════════════════════════════════════════════

${VOICE_GUIDE}

═══════════════════════════════════════════════════════════════
COST REFERENCE — úsalo para calcular la sección operationalCosts:
═══════════════════════════════════════════════════════════════

${COST_REFERENCE}

═══════════════════════════════════════════════════════════════
HARDWARE CATALOG — úsalo para decidir si incluir la sección hardware:
═══════════════════════════════════════════════════════════════

${HARDWARE_CATALOG}

═══════════════════════════════════════════════════════════════
CASE STUDIES — ÚNICA fuente autorizada de testimonios:
═══════════════════════════════════════════════════════════════

${CASE_STUDIES}

═══════════════════════════════════════════════════════════════
INSTRUCCIONES DE GENERACIÓN:
═══════════════════════════════════════════════════════════════

IMPORTANTE: La sección "testimonials" está REMOVIDA por política de IM3 hasta tener casos reales autorizados. NO incluyas la key "testimonials" en el JSON bajo ningún motivo. Las testimonios inventados dañan la reputación. Omítela completamente.

REGLAS CRÍTICAS:
- ANALIZA TODO el contexto: diagnóstico, emails, documentos, notas, auditoría, actividad. Cada fuente es relevante.
- Tono: profesional, confiado, orientado a resultados. Como consultor que sabe cerrar deals.
- NO inventes datos clave del cliente (nombres, cifras específicas) que no estén en el contexto. Si no hay dato, omítelo o usa rangos plausibles.
- Los precios en formato "$X.XXX USD" o equivalente en pesos colombianos.
- Los montos monetarios que muestras al cliente usan formato visual ("$12.500.000 COP" o "$3.500 USD"), NO números crudos.
- monthlyLossCOP es un NÚMERO entero (ej: 12500000) — el template lo anima en pantalla.
- Escribe en español latinoamericano (Colombia).
- Usa tags HTML simples SOLO si el schema lo permite. La mayoría de campos son strings planos — NO metas HTML en ellos.

SOBRE IM3 SYSTEMS (usa esto donde el schema lo pida):
- Agencia LATAM de IA + automatización + desarrollo
- Sede Colombia, operación LATAM + España
- Stack: React, Node.js, PostgreSQL, Claude AI, integraciones Google Workspace, Stripe
- Diferenciadores clave:
  * IA integrada en cada entregable (no es "agregado")
  * Portal de seguimiento en tiempo real (github commits → resúmenes para el cliente)
  * Tutor virtual post-entrega que entrena al equipo del cliente
  * Acompañamiento sin tiempo límite mientras el cliente crece
- Casos recientes: Passport2Fluency (plataforma idiomas + IA), CRM con IA y automatización email+WhatsApp, Auditorías automatizadas con IA.

ESTRUCTURA EXACTA QUE DEBES DEVOLVER (JSON estricto, sin markdown wrapper, sin comentarios, sin texto antes ni después):

{
  "proposalData": {
    "meta": {
      "clientName": "<nombre de la empresa>",
      "contactName": "<nombre del contacto principal>",
      "proposalDate": "${todayStr}",
      "validUntil": "${validUntilStr}",
      "industry": "<industria del cliente según el diagnóstico>"
    },
    "hero": {
      "painHeadline": "<1 oración impactante sobre el dolor principal del cliente, usando SUS palabras cuando sea posible. Ej: 'Estás perdiendo ventas cada semana por falta de seguimiento'>",
      "painAmount": "<cifra grande y dramática. Ej: '$12.5M COP/mes perdidos' o '480 horas/año desperdiciadas'>",
      "subtitle": "<2 líneas. Transición del dolor a la promesa: 'Te mostramos exactamente cómo recuperarlo en los próximos X meses.'>",
      "diagnosisRef": "<1 línea que valida que leímos su diagnóstico. Ej: 'Basado en el diagnóstico tecnológico que completaste el DD/MM'>"
    },
    "summary": {
      "commitmentQuote": "<quote fuerte de 1-2 líneas. Ej: 'No vendemos software. Vendemos tiempo, escala y control.' Debe sonar a IM3, no genérico>",
      "paragraphs": [
        "<Párrafo 1: contexto del cliente (2-3 líneas, personalizado)>",
        "<Párrafo 2: qué vamos a lograr juntos (2-3 líneas)>",
        "<Párrafo 3 (opcional): por qué ahora es el momento>"
      ],
      "stats": [
        { "label": "Tiempo de desarrollo", "value": "<ej: 12 semanas>" },
        { "label": "Ahorro estimado/mes", "value": "<ej: $8M COP>" },
        { "label": "ROI proyectado", "value": "<ej: 320% año 1>" }
      ]
    },
    "problem": {
      "intro": "<Intro de 2-3 líneas: 'Identificamos estos puntos críticos que están frenando a <empresa>:'>",
      "monthlyLossCOP": <NÚMERO ENTERO en COP, estimación conservadora y defendible. Ej: 12500000 NO: "12.500.000". BASAR EL NÚMERO en datos reales del diagnóstico (empleados × tarifa promedio × horas perdidas, o ventas perdidas × volumen, o similar).>,
      "counterDescription": "<Leyenda del número: 'Por mes en ineficiencia y oportunidades perdidas.' — corta>",
      "calculationBreakdown": "<OBLIGATORIO. Explica EXPLÍCITAMENTE cómo llegaste a ese número, usando datos reales del diagnóstico. Ejemplo: 'Basado en tu diagnóstico: 45 empleados que registran manualmente horas extras. Si 15% tiene sobrepago detectable (investigaciones del sector arrojan 10-20%), a $4.5M COP/mes/empleado promedio, son ~$30M COP/mes. Tomamos el extremo conservador: $25M.' — El cliente debe poder AUDITAR el cálculo. Si no puedes justificarlo, baja el número.>",
      "problemCards": [
        { "icon": "<emoji, ej: ⏰>", "title": "<título corto del problema>", "description": "<1-2 líneas describiendo el impacto concreto en SU negocio>" },
        { "icon": "<emoji>", "title": "...", "description": "..." },
        { "icon": "<emoji>", "title": "...", "description": "..." }
      ]
    },
    "solution": {
      "heading": "<ej: 'Tu plataforma integrada de crecimiento'>",
      "intro": "<2-3 líneas explicando la filosofía de la solución>",
      "modules": [
        { "number": 1, "title": "<nombre del módulo>", "description": "<qué hace>", "solves": "<qué problema de los anteriores resuelve específicamente>" },
        { "number": 2, "title": "...", "description": "...", "solves": "..." },
        { "number": 3, "title": "...", "description": "...", "solves": "..." }
      ]
    },
    "tech": {
      "heading": "<ej: 'Tecnología de punta, lista para escalar'>",
      "intro": "<2-3 líneas. Explica el stack EN LENGUAJE DE NEGOCIO, no de programador.>",
      "features": [
        "<4-6 features OBLIGATORIAS — lo que SÍ va incluido. Ej: 'Automatización de emails con IA', 'Dashboard en tiempo real'. NO incluyas aquí features opcionales, esos van en optionalFeatures.>"
      ],
      "optionalFeatures": [
        "<OPCIONAL: 0-4 features opcionales — extras que el cliente puede agregar. Si no hay extras claros, OMITIR esta key completamente (no array vacío). Estas se renderizan en una fila separada con etiqueta 'Opcionales'.>"
      ],
      "stack": "<lista corta de tecnologías: 'React · Node.js · PostgreSQL · Claude AI · Google Workspace'>"
    },
    "timeline": {
      "heading": "<ej: 'Tu implementación en 3 fases'>",
      "phases": [
        { "number": 1, "title": "<nombre de la fase>", "durationWeeks": <entero>, "items": ["<tarea>", "<tarea>", "<tarea>"], "outcome": "<qué tienen al terminar esta fase — NO incluyas 'Al finalizar:' al inicio, el template lo agrega automático>" },
        { "number": 2, "title": "...", "durationWeeks": 0, "items": ["..."], "outcome": "..." },
        { "number": 3, "title": "...", "durationWeeks": 0, "items": ["..."], "outcome": "..." }
      ]
    },
    "roi": {
      "heading": "<ej: 'Retorno de inversión proyectado'>",
      "recoveries": [
        { "amount": "<ej: $15M>", "currency": "COP", "label": "<ej: Ahorro anual en horas>" },
        { "amount": "...", "currency": "COP", "label": "..." },
        { "amount": "...", "currency": "COP", "label": "..." }
      ],
      "comparison": {
        "withoutLabel": "Sin IM3",
        "withoutAmount": "<monto anual de pérdidas actuales en formato $>",
        "withoutWeight": 100,
        "investmentLabel": "Con IM3",
        "investmentAmount": "<monto de la inversión en formato $>",
        "investmentWeight": <número 0-100 proporcional al monto vs el withoutAmount>,
        "caption": "<1 línea conectando inversión vs costo de no actuar>"
      },
      "heroTitle": "<ej: 'Se paga en 4 meses'>",
      "heroDescription": "<2-3 líneas explicando la matemática del payback>",
      "roiPercent": "<ej: '340%'>",
      "paybackMonths": "<ej: '4 meses'>"
    },
    "authority": {
      "heading": "<ej: 'Por qué IM3'>",
      "intro": "<2 líneas>",
      "stats": [
        { "num": "<ej: 15+>", "label": "Proyectos entregados" },
        { "num": "<ej: 100%>", "label": "Con IA integrada" },
        { "num": "<ej: 3>", "label": "Países de operación" },
        { "num": "<ej: 24/7>", "label": "Portal de seguimiento" }
      ],
      "differentiators": [
        { "icon": "<emoji>", "title": "<diferenciador>", "description": "<2 líneas explicándolo>" },
        { "icon": "<emoji>", "title": "...", "description": "..." },
        { "icon": "<emoji>", "title": "...", "description": "..." }
      ]
    },
    "pricing": {
      "label": "<ej: 'Tu inversión'>",
      "amount": "<MONTO NUMÉRICO con separador de miles según moneda local. Si cliente es COLOMBIANO (la mayoría): usar COP con separador por puntos → '26.000.000'. Si cliente USA/global: USD con separador americano → '12,500'. NO inventar — basar en complejidad del proyecto + presupuesto del diagnóstico.>",
      "amountPrefix": "$",
      "amountSuffix": "<Moneda local: 'COP' para Colombia, 'MXN' para México, 'USD' para USA/global. Detectar por meta.industry, diagnostic.ciudades o contexto del cliente.>",
      "priceFootnote": "<ej: 'Pago único. Sin mensualidades ocultas.'>",
      "scarcityMessage": "<1 línea de urgencia honesta, ej: 'Tomamos un proyecto por sector por trimestre — slot reservado para [EMPRESA] hasta [FECHA].'>",
      "milestones": [
        { "step": 1, "name": "Al firmar", "desc": "<qué se entrega>", "amount": "<En MISMA moneda que amount. Ej COP: '$7.800.000 COP (30%)'. Ej USD: '$3,750 USD (30%)'>" },
        { "step": 2, "name": "Mitad del proyecto", "desc": "<...>", "amount": "<monto 40%>" },
        { "step": 3, "name": "Entrega final", "desc": "<...>", "amount": "<monto 30%>" }
      ],
      "includes": [
        "<6-8 bullets OBLIGATORIOS de qué incluye la inversión. Solo lo que SÍ va incluido en el precio. NO mezcles aquí cosas opcionales — esos van en optionalIncludes.>"
      ],
      "optionalIncludes": [
        "<OPCIONAL: 0-4 entregables/checkpoints opcionales — extras no incluidos en el precio base. Si no hay claros, OMITIR esta key completamente. Se renderizan en bloque separado bajo título 'Opcionales' con icono '+' en vez de '✓'.>"
      ]
    },
    "hardware": "<OPCIONAL pero IMPORTANTE si la solución lo requiere. Si ALGÚN módulo de solution.modules requiere equipo físico según el HARDWARE CATALOG, incluir este objeto con MÁXIMA ESPECIFICIDAD. Si la solución es puramente SaaS/web/app (no requiere hardware físico), OMITIR esta key completamente. REGLAS: (1) Cada item debe tener MARCA Y MODELO específicos del catálogo (ej: 'Huellero ZKTeco K40 USB', NO 'huellero genérico'); (2) La CANTIDAD debe basarse en datos del diagnóstico (# sedes, # empleados, # puntos de venta) — explicítalo en notes; (3) Precios DEL CATÁLOGO, no inventados; (4) NO olvides items críticos (si hay control de asistencia biométrico siempre hay huelleros); (5) NO inventes items que no estén en el catálogo. Formato: { heading: 'Equipos físicos requeridos', intro: '2-3 líneas honestas sobre por qué son necesarios', items: [{ name: 'MARCA + MODELO específico', description: 'para qué sirve y cómo se usa en TU negocio', quantity: número entero, unitPriceUSD: '$120 USD', totalPriceUSD: '$240 USD', notes: 'Por qué esta cantidad — ej: 1 por cada una de tus 2 sedes + 1 spare', paidBy: 'cliente-compra' }], subtotalUSD: string, recommendationNote: 'Te pasamos el link de compra en Colombia + configuración sin costo', disclaimer: 'IM3 no agrega margen — precio que paga el cliente directo al proveedor' }>",
    "operationalCosts": {
      "heading": "<ej: 'Costos operativos mensuales'>",
      "intro": "<2-3 líneas explicando que estos son los gastos recurrentes después del lanzamiento, divididos en dos modelos de cobro: predecibles (tarifa fija) vs. uso variable (pass-through o pago directo)>",
      "groups": [
        {
          "name": "Servicios predecibles",
          "billingModel": "fixed",
          "monthlyFee": "<ej: '$50 USD/mes' — tarifa fija que IM3 cobra por administrar todos los servicios de este grupo>",
          "description": "<1 línea: 'Cobramos una tarifa fija mensual de operaciones que cubre estos servicios. Tú no te preocupas por cada cuenta.'>",
          "categories": [
            {
              "name": "Email & dominios",
              "items": [
                { "service": "<ej: Resend>", "cost": "<ej: $0-20/mes>", "note": "<ej: Gratis hasta 3.000 emails/mes>" },
                { "service": "<ej: Dominio anual>", "cost": "<ej: $15/año>", "note": "" }
              ]
            },
            {
              "name": "Hosting frontend & monitoring",
              "items": [
                { "service": "<ej: Vercel Pro>", "cost": "<ej: $20/mes>", "note": "<ej: Hobby gratis hasta cierto tráfico>" },
                { "service": "<ej: Sentry/UptimeRobot>", "cost": "<ej: $0-15/mes>", "note": "" }
              ]
            }
          ]
        },
        {
          "name": "Servicios que escalan con uso",
          "billingModel": "<elegir 'passthrough' (con markup) o 'client-direct' (cliente paga directo). Para LLMs específicamente usar 'passthrough-with-cap'>",
          "markup": "<si billingModel='passthrough', ej: '10%'. Si client-direct, omitir>",
          "description": "<1-2 líneas explicando: 'Estos servicios cobran por uso. IM3 hace pass-through con markup del X%, o el cliente puede pagar directo al proveedor. Para APIs de IA aplicamos cap mensual con alertas — o el cliente puede traer su propia API key.'>",
          "categories": [
            {
              "name": "Base de datos & backend",
              "items": [
                { "service": "<ej: Railway (hosting + DB)>", "cost": "<ej: $25-40/mes>", "note": "<ej: Escala con usuarios activos>" },
                { "service": "<ej: Supabase>", "cost": "<ej: $0-25/mes>", "note": "" }
              ]
            },
            {
              "name": "APIs de IA (LLMs)",
              "items": [
                { "service": "<ej: Anthropic Claude>", "cost": "<ej: $30-100/mes con cap>", "note": "<ej: Cap mensual + alertas, o BYO API key>" },
                { "service": "<ej: OpenAI>", "cost": "<ej: $20-80/mes con cap>", "note": "<ej: Configurable según volumen>" }
              ]
            },
            {
              "name": "Almacenamiento",
              "items": [
                { "service": "<ej: Supabase Storage / S3>", "cost": "<ej: $5-30/mes>", "note": "<ej: Crece con archivos subidos>" }
              ]
            }
          ]
        }
      ],
      "monthlyRangeLow": "<suma mínima en formato '$XX USD/mes'>",
      "monthlyRangeHigh": "<suma máxima en formato '$XXX USD/mes'>",
      "annualEstimate": "<ej: '$1.500 USD/año aprox'>",
      "managedServicesUpsell": "<OPCIONAL: para proyectos grandes. Ej: '¿Prefieres olvidarte de todo? Por $150 USD/mes adicionales administramos todo (hosting, APIs, actualizaciones, soporte 24/7).'>",
      "disclaimer": "<ej: 'Los rangos son estimados según volumen proyectado. Para servicios de uso variable aplicamos caps con alertas para evitar sorpresas.'>"
    },
    "cta": {
      "heading": "<ej: '¿Listo para recuperar tu tiempo?'>",
      "painHighlight": "<ej: 'Cada mes sin esto son $X COP que no vuelven.'>",
      "description": "<2-3 líneas cerrando, invitando a actuar hoy>",
      "acceptLabel": "Aceptar propuesta",
      "fallbackCtaLabel": "Hablemos 15 min",
      "deadlineMessage": "<ej: 'Esta propuesta es válida hasta el ${validUntilStr}'>",
      "guarantees": [
        "<ej: 'Si no entregamos en tiempo, devolvemos 20% del valor'>",
        "<...>"
      ]
    }
  },
  "sourcesReport": {
    "hero": ["Diagnóstico: campo X", "Email del DD/MM: asunto Y"],
    "problem": ["Diagnóstico: presupuesto, empleados, herramientas", "Documento: nombre"],
    "solution": ["..."],
    "timeline": ["..."],
    "roi": ["..."],
    "pricing": ["..."]
  }
}`,
    messages: [{
      role: "user",
      content: `Genera la propuesta comercial estructurada para este cliente.

${adminNotes ? `INSTRUCCIONES ADICIONALES DEL ADMIN:\n${adminNotes}\n\n` : ""}

CONTEXTO DEL CLIENTE:
${context}

Recuerda:
- Devuelve SOLO el JSON con las claves "proposalData" y "sourcesReport"
- Sin markdown, sin \`\`\`, sin texto fuera del JSON
- monthlyLossCOP es un NÚMERO entero sin formato
- Los campos "amount" de pricing y ROI son STRINGS con formato visual (ej: "12.500")
- Rellena TODOS los campos requeridos — no uses null ni omitas claves`
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : null;
  if (!text) return null;

  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.proposalData) {
      log(`Proposal AI response missing proposalData key`);
      return null;
    }

    // Validar con Zod — si falla, log pero no rechaces (mejor un parcial que nada)
    const validation = proposalDataSchema.safeParse(parsed.proposalData);
    if (!validation.success) {
      log(`Proposal AI validation failed: ${JSON.stringify(validation.error.issues.slice(0, 5))}`);
      // Aún así devolvemos lo que tenemos — el admin puede editar manualmente lo incompleto
    }

    const proposalData = (validation.success ? validation.data : parsed.proposalData) as ProposalData;

    // Quality Gate: validar y reparar operationalCosts con Claude Haiku (rápido, barato)
    if (proposalData.operationalCosts) {
      try {
        const repaired = await validateAndRepairOperationalCosts(anthropic, proposalData);
        if (repaired) {
          proposalData.operationalCosts = repaired;
        }
      } catch (err) {
        log(`[quality-gate] costs validation failed (non-blocking): ${err}`);
      }
    }

    // Quality Gate 2: validar coherencia matemática cross-section (problem/roi/pricing)
    try {
      const crossRepaired = await validateCrossSectionMath(anthropic, proposalData);
      if (crossRepaired) {
        if (crossRepaired.roi) proposalData.roi = crossRepaired.roi;
        if (crossRepaired.pricing) proposalData.pricing = crossRepaired.pricing;
      }
    } catch (err) {
      log(`[quality-gate] cross-section math validation failed (non-blocking): ${err}`);
    }

    return {
      proposalData,
      sourcesReport: (parsed.sourcesReport || {}) as ProposalSourcesReport,
    };
  } catch (err) {
    log(`Error parsing proposal AI response: ${err}`);
    return null;
  }
}

/**
 * Quality Gate para operationalCosts.
 * Usa Claude Haiku (más barato, más rápido) para revisar la sección de costos.
 * Verifica coherencia matemática, plausibilidad, y consistencia con la solución.
 * Si encuentra errores, devuelve una versión corregida. Si está todo bien, devuelve null.
 */
async function validateAndRepairOperationalCosts(
  anthropic: Anthropic,
  proposalData: ProposalData
): Promise<ProposalData["operationalCosts"] | null> {
  const current = proposalData.operationalCosts;
  // Dar contexto completo de los módulos (title + description + solves) para detectar ghosts
  const solutionModules = proposalData.solution?.modules
    ?.map(m => `- ${m.title}: ${m.description} (resuelve: ${m.solves})`)
    .join("\n") || "(sin módulos)";

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    temperature: 0.1,
    system: `Eres un auditor de costos operativos ESTRICTO. Tu tarea principal: REMOVER servicios que la solución NO usa (WhatsApp ghost, storage ghost, etc.) y verificar coherencia.

1. REGLA #1 — SERVICIOS GHOST (la más importante):
   Revisa los módulos de la solución arriba. Luego revisa cada item dentro de groups[].categories[].items[]:
   - Si un servicio está listado pero NINGÚN módulo lo usa → REMOVER el item
   - WhatsApp Cloud API solo si algún módulo menciona: "WhatsApp", "mensajería", "chat con clientes", "notificaciones a celular del cliente"
   - Supabase Storage solo si algún módulo menciona: "archivos", "audio", "video", "imágenes de productos"
   - Stripe/MercadoPago solo si algún módulo menciona: "pagos", "cobros", "suscripciones", "e-commerce"
   - Google Workspace solo si el cliente lo va a usar para el proyecto específico
   - Twilio SMS solo si mencionan SMS explícitamente
   - Si no estás 100% seguro que se use → REMOVER. Mejor una sección más corta que con ghosts.

2. COHERENCIA MATEMÁTICA:
   - monthlyRangeLow y monthlyRangeHigh deben ser strings con formato "$XX USD/mes"
   - Sumar TODOS los items de TODOS los grupos (predecibles + uso variable)
   - Suma de mínimos ≈ monthlyRangeLow
   - Suma de máximos × 1.2 (buffer) ≈ monthlyRangeHigh
   - annualEstimate ≈ (promedio mensual × 12) redondeado a $100

3. PLAUSIBILIDAD:
   - No cifras imposibles ($1000/mes para proyecto pequeño)
   - No cifras ridículamente bajas ($5/mes total)
   - Servicios deben ser reales: Railway, Resend, Anthropic Claude, WhatsApp Cloud API, Stripe, Supabase, Google Workspace

4. CONSERVADOR:
   - monthlyRangeHigh con buffer del +20% sobre suma real
   - Si dudas, subir el rango

5. FORMATO DE GRUPOS (estructura nueva):
   - Debe haber array groups[] con al menos 1 grupo
   - Cada grupo: { name, billingModel, description?, monthlyFee?, markup?, categories[] }
   - billingModel: "fixed" | "passthrough" | "passthrough-with-cap" | "client-direct"
   - Grupo "fixed" debe tener monthlyFee con monto concreto (lo que IM3 cobra)
   - Grupos "passthrough" y "passthrough-with-cap" pueden tener markup (ej: "10%")
   - Servicios LLM (Anthropic, OpenAI) deben ir en grupo con billingModel="passthrough-with-cap"
   - Servicios predecibles (Resend, Vercel, Sentry, dominios) → grupo billingModel="fixed"
   - Servicios que escalan (Railway, Supabase, almacenamiento) → "passthrough" o "client-direct"
   - disclaimer debe existir
   - managedServicesUpsell es opcional pero recomendado para proyectos grandes

Responde SOLO con JSON, sin markdown:

Si TODO está correcto:
{"status": "ok"}

Si hay errores o servicios ghost (lo más común):
{"status": "repaired", "operationalCosts": { ...objeto completo SIN los ghosts... }, "changes": ["Removido WhatsApp (no hay módulo de mensajería)", "Ajustado rango mensual a $65-120 tras remover ghost"]}`,
    messages: [{
      role: "user",
      content: `MÓDULOS DE LA SOLUCIÓN (cada uno con título, descripción y qué resuelve):
${solutionModules}

operationalCosts ACTUAL:
${JSON.stringify(current, null, 2)}

Audita estrictamente. Remueve cualquier servicio que no esté claramente soportado por los módulos. Responde con JSON estricto.`
    }]
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!text) return null;

  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.status === "ok") {
      log(`[quality-gate] operationalCosts OK — no repairs needed`);
      return null;
    }

    if (parsed.status === "repaired" && parsed.operationalCosts) {
      log(`[quality-gate] operationalCosts REPAIRED — changes: ${JSON.stringify(parsed.changes)}`);
      return parsed.operationalCosts;
    }

    return null;
  } catch (err) {
    log(`[quality-gate] could not parse auditor response: ${err}`);
    return null;
  }
}

/**
 * Regenerate ONE section of a ProposalData with a natural-language instruction.
 * Works with the new schema (hero, summary, problem, solution, tech, timeline, roi,
 * authority, testimonials, pricing, cta). Returns a structured section object
 * that matches the corresponding sub-schema of ProposalData.
 */
export async function regenerateProposalSection(
  proposalId: string,
  sectionKey: string,
  instruction: string
): Promise<{ section: unknown; sectionKey: string } | { error: string }> {
  if (!db) return { error: "DB not configured" };
  const anthropic = getClient();
  if (!anthropic) return { error: "ANTHROPIC_API_KEY not set" };

  const validKeys: ProposalSectionKey[] = [
    "meta", "hero", "summary", "problem", "solution", "tech",
    "timeline", "roi", "authority", "pricing", "hardware", "operationalCosts", "cta"
  ];
  if (!validKeys.includes(sectionKey as ProposalSectionKey)) {
    return { error: `Sección inválida. Debe ser una de: ${validKeys.join(", ")}` };
  }

  const { proposals } = await import("@shared/schema");

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  const currentData = (proposal.sections as Partial<ProposalData> | null) || {};
  const currentSection = (currentData as Record<string, unknown>)[sectionKey];

  // Resumen de otras secciones (JSON truncado) para coherencia
  const otherSections: Record<string, unknown> = {};
  for (const key of validKeys) {
    if (key === sectionKey) continue;
    const val = (currentData as Record<string, unknown>)[key];
    if (val !== undefined) otherSections[key] = val;
  }
  const otherSummary = JSON.stringify(otherSections).substring(0, 3000);

  // Contact brief para personalización
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
  let contactBrief = "";
  if (contact) {
    contactBrief = `CLIENTE: ${contact.nombre} — ${contact.empresa}`;
    if (contact.diagnosticId) {
      const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
      if (diag) {
        contactBrief += ` · ${getIndustriaLabel(diag.industria)} · ${diag.empleados} empleados · Presupuesto ${diag.presupuesto}`;
      }
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.4,
      system: `Eres un consultor senior de IM3 Systems reescribiendo UNA sección estructurada de una propuesta comercial.

Tu tarea: devolver la sección "${sectionKey}" en JSON, con EXACTAMENTE los mismos campos que tiene actualmente, aplicando la instrucción del admin.

REGLAS:
- Devuelve SOLO el objeto JSON de esta sección (sin wrapper \`\`\`, sin markdown, sin explicaciones, sin texto antes o después).
- Mantén EXACTAMENTE la misma forma (keys, tipos de datos) que la versión actual.
- NO cambies tipos: si un campo es número, que siga siendo número. Si es array, array. Etc.
- Mantén coherencia con las otras secciones.
- Español latinoamericano.
- No inventes datos del cliente que contradigan el contexto.`,
      messages: [{
        role: "user",
        content: `${contactBrief}

SECCIÓN A REESCRIBIR (key="${sectionKey}"):
${JSON.stringify(currentSection, null, 2)}

OTRAS SECCIONES (solo referencia, NO modificar):
${otherSummary}

INSTRUCCIÓN DEL ADMIN:
${instruction}

Devuelve el JSON del objeto "${sectionKey}" aplicando la instrucción. Mismos campos, misma forma.`
      }]
    });

    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text) return { error: "Respuesta vacía de Claude" };

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      log(`[regenerateProposalSection] JSON parse failed: ${err}. Raw: ${cleaned.substring(0, 200)}`);
      return { error: "Claude devolvió JSON inválido" };
    }

    // Persistir en DB
    const newData = { ...currentData, [sectionKey]: parsed };
    await db.update(proposals)
      .set({ sections: newData as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(proposals.id, proposalId));

    return { section: parsed, sectionKey };
  } catch (err: any) {
    log(`Error regenerating section ${sectionKey}: ${err?.message || err}`);
    return { error: err?.message || "Error regenerando sección" };
  }
}

/**
 * Generate 3 different options for rewriting a section.
 * Each option has a different "angle" (conservative, bold, creative).
 * Does NOT persist — the user picks one, then we save it.
 */
export async function generateSectionOptions(
  proposalId: string,
  sectionKey: string,
  instruction: string
): Promise<{ options: Array<{ label: string; description: string; section: unknown }> } | { error: string }> {
  if (!db) return { error: "DB not configured" };
  const anthropic = getClient();
  if (!anthropic) return { error: "ANTHROPIC_API_KEY not set" };

  const validKeys: ProposalSectionKey[] = [
    "meta", "hero", "summary", "problem", "solution", "tech",
    "timeline", "roi", "authority", "pricing", "hardware", "operationalCosts", "cta"
  ];
  if (!validKeys.includes(sectionKey as ProposalSectionKey)) {
    return { error: `Sección inválida` };
  }

  const { proposals } = await import("@shared/schema");
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  const currentData = (proposal.sections as Partial<ProposalData> | null) || {};
  const currentSection = (currentData as Record<string, unknown>)[sectionKey];

  const otherSections: Record<string, unknown> = {};
  for (const key of validKeys) {
    if (key === sectionKey) continue;
    const val = (currentData as Record<string, unknown>)[key];
    if (val !== undefined) otherSections[key] = val;
  }
  const otherSummary = JSON.stringify(otherSections).substring(0, 2000);

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
  let contactBrief = "";
  if (contact) {
    contactBrief = `CLIENTE: ${contact.nombre} — ${contact.empresa}`;
    if (contact.diagnosticId) {
      const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
      if (diag) {
        contactBrief += ` · ${getIndustriaLabel(diag.industria)} · ${diag.empleados} empleados`;
      }
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      temperature: 0.6,
      system: `Eres un consultor senior de IM3 Systems. El admin te pide reescribir UNA sección de una propuesta, dándote contexto de POR QUÉ quiere el cambio.

Tu tarea: generar EXACTAMENTE 3 opciones diferentes de esa sección, cada una con un enfoque distinto.

REGLAS:
- Cada opción mantiene la MISMA estructura JSON (mismas keys, mismos tipos).
- Las 3 opciones deben ser genuinamente DIFERENTES en tono/enfoque, no variaciones mínimas.
- Español latinoamericano.
- No inventes datos del cliente que no estén en el contexto.

Responde SOLO con JSON (sin markdown), con esta forma exacta:
{
  "options": [
    {
      "label": "Nombre corto de esta opción (3-5 palabras)",
      "description": "Por qué esta opción es diferente (1 línea)",
      "section": { ...el objeto JSON completo de la sección reescrita... }
    },
    { "label": "...", "description": "...", "section": { ... } },
    { "label": "...", "description": "...", "section": { ... } }
  ]
}`,
      messages: [{
        role: "user",
        content: `${contactBrief}

SECCIÓN ACTUAL (key="${sectionKey}"):
${JSON.stringify(currentSection, null, 2)}

OTRAS SECCIONES (referencia):
${otherSummary}

CONTEXTO E INSTRUCCIÓN DEL ADMIN:
${instruction}

Genera 3 opciones diferentes para reescribir "${sectionKey}". Cada una debe ser un enfoque genuinamente distinto.`
      }]
    });

    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text) return { error: "Respuesta vacía" };

    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length < 2) {
      return { error: "Claude no generó opciones válidas" };
    }

    return { options: parsed.options.slice(0, 3) };
  } catch (err: any) {
    log(`Error generating section options: ${err?.message || err}`);
    return { error: err?.message || "Error generando opciones" };
  }
}

/**
 * Save a specific option as the section content (called after user picks one).
 */
export async function applySectionOption(
  proposalId: string,
  sectionKey: string,
  sectionData: unknown
): Promise<{ success: boolean } | { error: string }> {
  if (!db) return { error: "DB not configured" };
  const { proposals } = await import("@shared/schema");
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  const currentData = (proposal.sections as Record<string, unknown>) || {};
  const newData = { ...currentData, [sectionKey]: sectionData };
  await db.update(proposals)
    .set({ sections: newData, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));

  return { success: true };
}

/**
 * Quality Gate 2: valida coherencia matemática cruzada entre problem, roi y pricing.
 * Si el problema dice "pierdes $35M/mes", las recoveries del ROI deberían cubrir al menos
 * 60% del dolor anual. Los milestones de pricing deben sumar el pricing.amount.
 * Usa Haiku (rápido, barato) — solo corrige números, no contenido.
 */
async function validateCrossSectionMath(
  anthropic: Anthropic,
  proposalData: ProposalData
): Promise<{ roi?: ProposalData["roi"]; pricing?: ProposalData["pricing"] } | null> {
  const monthlyLossCOP = proposalData.problem?.monthlyLossCOP || 0;
  const annualLossCOP = monthlyLossCOP * 12;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2500,
    temperature: 0.1,
    system: `Eres un auditor financiero. Verificas coherencia matemática entre 3 secciones de una propuesta:

1. COHERENCIA PROBLEM ↔ ROI:
   - problem.monthlyLossCOP = dolor mensual en COP (número)
   - Dolor anual = monthlyLossCOP × 12
   - La suma de roi.recoveries (en pesos) debería ser ≥ 60% del dolor anual
   - Si la suma da menos, AJUSTAR recoveries al alza para que cubra el dolor
   - Los amount de recoveries son strings con formato visual: "$15M", "$90M COP", etc.

2. COHERENCIA PRICING:
   - pricing.amount es el total (ej: "12.500") con pricing.amountPrefix "$" y amountSuffix "USD"
   - Los pricing.milestones deben sumar aproximadamente el pricing.amount
   - Cada milestone.amount es string tipo "$3.750 USD (30%)"
   - Los porcentajes de todos los milestones deben sumar 100%

3. COHERENCIA ROI ↔ PRICING:
   - roi.paybackMonths ≈ pricing.amount en USD / (recuperación mensual en USD)
   - Para calcular recuperación mensual en USD: suma recoveries totales en COP, dividir /12, convertir COP→USD a ~4000 COP/USD
   - Si paybackMonths dice "3 meses" pero la matemática da 15 meses, CORREGIR

RESPUESTA:
- Si TODO está correcto: {"status": "ok"}
- Si hay incoherencias: {"status": "repaired", "roi": {...objeto roi corregido completo...}, "pricing": {...objeto pricing corregido completo...}, "changes": ["lista de qué cambió"]}

Solo devuelve los objetos que cambiaste. Si solo cambia roi, no incluyas pricing.`,
    messages: [{
      role: "user",
      content: `DATOS DE LA PROPUESTA:

problem.monthlyLossCOP: ${monthlyLossCOP}
Dolor anual (calculado): ${annualLossCOP} COP = $${Math.round(annualLossCOP / 4000)} USD aprox

roi actual:
${JSON.stringify(proposalData.roi, null, 2)}

pricing actual:
${JSON.stringify(proposalData.pricing, null, 2)}

Audita y responde con JSON estricto (sin markdown).`
    }]
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!text) return null;

  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.status === "ok") {
      log(`[quality-gate-math] cross-section math OK`);
      return null;
    }

    if (parsed.status === "repaired") {
      log(`[quality-gate-math] REPAIRED: ${JSON.stringify(parsed.changes)}`);
      return {
        roi: parsed.roi || undefined,
        pricing: parsed.pricing || undefined,
      };
    }

    return null;
  } catch (err) {
    log(`[quality-gate-math] could not parse response: ${err}`);
    return null;
  }
}
