import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const BLOG_SYSTEM_PROMPT = `Eres un escritor experto de contenido técnico para IM3 Systems, una empresa de tecnología especializada en inteligencia artificial, automatización y desarrollo de software para empresas en Latinoamérica.

Tu tarea es generar artículos de blog que:
- Despierten curiosidad sobre IA, automatización y tecnología
- Sean educativos pero accesibles — no jerga innecesaria
- Incluyan ejemplos prácticos y aplicaciones reales para negocios
- Tengan un tono profesional pero cercano, como un consultor tech que sabe lo que hace
- NO sean genéricos ni corporativos — deben tener sustancia y valor real
- Usen español latinoamericano (tuteo, no voseo)

El contenido debe ser HTML limpio con estas reglas:
- Usa <h2> para secciones principales y <h3> para subsecciones
- Usa <p> para párrafos, <ul>/<ol> para listas
- Usa <strong> y <em> para énfasis
- Usa <blockquote> para citas o datos destacados
- NO incluyas <h1> (el título se renderiza aparte)
- NO incluyas estilos inline ni clases CSS
- NO uses emojis excesivos`;

export async function generateBlogContent(
  prompt: string,
  language: "es" | "en" = "es"
): Promise<{
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
} | null> {
  const ai = getClient();
  if (!ai) return null;

  try {
    const langInstruction = language === "en"
      ? "Write the article in English."
      : "Escribe el artículo en español latinoamericano.";

    const response = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: BLOG_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${langInstruction}

Genera un artículo de blog basado en esta idea: "${prompt}"

Responde SOLO con un JSON válido (sin markdown, sin backticks) con esta estructura:
{
  "title": "Título del artículo (máximo 70 caracteres)",
  "excerpt": "Resumen atractivo del artículo (máximo 160 caracteres)",
  "content": "Contenido HTML completo del artículo (mínimo 800 palabras)",
  "metaTitle": "Título SEO (máximo 60 caracteres)",
  "metaDescription": "Meta descripción SEO (máximo 155 caracteres)",
  "tags": ["tag1", "tag2", "tag3"]
}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err: any) {
    log(`Error generating blog content: ${err?.message}`);
    return null;
  }
}

export async function improveBlogContent(
  content: string,
  instruction: string,
  language: "es" | "en" = "es"
): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  try {
    const response = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: BLOG_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Mejora el siguiente contenido HTML de blog según esta instrucción: "${instruction}"

${language === "en" ? "Keep the content in English." : "Mantén el contenido en español."}

Contenido actual:
${content}

Responde SOLO con el HTML mejorado, sin explicaciones ni markdown.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return text;
  } catch (err: any) {
    log(`Error improving blog content: ${err?.message}`);
    return null;
  }
}
