import { useRef } from "react";
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
import { Testimonials } from "./sections/Testimonials";
import { Pricing } from "./sections/Pricing";
import { OperationalCosts } from "./sections/OperationalCosts";
import { CTA } from "./sections/CTA";

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

  return (
    <div className="proposal-template" ref={rootRef}>
      <nav className="pt-nav">
        <div className="pt-nav-brand">
          <div className="pt-nav-logo">IM3</div>
          <div className="pt-nav-label">
            <strong>Propuesta Comercial</strong>
            {data.meta.clientName}
          </div>
        </div>
        <div className="pt-nav-progress" ref={progressBarRef} />
      </nav>

      <Hero data={data.hero} meta={data.meta} />
      <div className="pt-divider" />
      <Summary data={data.summary} />
      <div className="pt-divider" />
      <Problem data={data.problem} interactive={interactive} />
      <div className="pt-divider" />
      <Solution data={data.solution} />
      <div className="pt-divider" />
      <Tech data={data.tech} />
      <div className="pt-divider" />
      <Timeline data={data.timeline} />
      <div className="pt-divider" />
      <ROI data={data.roi} interactive={interactive} />
      <div className="pt-divider" />
      <Authority data={data.authority} />
      <div className="pt-divider" />
      <Testimonials items={data.testimonials} />
      <div className="pt-divider" />
      <Pricing data={data.pricing} />
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
          <div className="pt-nav-logo" style={{ width: 26, height: 26, fontSize: "0.75rem" }}>
            IM3
          </div>
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
