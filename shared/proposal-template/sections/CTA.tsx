import type { CTAData } from "../types";

type Props = {
  data: CTAData;
  onAccept?: () => void;
  onFallback?: () => void;
};

export function CTA({ data, onAccept, onFallback }: Props) {
  return (
    <section className="pt-cta-section" id="aceptar">
      <div className="pt-container">
        <div className="pt-section-label pt-centered" style={{ marginBottom: "1.4rem" }}>
          Próximos Pasos
        </div>
        <h2 className="pt-reveal">
          {data.heading} <em>{data.painHighlight}</em>
        </h2>
        <p className="pt-cta-description pt-reveal">{data.description}</p>
        <div className="pt-cta-buttons pt-reveal">
          <button type="button" className="pt-btn pt-btn-teal pt-btn-large" onClick={onAccept}>
            {data.acceptLabel}
          </button>
          <button type="button" className="pt-btn-secondary-link" onClick={onFallback}>
            {data.fallbackCtaLabel}
          </button>
        </div>
        {data.guarantees.length > 0 && (
          <p className="pt-cta-guarantees pt-reveal">
            {data.guarantees.map((g, i) => (
              <span key={i}>
                ✓ {g}
                {i < data.guarantees.length - 1 && " · "}
              </span>
            ))}
          </p>
        )}
        <p className="pt-cta-deadline pt-reveal">⏱ {data.deadlineMessage}</p>
      </div>
    </section>
  );
}
