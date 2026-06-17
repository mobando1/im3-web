import type { TimelineData } from "../types";
import { useProposalStrings } from "../i18n";

type Props = { data: TimelineData };

export function Timeline({ data }: Props) {
  const t = useProposalStrings();
  return (
    <section>
      <div className="pt-container">
        <div className="pt-section-label">{t.timelineEyebrow}</div>
        <h2 className="pt-timeline-heading pt-reveal" dangerouslySetInnerHTML={{ __html: data.heading }} />
        <div className="pt-phases">
          {data.phases.map((p) => {
            const items = (p.items || []).filter((it) => typeof it === "string" && it.trim());
            const outcomeStripped = (p.outcome || "")
              .trim()
              .replace(/^al\s+finalizar\s*:?\s*/i, "")
              .trim();
            return (
              <div key={p.number} className="pt-phase pt-reveal">
                <div className="pt-phase-dot">{p.number}</div>
                <div className="pt-phase-header">
                  <div className="pt-phase-title">{p.title}</div>
                  <div className="pt-phase-duration">{p.durationWeeks} {t.weeksAbbrev}</div>
                </div>
                {items.length > 0 && (
                  <div className="pt-phase-items">
                    {items.map((it, i) => (
                      <span key={i} className="pt-phase-item">{it}</span>
                    ))}
                  </div>
                )}
                {outcomeStripped && (
                  <div className="pt-phase-outcome">{t.timelineOutcome} {outcomeStripped}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
