import type { PricingData } from "../types";
import { useProposalStrings } from "../i18n";

type Props = { data: PricingData };

export function Pricing({ data }: Props) {
  const t = useProposalStrings();
  const discount = data.discount?.enabled ? data.discount : null;
  const discountBadge = discount
    ? discount.discountType === "percentage"
      ? `−${discount.value}%`
      : `−${data.amountPrefix}${discount.value} ${data.amountSuffix}`
    : null;
  return (
    <section className="pt-pricing-section" id="inversion">
      <div className="pt-container">
        <div className="pt-section-label pt-centered">{t.pricingEyebrow}</div>
        <h2 className="pt-pricing-heading pt-reveal">{t.pricingHeadingLine1}<br />{t.pricingHeadingLine2}</h2>
        <p className="pt-pricing-intro pt-reveal">
          {t.pricingIntro}
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
            {discount ? (
              <>
                <div className="pt-pricing-discount-chip">
                  <span className="pt-pricing-discount-pct">{discountBadge}</span>
                  {discount.label}
                </div>
                <div className="pt-pricing-original">
                  {data.amountPrefix}{data.amount} {data.amountSuffix}
                </div>
                <div className="pt-pricing-amount">
                  <sup>{data.amountPrefix}</sup>
                  {discount.finalAmount}
                  <sub> {data.amountSuffix}</sub>
                </div>
                {discount.savingsAmount && (
                  <div className="pt-pricing-savings">
                    {t.pricingSavings} {data.amountPrefix}{discount.savingsAmount} {data.amountSuffix}
                  </div>
                )}
                {discount.note && <div className="pt-pricing-discount-note">{discount.note}</div>}
                <div className="pt-pricing-label">{data.priceFootnote}</div>
              </>
            ) : (
              <>
                <div className="pt-pricing-amount">
                  <sup>{data.amountPrefix}</sup>
                  {data.amount}
                  <sub> {data.amountSuffix}</sub>
                </div>
                <div className="pt-pricing-label">{data.priceFootnote}</div>
              </>
            )}
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
            <div className="pt-includes-title">{t.pricingIncludes}</div>
            <div className="pt-includes-grid">
              {data.includes.map((i, idx) => (
                <div key={idx} className="pt-include-item">{i}</div>
              ))}
            </div>
            {data.optionalIncludes && data.optionalIncludes.length > 0 && (
              <>
                <div className="pt-includes-title pt-includes-title-optional">{t.optional}</div>
                <div className="pt-includes-grid pt-includes-grid-optional">
                  {data.optionalIncludes.map((i, idx) => (
                    <div key={idx} className="pt-include-item pt-include-item-optional">{i}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
