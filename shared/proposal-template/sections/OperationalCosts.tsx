import type { OperationalCostsData } from "../types";

type Props = { data: OperationalCostsData };

export function OperationalCosts({ data }: Props) {
  return (
    <section className="pt-opcosts-section" id="costos-operativos">
      <div className="pt-container">
        <div className="pt-section-label">Costos Operativos</div>
        <h2 className="pt-opcosts-heading pt-reveal">{data.heading}</h2>
        <p className="pt-opcosts-intro pt-reveal">{data.intro}</p>

        <div className="pt-opcosts-grid pt-reveal">
          {data.categories.map((category, catIdx) => (
            <div key={catIdx} className="pt-opcosts-category">
              <div className="pt-opcosts-category-name">{category.name}</div>
              <ul className="pt-opcosts-items">
                {category.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="pt-opcosts-item">
                    <div className="pt-opcosts-item-row">
                      <span className="pt-opcosts-item-service">{item.service}</span>
                      <span className="pt-opcosts-item-cost">{item.cost}</span>
                    </div>
                    {item.note && <div className="pt-opcosts-item-note">{item.note}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-opcosts-totals pt-reveal">
          <div className="pt-opcosts-total-block">
            <div className="pt-opcosts-total-label">Rango mensual</div>
            <div className="pt-opcosts-total-value">
              {data.monthlyRangeLow} – {data.monthlyRangeHigh}
            </div>
          </div>
          <div className="pt-opcosts-total-block">
            <div className="pt-opcosts-total-label">Estimado anual</div>
            <div className="pt-opcosts-total-value">{data.annualEstimate}</div>
          </div>
        </div>

        {data.managedServicesUpsell && (
          <div className="pt-opcosts-upsell pt-reveal">
            <div className="pt-opcosts-upsell-label">Opción alternativa</div>
            <p className="pt-opcosts-upsell-text">{data.managedServicesUpsell}</p>
          </div>
        )}

        <p className="pt-opcosts-disclaimer pt-reveal">{data.disclaimer}</p>
      </div>
    </section>
  );
}
