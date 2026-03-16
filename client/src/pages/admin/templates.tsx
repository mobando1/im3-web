import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Send, Pencil, X, RefreshCw, MailCheck, ChevronRight } from "lucide-react";

type Template = {
  id: string;
  nombre: string;
  subjectPrompt: string;
  bodyPrompt: string;
  sequenceOrder: number;
  delayDays: number;
  isActive: boolean;
};

const templateLabels: Record<string, string> = {
  confirmacion: "Confirmación de Cita",
  caso_exito: "Caso de Éxito",
  insight_educativo: "Insight Educativo",
  prep_agenda: "Preparación Agenda",
  micro_recordatorio: "Micro Recordatorio",
  seguimiento_post: "Seguimiento Post-Reunión",
  abandono: "Rescate de Abandono",
};

const templateShortLabels: Record<string, string> = {
  confirmacion: "Confirmación",
  caso_exito: "Caso Éxito",
  insight_educativo: "Insight",
  prep_agenda: "Prep Agenda",
  micro_recordatorio: "Recordatorio",
  seguimiento_post: "Post-Reunión",
  abandono: "Abandono",
};

const templateBadgeColors: Record<string, { bg: string; text: string; dot: string }> = {
  confirmacion: { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" },
  caso_exito: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  insight_educativo: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  prep_agenda: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  micro_recordatorio: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  seguimiento_post: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  abandono: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400" },
};

const delayLabel = (d: number) => {
  if (d === 0) return "Inmediato";
  if (d < 0) return `${Math.abs(d)}h antes`;
  return `+${d} ${d === 1 ? "día" : "días"}`;
};

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [previewData, setPreviewData] = useState<{ subject: string; body: string } | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSendingId, setTestSendingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [sendingFullSequence, setSendingFullSequence] = useState(false);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/templates"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; subjectPrompt?: string; bodyPrompt?: string; isActive?: boolean }) => {
      await apiRequest("PATCH", `/api/admin/templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      setEditingId(null);
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (id: string) => {
      setPreviewingId(id);
      const res = await apiRequest("POST", `/api/admin/templates/${id}/preview`);
      return res.json();
    },
    onSuccess: (data: { subject: string; body: string }) => {
      setPreviewData(data);
    },
    onSettled: () => setPreviewingId(null),
  });

  const fullSequenceMutation = useMutation({
    mutationFn: async () => {
      setSendingFullSequence(true);
      const res = await apiRequest("POST", "/api/admin/test-full-sequence");
      return res.json();
    },
    onSuccess: (data: { sent: string[] }) => {
      setTestResult(`Secuencia enviada: ${data.sent.length} emails a info@im3systems.com`);
      setTimeout(() => setTestResult(null), 10000);
    },
    onError: (err: any) => {
      setTestResult(`Error: ${err?.message || "Error enviando secuencia"}`);
      setTimeout(() => setTestResult(null), 10000);
    },
    onSettled: () => setSendingFullSequence(false),
  });

  const testSendMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      setTestSendingId(id);
      const res = await apiRequest("POST", `/api/admin/templates/${id}/test-send`, { email });
      return res.json();
    },
    onSuccess: (data: { message: string }) => {
      setTestResult(data.message);
      setTimeout(() => setTestResult(null), 5000);
    },
    onSettled: () => setTestSendingId(null),
  });

  const startEdit = (t: Template) => {
    setEditingId(t.id);
    setEditSubject(t.subjectPrompt);
    setEditBody(t.bodyPrompt);
    setPreviewData(null);
  };

  const sorted = [...templates].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Plantillas de Email</h2>
          <p className="text-sm text-gray-400 mt-0.5">Secuencia automática de emails para nurturing de leads</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fullSequenceMutation.mutate()}
          disabled={sendingFullSequence}
          className="shrink-0"
        >
          <MailCheck className="w-4 h-4 mr-1.5" />
          {sendingFullSequence ? "Enviando secuencia..." : "Enviar secuencia completa de prueba"}
        </Button>
      </div>
      {testResult && (
        <div className="bg-teal-50 text-teal-700 text-sm px-4 py-2 rounded-lg border border-teal-200">
          {testResult}
        </div>
      )}

      {/* Mini flow map */}
      {!isLoading && sorted.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">Secuencia</p>
          <div className="flex items-center flex-wrap gap-1.5">
            {sorted.map((t, idx) => {
              const colors = templateBadgeColors[t.nombre] || templateBadgeColors.confirmacion;
              return (
                <div key={t.id} className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-opacity ${
                      t.isActive
                        ? `${colors.bg} ${colors.text}`
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${t.isActive ? colors.dot : "bg-gray-300"}`} />
                    {templateShortLabels[t.nombre] || t.nombre}
                  </span>
                  {idx < sorted.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Template cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200/80 p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((template) => {
            const colors = templateBadgeColors[template.nombre] || templateBadgeColors.confirmacion;
            const isEditing = editingId === template.id;

            return (
              <div
                key={template.id}
                className={`bg-white rounded-xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all duration-200 ${
                  !template.isActive ? "opacity-50" : ""
                }`}
              >
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    {/* Step badge */}
                    <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                      <span className={`text-xs font-bold ${colors.text}`}>
                        {template.sequenceOrder}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {templateLabels[template.nombre] || template.nombre}
                        </p>
                        <span className="text-[11px] text-gray-400 font-medium bg-gray-50 px-2 py-0.5 rounded-md">
                          {delayLabel(template.delayDays)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{template.nombre}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <Switch
                        checked={template.isActive}
                        onCheckedChange={(checked) => updateMutation.mutate({ id: template.id, isActive: checked })}
                        className="data-[state=checked]:bg-[#2FA4A9]"
                      />
                      <div className="w-px h-5 bg-gray-200" />
                      <button
                        onClick={() => isEditing ? setEditingId(null) : startEdit(template)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isEditing
                            ? "bg-gray-100 text-gray-700"
                            : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => previewMutation.mutate(template.id)}
                        disabled={previewingId === template.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
                      >
                        {previewingId === template.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded edit section */}
                {isEditing && (
                  <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                    <Tabs defaultValue="prompts" className="w-full">
                      <TabsList className="h-9 bg-gray-100/80 p-0.5 mb-4">
                        <TabsTrigger value="prompts" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm px-4">
                          Editar Prompts
                        </TabsTrigger>
                        <TabsTrigger value="test" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm px-4">
                          Preview & Test
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="prompts" className="space-y-4 mt-0">
                        <div>
                          <label className="text-xs text-gray-500 mb-1.5 block font-medium">Prompt del Subject</label>
                          <textarea
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9] transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1.5 block font-medium">Prompt del Body</label>
                          <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={6}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9] transition-colors"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: template.id, subjectPrompt: editSubject, bodyPrompt: editBody })}
                            disabled={updateMutation.isPending}
                            className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white"
                          >
                            {updateMutation.isPending ? "Guardando..." : "Guardar cambios"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditingId(null)} className="border-gray-200 text-gray-600">
                            Cancelar
                          </Button>
                        </div>
                      </TabsContent>

                      <TabsContent value="test" className="space-y-4 mt-0">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <label className="text-xs text-gray-500 font-medium">Vista Previa</label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => previewMutation.mutate(template.id)}
                              disabled={previewingId === template.id}
                              className="text-xs h-7 gap-1.5 border-gray-200"
                            >
                              {previewingId === template.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                              Generar Preview
                            </Button>
                          </div>
                          {previewData ? (
                            <div className="space-y-3">
                              <div className="bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Subject</p>
                                <p className="text-sm font-medium text-gray-900 mt-0.5">{previewData.subject}</p>
                              </div>
                              <div className="rounded-lg border border-gray-200 overflow-hidden">
                                <iframe
                                  srcDoc={previewData.body}
                                  sandbox=""
                                  className="w-full border-0 bg-white"
                                  style={{ minHeight: "300px" }}
                                  onLoad={(e) => {
                                    const iframe = e.target as HTMLIFrameElement;
                                    if (iframe.contentDocument) {
                                      iframe.style.height = (iframe.contentDocument.body.scrollHeight + 20) + "px";
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                              <Eye className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                              <p className="text-xs text-gray-400">Haz clic en "Generar Preview" para ver el email</p>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                          <label className="text-xs text-gray-500 font-medium mb-2 block">Enviar Email de Prueba</label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="email@test.com"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                              className="max-w-xs bg-white border-gray-200 text-sm"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => testSendMutation.mutate({ id: template.id, email: testEmail })}
                              disabled={!testEmail.includes("@") || testSendingId === template.id}
                              className="gap-1.5 border-gray-200 text-gray-600"
                            >
                              <Send className="w-3.5 h-3.5" />
                              {testSendingId === template.id ? "Enviando..." : "Enviar Test"}
                            </Button>
                          </div>
                          {testResult && (
                            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                              <MailCheck className="w-3.5 h-3.5" />
                              {testResult}
                            </p>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}

                {/* Standalone preview (when not editing) */}
                {!isEditing && previewData && previewingId === null && (
                  <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 font-medium">Vista Previa</p>
                      <button onClick={() => setPreviewData(null)} className="text-gray-400 hover:text-gray-700 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Subject</p>
                      <p className="text-sm font-medium text-gray-900 mt-0.5">{previewData.subject}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <iframe
                        srcDoc={previewData.body}
                        sandbox=""
                        className="w-full border-0 bg-white"
                        style={{ minHeight: "300px" }}
                        onLoad={(e) => {
                          const iframe = e.target as HTMLIFrameElement;
                          if (iframe.contentDocument) {
                            iframe.style.height = (iframe.contentDocument.body.scrollHeight + 20) + "px";
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
