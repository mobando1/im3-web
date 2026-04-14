import { useEffect } from "react";

export function useRevealOnScroll(rootRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    root.classList.add("pt-js-loaded");

    const elements = Array.from(root.querySelectorAll<HTMLElement>(".pt-reveal"));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const idx = elements.indexOf(el);
            window.setTimeout(() => el.classList.add("pt-visible"), (idx % 5) * 80);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.08 },
    );

    elements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      root.classList.remove("pt-js-loaded");
    };
  }, [rootRef, enabled]);
}
