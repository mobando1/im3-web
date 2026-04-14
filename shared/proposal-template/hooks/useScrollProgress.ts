import { useEffect } from "react";

export function useScrollProgress(barRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !enabled) return;

    const handler = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      bar.style.width = Math.min(pct, 100) + "%";
    };

    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [barRef, enabled]);
}
