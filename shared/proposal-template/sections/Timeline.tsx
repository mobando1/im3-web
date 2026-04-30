import type { TimelineData } from "../types";

type Props = { data: TimelineData };

export function Timeline({ data }: Props) {
  return (
    <section>
      <div className="pt-container">
        <div className="pt-section-label">Cronograma</div>
        <h2 className="pt-timeline-heading pt-reveal" dangerouslySetInnerHTML={{ __html: data.heading }} />
        <div className="pt-phases">
          {data.phases.map((p) => (
            <div key={p.number} className="pt-phase pt-reveal">
              <div className="pt-phase-dot">{p.number}</div>
              <div className="pt-phase-header">
                <div className="pt-phase-title">{p.title}</div>
                <div className="pt-phase-duration">{p.durationWeeks} sem.</div>
              </div>
              <div className="pt-phase-items">
                {p.items.map((it, i) => (
                  <span key={i} className="pt-phase-item">{it}</span>
                ))}
              </div>
              {p.outcome && p.outcome.trim() && (
                <div className="pt-phase-outcome">
                  {/al\s+finalizar/i.test(p.outcome.trim().slice(0, 20)) ? p.outcome : `Al finalizar: ${p.outcome}`}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
