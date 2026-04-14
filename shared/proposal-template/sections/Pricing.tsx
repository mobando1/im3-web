import type { PricingData } from "../types";

type Props = { data: PricingData };

export function Pricing({ data }: Props) {
  return (
    <section className="pt-pricing-section" id="inversion">
      <div className="pt-container">
        <div className="pt-section-label pt-centered">Tu Inversión</div>
        <h2 className="pt-pricing-heading pt-reveal">Transparente<br />y sin sorpresas</h2>
        <p className="pt-pricing-intro pt-reveal">
          La inversión se recupera rápido — no dejar de actuar es el verdadero costo.
        </p>

        <div className="pt-scarcity-banner pt-reveal">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p dangerouslySetInnerHTML={{ __html: data.scarcityMessage }} />
        </div>

        <div className="pt-pricing-card pt-reveal">
          <div className="pt-pricing-header">
            <div className="pt-pricing-badge">{data.label}</div>
            <div className="pt-pricing-amount">
              <sup>{data.amountPrefix}</sup>
              {data.amount}
              <sub> {data.amountSuffix}</sub>
            </div>
            <div className="pt-pricing-label">{data.priceFootnote}</div>
          </div>
          <div className="pt-pricing-milestones">
            {data.milestones.map((m) => (
              <div key={m.step} className="pt-milestone">
                <div className="pt-milestone-step">{m.step}</div>
                <div className="pt-milestone-info">
                  <div className="pt-milestone-name">{m.name}</div>
                  <div className="pt-milestone-desc">{m.desc}</div>
                </div>
                <div className="pt-milestone-amount">{m.amount}</div>
              </div>
            ))}
          </div>
          <div className="pt-pricing-includes">
            <div className="pt-includes-title">Tu inversión incluye</div>
            <div className="pt-includes-grid">
              {data.includes.map((i, idx) => (
                <div key={idx} className="pt-include-item">{i}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
