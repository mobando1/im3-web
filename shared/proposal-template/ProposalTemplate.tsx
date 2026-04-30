import { useEffect, useRef } from "react";
import type { ProposalData } from "./types";
import { useRevealOnScroll } from "./hooks/useRevealOnScroll";
import { useScrollProgress } from "./hooks/useScrollProgress";
import { Hero } from "./sections/Hero";
import { Summary } from "./sections/Summary";
import { Problem } from "./sections/Problem";
import { Solution } from "./sections/Solution";
import { Tech } from "./sections/Tech";
import { Timeline } from "./sections/Timeline";
import { ROI } from "./sections/ROI";
import { Authority } from "./sections/Authority";
import { Pricing } from "./sections/Pricing";
import { Hardware } from "./sections/Hardware";
import { OperationalCosts } from "./sections/OperationalCosts";
import { CTA } from "./sections/CTA";
// import { Testimonials } from "./sections/Testimonials"; // removida por ahora — revivir cuando hayan casos reales

import "./styles/tokens.css";
import "./styles/template.css";
import "./styles/print.css";

export type ProposalTemplateProps = {
  data: ProposalData;
  interactive?: boolean;
  onAccept?: () => void;
  onFallback?: () => void;
};

export function ProposalTemplate({
  data,
  interactive = true,
  onAccept,
  onFallback,
}: ProposalTemplateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useRevealOnScroll(rootRef, interactive);
  useScrollProgress(progressBarRef, interactive);

  // Marca <html data-pdf="1"> cuando la URL tiene ?pdf=1 (puppeteer)
  // para que el CSS oculte elementos interactivos (nav, CTAs, modales).
  const isPdfCapture = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("pdf") === "1";
  useEffect(() => {
    if (!isPdfCapture) return;
    document.documentElement.setAttribute("data-pdf", "1");
    return () => document.documentElement.removeAttribute("data-pdf");
  }, [isPdfCapture]);

  return (
    <div className={`proposal-template${isPdfCapture ? " pt-pdf-mode" : ""}`} ref={rootRef}>
      <nav className="pt-nav">
        <div className="pt-nav-brand">
          <img src="/assets/im3-logo.png" alt="IM3 Systems" className="pt-nav-logo-img" />
          <div className="pt-nav-label">
            <strong>Propuesta Comercial</strong>
            {data.meta.clientName}
          </div>
        </div>
        <div className="pt-nav-progress" ref={progressBarRef} />
      </nav>

      <Hero data={data.hero} meta={data.meta} />
      {data.summary && (
        <>
          <div className="pt-divider" />
          <Summary data={data.summary} />
        </>
      )}
      {data.problem && (
        <>
          <div className="pt-divider" />
          <Problem data={data.problem} interactive={interactive} />
        </>
      )}
      <div className="pt-divider" />
      <Solution data={data.solution} />
      {data.tech && (
        <>
          <div className="pt-divider" />
          <Tech data={data.tech} />
        </>
      )}
      {data.timeline && (
        <>
          <div className="pt-divider" />
          <Timeline data={data.timeline} />
        </>
      )}
      {data.roi && (
        <>
          <div className="pt-divider" />
          <ROI data={data.roi} interactive={interactive} />
        </>
      )}
      {data.authority && (
        <>
          <div className="pt-divider" />
          <Authority data={data.authority} />
        </>
      )}
      <div className="pt-divider" />
      <Pricing data={data.pricing} />
      {data.hardware && data.hardware.items && data.hardware.items.length > 0 && (
        <>
          <div className="pt-divider" />
          <Hardware data={data.hardware} />
        </>
      )}
      {data.operationalCosts && (
        <>
          <div className="pt-divider" />
          <OperationalCosts data={data.operationalCosts} />
        </>
      )}
      <div className="pt-divider" />
      <CTA data={data.cta} onAccept={onAccept} onFallback={onFallback} />

      <footer className="pt-footer">
        <div className="pt-footer-brand">
          <img src="/assets/im3-logo.png" alt="IM3 Systems" className="pt-footer-logo-img" />
          <span className="pt-footer-brand-name">IM3 Systems</span>
        </div>
        <div className="pt-footer-links">
          <span>info@im3systems.com</span>
          <span>www.im3systems.com</span>
          <span>Colombia · España · Latinoamérica</span>
        </div>
        <div className="pt-footer-confidential">
          Esta propuesta es confidencial y fue preparada exclusivamente para {data.meta.clientName}.
        </div>
      </footer>
    </div>
  );
}

export default ProposalTemplate;
