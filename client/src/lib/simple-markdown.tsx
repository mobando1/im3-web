import { ReactNode } from "react";

/**
 * Parser Markdown minimalista — sin dependencias externas.
 * Soporta lo necesario para contratos:
 *   # / ## / ###  → h1/h2/h3
 *   **bold**      → strong
 *   *italic*      → em
 *   - item        → ul/li
 *   1. item       → ol/li
 *   ---           → hr
 *   `code`        → code inline
 *   {{var}}       → span resaltado (variable sin resolver)
 *   párrafos en blanco se separan
 *   tablas pipes  → table/tr/td (con header row separator |---|)
 *
 * Lo que NO soporta: links, imágenes, blockquotes, code blocks fenced — no son
 * necesarios para contratos legales. Si se necesitan, considerar instalar react-markdown.
 */

type Token =
  | { type: "h1" | "h2" | "h3"; content: string }
  | { type: "hr" }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; content: string }
  | { type: "table"; header: string[]; rows: string[][] };

function parseInline(text: string): ReactNode[] {
  // Procesamos secuencialmente: variables, code, bold, italic
  // Usamos un único pass con regex compuesto preservando orden
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Regex que captura cualquiera de los patrones
  const re = /(\{\{[a-zA-Z_][\w.]*\}\})|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/;

  while (remaining.length > 0) {
    const match = re.exec(remaining);
    if (!match) {
      parts.push(remaining);
      break;
    }
    if (match.index > 0) parts.push(remaining.substring(0, match.index));

    const matched = match[0];
    if (matched.startsWith("{{")) {
      parts.push(<span key={key++} className="bg-amber-100 text-amber-800 px-1 rounded text-[0.85em] font-mono">{matched}</span>);
    } else if (matched.startsWith("`")) {
      parts.push(<code key={key++} className="bg-gray-100 px-1 rounded text-[0.9em] font-mono">{matched.slice(1, -1)}</code>);
    } else if (matched.startsWith("**")) {
      parts.push(<strong key={key++}>{matched.slice(2, -2)}</strong>);
    } else if (matched.startsWith("*")) {
      parts.push(<em key={key++}>{matched.slice(1, -1)}</em>);
    }

    remaining = remaining.substring(match.index + matched.length);
  }

  return parts;
}

function tokenize(md: string): Token[] {
  const lines = md.split("\n");
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Líneas vacías separan bloques
    if (!trimmed) { i++; continue; }

    // Headers
    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      tokens.push({ type: (`h${level}` as "h1" | "h2" | "h3"), content: hMatch[2] });
      i++;
      continue;
    }

    // HR
    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      tokens.push({ type: "hr" });
      i++;
      continue;
    }

    // Tabla — detectamos por presencia de | + linea separadora |---|
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s|:-]+\|?\s*$/.test(lines[i + 1])) {
      const headerCells = line.split("|").map(c => c.trim()).filter(Boolean);
      const rows: string[][] = [];
      i += 2; // saltamos header + separador
      while (i < lines.length && lines[i].includes("|")) {
        const cells = lines[i].split("|").map(c => c.trim()).filter((_, idx, arr) => {
          // mantener celdas internas — split deja vacíos en bordes si la línea empieza/termina con |
          return arr.length > 0;
        });
        // Filtrar primer y último vacío si el line empieza/termina con |
        const filtered = cells.filter((c, idx) => !(c === "" && (idx === 0 || idx === cells.length - 1)));
        rows.push(filtered);
        i++;
      }
      tokens.push({ type: "table", header: headerCells, rows });
      continue;
    }

    // UL
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      tokens.push({ type: "ul", items });
      continue;
    }

    // OL
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      tokens.push({ type: "ol", items });
      continue;
    }

    // Paragraph — acumular hasta línea vacía o bloque nuevo
    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (/^(#{1,3})\s+/.test(next)) break;
      if (/^[-*]\s+/.test(next)) break;
      if (/^\d+\.\s+/.test(next)) break;
      if (/^(---+|\*\*\*+|___+)$/.test(next)) break;
      if (next.includes("|") && i + 1 < lines.length && /^\s*\|?[\s|:-]+\|?\s*$/.test(lines[i + 1])) break;
      para.push(next);
      i++;
    }
    tokens.push({ type: "p", content: para.join(" ") });
  }

  return tokens;
}

export function SimpleMarkdown({ source, className }: { source: string; className?: string }) {
  const tokens = tokenize(source);
  return (
    <div className={`prose-contract ${className || ""}`}>
      {tokens.map((t, idx) => {
        if (t.type === "h1") return <h1 key={idx} className="text-2xl font-bold mt-6 mb-3 border-b pb-2">{parseInline(t.content)}</h1>;
        if (t.type === "h2") return <h2 key={idx} className="text-xl font-semibold mt-5 mb-2.5">{parseInline(t.content)}</h2>;
        if (t.type === "h3") return <h3 key={idx} className="text-base font-semibold mt-4 mb-1.5">{parseInline(t.content)}</h3>;
        if (t.type === "hr") return <hr key={idx} className="my-6 border-gray-200" />;
        if (t.type === "p") return <p key={idx} className="my-3 leading-relaxed text-gray-800">{parseInline(t.content)}</p>;
        if (t.type === "ul") return (
          <ul key={idx} className="list-disc pl-6 my-3 space-y-1">
            {t.items.map((it, i) => <li key={i} className="leading-relaxed">{parseInline(it)}</li>)}
          </ul>
        );
        if (t.type === "ol") return (
          <ol key={idx} className="list-decimal pl-6 my-3 space-y-1">
            {t.items.map((it, i) => <li key={i} className="leading-relaxed">{parseInline(it)}</li>)}
          </ol>
        );
        if (t.type === "table") return (
          <div key={idx} className="my-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 bg-gray-50">
                  {t.header.map((h, i) => <th key={i} className="text-left px-3 py-2 font-semibold">{parseInline(h)}</th>)}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{parseInline(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        return null;
      })}
    </div>
  );
}

/**
 * Extrae todas las variables `{{namespace.key}}` referenciadas en un template Markdown.
 * Útil para mostrar en UI qué variables se necesitan + autocompletado.
 */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    found.add(m[1]);
  }
  return Array.from(found).sort();
}
