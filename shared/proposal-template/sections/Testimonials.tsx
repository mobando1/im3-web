import type { TestimonialData } from "../types";

type Props = { items: TestimonialData[] };

export function Testimonials({ items }: Props) {
  return (
    <section>
      <div className="pt-container">
        <div className="pt-section-label">Clientes</div>
        <h2 className="pt-testimonials-heading pt-reveal">
          Lo que dicen quienes<br />ya confiaron en nosotros
        </h2>
        <div className="pt-testimonials-grid">
          {items.map((t, i) => (
            <div key={i} className="pt-testimonial pt-reveal">
              <p className="pt-testimonial-text">{t.text}</p>
              <div className="pt-testimonial-author">{t.author}</div>
              <div className="pt-testimonial-role">{t.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
