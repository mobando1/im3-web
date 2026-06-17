import type { SummaryData } from "../types";
import { useProposalStrings } from "../i18n";

type Props = { data: SummaryData };

export function Summary({ data }: Props) {
  const t = useProposalStrings();
  return (
    <section id="resumen">
      <div className="pt-container">
        <div className="pt-section-label">{t.summaryEyebrow}</div>

        {data.commitmentQuote && (
          <div className="pt-commitment-banner pt-reveal">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p dangerouslySetInnerHTML={{ __html: data.commitmentQuote }} />
          </div>
        )}

        <div className="pt-summary-grid pt-reveal">
          <div className="pt-summary-text">
            {data.paragraphs.map((p, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
            ))}
          </div>
          {data.stats && data.stats.length > 0 && (
            <div className="pt-summary-card">
              <div className="pt-summary-card-title">{t.summaryProjectData}</div>
              {data.stats.map((s, i) => (
                <div key={i} className="pt-stat-row">
                  <span className="pt-stat-label">{s.label}</span>
                  <span className="pt-stat-value">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
