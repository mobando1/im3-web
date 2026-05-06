import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { ArrowUpRight, BookOpen } from "lucide-react";
import type { ProposalBriefData, BriefModule } from "@shared/proposal-template/types";

type PublicBrief = ProposalBriefData & {
  id: string;
  title: string | null;
  status: string;
  contactName?: string;
  contactEmpresa?: string;
  proposalAccessToken?: string;
  proposalTitle?: string;
};

function trackView(token: string, body: { module?: string; timeSpent?: number; device?: string }) {
  fetch(`/api/brief/${token}/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export default function ProposalBriefView() {
  const { token } = useParams<{ token: string }>();

  const { data: brief, isLoading, error } = useQuery<PublicBrief>({
    queryKey: [`/api/brief/${token}`],
  });

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const moduleRefs = useRef<Record<string, HTMLElement | null>>({});
  const viewStart = useRef<{ module: string | null; ts: number }>({ module: null, ts: Date.now() });

  // Tracking de tiempo por módulo (al cambiar de sección y al desmontar)
  useEffect(() => {
    if (!brief) return;
    const device = window.innerWidth < 768 ? "mobile" : "desktop";
    trackView(token, { module: "__open__", device });
    return () => {
      const elapsed = Math.round((Date.now() - viewStart.current.ts) / 1000);
      if (viewStart.current.module && elapsed > 0) {
        trackView(token, { module: viewStart.current.module, timeSpent: elapsed, device });
      }
    };
  }, [brief?.id, token]);

  // Intersection observer para detectar módulo activo en scroll
  useEffect(() => {
    if (!brief?.modules?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const moduleKey = entry.target.getAttribute("data-module");
            if (moduleKey && moduleKey !== viewStart.current.module) {
              const elapsed = Math.round((Date.now() - viewStart.current.ts) / 1000);
              if (viewStart.current.module && elapsed > 0) {
                trackView(token, { module: viewStart.current.module, timeSpent: elapsed });
              }
              viewStart.current = { module: moduleKey, ts: Date.now() };
              setActiveModule(moduleKey);
            }
          }
        }
      },
      { threshold: 0.4, rootMargin: "-100px 0px -40% 0px" }
    );

    Object.entries(moduleRefs.current).forEach(([, el]) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [brief?.modules?.length, token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-gray-200 border-t-[#2FA4A9] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Brief no disponible</h1>
          <p className="text-sm text-gray-600">
            Este link no es válido o el documento aún no ha sido enviado. Contacta al equipo de IM3 si crees que es un error.
          </p>
        </div>
      </div>
    );
  }

  const modules = brief.modules || [];
  const faqs = brief.faqs || [];
  const glossary = brief.glossary || [];

  const navItems = [
    { id: "__intro__", label: "Introducción" },
    ...modules.map(m => ({ id: m.key, label: m.title })),
    ...(faqs.length ? [{ id: "__faqs__", label: "Preguntas frecuentes" }] : []),
    ...(glossary.length ? [{ id: "__glossary__", label: "Glosario" }] : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-amber-50/30">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 backdrop-blur-md bg-white/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-amber-700 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">{brief.title || "Brief técnico detallado"}</h1>
              {brief.contactEmpresa && <p className="text-[11px] text-gray-500 truncate">Para {brief.contactEmpresa}</p>}
            </div>
          </div>
          {brief.proposalAccessToken && (
            <a
              href={`/proposal/${brief.proposalAccessToken}`}
              className="text-xs text-[#2FA4A9] hover:underline flex items-center gap-1 shrink-0"
            >
              Ver propuesta original <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        {/* Sidebar nav (desktop) */}
        <nav className="hidden lg:block sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`block px-3 py-2 rounded-lg text-sm transition-colors ${activeModule === item.id ? "bg-amber-100 text-amber-900 font-medium" : "text-gray-600 hover:bg-gray-100"}`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <main className="space-y-12 pb-20">
          {/* Intro */}
          <section id="__intro__" className="scroll-mt-20">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-amber-700" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Bienvenido al brief detallado</h2>
              </div>
              {brief.intro?.context && <p className="text-gray-700 leading-relaxed mb-4 whitespace-pre-wrap">{brief.intro.context}</p>}
              {brief.intro?.howToRead && (
                <div className="bg-amber-50 border-l-4 border-amber-300 px-4 py-3 rounded-r-lg">
                  <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{brief.intro.howToRead}</p>
                </div>
              )}
            </div>
          </section>

          {/* Modules */}
          {modules.map((m, idx) => (
            <section
              key={m.key}
              id={m.key}
              data-module={m.key}
              ref={(el) => { moduleRefs.current[m.key] = el; }}
              className="scroll-mt-20"
            >
              <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
                <div className="flex items-baseline gap-3 mb-5 pb-4 border-b border-gray-100">
                  <span className="text-2xl font-bold text-amber-600">{String(idx + 1).padStart(2, "0")}</span>
                  <h2 className="text-2xl font-bold text-gray-900">{m.title}</h2>
                </div>
                <ModuleBlock module={m} />
              </div>
            </section>
          ))}

          {/* FAQs */}
          {faqs.length > 0 && (
            <section id="__faqs__" data-module="__faqs__" ref={(el) => { moduleRefs.current["__faqs__"] = el; }} className="scroll-mt-20">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Preguntas frecuentes</h2>
                <div className="space-y-4">
                  {faqs.map((f, i) => (
                    <details key={i} className="group border border-gray-200 rounded-lg">
                      <summary className="cursor-pointer px-4 py-3 font-medium text-gray-900 flex items-center justify-between hover:bg-gray-50 rounded-lg">
                        <span>{f.question}</span>
                        <span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
                      </summary>
                      <div className="px-4 pb-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{f.answer}</div>
                    </details>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Glossary */}
          {glossary.length > 0 && (
            <section id="__glossary__" data-module="__glossary__" ref={(el) => { moduleRefs.current["__glossary__"] = el; }} className="scroll-mt-20">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Glosario</h2>
                <dl className="space-y-3">
                  {glossary.map((g, i) => (
                    <div key={i} className="border-l-2 border-amber-300 pl-4">
                      <dt className="font-semibold text-gray-900">{g.term}</dt>
                      <dd className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{g.definition}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          )}

          <footer className="text-center text-xs text-gray-500 pt-6">
            Material de soporte preparado por IM3 Systems · {new Date().getFullYear()}
          </footer>
        </main>
      </div>
    </div>
  );
}

function ModuleBlock({ module: m }: { module: BriefModule }) {
  return (
    <div className="space-y-5">
      <Block label="¿Qué problema resuelve?" emoji="🎯">{m.problemSolved}</Block>
      <Block label="¿Cómo funciona?" emoji="⚙️">{m.howItWorks}</Block>
      {m.meetingContext && <Block label="De dónde salió" emoji="💬">{m.meetingContext}</Block>}
      <Block label="Por qué lo elegimos así" emoji="🧭">{m.whyThisChoice}</Block>
      <Block label="Qué pasa si no se hace" emoji="⚠️" tone="warning">{m.withoutThis}</Block>
      {m.examples?.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <span>📌</span> Ejemplos concretos
          </h3>
          <ul className="space-y-2 pl-2">
            {m.examples.map((e, i) => (
              <li key={i} className="text-gray-700 leading-relaxed flex items-start gap-2">
                <span className="text-amber-500 mt-1.5 shrink-0">•</span>
                <span className="whitespace-pre-wrap">{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.technicalDetails && (
        <details className="group border border-gray-200 rounded-lg">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 flex items-center justify-between hover:bg-gray-50 rounded-lg">
            <span>📐 Detalles técnicos</span>
            <span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
          </summary>
          <div className="px-4 pb-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{m.technicalDetails}</div>
        </details>
      )}
    </div>
  );
}

function Block({ label, emoji, children, tone }: { label: string; emoji: string; children: string; tone?: "warning" }) {
  return (
    <div className={`rounded-lg p-4 ${tone === "warning" ? "bg-amber-50/60 border-l-4 border-amber-300" : "bg-gray-50/60"}`}>
      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <span>{emoji}</span> {label}
      </h3>
      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{children}</p>
    </div>
  );
}
