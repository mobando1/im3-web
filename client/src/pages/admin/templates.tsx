import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, Send, Pencil, X, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react";

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
  confirmacion: "Confirmacion de Cita",
  caso_exito: "Caso de Exito",
  insight_educativo: "Insight Educativo",
  prep_agenda: "Preparacion Agenda",
  micro_recordatorio: "Micro Recordatorio",
  seguimiento_post: "Seguimiento Post-Reunion",
  abandono: "Rescate de Abandono",
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Plantillas de Email</h2>
        <p className="text-sm text-gray-400">{templates.length} plantillas</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((template) => (
            <Card key={template.id} className={`bg-white border-gray-200 shadow-sm ${!template.isActive ? "opacity-60" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-white bg-[#2FA4A9] rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                        {template.sequenceOrder}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {templateLabels[template.nombre] || template.nombre}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {template.nombre} — {template.delayDays === 0 ? "Inmediato" : `+${template.delayDays} dias`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => updateMutation.mutate({ id: template.id, isActive: !template.isActive })}
                      className={`transition-colors ${template.isActive ? "text-[#2FA4A9]" : "text-gray-300"}`}
                      title={template.isActive ? "Desactivar" : "Activar"}
                    >
                      {template.isActive ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => editingId === template.id ? setEditingId(null) : startEdit(template)}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      {editingId === template.id ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => previewMutation.mutate(template.id)}
                      disabled={previewingId === template.id}
                      className="text-gray-400 hover:text-purple-600"
                    >
                      {previewingId === template.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Edit form */}
                {editingId === template.id && (
                  <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Prompt del Subject</label>
                      <textarea
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Prompt del Body</label>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={6}
                        className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9]"
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

                    {/* Test send */}
                    <div className="flex gap-2 border-t border-gray-100 pt-4">
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
                        {testSendingId === template.id ? "Enviando..." : "Test Send"}
                      </Button>
                      {testResult && <p className="text-xs text-emerald-600 self-center">{testResult}</p>}
                    </div>
                  </div>
                )}

                {/* Preview */}
                {previewData && previewingId === null && (
                  <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 font-medium">Vista Previa</p>
                      <button onClick={() => setPreviewData(null)} className="text-gray-400 hover:text-gray-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-4 py-2 border border-gray-200">
                      <p className="text-xs text-gray-400">Subject:</p>
                      <p className="text-sm font-medium text-gray-900">{previewData.subject}</p>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
