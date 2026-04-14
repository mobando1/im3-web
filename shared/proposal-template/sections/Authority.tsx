import type { AuthorityData } from "../types";

type Props = { data: AuthorityData };

export function Authority({ data }: Props) {
  return (
    <section className="pt-authority-section">
      <div className="pt-container">
        <div className="pt-section-label">Sobre IM3 Systems</div>
        <h2 className="pt-authority-heading pt-reveal" dangerouslySetInnerHTML={{ __html: data.heading }} />
        <p className="pt-section-intro pt-reveal">{data.intro}</p>

        <div className="pt-authority-stats">
          {data.stats.map((s, i) => (
            <div key={i} className="pt-auth-stat pt-reveal">
              <div className="pt-auth-stat-num">{s.num}</div>
              <div className="pt-auth-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="pt-authority-grid">
          {data.differentiators.map((d, i) => (
            <div key={i} className="pt-authority-card pt-reveal">
              <div className="pt-authority-card-icon">{d.icon}</div>
              <h4>{d.title}</h4>
              <p>{d.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
