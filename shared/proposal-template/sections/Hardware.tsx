import type { HardwareData } from "../types";

type Props = { data: HardwareData };

export function Hardware({ data }: Props) {
  return (
    <section className="pt-hardware-section" id="hardware">
      <div className="pt-container">
        <div className="pt-section-label">Hardware</div>
        <h2 className="pt-hardware-heading pt-reveal">{data.heading}</h2>
        <p className="pt-hardware-intro pt-reveal">{data.intro}</p>

        <div className="pt-hardware-table pt-reveal">
          <div className="pt-hardware-table-head">
            <div>Equipo</div>
            <div className="pt-hardware-col-qty">Cant.</div>
            <div className="pt-hardware-col-unit">Unit.</div>
            <div className="pt-hardware-col-total">Total</div>
          </div>
          {data.items.map((item, idx) => (
            <div key={idx} className="pt-hardware-row">
              <div className="pt-hardware-item-cell">
                <div className="pt-hardware-item-name">{item.name}</div>
                <div className="pt-hardware-item-desc">{item.description}</div>
                {item.notes && <div className="pt-hardware-item-notes">{item.notes}</div>}
              </div>
              <div className="pt-hardware-col-qty">
                <span className="pt-hardware-qty-value">{item.quantity}</span>
              </div>
              <div className="pt-hardware-col-unit">{item.unitPriceUSD}</div>
              <div className="pt-hardware-col-total">{item.totalPriceUSD}</div>
            </div>
          ))}
          <div className="pt-hardware-subtotal">
            <div className="pt-hardware-subtotal-label">Subtotal hardware</div>
            <div className="pt-hardware-subtotal-value">{data.subtotalUSD}</div>
          </div>
        </div>

        {data.recommendationNote && (
          <div className="pt-hardware-recommendation pt-reveal">
            <div className="pt-hardware-rec-label">Acompañamiento en la compra</div>
            <p>{data.recommendationNote}</p>
          </div>
        )}

        <p className="pt-hardware-disclaimer pt-reveal">{data.disclaimer}</p>
      </div>
    </section>
  );
}
