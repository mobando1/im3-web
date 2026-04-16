import { useRef } from "react";
import type { ProblemData } from "../types";
import { useCostCounter } from "../hooks/useCostCounter";

type Props = {
  data: ProblemData;
  interactive: boolean;
};

export function Problem({ data, interactive }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);

  useCostCounter(
    { wrapRef, counterRef, meterRef },
    data.monthlyLossCOP,
    interactive,
  );

  return (
    <section className="pt-problem-section">
      <div className="pt-container">
        <div className="pt-section-label">El Problema</div>
        <h2 className="pt-problem-heading pt-reveal" dangerouslySetInnerHTML={{ __html: data.intro }} />

        <div className="pt-cost-counter-wrap pt-reveal" ref={wrapRef}>
          <div className="pt-cost-counter-label">
            Pérdida acumulada desde que abriste esta propuesta
          </div>
          <div className="pt-cost-counter-row">
            <div className="pt-cost-counter" ref={counterRef}>
              $0
            </div>
            <div
              className="pt-cost-counter-desc"
              dangerouslySetInnerHTML={{ __html: data.counterDescription }}
            />
          </div>
          <div className="pt-cost-meter">
            <div className="pt-cost-meter-fill" ref={meterRef} />
          </div>
          {data.calculationBreakdown && (
            <div className="pt-cost-breakdown">
              <div className="pt-cost-breakdown-label">Cómo calculamos esto</div>
              <p dangerouslySetInnerHTML={{ __html: data.calculationBreakdown }} />
            </div>
          )}
        </div>

        <div className="pt-problems-grid">
          {data.problemCards.map((card, i) => (
            <div key={i} className="pt-problem-card pt-reveal">
              <div className="pt-problem-icon">{card.icon}</div>
              <h4>{card.title}</h4>
              <p>{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
