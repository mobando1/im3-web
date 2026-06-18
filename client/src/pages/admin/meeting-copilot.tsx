import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Headphones,
  Download,
  ExternalLink,
  ArrowLeft,
  Check,
  Languages,
  Captions,
  Zap,
  ShieldCheck,
  Apple,
} from "lucide-react";

const DOWNLOAD_URL =
  "https://github.com/mobando1/im3-meeting-copilot-releases/releases/latest/download/IM3-Meeting-Copilot.dmg";
const REPO_URL = "https://github.com/mobando1/im3-meeting-copilot-releases";
const APP_SCHEME = "im3copilot://open";

const features = [
  {
    icon: Captions,
    title: "Transcripción en vivo",
    text: "Escucha a la contraparte (audio del sistema vía BlackHole) y la transcribe palabra por palabra.",
  },
  {
    icon: Languages,
    title: "Respuesta en tu tono",
    text: "Sugiere una respuesta natural en inglés calibrada a tu estilo, lista para leer en voz alta.",
  },
  {
    icon: Zap,
    title: "Metodología NEPQ",
    text: "Mezcla preguntas de venta de \"The New Model of Selling\" — opcional, con un interruptor.",
  },
  {
    icon: ShieldCheck,
    title: "Privado y local",
    text: "Tus claves API se guardan cifradas en tu equipo; el audio no se almacena en ningún servidor.",
  },
];

const steps = [
  {
    n: 1,
    title: "Instala la app",
    text: "Abre el .dmg y arrastra IM3 Meeting Copilot a Applications. La primera vez: clic derecho → Abrir.",
  },
  {
    n: 2,
    title: "Instala BlackHole + Multi-Output",
    text: "brew install blackhole-2ch. En Audio MIDI Setup crea un Multi-Output con tus audífonos + BlackHole.",
  },
  {
    n: 3,
    title: "Enruta el audio de la llamada",
    text: "En Zoom/Meet/Teams pon la Salida (Speaker) = Multi-Output. En la app: Fuente = BlackHole 2ch. Usa audífonos.",
  },
  {
    n: 4,
    title: "Pega tus claves",
    text: "En Ajustes ingresa OpenAI + Anthropic (y Deepgram opcional para captura streaming). Se guardan cifradas.",
  },
];

export default function MeetingCopilotPage() {
  const [openHint, setOpenHint] = useState(false);

  function openApp() {
    setOpenHint(false);
    // Try to launch the installed desktop app via its URL scheme.
    window.location.href = APP_SCHEME;
    // If the app didn't take focus shortly after, it's probably not installed.
    const t = window.setTimeout(() => setOpenHint(true), 1500);
    window.addEventListener("blur", () => window.clearTimeout(t), {
      once: true,
    });
  }

  return (
    <div className="max-w-4xl space-y-6 pt-4">
      <Link
        href="/admin/tools"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" /> Herramientas
      </Link>

      {/* Hero */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#2FA4A9]/10 text-[#2FA4A9] flex items-center justify-center shrink-0">
              <Headphones className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold text-gray-900">
                  IM3 Meeting Copilot
                </h1>
                <span className="text-[10px] h-5 px-2 rounded-full bg-emerald-50 text-emerald-700 flex items-center">
                  Activo
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Copiloto en vivo para reuniones: transcribe a la contraparte y
                te sugiere tu respuesta en inglés, en tu tono.
              </p>
              <p className="inline-flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                <Apple className="w-3.5 h-3.5" /> macOS (Apple Silicon) · app de
                escritorio
              </p>

              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <Button
                  onClick={openApp}
                  className="gap-1.5 bg-[#2FA4A9] hover:bg-[#268d92] text-white"
                >
                  <Headphones className="w-4 h-4" /> Abrir la app
                </Button>
                <a href={DOWNLOAD_URL}>
                  <Button variant="outline" className="gap-1.5">
                    <Download className="w-4 h-4" /> Descargar para Mac (.dmg)
                  </Button>
                </a>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[#2FA4A9] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver en GitHub
                </a>
              </div>
              {openHint && (
                <p className="text-xs text-gray-500 mt-3">
                  ¿No se abrió nada? Probablemente aún no está instalada en este
                  equipo — descárgala con el botón de arriba.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Qué hace */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Qué hace
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#2FA4A9]/10 text-[#2FA4A9] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {f.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{f.text}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Instalación */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Instalación (una sola vez)
        </h2>
        <div className="space-y-2">
          {steps.map((s) => (
            <Card key={s.n}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#2FA4A9] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {s.n}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {s.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{s.text}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="inline-flex items-center gap-1.5 text-xs text-gray-400 mt-3">
          <Check className="w-3.5 h-3.5 text-[#2FA4A9]" /> Guía completa en el{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2FA4A9] hover:underline"
          >
            README del repositorio
          </a>
          .
        </p>
      </div>
    </div>
  );
}
