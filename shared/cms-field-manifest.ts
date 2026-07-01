// Manifiesto de campos editables del landing.
//
// Es el CONTRATO entre el editor (UI) y el árbol de contenido (landing-defaults).
// Define QUÉ se puede editar (whitelist), con qué etiqueta, qué tipo de input y
// qué largo máximo. Lo que NO está aquí está BLOQUEADO: estructura, layout,
// iconos, orden de secciones. El cliente edita, no destruye el reino.
//
// Vive en shared/ porque lo usan el cliente (genera el formulario) y el servidor
// (guards: valida que cada edición apunte a una key legal).
//
// Las paths son relativas a la raíz de un idioma (translations.es / .en):
//   "hero.headline", "services.internalApps", etc.
// Las listas (testimonials, faq, ...) describen los campos de CADA ítem; el editor
// los repite por índice. En V1 las filas se editan en sitio (no se agregan/borran).

export type FieldKind = "text" | "textarea" | "image";

export interface FieldDef {
  /** Path relativa a la raíz del idioma, p.ej. "hero.headline" */
  path: string;
  label: string;
  kind: FieldKind;
  /** Largo máximo sugerido (también lo aplican los guards). */
  maxLen?: number;
}

export interface ListDef {
  /** Path del array, p.ej. "testimonials.reviews" */
  path: string;
  label: string;
  /** Etiqueta de cada ítem, p.ej. "Testimonio" */
  itemLabel: string;
  /** Campos relativos a cada ítem del array, p.ej. { path: "quote", ... } */
  fields: FieldDef[];
}

export interface SectionDef {
  key: string;
  label: string;
  fields?: FieldDef[];
  lists?: ListDef[];
}

export const CMS_MANIFEST: SectionDef[] = [
  {
    key: "hero",
    label: "Encabezado (Hero)",
    fields: [
      { path: "hero.badge", label: "Badge", kind: "text", maxLen: 60 },
      { path: "hero.headline", label: "Titular", kind: "text", maxLen: 90 },
      { path: "hero.subheadline", label: "Subtítulo", kind: "textarea", maxLen: 280 },
      { path: "hero.cta", label: "Botón principal", kind: "text", maxLen: 40 },
      { path: "hero.secondary", label: "Botón secundario", kind: "text", maxLen: 40 },
    ],
  },
  {
    key: "priorities",
    label: "Lo que priorizamos",
    fields: [
      { path: "priorities.title", label: "Título", kind: "text", maxLen: 80 },
      { path: "priorities.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 240 },
      { path: "priorities.clearExecution", label: "Pilar 1 — título", kind: "text", maxLen: 60 },
      { path: "priorities.clearExecutionDesc", label: "Pilar 1 — descripción", kind: "textarea", maxLen: 240 },
      { path: "priorities.structure", label: "Pilar 2 — título", kind: "text", maxLen: 60 },
      { path: "priorities.structureDesc", label: "Pilar 2 — descripción", kind: "textarea", maxLen: 240 },
      { path: "priorities.maintainable", label: "Pilar 3 — título", kind: "text", maxLen: 60 },
      { path: "priorities.maintainableDesc", label: "Pilar 3 — descripción", kind: "textarea", maxLen: 240 },
    ],
  },
  {
    key: "credibility",
    label: "Métricas de credibilidad",
    fields: [
      { path: "credibility.systems", label: "Métrica 1 — número", kind: "text", maxLen: 10 },
      { path: "credibility.systemsLabel", label: "Métrica 1 — etiqueta", kind: "text", maxLen: 60 },
      { path: "credibility.industries", label: "Métrica 2 — número", kind: "text", maxLen: 10 },
      { path: "credibility.industriesLabel", label: "Métrica 2 — etiqueta", kind: "text", maxLen: 60 },
      { path: "credibility.conversion", label: "Métrica 3 — número", kind: "text", maxLen: 10 },
      { path: "credibility.conversionLabel", label: "Métrica 3 — etiqueta", kind: "text", maxLen: 80 },
    ],
  },
  {
    key: "services",
    label: "¿Qué construimos?",
    fields: [
      { path: "services.title", label: "Título", kind: "text", maxLen: 80 },
      { path: "services.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 240 },
      { path: "services.internalApps", label: "Servicio 1 — título", kind: "text", maxLen: 60 },
      { path: "services.internalAppsDesc", label: "Servicio 1 — descripción", kind: "textarea", maxLen: 280 },
      { path: "services.automation", label: "Servicio 2 — título", kind: "text", maxLen: 60 },
      { path: "services.automationDesc", label: "Servicio 2 — descripción", kind: "textarea", maxLen: 280 },
      { path: "services.controlSystems", label: "Servicio 3 — título", kind: "text", maxLen: 60 },
      { path: "services.controlSystemsDesc", label: "Servicio 3 — descripción", kind: "textarea", maxLen: 280 },
    ],
  },
  {
    key: "leadMagnet",
    label: "Diagnóstico gratuito (Lead magnet)",
    fields: [
      { path: "leadMagnet.badge", label: "Badge", kind: "text", maxLen: 30 },
      { path: "leadMagnet.title", label: "Título", kind: "text", maxLen: 80 },
      { path: "leadMagnet.description", label: "Descripción", kind: "textarea", maxLen: 320 },
      { path: "leadMagnet.cta", label: "Botón", kind: "text", maxLen: 40 },
    ],
  },
  {
    key: "process",
    label: "Cómo trabajamos",
    fields: [
      { path: "process.title", label: "Título", kind: "text", maxLen: 80 },
      { path: "process.cycleLabel", label: "Etiqueta del ciclo", kind: "text", maxLen: 60 },
    ],
    lists: [
      {
        path: "process.steps",
        label: "Pasos",
        itemLabel: "Paso",
        fields: [
          { path: "title", label: "Título", kind: "text", maxLen: 60 },
          { path: "text", label: "Descripción", kind: "textarea", maxLen: 320 },
        ],
      },
    ],
  },
  {
    key: "targetAudience",
    label: "¿Con quién trabajamos?",
    fields: [
      { path: "targetAudience.title", label: "Título", kind: "text", maxLen: 80 },
      { path: "targetAudience.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 240 },
      { path: "targetAudience.fitsYouIf", label: "Encabezado 'somos buena elección'", kind: "text", maxLen: 80 },
      { path: "targetAudience.notForYou", label: "Encabezado 'no somos la mejor opción'", kind: "text", maxLen: 80 },
    ],
  },
  {
    key: "testimonials",
    label: "Testimonios",
    fields: [
      { path: "testimonials.title", label: "Título", kind: "text", maxLen: 80 },
      { path: "testimonials.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 200 },
      { path: "testimonials.featuredLabel", label: "Etiqueta 'destacado'", kind: "text", maxLen: 40 },
    ],
    lists: [
      {
        path: "testimonials.reviews",
        label: "Reseñas",
        itemLabel: "Reseña",
        fields: [
          { path: "quote", label: "Cita", kind: "textarea", maxLen: 400 },
          { path: "author", label: "Autor", kind: "text", maxLen: 60 },
          { path: "role", label: "Cargo · Empresa", kind: "text", maxLen: 80 },
          { path: "image", label: "Foto (URL)", kind: "image", maxLen: 300 },
        ],
      },
    ],
  },
  {
    key: "offer",
    label: "Modelos de trabajo",
    fields: [
      { path: "offer.title", label: "Título", kind: "text", maxLen: 60 },
      { path: "offer.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 200 },
      { path: "offer.fullImplementation", label: "Modelo 1 — título", kind: "text", maxLen: 60 },
      { path: "offer.fullImplementationDesc", label: "Modelo 1 — descripción", kind: "textarea", maxLen: 320 },
      { path: "offer.fullImplementationBenefit", label: "Modelo 1 — beneficio", kind: "textarea", maxLen: 160 },
      { path: "offer.strategicGuidance", label: "Modelo 2 — título", kind: "text", maxLen: 60 },
      { path: "offer.strategicGuidanceDesc", label: "Modelo 2 — descripción", kind: "textarea", maxLen: 320 },
      { path: "offer.strategicGuidanceBenefit", label: "Modelo 2 — beneficio", kind: "textarea", maxLen: 160 },
      { path: "offer.noSalesPressure", label: "Sin presión — título", kind: "text", maxLen: 60 },
      { path: "offer.noSalesPressureDesc", label: "Sin presión — descripción", kind: "textarea", maxLen: 320 },
      { path: "offer.scheduleConversation", label: "Botón", kind: "text", maxLen: 40 },
    ],
  },
  {
    key: "faq",
    label: "Preguntas frecuentes",
    fields: [
      { path: "faq.title", label: "Título", kind: "text", maxLen: 60 },
      { path: "faq.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 200 },
    ],
    lists: [
      {
        path: "faq.items",
        label: "Preguntas",
        itemLabel: "Pregunta",
        fields: [
          { path: "question", label: "Pregunta", kind: "text", maxLen: 160 },
          { path: "answer", label: "Respuesta", kind: "textarea", maxLen: 600 },
        ],
      },
    ],
  },
  {
    key: "caseStudies",
    label: "Casos de éxito",
    fields: [
      { path: "caseStudies.title", label: "Título", kind: "text", maxLen: 80 },
      { path: "caseStudies.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 200 },
    ],
    lists: [
      {
        path: "caseStudies.cases",
        label: "Casos",
        itemLabel: "Caso",
        fields: [
          { path: "empresa", label: "Empresa", kind: "text", maxLen: 60 },
          { path: "industria", label: "Industria", kind: "text", maxLen: 40 },
          { path: "solucion", label: "Solución", kind: "textarea", maxLen: 160 },
          { path: "resultado", label: "Resultado", kind: "textarea", maxLen: 160 },
        ],
      },
    ],
  },
  {
    key: "contact",
    label: "Contacto / cierre",
    fields: [
      { path: "contact.title", label: "Título", kind: "textarea", maxLen: 160 },
      { path: "contact.subtitle", label: "Subtítulo", kind: "textarea", maxLen: 200 },
      { path: "contact.scheduleCall", label: "Botón", kind: "text", maxLen: 40 },
    ],
  },
  {
    key: "footer",
    label: "Footer",
    fields: [
      { path: "footer.copyright", label: "Copyright", kind: "text", maxLen: 60 },
    ],
  },
];

// ── Helpers derivados del manifiesto (usados por guards y UI) ──

/** Set de paths exactas de campos NO-lista (p.ej. "hero.headline"). */
export const EDITABLE_FIELD_PATHS: ReadonlySet<string> = new Set(
  CMS_MANIFEST.flatMap((s) => (s.fields ?? []).map((f) => f.path)),
);

/** Lista de defs de array, para validar paths indexadas tipo "<list>.<i>.<field>". */
export const EDITABLE_LISTS: ReadonlyArray<ListDef> = CMS_MANIFEST.flatMap(
  (s) => s.lists ?? [],
);

/** maxLen de una path concreta (campo simple o campo de ítem de lista). undefined si no aplica. */
export function maxLenForPath(path: string): number | undefined {
  for (const s of CMS_MANIFEST) {
    for (const f of s.fields ?? []) {
      if (f.path === path) return f.maxLen;
    }
  }
  for (const list of EDITABLE_LISTS) {
    const m = path.match(new RegExp(`^${escapeRe(list.path)}\\.(\\d+)\\.(.+)$`));
    if (m) {
      const sub = list.fields.find((f) => f.path === m[2]);
      if (sub) return sub.maxLen;
    }
  }
  return undefined;
}

/** kind de una path concreta. undefined si la path no es editable. */
export function kindForPath(path: string): FieldKind | undefined {
  for (const s of CMS_MANIFEST) {
    for (const f of s.fields ?? []) {
      if (f.path === path) return f.kind;
    }
  }
  for (const list of EDITABLE_LISTS) {
    const m = path.match(new RegExp(`^${escapeRe(list.path)}\\.(\\d+)\\.(.+)$`));
    if (m) {
      const sub = list.fields.find((f) => f.path === m[2]);
      if (sub) return sub.kind;
    }
  }
  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
