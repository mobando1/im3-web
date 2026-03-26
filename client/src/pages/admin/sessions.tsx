import { useState } from "react";
import { Mic, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTA_URL = "https://brave-kindness-production-049c.up.railway.app";

export default function AdminSessions() {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div className={`${fullscreen ? "fixed inset-0 z-50 bg-white" : "space-y-4"}`}>
      {/* Header */}
      <div className={`flex items-center justify-between ${fullscreen ? "px-4 py-3 border-b border-gray-200" : ""}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h1 className={`font-bold text-gray-900 ${fullscreen ? "text-lg" : "text-2xl"}`}>Sesiones</h1>
            <p className="text-xs text-gray-400">Graba y transcribe reuniones con clientes usando Acta</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5 mr-1.5" /> : <Maximize2 className="w-3.5 h-3.5 mr-1.5" />}
            {fullscreen ? "Salir" : "Pantalla completa"}
          </Button>
          <a href={ACTA_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir en nueva pestaña
            </Button>
          </a>
        </div>
      </div>

      {/* Acta iframe */}
      <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${fullscreen ? "h-[calc(100vh-65px)]" : "h-[calc(100vh-200px)]"}`}>
        <iframe
          src={ACTA_URL}
          className="w-full h-full border-0"
          allow="microphone; camera"
          title="Acta — Grabación de sesiones"
        />
      </div>
    </div>
  );
}
