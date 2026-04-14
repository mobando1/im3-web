import { useEffect } from "react";

type BarRef = { ref: React.RefObject<HTMLElement | null>; targetWidthPct: number; delayMs: number };

export function useAnimatedBars(containerRef: React.RefObject<HTMLElement | null>, bars: BarRef[], enabled: boolean) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled || bars.length === 0) return;

    const timeouts: number[] = [];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            bars.forEach(({ ref, targetWidthPct, delayMs }) => {
              const el = ref.current;
              if (!el) return;
              const id = window.setTimeout(() => {
                el.style.width = targetWidthPct + "%";
              }, delayMs);
              timeouts.push(id);
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    observer.observe(container);

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      observer.disconnect();
    };
  }, [containerRef, bars, enabled]);
}
