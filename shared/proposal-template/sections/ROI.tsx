import { useMemo, useRef } from "react";
import type { ROIData } from "../types";
import { useAnimatedBars } from "../hooks/useAnimatedBars";

type Props = {
  data: ROIData;
  interactive: boolean;
};

export function ROI({ data, interactive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barDangerRef = useRef<HTMLDivElement>(null);
  const barTealRef = useRef<HTMLDivElement>(null);

  const bars = useMemo(
    () => [
      { ref: barDangerRef, targetWidthPct: data.comparison.withoutWeight, delayMs: 200 },
      { ref: barTealRef, targetWidthPct: data.comparison.investmentWeight, delayMs: 600 },
    ],
    [data.comparison.withoutWeight, data.comparison.investmentWeight],
  );

  useAnimatedBars(containerRef, bars, interactive);

  return (
    <section>
      <div className="pt-container">
        <div className="pt-section-label">Retorno de Inversión</div>
        <h2 className="pt-timeline-heading pt-reveal" dangerouslySetInnerHTML={{ __html: data.heading }} />

        <div className="pt-roi-grid">
          {data.recoveries.map((r, i) => (
            <div key={i} className="pt-roi-card pt-reveal">
              <div className="pt-roi-figure">{r.amount}</div>
              <div className="pt-roi-currency">{r.currency}</div>
              <div className="pt-roi-label">{r.label}</div>
            </div>
          ))}
        </div>

        <div className="pt-roi-comparison pt-reveal" ref={containerRef}>
          <div className="pt-roi-comparison-title">
            Comparativa: no actuar vs. implementar
          </div>
          <div className="pt-bar-row">
            <div className="pt-bar-label">{data.comparison.withoutLabel}</div>
            <div className="pt-bar-track">
              <div
                className="pt-bar-fill pt-danger"
                ref={barDangerRef}
                style={interactive ? undefined : { width: `${data.comparison.withoutWeight}%` }}
              >
                {data.comparison.withoutAmount}
              </div>
            </div>
            <div className="pt-bar-value" style={{ color: "var(--pt-danger)" }}>
              {data.comparison.withoutAmount}
            </div>
          </div>
          <div className="pt-bar-row">
            <div className="pt-bar-label">{data.comparison.investmentLabel}</div>
            <div className="pt-bar-track">
              <div
                className="pt-bar-fill pt-teal"
                ref={barTealRef}
                style={interactive ? undefined : { width: `${data.comparison.investmentWeight}%` }}
              >
                {data.comparison.investmentAmount}
              </div>
            </div>
            <div className="pt-bar-value" style={{ color: "var(--pt-teal)" }}>
              {data.comparison.investmentAmount}
            </div>
          </div>
          <p
            className="pt-roi-comparison-footnote"
            dangerouslySetInnerHTML={{ __html: data.comparison.caption }}
          />
        </div>

        <div className="pt-roi-hero-card pt-reveal">
          <div>
            <div className="pt-roi-hero-title">{data.heroTitle}</div>
            <div className="pt-roi-hero-desc">{data.heroDescription}</div>
          </div>
          <div>
            <div className="pt-roi-big">
              {data.roiPercent}
              <span>ROI · {data.paybackMonths}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
