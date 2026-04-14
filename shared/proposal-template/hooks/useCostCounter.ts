import { useEffect } from "react";

type Refs = {
  wrapRef: React.RefObject<HTMLElement | null>;
  counterRef: React.RefObject<HTMLElement | null>;
  meterRef: React.RefObject<HTMLElement | null>;
};

function formatCOP(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "K";
  return "$" + Math.round(n);
}

export function useCostCounter({ wrapRef, counterRef, meterRef }: Refs, monthlyLossCOP: number, enabled: boolean) {
  useEffect(() => {
    const wrap = wrapRef.current;
    const counter = counterRef.current;
    const meter = meterRef.current;
    if (!wrap || !counter || !meter || !enabled || monthlyLossCOP <= 0) return;

    const lossPerMs = monthlyLossCOP / (30 * 24 * 60 * 60 * 1000);
    let rafId: number | null = null;
    let startTime: number | null = null;
    let running = false;

    const tick = (ts: number) => {
      if (startTime === null) startTime = ts;
      const elapsed = ts - startTime;
      const loss = elapsed * lossPerMs;
      counter.textContent = formatCOP(loss);
      const pct = Math.min((elapsed / (5 * 60 * 1000)) * 100, 100);
      meter.style.width = pct + "%";
      if (running) rafId = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !running) {
            running = true;
            rafId = requestAnimationFrame(tick);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 },
    );
    observer.observe(wrap);

    return () => {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [wrapRef, counterRef, meterRef, monthlyLossCOP, enabled]);
}
