import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Download, FileText, Loader2, CheckCircle2, AlertCircle, RotateCcw, ListChecks, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type AuditDetail = {
  id: number;
  report_type: string;
  company: string;
  status: string;
  step: number | null;
  total_steps: number | null;
  step_message: string | null;
  pdf_path: string | null;
  form_data: Record<string, unknown> | null;
  transcription: string | null;
  conversation_summary: string | null;
  qa_breakdown: string | null;
  key_takeaways: string | null;
  presentation_guide: string | null;
  action_plan: string | null;
  source: string;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
};

const STEP_LABELS: Record<number, string> = {
  1: "Validando datos",
  2: "Calculando métricas",
  3: "Generando diagramas",
  4: "Renderizando HTML",
  5: "Generando PDF",
  6: "Copiando assets",
  7: "Limpiando archivos temporales",
};

export default function AdminAuditoriaDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("estado");

  const { data: audit, isLoading } = useQuery<AuditDetail>({
    queryKey: [`/api/admin/auditorias/${params.id}/status`],
    refetchInterval: (query) => {
      const data = query.state.data as AuditDetail | undefined;
      return data?.status === "processing" ? 2000 : false;
    },
  });

  const guideMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/admin/auditorias/${params.id}/guide`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/auditorias/${params.id}/status`] });
      toast({ title: "Guía de presentación generada" });
    },
  });

  const actionPlanMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/auditorias/${params.id}/action-plan`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/auditorias/${params.id}/status`] });
      toast({ title: "Plan de acción generado" });
    },
  });

  if (isLoading || !audit) {
    return <div className="text-center py-20 text-gray-400">Cargando auditoría...</div>;
  }

  const isProcessing = audit.status === "processing";
  const isReady = audit.status === "ready";
  const isError = audit.status === "error";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/admin/auditorias")} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{audit.company || "Auditoría"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {audit.report_type === "full" ? "Auditoría Completa" : "Pre-Auditoría"} · {new Date(audit.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {isReady && (
          <a href={`/api/admin/auditorias/${audit.id}/download`} className="inline-flex items-center gap-2 px-4 py-2 bg-[#2FA4A9] text-white text-sm font-medium rounded-lg hover:bg-[#238b8f] transition-colors">
            <Download className="w-4 h-4" /> Descargar PDF
          </a>
        )}
      </div>

      {/* Status card */}
      <div className={`rounded-xl border p-5 ${
        isProcessing ? "bg-blue-50 border-blue-200" :
        isReady ? "bg-emerald-50 border-emerald-200" :
        isError ? "bg-red-50 border-red-200" :
        "bg-gray-50 border-gray-200"
      }`}>
        <div className="flex items-center gap-3">
          {isProcessing && <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />}
          {isReady && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
          {isError && <AlertCircle className="w-6 h-6 text-red-600" />}
          {!isProcessing && !isReady && !isError && <FileText className="w-6 h-6 text-gray-400" />}
          <div className="flex-1">
            <p className={`font-medium ${
              isProcessing ? "text-blue-800" : isReady ? "text-emerald-800" : isError ? "text-red-800" : "text-gray-700"
            }`}>
              {isProcessing ? "Generando auditoría..." : isReady ? "Auditoría lista" : isError ? "Error en la generación" : "Borrador"}
            </p>
            {isProcessing && audit.step_message && (
              <p className="text-sm text-blue-600 mt-0.5">{audit.step_message}</p>
            )}
            {isError && audit.error_msg && (
              <p className="text-sm text-red-600 mt-0.5">{audit.error_msg}</p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isProcessing && audit.step && audit.total_steps && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-blue-600 font-medium">Paso {audit.step} de {audit.total_steps}</span>
              <span className="text-xs text-blue-600">{STEP_LABELS[audit.step] || ""}</span>
            </div>
            <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${(audit.step / audit.total_steps) * 100}%` }}
              />
            </div>
            {/* Step indicators */}
            <div className="flex justify-between mt-2">
              {Array.from({ length: audit.total_steps }, (_, i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i + 1 < audit.step! ? "bg-blue-500 text-white" :
                    i + 1 === audit.step ? "bg-blue-500 text-white ring-4 ring-blue-200" :
                    "bg-blue-100 text-blue-400"
                  }`}
                >
                  {i + 1 < audit.step! ? "✓" : i + 1}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions for ready audits */}
      {isReady && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => guideMut.mutate()}
            disabled={guideMut.isPending}
          >
            {guideMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Presentation className="w-4 h-4 mr-2" />}
            {audit.presentation_guide ? "Regenerar guía" : "Generar guía de presentación"}
          </Button>
          <Button
            variant="outline"
            onClick={() => actionPlanMut.mutate()}
            disabled={actionPlanMut.isPending}
          >
            {actionPlanMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ListChecks className="w-4 h-4 mr-2" />}
            {audit.action_plan ? "Regenerar plan" : "Generar plan de acción"}
          </Button>
        </div>
      )}

      {/* Tabs */}
      {isReady && (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            {[
              { key: "estado", label: "Resumen" },
              ...(audit.presentation_guide ? [{ key: "guia", label: "Guía de Presentación" }] : []),
              ...(audit.action_plan ? [{ key: "plan", label: "Plan de Acción" }] : []),
              ...(audit.conversation_summary ? [{ key: "conversacion", label: "Análisis Conversación" }] : []),
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? "border-[#2FA4A9] text-[#2FA4A9]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-[300px]">
            {activeTab === "estado" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">Información de la auditoría</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-400">Empresa:</span> <span className="font-medium text-gray-900">{audit.company}</span></div>
                  <div><span className="text-gray-400">Tipo:</span> <span className="font-medium text-gray-900">{audit.report_type === "full" ? "Completa" : "Pre-auditoría"}</span></div>
                  <div><span className="text-gray-400">Fuente:</span> <span className="font-medium text-gray-900">{audit.source === "drive_import" ? "Google Drive" : "Manual"}</span></div>
                  <div><span className="text-gray-400">Creada:</span> <span className="font-medium text-gray-900">{new Date(audit.created_at).toLocaleString("es-CO")}</span></div>
                </div>
                {audit.key_takeaways && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Hallazgos clave</h4>
                    <div className="text-sm text-gray-600 whitespace-pre-wrap">{audit.key_takeaways}</div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "guia" && audit.presentation_guide && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Guía de Presentación</h3>
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{audit.presentation_guide}</div>
              </div>
            )}

            {activeTab === "plan" && audit.action_plan && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Plan de Acción</h3>
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{audit.action_plan}</div>
              </div>
            )}

            {activeTab === "conversacion" && audit.conversation_summary && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Resumen de la conversación</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{audit.conversation_summary}</p>
                </div>
                {audit.qa_breakdown && (
                  <div className="pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Preguntas y Respuestas</h4>
                    <div className="text-sm text-gray-600 whitespace-pre-wrap">{audit.qa_breakdown}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
