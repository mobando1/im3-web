import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";
import type { EmailTemplate, Diagnostic, Contact, SentEmail, ContactNote } from "@shared/schema";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `Eres el equipo de IM3 Systems, una empresa de tecnología especializada en inteligencia artificial, automatización y desarrollo de software para empresas en Latinoamérica.

Tu tarea es generar emails profesionales y personalizados para clientes que agendaron una sesión de diagnóstico tecnológico.

Reglas:
- Tono: profesional pero cercano, como un consultor tech que sabe lo que hace. NO corporativo genérico.
- Idioma: español latinoamericano (tuteo, no voseo)
- Largo: sigue las instrucciones específicas de cada prompt
- No uses emojis excesivos (máximo 1-2 si aplica)
- Personaliza usando los datos reales del cliente — menciona su industria, herramientas, objetivos
- No inventes datos que no tengas — si no hay dato, omite esa mención
- El email debe ser HTML PURO con estilos inline simples (sin CSS externo)
- IMPORTANTE: NO envuelvas el HTML en bloques de código markdown (no uses \`\`\`html). Devuelve SOLO el HTML directo.
- Estructura: wrapper div con max-width:600px, font-family:'Segoe UI',Roboto,sans-serif
- Color primario header: background con linear-gradient(135deg,#0F172A,#1E293B) — azul oscuro tech
- Color para links y CTAs: #3B82F6 (azul vibrante)
- Color para botones CTA: background:#3B82F6, color:#fff
- Cuando menciones datos, estadísticas o tendencias, SIEMPRE cita la fuente real (ej: "según McKinsey (2024)", "Gartner reporta que...", "un estudio de Harvard Business Review"). Solo usa fuentes verificables como McKinsey, Gartner, Forrester, Deloitte, BCG, HBR, MIT, Statista, Bloomberg, Reuters. Si no estás seguro de un dato específico, habla en términos generales del sector sin inventar cifras
- Firma: "— Equipo IM3 Systems"
- NO incluyas footer de unsubscribe — se agrega automáticamente
- NO uses placeholders como {empresa} — usa los datos reales del contexto
- SIEMPRE dirige al contacto por su nombre (campo Participante). Nunca uses genéricos como "Hola" sin nombre.
- Si hay un meetLink en el contexto, SIEMPRE inclúyelo como un botón prominente visible (no como texto al final). Usar: <a href="{meetLink}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Unirse a la reunión →</a>
- Si hay un link de "Agregar al calendario", inclúyelo justo después del botón de reunión como texto más pequeño
- NUNCA uses "Confirmar asistencia" como CTA — la persona ya confirmó al agendar. El CTA principal en emails pre-reunión es el link de la reunión (Meet).
- Para emails pre-reunión: incluir al final (texto pequeño, color #999): "¿Necesitas cambiar la fecha? <a href='{rescheduleUrl}'>Reagendar</a> · <a href='{cancelUrl}'>Cancelar</a>"
- Para el email de seguimiento post-reunión: el CTA puede invitar a agendar una sesión de seguimiento con link a https://www.im3systems.com/booking
- NO incluyas un CTA genérico de "/booking" en emails pre-reunión — el contacto YA agendó.`;

function buildContext(data: Partial<Diagnostic> | null): string {
  if (!data || !data.empresa) {
    return "CONTEXTO: Email genérico de IM3 Systems (sin datos específicos de cliente).";
  }

  const lines: string[] = ["DATOS DEL CLIENTE:"];
  if (data.empresa) lines.push(`- Empresa: ${data.empresa}`);
  if (data.industria) lines.push(`- Industria: ${data.industria}`);
  if (data.anosOperacion) lines.push(`- Años de operación: ${data.anosOperacion}`);
  if (data.empleados) lines.push(`- Empleados: ${data.empleados}`);
  if (data.ciudades) lines.push(`- Ciudades: ${data.ciudades}`);
  if (data.participante) lines.push(`- Participante: ${data.participante}`);
  if (data.fechaCita) lines.push(`- Fecha de cita: ${data.fechaCita}`);
  if (data.horaCita) lines.push(`- Hora de cita: ${data.horaCita}`);
  if (data.objetivos) lines.push(`- Objetivos: ${Array.isArray(data.objetivos) ? data.objetivos.join(", ") : data.objetivos}`);
  if (data.resultadoEsperado) lines.push(`- Resultado esperado: ${data.resultadoEsperado}`);
  if (data.productos) lines.push(`- Productos/Servicios: ${data.productos}`);
  if (data.volumenMensual) lines.push(`- Volumen mensual: ${data.volumenMensual}`);
  if (data.clientePrincipal) lines.push(`- Cliente principal: ${data.clientePrincipal}`);
  if (data.herramientas) lines.push(`- Herramientas actuales: ${data.herramientas}`);
  if (data.conectadas) lines.push(`- Herramientas conectadas: ${data.conectadas}`);
  if (data.nivelTech) lines.push(`- Nivel tecnológico: ${data.nivelTech}`);
  if (data.usaIA) lines.push(`- Usa IA: ${data.usaIA}`);
  if (data.usaIAParaQue) lines.push(`- Para qué usa IA: ${data.usaIAParaQue}`);
  if (data.comodidadTech) lines.push(`- Comodidad con tecnología: ${data.comodidadTech}`);
  if (data.areaPrioridad) lines.push(`- Áreas prioritarias: ${Array.isArray(data.areaPrioridad) ? data.areaPrioridad.join(", ") : data.areaPrioridad}`);
  if (data.presupuesto) lines.push(`- Presupuesto: ${data.presupuesto}`);
  if (data.familiaridad && typeof data.familiaridad === "object") {
    const f = data.familiaridad as any;
    lines.push(`- Familiaridad — Automatización: ${f.automatizacion}, CRM: ${f.crm}, IA: ${f.ia}, Integración: ${f.integracion}, Desarrollo: ${f.desarrollo}`);
  }
  if (data.meetLink) lines.push(`- Link de reunión (Google Meet): ${data.meetLink}`);
  if ((data as any)._calendarAddUrl) lines.push(`- Link para agregar al calendario personal: ${(data as any)._calendarAddUrl}`);
  if ((data as any)._rescheduleUrl) lines.push(`- Link para reagendar: ${(data as any)._rescheduleUrl}`);
  if ((data as any)._cancelUrl) lines.push(`- Link para cancelar: ${(data as any)._cancelUrl}`);
  if ((data as any)._isReturningContact) {
    lines.push("- NOTA: Este contacto ya era conocido (suscriptor de newsletter u otro canal). Reconócelo sutilmente — muestra entusiasmo de que haya decidido dar el siguiente paso y agendar. No lo trates como primera vez, hazle saber que estás pendiente.");
  }
  return lines.join("\n");
}

/**
 * Build the fixed HTML for the micro-reminder email (E5).
 * No AI needed — just a simple template with variables.
 */
export function build6hReminderEmail(
  participante: string,
  horaCita: string,
  meetLink: string | null,
  contactId: string,
  calendarAddUrl?: string | null
): { subject: string; body: string } {
  const subject = `${participante}, tu sesión con IM3 es hoy`;
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";

  const meetSection = meetLink
    ? `<p style="margin:0 0 12px"><a href="${meetLink}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">Unirse a la reunión →</a></p>`
    : "";

  const calendarSection = calendarAddUrl
    ? `<p style="margin:0 0 16px"><a href="${calendarAddUrl}" style="color:#3B82F6;font-size:13px;text-decoration:none">📅 Agregar a mi calendario</a></p>`
    : "";

  const body = `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">${participante}, hoy tenemos tu sesión de diagnóstico a las <strong>${horaCita}</strong> (45 minutos).</p>
    ${meetSection}
    ${calendarSection}
    <p style="margin:0 0 16px">Ten a mano información sobre tus herramientas actuales y los procesos que más tiempo consumen en tu operación — así aprovechamos al máximo la sesión.</p>
    <p style="margin:0 0 16px;color:#666">¿Tienes preguntas antes? Responde este correo y te ayudamos.</p>
    <p style="margin:0 0 20px;color:#999">— Equipo IM3 Systems</p>
    <p style="margin:0;font-size:12px;color:#999"><a href="${baseUrl}/api/reschedule/${contactId}" style="color:#999;text-decoration:none">Reagendar</a> · <a href="${baseUrl}/api/cancel/${contactId}" style="color:#999;text-decoration:none">Cancelar</a></p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">No recibir más emails</a>
  </div>
</div>`;

  return { subject, body };
}

export function buildMicroReminderEmail(
  participante: string,
  horaCita: string,
  meetLink: string | null,
  contactId: string
): { subject: string; body: string } {
  const subject = `En 1 hora: tu diagnóstico con IM3`;
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";

  const meetSection = meetLink
    ? `<p style="margin:0 0 16px"><a href="${meetLink}" style="display:inline-block;background:#3B82F6;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Unirse a la reunión →</a></p>`
    : "";

  const body = `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">${participante}, tu sesión empieza en <strong>1 hora</strong> (${horaCita}). Nos vemos ahí.</p>
    ${meetSection}
    <p style="margin:0;color:#999">— Equipo IM3 Systems</p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">No recibir más emails</a>
  </div>
</div>`;

  return { subject, body };
}

/**
 * Add unsubscribe footer to AI-generated email HTML.
 */
function addUnsubscribeFooter(html: string, contactId: string): string {
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";
  const footer = `<div style="max-width:600px;margin:8px auto 0;text-align:center;padding:8px">
  <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">No recibir más emails de esta secuencia</a>
</div>`;

  // Try to insert before closing </div> or append
  if (html.includes("</div>")) {
    const lastDiv = html.lastIndexOf("</div>");
    return html.substring(0, lastDiv + 6) + footer;
  }
  return html + footer;
}

export async function generateEmailContent(
  template: EmailTemplate,
  diagnosticData: Partial<Diagnostic> | null,
  contactId?: string
): Promise<{ subject: string; body: string }> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const context = buildContext(diagnosticData);

  // Generate subject
  const subjectResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: "Genera SOLO el texto del subject de un email. Sin comillas, sin prefijo, solo el texto. Máximo 60 caracteres.",
    messages: [
      {
        role: "user",
        content: `${template.subjectPrompt}\n\n${context}`,
      },
    ],
  });

  const subject =
    subjectResponse.content?.[0]?.type === "text"
      ? subjectResponse.content[0].text.trim()
      : "Diagnóstico IM3 Systems";

  // Generate body
  const bodyResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${template.bodyPrompt}\n\n${context}\n\nGenera el email completo en HTML PURO con estilos inline. NO uses bloques de código markdown. Devuelve SOLO el HTML directo sin \`\`\`html ni \`\`\`. Wrapper: max-width:600px, font-family:'Segoe UI',Roboto,sans-serif. Header con background:linear-gradient(135deg,#0F172A,#1E293B) y título blanco. Links y CTAs en color #3B82F6.`,
      },
    ],
  });

  let body =
    bodyResponse.content?.[0]?.type === "text"
      ? bodyResponse.content[0].text.trim()
      : "<p>Error generando contenido</p>";

  // Strip markdown code block wrappers if AI included them
  body = body.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  // Add unsubscribe footer if we have a contactId
  if (contactId) {
    body = addUnsubscribeFooter(body, contactId);
  }

  log(`Email AI generado: "${subject}" para ${diagnosticData?.empresa || "suscriptor"}`);

  return { subject, body };
}

/**
 * Generate an AI-powered newsletter welcome email with a "dato curioso"
 * about AI/automation that hooks the subscriber from day one.
 */
export async function generateNewsletterWelcome(): Promise<{ subject: string; body: string }> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const subjectResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: "Genera SOLO el texto del subject de un email de bienvenida a un newsletter de tecnología. Debe ser intrigante y contener un dato curioso o pregunta que enganche. Sin comillas, sin prefijo, solo el texto. Máximo 60 caracteres. Español latinoamericano.",
    messages: [
      {
        role: "user",
        content: "Genera un subject para un email de bienvenida al newsletter de IM3 Systems (empresa de IA, automatización y software para empresas en Latinoamérica). El subject debe contener un dato curioso o pregunta intrigante sobre IA/automatización que haga que el lector quiera abrir el email. Ejemplos de estilo: '¿Sabías que el 40% de las tareas repetitivas ya se automatizan?', 'Tu primer insight IM3: lo que viene en IA'. Varía el enfoque cada vez.",
      },
    ],
  });

  const subject =
    subjectResponse.content?.[0]?.type === "text"
      ? subjectResponse.content[0].text.trim()
      : "Bienvenido al newsletter de IM3 Systems";

  const bodyResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Genera un email de bienvenida al newsletter de IM3 Systems. Estructura:

1. Saludo breve y cálido (gracias por suscribirse)
2. UN "dato curioso" impactante sobre IA, automatización o tecnología aplicada a empresas — DEBE citar una fuente real (McKinsey, Gartner, Forrester, MIT, Statista, etc.). El dato debe ser sorprendente y relevante para empresas latinoamericanas.
3. En 1-2 oraciones, conecta ese dato con por qué les importa a ellos como empresa
4. Qué van a recibir: cada semana, un digest con tendencias + 3 pasos concretos que pueden implementar esa misma semana. Lectura de 2 minutos.
5. CTA sutil a https://www.im3systems.com/booking — invita a descubrir oportunidades con una auditoría gratuita

Máximo 200 palabras en el cuerpo. Tono: como un amigo experto en tech que comparte algo que acaba de descubrir. NO corporativo genérico.

Genera el email completo en HTML PURO con estilos inline. NO uses bloques de código markdown. Devuelve SOLO el HTML directo sin \`\`\`html ni \`\`\`. Wrapper: max-width:600px, font-family:'Segoe UI',Roboto,sans-serif. Header con background:linear-gradient(135deg,#0F172A,#1E293B) y título blanco. Links y CTAs en color #3B82F6.`,
      },
    ],
  });

  let body =
    bodyResponse.content?.[0]?.type === "text"
      ? bodyResponse.content[0].text.trim()
      : "<p>Error generando contenido</p>";

  body = body.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  log(`Newsletter welcome AI generado: "${subject}"`);

  return { subject, body };
}

/**
 * Generate AI insight for a contact — sales intelligence analysis.
 */
export async function generateContactInsight(
  contact: Contact,
  diagnostic: Partial<Diagnostic> | null,
  emails: SentEmail[],
  notes: ContactNote[]
): Promise<{
  summary: string;
  nextActions: string[];
  talkingPoints: string[];
  riskLevel: string;
  riskReason: string;
  estimatedValue: string;
}> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const context = buildContext(diagnostic);

  // Build engagement summary
  const emailStats = {
    total: emails.length,
    sent: emails.filter(e => ["sent", "opened", "clicked"].includes(e.status)).length,
    opened: emails.filter(e => e.status === "opened").length,
    clicked: emails.filter(e => e.status === "clicked").length,
    pending: emails.filter(e => e.status === "pending").length,
    bounced: emails.filter(e => e.status === "bounced" || e.status === "failed").length,
  };

  const notesText = notes.length > 0
    ? `NOTAS INTERNAS:\n${notes.map(n => `- ${n.content}`).join("\n")}`
    : "Sin notas internas.";

  const prompt = `Eres un analista de inteligencia comercial para IM3 Systems, consultora de automatización e IA en Latinoamérica.

Analiza este lead y responde SOLO con un JSON válido (sin markdown, sin backticks, sin texto adicional).

${context}

ESTADO ACTUAL:
- Status: ${contact.status}
- Lead Score: ${contact.leadScore}/100
- Opted out: ${contact.optedOut ? "Sí" : "No"}
- Fecha de registro: ${contact.createdAt}

ENGAGEMENT DE EMAILS:
- Total programados: ${emailStats.total}
- Enviados: ${emailStats.sent}
- Abiertos: ${emailStats.opened}
- Clicks: ${emailStats.clicked}
- Pendientes: ${emailStats.pending}
- Rebotados/fallidos: ${emailStats.bounced}

${notesText}

Responde con este JSON exacto:
{
  "summary": "Resumen de 2-3 oraciones del perfil del lead y su potencial",
  "nextActions": ["Acción 1", "Acción 2", "Acción 3"],
  "talkingPoints": ["Punto de conversación 1 personalizado", "Punto 2", "Punto 3"],
  "riskLevel": "low|medium|high",
  "riskReason": "Razón del nivel de riesgo en 1 oración",
  "estimatedValue": "Estimación cualitativa del valor potencial (ej: 'Alto - empresa mediana con presupuesto significativo')"
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";

  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || "Sin análisis disponible",
      nextActions: parsed.nextActions || [],
      talkingPoints: parsed.talkingPoints || [],
      riskLevel: parsed.riskLevel || "medium",
      riskReason: parsed.riskReason || "",
      estimatedValue: parsed.estimatedValue || "",
    };
  } catch {
    log(`Error parsing AI insight JSON: ${text.substring(0, 200)}`);
    return {
      summary: "Error generando análisis. Intenta regenerar.",
      nextActions: [],
      talkingPoints: [],
      riskLevel: "medium",
      riskReason: "No se pudo analizar",
      estimatedValue: "Desconocido",
    };
  }
}

/**
 * Generate a weekly news digest with 3 AI/automation/tech news summaries.
 * Used for both blog post creation and weekly newsletter email.
 */
export async function generateDailyNewsDigest(language: string = "es"): Promise<{
  title: string;
  excerpt: string;
  htmlContent: string;
  emailSubject: string;
  emailHtml: string;
  tags: string[];
}> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const today = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Fetch real news from RSS feeds
  const { fetchTechNews } = await import("./news-scraper");
  const realNews = await fetchTechNews();

  const newsContext = realNews.length > 0
    ? `\n\nNOTICIAS REALES DE ESTA SEMANA (fuentes verificables):\n${realNews.map((n, i) => `${i + 1}. "${n.title}" — ${n.source} (${n.link})\n   ${n.description}`).join("\n\n")}\n\nIMPORTANTE: Selecciona las 3 noticias más relevantes de la lista anterior. Usa los titulares y fuentes REALES. Incluye el link original en el campo "sourceUrl" y la fuente en "sourceName".`
    : "\n\nNo se pudieron obtener noticias de RSS. Genera basándote en tendencias recientes verificables de IA/tech, citando fuentes reales (TechCrunch, MIT Technology Review, etc.).";

  const blogResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: `Eres un analista tech de IM3 Systems que escribe un resumen semanal de noticias sobre inteligencia artificial, automatización y tecnología para empresas en Latinoamérica.

Reglas:
- Idioma: español latinoamericano
- Tono: informativo pero accesible, como un colega tech que te cuenta las noticias más relevantes de la semana
- Cada noticia debe incluir: qué pasó, por qué importa, y cómo una PYME podría aplicarlo
- SIEMPRE incluye la fuente real y el link original de cada noticia
- Basa tus resúmenes en las noticias reales proporcionadas — NO inventes
- Incluye una reflexión final breve conectando las 3 noticias`,
    messages: [{
      role: "user",
      content: `Genera el resumen de las 3 noticias tech más relevantes de esta semana (${today}).${newsContext}

Responde SOLO con un JSON válido (sin markdown, sin backticks):
{
  "title": "Título del artículo (ej: 'Resumen tech semanal — [fecha corta]')",
  "excerpt": "Resumen de 1 oración del artículo completo",
  "tags": ["tag1", "tag2", "tag3"],
  "news": [
    {
      "headline": "Titular de la noticia (basado en el real)",
      "summary": "2-3 oraciones explicando qué pasó",
      "takeaway": "1 oración sobre cómo aplica a una PYME",
      "sourceName": "Nombre de la fuente (ej: TechCrunch)",
      "sourceUrl": "URL del artículo original"
    }
  ],
  "closing": "Reflexión final de 2 oraciones conectando las 3 noticias"
}`,
    }],
  });

  const text = blogResponse.content?.[0]?.type === "text" ? blogResponse.content[0].text.trim() : "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    log(`Error parsing daily digest JSON: ${text.substring(0, 200)}`);
    throw new Error("Failed to parse AI response for daily digest");
  }

  const news = parsed.news || [];
  const title = parsed.title || `Resumen tech semanal`;
  const excerpt = parsed.excerpt || "Las 3 noticias tech más importantes de la semana.";
  const tags = parsed.tags || ["noticias", "ia", "tecnología"];

  // Build blog HTML content with source links
  const htmlContent = `<p><em>${excerpt}</em></p>
${news.map((n: any, i: number) => `
<h2>${i + 1}. ${n.headline}</h2>
<p>${n.summary}</p>
<p><strong>Para tu negocio:</strong> ${n.takeaway}</p>
${n.sourceUrl ? `<p><small>Fuente: <a href="${n.sourceUrl}" target="_blank" rel="noopener">${n.sourceName || "Ver artículo original"}</a></small></p>` : ""}`).join("\n")}

<h2>Reflexión de la semana</h2>
<p>${parsed.closing || ""}</p>

<p>¿Te gustaría saber cuáles de estas tendencias aplican a tu negocio? <a href="https://www.im3systems.com/booking">Te hacemos un análisis gratuito con pasos concretos</a>.</p>`;

  // Build email HTML
  const baseUrl = process.env.BASE_URL || "https://www.im3systems.com";
  const emailHtml = `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:20px 28px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems — Newsletter</h1>
    <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:6px 0 0">${today}</p>
  </div>
  <div style="padding:28px;border:1px solid #e5e5e5;border-top:none">
    <p style="font-size:15px;color:#444;margin:0 0 20px">${excerpt}</p>
    ${news.map((n: any, i: number) => `
    <div style="margin-bottom:24px;padding-bottom:24px;${i < news.length - 1 ? "border-bottom:1px solid #eee" : ""}">
      <h2 style="font-size:16px;color:#1a1a1a;margin:0 0 8px">${i + 1}. ${n.headline}</h2>
      <p style="font-size:14px;color:#444;margin:0 0 8px;line-height:1.5">${n.summary}</p>
      <p style="font-size:13px;color:#3B82F6;margin:0 0 6px;font-weight:600">💡 ${n.takeaway}</p>
      ${n.sourceUrl ? `<p style="font-size:12px;color:#999;margin:0"><a href="${n.sourceUrl}" style="color:#999;text-decoration:underline" target="_blank">Fuente: ${n.sourceName || "Ver artículo"}</a></p>` : ""}
    </div>`).join("")}
    ${parsed.closing ? `<p style="font-size:14px;color:#666;margin:20px 0 0;font-style:italic">${parsed.closing}</p>` : ""}
  </div>
  <div style="padding:20px 28px;text-align:center;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;background:#f9f9f9">
    <a href="${baseUrl}/booking" style="background:#3B82F6;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">¿Qué podrías automatizar en tu negocio? Descúbrelo gratis →</a>
    <p style="font-size:11px;color:#999;margin:12px 0 0">
      <a href="${baseUrl}/blog" style="color:#999;text-decoration:none">Leer en el blog</a> ·
      <a href="${baseUrl}/api/newsletter/unsubscribe/{{EMAIL}}" style="color:#999;text-decoration:none">Desuscribirse</a>
    </p>
  </div>
</div>`;

  const emailSubject = `🔍 ${title} — IM3 Systems`;

  return { title, excerpt, htmlContent, emailSubject, emailHtml, tags };
}

/**
 * Generate a personalized WhatsApp message for a contact.
 */
export async function generateWhatsAppMessage(
  contact: Contact,
  diagnostic: Partial<Diagnostic> | null
): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) {
    // Fallback message
    return `Hola ${contact.nombre}, soy del equipo de IM3 Systems. Queria hacer seguimiento sobre tu diagnostico tecnologico. ¿Tienes un momento para conversar?`;
  }

  const context = buildContext(diagnostic);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: `Genera un mensaje corto de WhatsApp (máximo 3 oraciones) en español latinoamericano. Tono: profesional pero cercano, como un consultor tech amigable. NO uses emojis excesivos (máximo 1). NO uses formato HTML. Texto plano solamente. Empieza con "Hola {nombre}". Firma como "— Equipo IM3 Systems". El mensaje debe ser relevante al status actual del contacto y sus datos.`,
    messages: [{
      role: "user",
      content: `Genera un mensaje de WhatsApp para este contacto.\n\nStatus: ${contact.status}\nSubstatus: ${contact.substatus || "ninguno"}\n\n${context}`,
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
  return text || `Hola ${contact.nombre}, soy del equipo de IM3 Systems. Queria hacer seguimiento. ¿Tienes un momento?`;
}
