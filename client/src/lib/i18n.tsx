import { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { translations, type Language, type Translations } from '@shared/landing-defaults';
import { deepMerge } from '@shared/cms-merge';

// El copy base vive en shared/landing-defaults.ts (lo necesitan cliente y servidor).
// Re-exportamos para no romper a los consumidores existentes de '@/lib/i18n'.
export { translations };
export type { Language, Translations };

// Overrides publicados por el CMS, por idioma. Forma: { es?: {...}, en?: {...} }.
// `unknown` porque es un DeepPartial<Translations> que deepMerge valida en runtime.
type CmsContent = Partial<Record<Language, unknown>>;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('es');

  // Si la URL trae ?cms_preview=<token> (el iframe del editor), pedimos el BORRADOR;
  // si no, el contenido publicado. Así el preview del editor muestra el draft.
  const previewToken =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('cms_preview')
      : null;

  // Contenido del CMS. NUNCA throwea: ante cualquier fallo devuelve {} y el merge
  // cae a los defaults → el sitio se ve idéntico a hoy.
  const { data: cms } = useQuery<CmsContent>({
    queryKey: ['/api/cms/landing', previewToken],
    queryFn: async () => {
      try {
        const url = previewToken
          ? `/api/cms/landing?preview=${encodeURIComponent(previewToken)}`
          : '/api/cms/landing';
        const res = await fetch(url);
        if (!res.ok) return {};
        return (await res.json()) as CmsContent;
      } catch {
        return {};
      }
    },
    staleTime: previewToken ? 0 : 5 * 60 * 1000, // en preview, siempre fresco
    retry: 1,
  });

  // Defaults con los overrides publicados superpuestos. Con published = {} esto es
  // idéntico a translations[language] (cero cambio de comportamiento).
  const t = useMemo(
    () => deepMerge(translations[language], cms?.[language]),
    [language, cms],
  );

  const value: I18nContextType = { language, setLanguage, t };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
