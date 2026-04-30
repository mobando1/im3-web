import type { TechData } from "../types";

type Props = { data: TechData };

export function Tech({ data }: Props) {
  return (
    <section className="pt-tech-section">
      <div className="pt-container">
        <div className="pt-section-label">Cómo funciona</div>
        <h2 className="pt-tech-heading pt-reveal" dangerouslySetInnerHTML={{ __html: data.heading }} />
        <p className="pt-section-intro pt-reveal">{data.intro}</p>
        <div className="pt-tech-grid pt-reveal">
          {data.features.map((f, i) => (
            <div key={i} className="pt-tech-pill">
              <div className="pt-tech-dot" />
              {f}
            </div>
          ))}
        </div>
        {data.optionalFeatures && data.optionalFeatures.filter((f) => typeof f === "string" && f.trim()).length > 0 && (
          <>
            <div className="pt-tech-optional-label pt-reveal">Opcionales</div>
            <div className="pt-tech-grid pt-tech-grid-optional pt-reveal">
              {data.optionalFeatures
                .filter((f) => typeof f === "string" && f.trim())
                .map((f, i) => (
                  <div key={i} className="pt-tech-pill pt-tech-pill-optional">
                    <div className="pt-tech-dot" />
                    {f}
                  </div>
                ))}
            </div>
          </>
        )}
        <p className="pt-tech-stack pt-reveal">Stack: {data.stack}</p>
      </div>
    </section>
  );
}
