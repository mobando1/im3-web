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

function getSystemPrompt(language: string = "es"): string {
  const shared = `
- El email debe ser HTML PURO con estilos inline simples (sin CSS externo)
- IMPORTANTE: NO envuelvas el HTML en bloques de código markdown (no uses \`\`\`html). Devuelve SOLO el HTML directo.
- Estructura: wrapper div con max-width:600px, font-family:'Segoe UI',Roboto,sans-serif
- Color primario header: background con linear-gradient(135deg,#0F172A,#1E293B) — azul oscuro tech
- Color para links y CTAs: #3B82F6 (azul vibrante)
- Color para botones CTA: background:#3B82F6, color:#fff
- Solo usa fuentes verificables como McKinsey, Gartner, Forrester, Deloitte, BCG, HBR, MIT, Statista, Bloomberg, Reuters. Si no estás seguro de un dato específico, habla en términos generales del sector sin inventar cifras
- NO incluyas footer de unsubscribe — se agrega automáticamente
- NO uses placeholders como {empresa} — usa los datos reales del contexto
- SIEMPRE dirige al contacto por su nombre (campo Participante). Nunca uses genéricos como "Hola" sin nombre.
- Si hay un meetLink en el contexto, SIEMPRE inclúyelo como un botón prominente visible (no como texto al final). Usar: <a href="{meetLink}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">${language === "en" ? "Join the meeting →" : "Unirse a la reunión →"}</a>
- Si hay un link de "Agregar al calendario", inclúyelo justo después del botón de reunión como texto más pequeño
- NO incluyas links de reagendar o cancelar en tu HTML — se agregan automáticamente en el footer de cada email.`;

  if (language === "en") {
    return `You are the IM3 Systems team, a TECHNOLOGY company specialized in artificial intelligence, automation, and custom software development for businesses.

Your task is to generate professional and personalized emails for clients who scheduled a TECHNOLOGY DIAGNOSTIC session (technology consulting about AI, automation, and software).

FORBIDDEN: NEVER use medical terminology. This is NOT a medical appointment. It is a TECHNOLOGY DIAGNOSTIC — a consulting session about AI, automation, and software. NEVER say "medical appointment", "medical consultation", "patient", "doctor", "health", "clinic", "hospital", "treatment" or similar terms.

Rules:
- Tone: professional yet approachable, like a tech consultant who knows their stuff. NOT generic corporate.
- Language: professional English
- Length: follow the specific instructions of each prompt
- Don't use excessive emojis (max 1-2 if applicable)
- Personalize using the client's real data — mention their industry, tools, goals
- Don't make up data you don't have — if there's no data, omit that mention
- When citing data, statistics or trends, ALWAYS cite the real source (e.g., "according to McKinsey (2024)", "Gartner reports that...")
- Signature: "— IM3 Systems Team"
- NEVER use "Confirm attendance" as CTA — the person already confirmed by scheduling. The main CTA in pre-meeting emails is the meeting link (Meet).
- For the post-meeting follow-up email: the CTA can invite to schedule a follow-up session with link to https://www.im3systems.com/booking
- Do NOT include a generic "/booking" CTA in pre-meeting emails — the contact already scheduled.
${shared}`;
  }

  return `Eres el equipo de IM3 Systems, una empresa de TECNOLOGÍA especializada en inteligencia artificial, automatización y desarrollo de software para empresas.

Tu tarea es generar emails profesionales y personalizados para clientes que agendaron una sesión de DIAGNÓSTICO TECNOLÓGICO (consultoría de tecnología, IA y automatización).

PROHIBIDO: NUNCA uses terminología médica. Esto NO es una cita médica ni una consulta de salud. Es un DIAGNÓSTICO TECNOLÓGICO — una sesión de consultoría sobre IA, automatización y software. NUNCA digas "cita médica", "consulta médica", "paciente", "doctor", "salud", "clínica", "hospital", "tratamiento" ni términos similares.

Reglas:
- Tono: profesional pero cercano, como un consultor tech que sabe lo que hace. NO corporativo genérico.
- Idioma: español latinoamericano (tuteo, no voseo)
- Largo: sigue las instrucciones específicas de cada prompt
- No uses emojis excesivos (máximo 1-2 si aplica)
- Personaliza usando los datos reales del cliente — menciona su industria, herramientas, objetivos
- No inventes datos que no tengas — si no hay dato, omite esa mención
- Cuando menciones datos, estadísticas o tendencias, SIEMPRE cita la fuente real (ej: "según McKinsey (2024)", "Gartner reporta que...", "un estudio de Harvard Business Review")
- Firma: "— Equipo IM3 Systems"
- NUNCA uses "Confirmar asistencia" como CTA — la persona ya confirmó al agendar. El CTA principal en emails pre-reunión es el link de la reunión (Meet).
- Para el email de seguimiento post-reunión: el CTA puede invitar a agendar una sesión de seguimiento con link a https://www.im3systems.com/booking
- NO incluyas un CTA genérico de "/booking" en emails pre-reunión — el contacto YA agendó.
${shared}`;
}

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
  if ((data as any)._followUpDate) {
    lines.push(`- SESIÓN DE SEGUIMIENTO YA AGENDADA: ${(data as any)._followUpDate} a las ${(data as any)._followUpTime}`);
    if ((data as any)._followUpMeetLink) lines.push(`- Link de reunión de seguimiento: ${(data as any)._followUpMeetLink}`);
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
  calendarAddUrl?: string | null,
  language: string = "es"
): { subject: string; body: string } {
  const subject = language === "en"
    ? `${participante}, your IM3 session is today`
    : `${participante}, tu sesión con IM3 es hoy`;
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
    <p style="margin:0 0 16px">${language === "en"
      ? `${participante}, your diagnostic session is today at <strong>${horaCita}</strong> (45 minutes).`
      : `${participante}, hoy tenemos tu sesión de diagnóstico a las <strong>${horaCita}</strong> (45 minutos).`}</p>
    ${meetSection}
    ${calendarSection}
    <p style="margin:0 0 16px">${language === "en"
      ? "Have information about your current tools and the processes that take the most time ready — so we can make the most of the session."
      : "Ten a mano información sobre tus herramientas actuales y los procesos que más tiempo consumen en tu operación — así aprovechamos al máximo la sesión."}</p>
    <p style="margin:0 0 16px;color:#666">${language === "en"
      ? "Any questions beforehand? Reply to this email and we'll help."
      : "¿Tienes preguntas antes? Responde este correo y te ayudamos."}</p>
    <p style="margin:0 0 20px;color:#999">— ${language === "en" ? "IM3 Systems Team" : "Equipo IM3 Systems"}</p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">${language === "en" ? "Unsubscribe" : "No recibir más emails"}</a>
  </div>
</div>`;

  return { subject, body };
}

export function buildMicroReminderEmail(
  participante: string,
  horaCita: string,
  meetLink: string | null,
  contactId: string,
  language: string = "es"
): { subject: string; body: string } {
  const subject = language === "en"
    ? `In 1 hour: your diagnostic with IM3`
    : `En 1 hora: tu diagnóstico con IM3`;
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";

  const meetSection = meetLink
    ? `<p style="margin:0 0 16px"><a href="${meetLink}" style="display:inline-block;background:#3B82F6;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Unirse a la reunión →</a></p>`
    : "";

  const body = `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">${language === "en"
      ? `${participante}, your session starts in <strong>1 hour</strong> (${horaCita}). See you there.`
      : `${participante}, tu sesión empieza en <strong>1 hora</strong> (${horaCita}). Nos vemos ahí.`}</p>
    ${meetSection}
    <p style="margin:0;color:#999">— ${language === "en" ? "IM3 Systems Team" : "Equipo IM3 Systems"}</p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">${language === "en" ? "Unsubscribe" : "No recibir más emails"}</a>
  </div>
</div>`;

  return { subject, body };
}

/**
 * Build fixed HTML for no-show email (empathetic, invite to reschedule).
 */
export function buildNoShowEmail(
  participante: string,
  empresa: string,
  contactId: string,
  language: string = "es"
): { subject: string; body: string } {
  const subject = language === "en"
    ? `${participante}, we couldn't connect today`
    : `${participante}, no pudimos conectarnos hoy`;
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";

  const body = `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">${language === "en"
      ? `${participante}, we noticed we couldn't connect today for the ${empresa} diagnostic session.`
      : `${participante}, notamos que no pudimos conectarnos hoy para la sesión de diagnóstico de ${empresa}.`}</p>
    <p style="margin:0 0 16px">${language === "en"
      ? "We understand things come up. Your diagnostic time is still reserved and all the information you shared is saved."
      : "Entendemos que a veces surgen imprevistos. Tu tiempo de diagnóstico sigue reservado y toda la información que compartiste está guardada."}</p>
    <p style="margin:0 0 20px">${language === "en"
      ? "If you'd like, you can pick a new date in seconds:"
      : "Si quieres, puedes elegir una nueva fecha en segundos:"}</p>
    <p style="margin:0 0 20px"><a href="${baseUrl}/reschedule/${contactId}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">${language === "en" ? "Reschedule my session →" : "Reagendar mi sesión →"}</a></p>
    <p style="margin:0 0 16px;color:#666;font-size:14px">${language === "en"
      ? "If you prefer, you can also reply to this email and we'll coordinate directly."
      : "Si prefieres, también puedes responder a este correo y coordinamos directamente."}</p>
    <p style="margin:0;color:#999">— ${language === "en" ? "IM3 Systems Team" : "Equipo IM3 Systems"}</p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">${language === "en" ? "Unsubscribe" : "No recibir más emails"}</a>
  </div>
</div>`;

  return { subject, body };
}

/**
 * Build fixed HTML for follow-up confirmation email.
 * Sent when admin schedules a follow-up call for a contact.
 */
export function buildFollowUpConfirmationEmail(
  participante: string,
  empresa: string,
  fechaSeguimiento: string,
  horaSeguimiento: string,
  meetLink: string | null,
  contactId: string,
  calendarAddUrl?: string | null,
  language: string = "es"
): { subject: string; body: string } {
  const subject = language === "en"
    ? `${participante}, your follow-up session with IM3 is confirmed`
    : `${participante}, confirmada tu sesión de seguimiento con IM3`;
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
    <p style="margin:0 0 16px">${language === "en"
      ? `${participante}, as we discussed, here are the details for our next follow-up session:`
      : `${participante}, como quedamos en nuestra conversación, te confirmo los detalles de nuestra próxima sesión de seguimiento:`}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 8px;font-size:14px;color:#64748B">${language === "en" ? "Follow-up session" : "Sesión de seguimiento"}</p>
      <p style="margin:0 0 4px;font-weight:600;font-size:16px">${language === "en" ? "Date" : "Fecha"}: ${fechaSeguimiento}</p>
      <p style="margin:0 0 4px;font-weight:600;font-size:16px">${language === "en" ? "Time" : "Hora"}: ${horaSeguimiento}</p>
      <p style="margin:0;font-size:14px;color:#64748B">${language === "en" ? "Duration: 45 minutes" : "Duración: 45 minutos"}</p>
    </div>
    ${meetSection}
    ${calendarSection}
    <p style="margin:0 0 16px">${language === "en"
      ? `In this session we'll review the proposal and next steps for ${empresa}. If you have questions, reply to this email.`
      : `En esta sesión revisaremos la propuesta y los próximos pasos para ${empresa}. Si tienes preguntas antes, responde a este correo.`}</p>
    <p style="margin:0 0 20px;color:#999">— ${language === "en" ? "IM3 Systems Team" : "Equipo IM3 Systems"}</p>
  </div>
  <div style="max-width:600px;margin:8px auto 0;text-align:center;padding:12px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
    <p style="margin:0 0 4px;font-size:13px;color:#475569">${language === "en" ? "Need to change the date?" : "¿Necesitas cambiar la fecha?"}</p>
    <p style="margin:0"><a href="${baseUrl}/api/reschedule/${contactId}" style="color:#3B82F6;font-size:13px;text-decoration:none;font-weight:600">${language === "en" ? "Reschedule" : "Reagendar"}</a> <span style="color:#CBD5E1;margin:0 8px">·</span> <a href="${baseUrl}/api/cancel/${contactId}" style="color:#94A3B8;font-size:13px;text-decoration:none">${language === "en" ? "Cancel meeting" : "Cancelar reunión"}</a></p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">${language === "en" ? "Unsubscribe" : "No recibir más emails"}</a>
  </div>
</div>`;

  return { subject, body };
}

/**
 * Add email footer with reschedule/cancel links (pre-meeting) + unsubscribe.
 * @param isPreMeeting - if true, includes reschedule/cancel links prominently
 */
function addEmailFooter(html: string, contactId: string, isPreMeeting: boolean = true, language: string = "es"): string {
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";
  const isEn = language === "en";

  const rescheduleSection = isPreMeeting ? `<div style="max-width:600px;margin:8px auto 0;text-align:center;padding:12px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <p style="margin:0 0 4px;font-size:13px;color:#475569">${isEn ? "Need to change the date?" : "¿Necesitas cambiar la fecha?"}</p>
  <p style="margin:0">
    <a href="${baseUrl}/api/reschedule/${contactId}" style="color:#3B82F6;font-size:13px;text-decoration:none;font-weight:600">${isEn ? "Reschedule" : "Reagendar"}</a>
    <span style="color:#CBD5E1;margin:0 8px">·</span>
    <a href="${baseUrl}/api/cancel/${contactId}" style="color:#94A3B8;font-size:13px;text-decoration:none">${isEn ? "Cancel meeting" : "Cancelar reunión"}</a>
  </p>
</div>` : "";

  const unsubscribe = `<div style="max-width:600px;margin:8px auto 0;text-align:center;padding:8px">
  <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">${isEn ? "Unsubscribe from this sequence" : "No recibir más emails de esta secuencia"}</a>
</div>`;

  const footer = rescheduleSection + unsubscribe;

  // Try to insert after last closing </div> or append
  if (html.includes("</div>")) {
    const lastDiv = html.lastIndexOf("</div>");
    return html.substring(0, lastDiv + 6) + footer;
  }
  return html + footer;
}

export async function generateEmailContent(
  template: EmailTemplate,
  diagnosticData: Partial<Diagnostic> | null,
  contactId?: string,
  language: string = "es"
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
    temperature: 0.3,
    system: language === "en"
      ? "Generate ONLY the email subject text. No quotes, no prefix, just the text. Max 60 characters. Write in English. This is a TECHNOLOGY diagnostic session about AI and software, NOT medical."
      : "Genera SOLO el texto del subject de un email. Sin comillas, sin prefijo, solo el texto. Máximo 60 caracteres. Esto es un DIAGNÓSTICO TECNOLÓGICO sobre IA y software, NO médico.",
    messages: [
      {
        role: "user",
        content: language === "en"
          ? `${template.subjectPrompt}\n\nIMPORTANT: Write the subject in English.\n\n${context}`
          : `${template.subjectPrompt}\n\n${context}`,
      },
    ],
  });

  const subject =
    subjectResponse.content?.[0]?.type === "text"
      ? subjectResponse.content[0].text.trim()
      : language === "en" ? "IM3 Systems Diagnostic" : "Diagnóstico IM3 Systems";

  // Generate body
  const bodyResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    temperature: 0.3,
    system: getSystemPrompt(language),
    messages: [
      {
        role: "user",
        content: `${template.bodyPrompt}\n\n${language === "en" ? "IMPORTANT: Write ALL content in English." : ""}\n\n${context}\n\nGenera el email completo en HTML PURO con estilos inline. NO uses bloques de código markdown. Devuelve SOLO el HTML directo sin \`\`\`html ni \`\`\`. Wrapper: max-width:600px, font-family:'Segoe UI',Roboto,sans-serif. Header con background:linear-gradient(135deg,#0F172A,#1E293B) y título blanco. Links y CTAs en color #3B82F6.`,
      },
    ],
  });

  let body =
    bodyResponse.content?.[0]?.type === "text"
      ? bodyResponse.content[0].text.trim()
      : "<p>Error generando contenido</p>";

  // Strip markdown code block wrappers if AI included them
  body = body.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  // Validate: reject medical terminology (AI hallucination guard)
  const FORBIDDEN_TERMS = ["cita médica", "consulta médica", "paciente", "médico", "clínica", "hospital", "tratamiento", "medical appointment", "medical consultation"];
  const bodyLower = body.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const hasForbiddenBody = FORBIDDEN_TERMS.some(t => bodyLower.includes(t));
  const hasForbiddenSubject = FORBIDDEN_TERMS.some(t => subjectLower.includes(t));

  if (hasForbiddenBody || hasForbiddenSubject) {
    log(`⚠ Email para ${diagnosticData?.empresa || "?"} contenía términos médicos — regenerando con temperature 0.1`);
    const retryResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      temperature: 0.1,
      system: getSystemPrompt(language),
      messages: [{
        role: "user",
        content: `${template.bodyPrompt}\n\nCRÍTICO: Esto es un DIAGNÓSTICO TECNOLÓGICO de IM3 Systems (empresa de tecnología). NO es médico.\n\n${language === "en" ? "IMPORTANT: Write ALL content in English." : ""}\n\n${context}\n\nGenera el email completo en HTML PURO con estilos inline. NO uses bloques de código markdown. Devuelve SOLO el HTML directo sin \`\`\`html ni \`\`\`. Wrapper: max-width:600px, font-family:'Segoe UI',Roboto,sans-serif. Header con background:linear-gradient(135deg,#0F172A,#1E293B) y título blanco. Links y CTAs en color #3B82F6.`,
      }],
    });
    body = retryResponse.content?.[0]?.type === "text"
      ? retryResponse.content[0].text.trim().replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim()
      : "<p>Error generando contenido</p>";
  }

  // Add footer with reschedule/cancel (pre-meeting) + unsubscribe
  if (contactId) {
    const isPreMeeting = template.nombre !== "seguimiento_post";
    body = addEmailFooter(body, contactId, isPreMeeting, language);
  }

  log(`Email AI generado: "${subject}" para ${diagnosticData?.empresa || "suscriptor"}`);

  return { subject, body };
}

/**
 * Generate an AI-powered newsletter welcome email with a "dato curioso"
 * about AI/automation that hooks the subscriber from day one.
 */
export async function generateNewsletterWelcome(language: string = "es"): Promise<{ subject: string; body: string }> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const subjectResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    temperature: 0.5,
    system: language === "en"
      ? "Generate ONLY the email subject text for a tech newsletter welcome. It should be intriguing with a fun fact or question. No quotes, no prefix, just the text. Max 60 characters."
      : "Genera SOLO el texto del subject de un email de bienvenida a un newsletter de tecnología. Debe ser intrigante y contener un dato curioso o pregunta que enganche. Sin comillas, sin prefijo, solo el texto. Máximo 60 caracteres. Español latinoamericano.",
    messages: [
      {
        role: "user",
        content: language === "en"
          ? "Generate a subject for a welcome email to the IM3 Systems newsletter (AI, automation and software company). The subject should contain a fun fact or intriguing question about AI/automation. Examples: 'Did you know 40% of repetitive tasks can be automated?', 'Your first IM3 insight: what's next in AI'. Vary the approach each time."
          : "Genera un subject para un email de bienvenida al newsletter de IM3 Systems (empresa de IA, automatización y software para empresas). El subject debe contener un dato curioso o pregunta intrigante sobre IA/automatización que haga que el lector quiera abrir el email. Ejemplos de estilo: '¿Sabías que el 40% de las tareas repetitivas ya se automatizan?', 'Tu primer insight IM3: lo que viene en IA'. Varía el enfoque cada vez.",
      },
    ],
  });

  const subject =
    subjectResponse.content?.[0]?.type === "text"
      ? subjectResponse.content[0].text.trim()
      : language === "en" ? "Welcome to the IM3 Systems newsletter" : "Bienvenido al newsletter de IM3 Systems";

  const bodyResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    temperature: 0.5,
    system: getSystemPrompt(language),
    messages: [
      {
        role: "user",
        content: language === "en"
          ? `Generate a welcome email for the IM3 Systems newsletter. Structure:

1. Brief, warm greeting (thanks for subscribing)
2. ONE impactful "fun fact" about AI, automation or technology applied to businesses — MUST cite a real source (McKinsey, Gartner, Forrester, MIT, Statista, etc.)
3. In 1-2 sentences, connect that fact to why it matters to them as a business
4. What they'll receive: every week, a digest with trends + 3 concrete steps they can implement that same week. 2-minute read.
5. Subtle CTA to https://www.im3systems.com/booking — invite them to discover opportunities with a free audit

Max 200 words in the body. Tone: like a tech-savvy friend sharing something they just discovered. NOT generic corporate.

Generate the complete email in PURE HTML with inline styles. NO markdown code blocks. Return ONLY the direct HTML. Wrapper: max-width:600px, font-family:'Segoe UI',Roboto,sans-serif. Header with background:linear-gradient(135deg,#0F172A,#1E293B) and white title. Links and CTAs in #3B82F6.`
          : `Genera un email de bienvenida al newsletter de IM3 Systems. Estructura:

1. Saludo breve y cálido (gracias por suscribirse)
2. UN "dato curioso" impactante sobre IA, automatización o tecnología aplicada a empresas — DEBE citar una fuente real (McKinsey, Gartner, Forrester, MIT, Statista, etc.). El dato debe ser sorprendente y relevante para empresas.
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

  const prompt = `Eres un analista de inteligencia comercial para IM3 Systems, consultora de automatización e IA.

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
    temperature: 0.2,
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

  const isEn = language === "en";
  const today = new Date().toLocaleDateString(isEn ? "en-US" : "es-CO", {
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
    temperature: 0.5,
    system: isEn
      ? `You are a tech analyst at IM3 Systems writing a weekly summary of AI, automation and technology news for businesses.

Rules:
- Language: professional English
- Tone: informative but accessible, like a tech colleague sharing the week's most relevant news
- Each story must include: what happened, why it matters, and how an SMB could apply it
- ALWAYS include the real source and original link for each story
- Base your summaries on the real news provided — DO NOT make things up
- Include a brief closing reflection connecting the 3 stories`
      : `Eres un analista tech de IM3 Systems que escribe un resumen semanal de noticias sobre inteligencia artificial, automatización y tecnología para empresas.

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
<p><strong>${isEn ? "For your business:" : "Para tu negocio:"}</strong> ${n.takeaway}</p>
${n.sourceUrl ? `<p><small>${isEn ? "Source" : "Fuente"}: <a href="${n.sourceUrl}" target="_blank" rel="noopener">${n.sourceName || (isEn ? "See original article" : "Ver artículo original")}</a></small></p>` : ""}`).join("\n")}

<h2>${isEn ? "Weekly reflection" : "Reflexión de la semana"}</h2>
<p>${parsed.closing || ""}</p>

<p>${isEn
  ? `Want to know which of these trends apply to your business? <a href="https://www.im3systems.com/booking">Get a free analysis with concrete steps</a>.`
  : `¿Te gustaría saber cuáles de estas tendencias aplican a tu negocio? <a href="https://www.im3systems.com/booking">Te hacemos un análisis gratuito con pasos concretos</a>.`}</p>`;

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
    <a href="${baseUrl}/booking" style="background:#3B82F6;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">${isEn ? "What could you automate in your business? Find out free →" : "¿Qué podrías automatizar en tu negocio? Descúbrelo gratis →"}</a>
    <p style="font-size:11px;color:#999;margin:12px 0 0">
      <a href="${baseUrl}/blog" style="color:#999;text-decoration:none">${isEn ? "Read on the blog" : "Leer en el blog"}</a> ·
      <a href="${baseUrl}/api/newsletter/unsubscribe/{{EMAIL}}" style="color:#999;text-decoration:none">${isEn ? "Unsubscribe" : "Desuscribirse"}</a>
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
  diagnostic: Partial<Diagnostic> | null,
  language: string = "es"
): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) {
    return language === "en"
      ? `Hi ${contact.nombre}, this is the IM3 Systems team. We wanted to follow up on your technology diagnostic. Do you have a moment to chat?`
      : `Hola ${contact.nombre}, soy del equipo de IM3 Systems. Queria hacer seguimiento sobre tu diagnostico tecnologico. ¿Tienes un momento para conversar?`;
  }

  const context = buildContext(diagnostic);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    temperature: 0.3,
    system: language === "en"
      ? `Generate a short WhatsApp message (max 3 sentences) in professional English. Tone: professional but approachable, like a friendly tech consultant. NO excessive emojis (max 1). NO HTML format. Plain text only. Start with "Hi {name}". Sign as "— IM3 Systems Team". The message must be relevant to the contact's current status and data. This is a TECHNOLOGY consulting company, NOT medical.`
      : `Genera un mensaje corto de WhatsApp (máximo 3 oraciones) en español latinoamericano. Tono: profesional pero cercano, como un consultor tech amigable. NO uses emojis excesivos (máximo 1). NO uses formato HTML. Texto plano solamente. Empieza con "Hola {nombre}". Firma como "— Equipo IM3 Systems". El mensaje debe ser relevante al status actual del contacto y sus datos. Esto es una empresa de TECNOLOGÍA, NO médica.`,
    messages: [{
      role: "user",
      content: `Genera un mensaje de WhatsApp para este contacto.\n\nStatus: ${contact.status}\nSubstatus: ${contact.substatus || "ninguno"}\n\n${context}`,
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
  return text || (language === "en"
    ? `Hi ${contact.nombre}, this is the IM3 Systems team. We wanted to follow up. Do you have a moment?`
    : `Hola ${contact.nombre}, soy del equipo de IM3 Systems. Queria hacer seguimiento. ¿Tienes un momento?`);
}

/**
 * Build the premium HTML template for a mini-audit email.
 */
function buildMiniAuditEmail(
  insights: Array<{ title: string; description: string; stat: string }>,
  diagnosticData: Partial<Diagnostic>,
  contactId: string,
  language: string = "es"
): string {
  const isEn = language === "en";
  const nombre = diagnosticData.participante || "there";
  const empresa = diagnosticData.empresa || (isEn ? "your company" : "tu empresa");
  const industria = diagnosticData.industria || (isEn ? "your sector" : "tu sector");
  const fechaCita = diagnosticData.fechaCita || "";
  const horaCita = diagnosticData.horaCita || "";
  const meetLink = (diagnosticData as any)._meetLink || (diagnosticData as any).meetLink || "";
  const areaPrioridad = Array.isArray(diagnosticData.areaPrioridad) ? diagnosticData.areaPrioridad : [];

  const insightColors = [
    { border: "#3B82F6", bg: "#EFF6FF", icon: "&#9889;", iconBg: "#DBEAFE", label: isEn ? "OBSERVATION" : "OBSERVACION" },
    { border: "#10B981", bg: "#ECFDF5", icon: "&#128200;", iconBg: "#D1FAE5", label: isEn ? "DATA POINT" : "DATO" },
    { border: "#F59E0B", bg: "#FFFBEB", icon: "&#127919;", iconBg: "#FEF3C7", label: isEn ? "AREA OF INTEREST" : "AREA DE INTERES" },
  ];

  const insightCards = insights.map((insight, i) => {
    const c = insightColors[i] || insightColors[0];
    return `
    <div style="background:${c.bg};border-left:4px solid ${c.border};border-radius:0 8px 8px 0;padding:20px;margin:0 0 16px">
      <div style="display:flex;align-items:center;margin:0 0 10px">
        <div style="width:36px;height:36px;background:${c.iconBg};border-radius:8px;text-align:center;line-height:36px;font-size:18px;margin-right:12px">${c.icon}</div>
        <div>
          <span style="font-size:10px;font-weight:700;letter-spacing:1px;color:${c.border};text-transform:uppercase">${c.label}</span>
          <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:#1a1a1a">${insight.title}</p>
        </div>
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6">${insight.description}</p>
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:6px;padding:10px 14px;display:inline-block">
        <span style="font-size:12px;color:#6B7280">&#128202; </span>
        <span style="font-size:13px;font-weight:600;color:#1F2937">${insight.stat}</span>
      </div>
    </div>`;
  }).join("");

  const priorityTags = areaPrioridad.map(area =>
    `<span style="display:inline-block;background:#EFF6FF;color:#3B82F6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:12px;margin:2px 4px 2px 0">${area}</span>`
  ).join("");

  const meetSection = meetLink ? `
    <div style="text-align:center;margin:24px 0 0">
      <a href="${meetLink}" style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#2563EB);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 2px 8px rgba(59,130,246,0.3)">Unirse a la reunion &#8594;</a>
    </div>` : "";

  const calendarInfo = fechaCita && horaCita ? `
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:20px 0 0;text-align:center">
      <p style="margin:0 0 4px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px">${isEn ? "Your diagnostic session" : "Tu sesion de diagnostico"}</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#1E293B">${fechaCita} ${isEn ? "at" : "a las"} ${horaCita}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#64748B">45 ${isEn ? "minutes" : "minutos"} &middot; Google Meet</p>
    </div>` : "";

  const html = `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#ffffff">
  <div style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 50%,#0F172A 100%);padding:32px 24px;border-radius:8px 8px 0 0;text-align:center">
    <p style="margin:0 0 6px;font-size:11px;color:#64748B;letter-spacing:2px;text-transform:uppercase">IM3 SYSTEMS</p>
    <h1 style="color:#fff;font-size:24px;margin:0 0 6px;font-weight:700">${isEn ? "Initial observations" : "Primeras observaciones"}</h1>
    <p style="color:#94A3B8;font-size:14px;margin:0 0 16px">${isEn ? "about what you shared with us" : "sobre lo que nos compartiste"}</p>
    <div style="display:inline-block;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:20px;padding:6px 18px">
      <span style="color:#60A5FA;font-size:12px;font-weight:600;letter-spacing:0.5px">${isEn ? "INITIAL REVIEW" : "REVISION INICIAL"} &middot; ${empresa.toUpperCase()}</span>
    </div>
  </div>

  <div style="padding:28px 24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 20px;font-size:16px;color:#1a1a1a;line-height:1.6">${isEn
      ? `<strong>${nombre}</strong>, we took a first look at what you shared about <strong>${empresa}</strong>. There are some areas that caught our attention and that we think are worth exploring together in the session:`
      : `<strong>${nombre}</strong>, le dimos una primera mirada a lo que nos compartiste sobre <strong>${empresa}</strong>. Hay algunas areas que nos llamaron la atencion y que creemos que vale la pena explorar juntos en la sesion:`}</p>

    ${insightCards}

    <div style="background:linear-gradient(135deg,#F8FAFC,#F1F5F9);border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:24px 0 0">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
        <td style="width:28px;height:28px;background:#DBEAFE;border-radius:6px;text-align:center;font-size:14px;vertical-align:middle">&#128640;</td>
        <td style="padding-left:10px;font-size:14px;font-weight:700;color:#1E293B">${isEn ? "Diagnostic summary" : "Resumen de tu diagnostico"}</td>
      </tr></table>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B">${isEn ? "Sector" : "Sector"}</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1E293B;text-align:right">${industria}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B">${isEn ? "Areas to review" : "Areas para revisar"}</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1E293B;text-align:right">${isEn ? "3 identified" : "3 identificadas"}</td>
        </tr>
        ${areaPrioridad.length > 0 ? `<tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B;vertical-align:top">${isEn ? "Your priorities" : "Tus prioridades"}</td>
          <td style="padding:6px 0;text-align:right">${priorityTags}</td>
        </tr>` : ""}
      </table>
    </div>

    ${calendarInfo}
    ${meetSection}

    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 20px;margin:24px 0 0">
      <p style="margin:0;font-size:14px;color:#475569;line-height:1.6">${isEn
        ? `This is an initial read — in the session we'll go into detail, review your processes and see what makes sense for <strong>${empresa}</strong>. We may find more things, or some of these may not apply as much. That's what the session is for.`
        : `Esto es una primera lectura — en la sesion vamos a entrar en detalle, revisar tus procesos y ver que tiene sentido para <strong>${empresa}</strong>. Puede que encontremos mas cosas, o que algunas de estas no apliquen tanto. Para eso es la sesion.`}</p>
    </div>

    <p style="margin:20px 0 0;color:#64748B;font-size:13px">${isEn
      ? "If you have questions before the session, reply to this email. We're here to help."
      : "Si tienes preguntas antes de la sesion, responde a este correo. Estamos para ayudarte."}</p>

    <p style="margin:16px 0 0;color:#999;font-size:14px">— ${isEn ? "IM3 Systems Team" : "Equipo IM3 Systems"}</p>
  </div>
</div>`;

  return addEmailFooter(html, contactId, true, language);
}

/**
 * Generate a mini-audit report (3 insights) based on diagnostic data.
 * Sent 1 hour after form submission to feel like human analysis.
 * AI generates structured insights (JSON), HTML template is fixed for consistent design.
 */
export async function generateMiniAudit(
  diagnosticData: Partial<Diagnostic>,
  contactId: string,
  language: string = "es"
): Promise<{ subject: string; body: string; whatsappSummary: string }> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY not configured");
  const isEn = language === "en";

  const context = buildContext(diagnosticData);

  // 1. Generate subject
  const subjectResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    temperature: 0.3,
    system: isEn
      ? "Generate ONLY the email subject text. No quotes, no prefix, just the text. Max 60 characters. Professional and moderate tone — don't exaggerate or promise too much. This is a TECHNOLOGY diagnostic, NOT medical."
      : "Genera SOLO el texto del subject de un email. Sin comillas, sin prefijo, solo el texto. Maximo 60 caracteres. Tono profesional y moderado — no exagerar ni prometer demasiado.",
    messages: [{
      role: "user",
      content: isEn
        ? `Subject for initial observations on the diagnostic of ${diagnosticData.empresa} (${diagnosticData.industria}). Consultative tone, not salesy. Style: "Initial observations on ${diagnosticData.empresa}" or "Areas worth reviewing — ${diagnosticData.empresa}"`
        : `Subject para primeras observaciones del diagnostico de ${diagnosticData.empresa} (${diagnosticData.industria}). Tono consultivo, no vendedor. Estilo: "Primeras observaciones sobre ${diagnosticData.empresa}" o "Areas que vale la pena revisar — ${diagnosticData.empresa}"`,
    }],
  });

  const subject = subjectResponse.content?.[0]?.type === "text"
    ? subjectResponse.content[0].text.trim()
    : isEn ? `Initial observations on ${diagnosticData.empresa}` : `Primeras observaciones sobre ${diagnosticData.empresa}`;

  // 2. Generate 3 insights as structured JSON
  const insightsResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    temperature: 0.3,
    system: isEn
      ? `You are a senior technology and AI consultant at IM3 Systems. You make initial observations about company diagnostics — areas worth exploring, not promises.

Respond ONLY with a valid JSON array. No text before or after. No markdown code blocks. Just the JSON.

Exact format:
[
  {"title": "short title (3-5 words)", "description": "2-3 sentences describing the area you observed. Consultative and moderate tone — don't promise big results, just point out it's an interesting area to review together.", "stat": "reference data with source (e.g.: 'McKinsey: 40% of operational tasks are automatable')"},
  {"title": "...", "description": "...", "stat": "..."},
  {"title": "...", "description": "...", "stat": "..."}
]

Rules:
- Each observation must be DIFFERENT (automation, data/AI, integration/efficiency)
- Statistics must be from real sources (McKinsey, Gartner, Forrester, Deloitte, HBR)
- Descriptions must use real data from the diagnostic (industry, tools, goals)
- DO NOT exaggerate benefits — use phrases like "could be worth exploring", "there are signs that", "this is something we see in similar companies"
- DO NOT mention "our AI" or "artificial intelligence analyzed" — write as a human consultant
- Max 50 words per description`
      : `Eres un consultor senior de tecnologia e IA de IM3 Systems. Haces observaciones iniciales sobre diagnosticos de empresas — areas que vale la pena explorar, no promesas.

Responde UNICAMENTE con un JSON array valido. Sin texto antes ni despues. Sin bloques de codigo markdown. Solo el JSON.

Formato exacto:
[
  {"title": "titulo corto (3-5 palabras)", "description": "2-3 oraciones describiendo el area que observaste. Tono consultivo y moderado — no prometas resultados grandes, solo señala que es un area interesante para revisar juntos.", "stat": "dato de referencia con fuente (ej: 'McKinsey: 40% de tareas operativas son automatizables')"},
  {"title": "...", "description": "...", "stat": "..."},
  {"title": "...", "description": "...", "stat": "..."}
]

Reglas:
- Cada observacion debe ser DIFERENTE (automatizacion, datos/IA, integracion/eficiencia)
- Las estadisticas deben ser de fuentes reales (McKinsey, Gartner, Forrester, Deloitte, HBR)
- Las descripciones deben usar datos reales del diagnostico (industria, herramientas, objetivos)
- NO exageres beneficios — usa frases como "podria valer la pena explorar", "hay señales de que", "esto es algo que vemos en empresas similares"
- NO menciones "nuestra IA" ni "inteligencia artificial analizo" — escribe como consultor humano
- Maximo 50 palabras por descripcion`,
    messages: [{
      role: "user",
      content: isEn
        ? `Generate 3 observations for this company:\n\n${context}`
        : `Genera 3 insights para esta empresa:\n\n${context}`,
    }],
  });

  const insightsText = insightsResponse.content?.[0]?.type === "text"
    ? insightsResponse.content[0].text.trim()
    : "[]";

  let insights: Array<{ title: string; description: string; stat: string }>;
  try {
    const cleaned = insightsText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    insights = JSON.parse(cleaned);
    if (!Array.isArray(insights) || insights.length < 3) throw new Error("Invalid insights");
  } catch {
    insights = isEn ? [
      { title: "Repetitive processes", description: `We noticed that in ${diagnosticData.industria || "your operation"} there are tasks that are probably being done manually and could be simplified. Worth reviewing which ones have the most impact.`, stat: "McKinsey: 45% of work activities are automatable" },
      { title: "Disconnected tools", description: `It seems ${diagnosticData.empresa || "the company"} uses several tools that don't communicate with each other. Connecting them could reduce duplicate work, though it would need to be evaluated case by case.`, stat: "Forrester: integrated companies reduce 30% of admin time" },
      { title: "Untapped data", description: `In ${diagnosticData.industria || "your industry"} it's common to have valuable data that isn't being used for decision-making. This is an area that could be worth exploring.`, stat: "Gartner: 75% of companies will adopt operational AI by 2026" },
    ] : [
      { title: "Procesos que se repiten", description: `Notamos que en ${diagnosticData.industria || "tu operacion"} hay tareas que probablemente se estan haciendo de forma manual y podrian simplificarse. Vale la pena revisar cuales tienen mas impacto.`, stat: "McKinsey: 45% de actividades laborales son automatizables" },
      { title: "Herramientas desconectadas", description: `Parece que ${diagnosticData.empresa || "la empresa"} usa varias herramientas que no se comunican entre si. Conectarlas podria reducir trabajo duplicado, aunque habria que ver caso por caso.`, stat: "Forrester: empresas integradas reducen 30% el tiempo administrativo" },
      { title: "Datos sin aprovechar", description: `En ${diagnosticData.industria || "tu industria"} es comun tener datos valiosos que no se estan usando para tomar decisiones. Es un area que podria valer la pena explorar.`, stat: "Gartner: 75% de empresas adoptaran IA operativa para 2026" },
    ];
  }

  // 3. Build premium HTML email
  const body = buildMiniAuditEmail(insights, diagnosticData, contactId, language);

  // 4. WhatsApp summary
  const waSummary = isEn
    ? `Hi ${diagnosticData.participante || ""}, we took a first look at your diagnostic for ${diagnosticData.empresa || ""} and there are some interesting areas to review together: ${insights.map(i => i.title).join(", ")}. We sent the details to your email. — IM3 Team`
    : `Hola ${diagnosticData.participante || ""}, le dimos una primera mirada a tu diagnostico de ${diagnosticData.empresa || ""} y hay algunas areas interesantes para revisar juntos: ${insights.map(i => i.title).join(", ")}. Te enviamos los detalles al correo. — Equipo IM3`;

  log(`Mini-auditoria generada para ${diagnosticData.empresa}`);
  return { subject, body, whatsappSummary: waSummary };
}

/**
 * Generate a re-engagement email for cold leads (completely different tone/approach).
 */
export async function generateReengagement(
  contact: Contact,
  diagnosticData: Partial<Diagnostic> | null,
  contactId: string,
  language: string = "es"
): Promise<{ subject: string; body: string }> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY not configured");

  const context = buildContext(diagnosticData);

  const subjectResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    temperature: 0.5,
    system: language === "en"
      ? "Generate ONLY the email subject text. No quotes, no prefix, just the text. Max 60 characters. Must be COMPLETELY different from diagnostic/audit emails. Intrigue with an industry fact or provocative question."
      : "Genera SOLO el texto del subject de un email. Sin comillas, sin prefijo, solo el texto. Máximo 60 caracteres. Debe ser COMPLETAMENTE diferente a emails de diagnóstico/auditoría. Intriga con un dato de su industria o pregunta provocadora.",
    messages: [{
      role: "user",
      content: language === "en"
        ? `Generate a re-engagement subject for a cold lead in ${diagnosticData?.industria || "business"} sector. DO NOT mention "audit", "diagnostic", "appointment" or "IM3". Focus on a surprising industry fact. Examples: "What 73% of ${diagnosticData?.industria || "companies"} don't know", "Is your team losing X hours per week on this?"`
        : `Genera un subject de re-engagement para un lead frío del sector ${diagnosticData?.industria || "empresas"}. NO mencionar "auditoría", "diagnóstico", "cita" ni "IM3". Enfócate en un dato sorprendente de su industria. Ejemplos: "Lo que el 73% de empresas de [industria] no saben", "¿Tu equipo pierde X horas por semana en esto?"`,
    }],
  });

  const subject = subjectResponse.content?.[0]?.type === "text"
    ? subjectResponse.content[0].text.trim()
    : language === "en" ? `Still thinking about automating ${contact.empresa}?` : `¿Sigues pensando en automatizar ${contact.empresa}?`;

  const bodyResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    temperature: 0.5,
    system: getSystemPrompt(language),
    messages: [{
      role: "user",
      content: language === "en"
        ? `Generate a RE-ENGAGEMENT email for a cold lead (hasn't opened previous emails).

STRATEGY: Break the pattern. DO NOT mention audit or diagnostic. Instead:
1. Open with a surprising fact or short story about their industry (${diagnosticData?.industria || "business"})
2. Connect that fact with a pain they probably have
3. Offer value without asking for anything: a concrete tip they can apply TODAY
4. Soft CTA: "If you'd like to see how to apply this at ${contact.empresa}, reply to this email"

Max 150 words. Tone: like someone sharing something useful, not someone selling.

${context}

Generate in PURE HTML with inline styles. Return ONLY the direct HTML. MINIMALIST design — no big header, no gradients. Just clean text with a link at the end. max-width:600px, font-family:'Segoe UI',Roboto,sans-serif.`
        : `Genera un email de RE-ENGAGEMENT para un lead frío (no ha abierto emails anteriores).

ESTRATEGIA: Romper el patrón. NO mencionar auditoría ni diagnóstico. En su lugar:
1. Abrir con un dato sorprendente o historia corta sobre su industria (${diagnosticData?.industria || "empresas"})
2. Conectar ese dato con un dolor que probablemente tienen
3. Ofrecer valor sin pedir nada: un tip concreto que puedan aplicar HOY
4. CTA suave: "Si quieres ver cómo aplicar esto en ${contact.empresa}, responde a este email"

Máximo 150 palabras. Tono: como alguien que comparte algo útil, no como alguien que vende.

${context}

Genera en HTML PURO con estilos inline. Devuelve SOLO el HTML directo. Diseño MINIMALISTA — sin header grande, sin gradientes. Solo texto limpio con un link al final. max-width:600px, font-family:'Segoe UI',Roboto,sans-serif.`,
    }],
  });

  let body = bodyResponse.content?.[0]?.type === "text"
    ? bodyResponse.content[0].text.trim()
    : "<p>Error generando contenido</p>";
  body = body.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  if (contactId) body = addEmailFooter(body, contactId, false, language);

  log(`Re-engagement email generado para ${contact.empresa}`);
  return { subject, body };
}

/**
 * Classify intent of an incoming WhatsApp message using AI.
 */
export async function classifyWhatsAppIntent(
  messageText: string,
  contact: Contact,
  diagnosticData: Partial<Diagnostic> | null
): Promise<{ type: "question" | "reschedule" | "interest" | "rejection" | "other"; confidence: number }> {
  const anthropic = getClient();
  if (!anthropic) return { type: "other", confidence: 0 };

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    temperature: 0.1,
    system: `Clasifica el intent de este mensaje de WhatsApp de un lead de consultoría tecnológica. Responde SOLO con un JSON: {"type": "question"|"reschedule"|"interest"|"rejection"|"other", "confidence": 0.0-1.0}
- question: pregunta sobre el servicio, auditoría, precios
- reschedule: quiere cambiar fecha/hora de su cita
- interest: muestra interés, entusiasmo, confirma, agradece
- rejection: no le interesa, pide que no le escriban
- other: saludo simple, mensaje no relacionado`,
    messages: [{
      role: "user",
      content: `Contacto: ${contact.nombre} de ${contact.empresa} (${contact.status})\nMensaje: "${messageText}"`,
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
  try {
    const parsed = JSON.parse(text);
    return { type: parsed.type || "other", confidence: parsed.confidence || 0.5 };
  } catch {
    return { type: "other", confidence: 0 };
  }
}

/**
 * Generate an AI response to a WhatsApp question, using diagnostic context.
 */
export async function generateWhatsAppAutoReply(
  questionText: string,
  contact: Contact,
  diagnosticData: Partial<Diagnostic> | null
): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) {
    return `Hola ${contact.nombre}, gracias por tu mensaje. Le paso tu consulta al equipo y te responderemos pronto. — Equipo IM3`;
  }

  const context = buildContext(diagnosticData);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    temperature: 0.3,
    system: `Responde un mensaje de WhatsApp como si fueras del equipo de IM3 Systems (empresa de TECNOLOGÍA, IA y automatización — NO médica). Máximo 3-4 oraciones. Texto plano (no HTML). Tono: profesional pero cercano. Responde basándote en el contexto del diagnóstico del cliente. Si no sabes algo, di que lo revisarás con el equipo. Firma: "— Equipo IM3". No uses emojis excesivos (máximo 1).`,
    messages: [{
      role: "user",
      content: `El contacto ${contact.nombre} de ${contact.empresa} pregunta por WhatsApp: "${questionText}"\n\n${context}`,
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
  return text || `Hola ${contact.nombre}, gracias por tu mensaje. Le paso tu consulta al equipo. — Equipo IM3`;
}

const INTENT_LABELS: Record<string, { emoji: string; label: string }> = {
  question: { emoji: "💬", label: "Pregunta" },
  reschedule: { emoji: "📅", label: "Quiere reagendar" },
  interest: { emoji: "🔥", label: "Muestra interés" },
  rejection: { emoji: "⚠️", label: "Rechazo" },
  other: { emoji: "💬", label: "Mensaje" },
};

export function buildWhatsAppNotificationEmail(
  contact: Contact,
  messageText: string,
  intent: { type: string; confidence: number },
  autoReply: string | null
): { subject: string; body: string } {
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";
  const info = INTENT_LABELS[intent.type] || INTENT_LABELS.other;
  const subject = `${info.emoji} ${info.label} de ${contact.nombre} por WhatsApp`;

  const autoReplySection = autoReply
    ? `<div style="margin:16px 0;padding:12px 16px;background:#f0fdf4;border-left:3px solid #22c55e;border-radius:4px">
        <p style="margin:0 0 4px;font-size:12px;color:#16a34a;font-weight:600">RESPUESTA AUTOMÁTICA ENVIADA:</p>
        <p style="margin:0;font-size:14px;color:#333">${autoReply}</p>
      </div>`
    : `<p style="margin:16px 0;padding:12px 16px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:4px;font-size:13px;color:#dc2626">No se envió respuesta automática — requiere acción manual.</p>`;

  const body = `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems — WhatsApp</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 4px;font-size:13px;color:#666">Contacto</p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:600">${contact.nombre} — ${contact.empresa || "Sin empresa"}</p>
    <p style="margin:0 0 4px;font-size:13px;color:#666">Intent detectado</p>
    <p style="margin:0 0 16px;font-size:14px">${info.emoji} ${info.label} <span style="color:#999">(confianza: ${Math.round(intent.confidence * 100)}%)</span></p>
    <div style="margin:0 0 16px;padding:12px 16px;background:#f8fafc;border-left:3px solid #3B82F6;border-radius:4px">
      <p style="margin:0 0 4px;font-size:12px;color:#3B82F6;font-weight:600">MENSAJE DEL LEAD:</p>
      <p style="margin:0;font-size:14px;color:#333">${messageText}</p>
    </div>
    ${autoReplySection}
    <p style="margin:20px 0 0;text-align:center"><a href="${baseUrl}/crm" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Ver en CRM →</a></p>
  </div>
</div>`;

  return { subject, body };
}

/**
 * Build a project notification email for the client portal.
 * Reusable template for all project-related notifications.
 */
export function buildProjectNotificationEmail(opts: {
  projectName: string;
  clientName: string;
  title: string;
  headerColor?: string;
  headerEmoji?: string;
  bodyLines: string[];
  ctaText: string;
  ctaUrl: string;
  footerNote?: string;
}): string {
  const { projectName, clientName, title, bodyLines, ctaText, ctaUrl, footerNote } = opts;
  const headerColor = opts.headerColor || "linear-gradient(135deg,#0F172A,#1E293B)";
  const headerEmoji = opts.headerEmoji || "📋";

  const bodyHtml = bodyLines.map(line => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#333">${line}</p>`).join("");

  return `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="background:${headerColor};padding:20px 28px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">${headerEmoji} ${title}</h1>
  </div>
  <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;background:#fff">
    <p style="margin:0 0 16px;font-size:15px;color:#333">Hola <strong>${clientName}</strong>,</p>
    ${bodyHtml}
    <div style="margin:24px 0 16px;text-align:center">
      <a href="${ctaUrl}" style="display:inline-block;background:#2FA4A9;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">${ctaText}</a>
    </div>
    ${footerNote ? `<p style="margin:16px 0 0;font-size:12px;color:#999;text-align:center">${footerNote}</p>` : ""}
    <p style="margin:24px 0 0;font-size:13px;color:#999;text-align:center">Proyecto: <strong>${projectName}</strong></p>
    <p style="margin:4px 0 0;font-size:11px;color:#bbb;text-align:center">— Equipo IM3 Systems</p>
  </div>
</div>`;
}
