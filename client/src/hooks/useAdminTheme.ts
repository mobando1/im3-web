import { useCallback, useEffect, useState } from "react";

// Tema del admin, independiente del sitio público (que usa useDarkMode + la clave
// "im3-dark-mode"). Default OSCURO: el camino de demo (login→dashboard→pipeline→
// contactos→agents) está migrado a tokens y dark-ready, así que oscuro da la
// continuidad premium login→app. El toggle deja pasar a claro (también pulido).
// (Páginas fuera del demo aún migran a tokens; ver rediseño "Teal Instrument".)
// Aplica .dark al <html> (no a un wrapper) para que portales — Dialog, Sheet,
// Command, Sonner — hereden el tema. Al salir de /admin se restaura la preferencia
// del sitio público; entre rutas /admin no se toca (evita parpadeo en cada nav).
const KEY = "im3-admin-theme";
type Theme = "dark" | "light";

function publicPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("im3-dark-mode");
  if (stored !== null) return stored === "true";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDark(on: boolean) {
  document.documentElement.classList.toggle("dark", on);
}

export function useAdminTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(KEY) as Theme | null) ?? "dark";
  });

  useEffect(() => {
    applyDark(theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // Restaurar el tema del sitio público SOLO al abandonar /admin (no entre rutas
  // admin, que remontan el layout en cada navegación).
  useEffect(() => {
    return () => {
      if (!window.location.pathname.startsWith("/admin")) {
        applyDark(publicPrefersDark());
      }
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, isDark: theme === "dark", toggle };
}
