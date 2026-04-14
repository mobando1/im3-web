import type { HeroData, ProposalMeta } from "../types";

type Props = {
  data: HeroData;
  meta: ProposalMeta;
};

export function Hero({ data, meta }: Props) {
  return (
    <section className="pt-hero">
      <div className="pt-hero-bg" />
      <div className="pt-hero-line" />
      <div className="pt-container pt-hero-inner">
        <div className="pt-hero-tag">
          Propuesta personalizada · {meta.contactName}
        </div>

        <h1>
          {data.painHeadline} <em>{data.painAmount}</em>
        </h1>

        <p className="pt-hero-sub">{data.subtitle}</p>

        <div className="pt-hero-reciprocation">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{data.diagnosisRef}</span>
        </div>

        <a href="#resumen" className="pt-hero-cta-single">
          <span className="pt-arrow">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          Ver la propuesta completa
        </a>
      </div>
      <div className="pt-scroll-hint">Desliza</div>
    </section>
  );
}
