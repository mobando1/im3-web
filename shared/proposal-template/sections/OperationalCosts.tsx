import type { OperationalCostsData, OperationalCostCategory, OperationalCostGroup } from "../types";

type Props = { data: OperationalCostsData };

const BILLING_LABELS: Record<OperationalCostGroup["billingModel"], string> = {
  "fixed": "Tarifa fija mensual",
  "passthrough": "Pass-through con markup",
  "passthrough-with-cap": "Pass-through con tope mensual",
  "client-direct": "Pago directo del cliente",
};

function CategoryCard({ category }: { category: OperationalCostCategory }) {
  return (
    <div className="pt-opcosts-category">
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
  );
}

export function OperationalCosts({ data }: Props) {
  // Migración legacy: si no hay groups pero sí categories, envolver como un solo grupo "fixed"
  const groups: OperationalCostGroup[] = data.groups && data.groups.length > 0
    ? data.groups
    : data.categories && data.categories.length > 0
      ? [{ name: "Servicios operativos", billingModel: "fixed", categories: data.categories }]
      : [];

  return (
    <section className="pt-opcosts-section" id="costos-operativos">
      <div className="pt-container">
        <div className="pt-section-label">Costos Operativos</div>
        <h2 className="pt-opcosts-heading pt-reveal">{data.heading}</h2>
        <p className="pt-opcosts-intro pt-reveal">{data.intro}</p>

        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="pt-opcosts-group pt-reveal">
            <div className="pt-opcosts-group-header">
              <div className="pt-opcosts-group-name">{group.name}</div>
              <div className="pt-opcosts-group-billing">
                {BILLING_LABELS[group.billingModel]}
                {group.monthlyFee && <span className="pt-opcosts-group-fee"> · {group.monthlyFee}</span>}
                {group.markup && <span className="pt-opcosts-group-fee"> · markup {group.markup}</span>}
              </div>
            </div>
            {group.description && (
              <p className="pt-opcosts-group-description">{group.description}</p>
            )}
            <div className="pt-opcosts-grid">
              {group.categories.map((category, catIdx) => (
                <CategoryCard key={catIdx} category={category} />
              ))}
            </div>
          </div>
        ))}

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
