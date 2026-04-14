import type { SolutionData } from "../types";

type Props = { data: SolutionData };

export function Solution({ data }: Props) {
  return (
    <section>
      <div className="pt-container">
        <div className="pt-section-label">Nuestra Solución</div>
        <h2 className="pt-solution-heading pt-reveal" dangerouslySetInnerHTML={{ __html: data.heading }} />
        <p className="pt-section-intro pt-reveal">{data.intro}</p>
        <div className="pt-modules-list">
          {data.modules.map((m) => (
            <div key={m.number} className="pt-module-card pt-reveal">
              <div className="pt-module-num">{m.number}</div>
              <div className="pt-module-body">
                <h3>{m.title}</h3>
                <p>{m.description}</p>
                <div className="pt-module-solves">{m.solves}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
