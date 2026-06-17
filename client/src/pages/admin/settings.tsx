import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Cpu, ToggleRight, Plug, Database, KeyRound, History, Activity, Stethoscope,
  Check, X, Loader2, Save, ExternalLink, AlertTriangle, ShieldCheck, Github, Plus,
} from "lucide-react";

type SettingsData = {
  config: { model: Record<string, string>; flag: Record<string, string>; other: Record<string, string> };
  integrations: Record<string, boolean>;
  github: { configured: boolean; connected: boolean; githubUsername: string | null };
  faseC: { repo: string | null; tokenEnv: boolean; adminConnected: boolean };
};
type AuditRow = { id: string; actionType: string; target: string | null; performedBy: string; reason: string | null; result: string | null; createdAt: string };

const MODEL_LABELS: Record<string, string> = {
  "model.generation": "Generación (propuestas, blog, briefs, chats)",
  "model.classification": "Clasificación / validación (rápido)",
};
const FLAG_LABELS: Record<string, string> = {
  "flag.gmail-sync": "Sincronización de Gmail (cada 15 min)",
  "flag.whatsapp-send": "Envío de WhatsApp",
  "flag.newsletter": "Newsletter semanal",
};
const INTEGRATION_LABELS: Record<string, string> = {
  anthropic: "Anthropic (IA)",
  resend: "Resend (email)",
  gmail: "Gmail sync",
  googleDrive: "Google Drive",
  whatsapp: "WhatsApp",
  googleAnalytics: "Google Analytics",
};

export default function AdminSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<SettingsData>({ queryKey: ["/api/admin/settings"] });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/settings"] });

  return (
    <div className="py-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-9 w-9 rounded-lg bg-[#2FA4A9]/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-[#2FA4A9]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
          <p className="text-xs text-gray-500">Ajustes del sistema — de básicos a avanzados. Todo cambio queda auditado.</p>
        </div>
      </div>

      {/* Atajos del sistema */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button onClick={() => navigate("/admin/agents")} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:border-[#2FA4A9]/40 transition-colors">
          <Activity className="w-4 h-4 text-[#2FA4A9]" /> Salud de agentes
        </button>
        <button onClick={() => navigate("/admin/engineering")} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:border-[#2FA4A9]/40 transition-colors">
          <Stethoscope className="w-4 h-4 text-[#2FA4A9]" /> Ingeniero IA
        </button>
      </div>

      {isLoading || !data ? (
        <p className="text-center text-sm text-gray-400 py-10">Cargando configuración…</p>
      ) : (
        <Tabs defaultValue="models" className="mt-5">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="models"><Cpu className="w-3.5 h-3.5 mr-1" /> Modelos</TabsTrigger>
            <TabsTrigger value="flags"><ToggleRight className="w-3.5 h-3.5 mr-1" /> Flags</TabsTrigger>
            <TabsTrigger value="integrations"><Plug className="w-3.5 h-3.5 mr-1" /> Integraciones</TabsTrigger>
            <TabsTrigger value="advanced"><Database className="w-3.5 h-3.5 mr-1" /> Avanzado</TabsTrigger>
            <TabsTrigger value="account"><KeyRound className="w-3.5 h-3.5 mr-1" /> Cuenta</TabsTrigger>
            <TabsTrigger value="history"><History className="w-3.5 h-3.5 mr-1" /> Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="models"><ModelsTab models={data.config.model} onSaved={refresh} /></TabsContent>
          <TabsContent value="flags"><FlagsTab flags={data.config.flag} onSaved={refresh} /></TabsContent>
          <TabsContent value="integrations"><IntegrationsTab data={data} onChanged={refresh} /></TabsContent>
          <TabsContent value="advanced"><AdvancedTab config={data.config} onSaved={refresh} /></TabsContent>
          <TabsContent value="account"><AccountTab /></TabsContent>
          <TabsContent value="history"><HistoryTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── helper: PATCH config ──
async function patchConfig(key: string, value: string, reason?: string) {
  const res = await apiRequest("PATCH", `/api/admin/settings/config/${key}`, { value, reason });
  return res.json();
}

function ModelsTab({ models, onSaved }: { models: Record<string, string>; onSaved: () => void }) {
  const { toast } = useToast();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [test, setTest] = useState<Record<string, { loading?: boolean; ok?: boolean; error?: string }>>({});
  useEffect(() => { setEdits(models); }, [models]);

  const saveMut = useMutation({
    mutationFn: (k: string) => patchConfig(k, edits[k]),
    onSuccess: () => { toast({ title: "Modelo actualizado", description: "Aplicado sin redeploy." }); onSaved(); },
    onError: (e: any) => toast({ title: "No se pudo guardar", description: e?.message, variant: "destructive" }),
  });

  const runTest = async (k: string) => {
    setTest((t) => ({ ...t, [k]: { loading: true } }));
    try {
      const res = await apiRequest("POST", `/api/admin/settings/config/${k}/test`, { value: edits[k] });
      const r = await res.json();
      setTest((t) => ({ ...t, [k]: { ok: r.ok, error: r.error } }));
    } catch (e: any) {
      setTest((t) => ({ ...t, [k]: { ok: false, error: e?.message } }));
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <p className="text-xs text-gray-500">Cambia el modelo de Claude que usa todo el CRM <strong>sin redeploy</strong>. Prueba el ID contra Anthropic antes de guardar.</p>
      {Object.keys(models).map((k) => {
        const t = test[k] || {};
        const changed = edits[k] !== models[k];
        return (
          <div key={k} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-900">{MODEL_LABELS[k] || k}</div>
            <div className="text-[11px] text-gray-400 mb-2 font-mono">{k}</div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input value={edits[k] ?? ""} onChange={(e) => { setEdits((s) => ({ ...s, [k]: e.target.value })); setTest((s) => ({ ...s, [k]: {} })); }} className="font-mono text-sm" />
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => runTest(k)} disabled={t.loading}>
                  {t.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Probar"}
                </Button>
                <Button size="sm" className="bg-[#2FA4A9] hover:bg-[#238b8f]" disabled={!changed || saveMut.isPending}
                  onClick={() => { if (window.confirm(`Cambiar ${k} a "${edits[k]}"? Afecta TODAS las funciones de IA.`)) saveMut.mutate(k); }}>
                  <Save className="w-4 h-4 mr-1" /> Guardar
                </Button>
              </div>
            </div>
            {t.ok === true && <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Modelo válido contra Anthropic</p>}
            {t.ok === false && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><X className="w-3.5 h-3.5" /> {t.error || "Modelo inválido"}</p>}
          </div>
        );
      })}
    </div>
  );
}

function FlagsTab({ flags, onSaved }: { flags: Record<string, string>; onSaved: () => void }) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: (v: { key: string; value: string }) => patchConfig(v.key, v.value),
    onSuccess: () => onSaved(),
    onError: (e: any) => toast({ title: "No se pudo cambiar el flag", description: e?.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs text-gray-500">Enciende/apaga comportamientos del sistema al instante (sin redeploy).</p>
      {Object.entries(flags).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div>
            <div className="text-sm font-medium text-gray-900">{FLAG_LABELS[k] || k}</div>
            <div className="text-[11px] text-gray-400 font-mono">{k}</div>
          </div>
          <Switch checked={v === "true"} disabled={mut.isPending} onCheckedChange={(c) => mut.mutate({ key: k, value: c ? "true" : "false" })} />
        </div>
      ))}
      {Object.keys(flags).length === 0 && <p className="text-sm text-gray-400">Sin flags configurados.</p>}
    </div>
  );
}

function StatusBadge({ ok, okLabel = "Configurado", offLabel = "Falta" }: { ok: boolean; okLabel?: string; offLabel?: string }) {
  return ok
    ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" /> {okLabel}</span>
    : <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1"><X className="w-3 h-3" /> {offLabel}</span>;
}

function IntegrationsTab({ data, onChanged }: { data: SettingsData; onChanged: () => void }) {
  const { toast } = useToast();
  const disconnect = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/admin/github/disconnect"); },
    onSuccess: () => { toast({ title: "GitHub desconectado" }); onChanged(); },
  });
  const faseCReady = !!data.faseC.repo && (data.faseC.tokenEnv || data.faseC.adminConnected);
  return (
    <div className="space-y-4 mt-2">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900 mb-3">Servicios</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {Object.entries(data.integrations).map(([k, ok]) => (
            <div key={k} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-700">{INTEGRATION_LABELS[k] || k}</span>
              <StatusBadge ok={ok} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">El estado refleja si las variables de entorno están presentes en el servidor (Railway).</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2"><Github className="w-4 h-4" /><span className="text-sm font-semibold text-gray-900">GitHub</span></div>
        {data.github.connected ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Conectado como <strong>{data.github.githubUsername || "—"}</strong></span>
            <Button size="sm" variant="outline" onClick={() => { if (window.confirm("¿Desconectar GitHub?")) disconnect.mutate(); }} disabled={disconnect.isPending}>Desconectar</Button>
          </div>
        ) : data.github.configured ? (
          <a href="/api/github/authorize" className="inline-flex items-center gap-1 text-sm font-medium text-[#2FA4A9] hover:underline">Conectar GitHub <ExternalLink className="w-3.5 h-3.5" /></a>
        ) : (
          <p className="text-sm text-gray-500">OAuth de GitHub no configurado (faltan GITHUB_CLIENT_ID/SECRET).</p>
        )}
      </div>

      <div className={`rounded-xl border p-4 ${faseCReady ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
        <div className="flex items-center gap-2 mb-2">
          {faseCReady ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
          <span className="text-sm font-semibold text-gray-900">Fase C — cambios de código vía Pull Request</span>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between"><span className="text-gray-600">Repo (<code className="text-xs">IM3_REPO</code>)</span><StatusBadge ok={!!data.faseC.repo} okLabel={data.faseC.repo || "ok"} offLabel="Falta" /></div>
          <div className="flex items-center justify-between"><span className="text-gray-600">Token de GitHub</span><StatusBadge ok={data.faseC.tokenEnv || data.faseC.adminConnected} okLabel={data.faseC.tokenEnv ? "GITHUB_TOKEN" : "OAuth admin"} offLabel="Falta" /></div>
        </div>
        {!faseCReady && <p className="text-[11px] text-amber-700 mt-2">Para activar: setea <code>IM3_REPO</code> en Railway y conecta GitHub arriba (o setea <code>GITHUB_TOKEN</code>).</p>}
      </div>
    </div>
  );
}

function AdvancedTab({ config, onSaved }: { config: SettingsData["config"]; onSaved: () => void }) {
  const { toast } = useToast();
  const all = { ...config.model, ...config.flag, ...config.other };
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState(""); const [newVal, setNewVal] = useState("");
  useEffect(() => { setEdits(all); /* eslint-disable-next-line */ }, [JSON.stringify(all)]);

  const save = useMutation({
    mutationFn: (k: string) => patchConfig(k, edits[k]),
    onSuccess: () => { toast({ title: "Guardado" }); onSaved(); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });
  const add = useMutation({
    mutationFn: () => patchConfig(newKey.trim(), newVal),
    onSuccess: () => { toast({ title: "Clave agregada" }); setNewKey(""); setNewVal(""); onSaved(); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-500 mb-3 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Edición directa de <code>system_config</code>. Los <code>model.*</code> se validan contra Anthropic. Cuidado con valores inválidos.</p>
      <div className="space-y-1.5">
        {Object.keys(all).sort().map((k) => (
          <div key={k} className="flex items-center gap-2">
            <code className="text-[11px] text-gray-600 w-44 shrink-0 truncate" title={k}>{k}</code>
            <Input value={edits[k] ?? ""} onChange={(e) => setEdits((s) => ({ ...s, [k]: e.target.value }))} className="font-mono text-xs h-8" />
            <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={edits[k] === all[k] || save.isPending}
              onClick={() => { if (!k.startsWith("model.") || window.confirm(`¿Cambiar ${k}?`)) save.mutate(k); }}>Guardar</Button>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-3">
        <div className="text-xs font-medium text-gray-500 mb-2">Agregar clave nueva</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="clave (ej. flag.x)" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="text-xs h-8" />
          <Input placeholder="valor" value={newVal} onChange={(e) => setNewVal(e.target.value)} className="text-xs h-8" />
          <Button size="sm" className="h-8 bg-[#2FA4A9] hover:bg-[#238b8f] shrink-0" disabled={!newKey.trim() || add.isPending} onClick={() => add.mutate()}>
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccountTab() {
  const { toast } = useToast();
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [cf, setCf] = useState("");
  const mut = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/admin/account/password", { currentPassword: cur, newPassword: nw }); return r.json(); },
    onSuccess: () => { toast({ title: "Contraseña actualizada" }); setCur(""); setNw(""); setCf(""); },
    onError: (e: any) => toast({ title: "No se pudo cambiar", description: e?.message, variant: "destructive" }),
  });
  const canSubmit = cur && nw.length >= 8 && nw === cf;
  return (
    <div className="mt-2 max-w-sm space-y-3">
      <p className="text-xs text-gray-500">Cambia la contraseña de tu cuenta admin.</p>
      <div><label className="text-xs text-gray-600">Contraseña actual</label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">Nueva contraseña (mín. 8)</label><Input type="password" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">Confirmar nueva</label><Input type="password" value={cf} onChange={(e) => setCf(e.target.value)} /></div>
      {nw && cf && nw !== cf && <p className="text-xs text-red-600">Las contraseñas no coinciden.</p>}
      <Button className="bg-[#2FA4A9] hover:bg-[#238b8f]" disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <KeyRound className="w-4 h-4 mr-1" />} Cambiar contraseña
      </Button>
    </div>
  );
}

function HistoryTab() {
  const { data: rows = [], isLoading } = useQuery<AuditRow[]>({ queryKey: ["/api/admin/settings/audit"] });
  return (
    <div className="mt-2">
      <p className="text-xs text-gray-500 mb-3">Auditoría de cambios (panel + agente Ingeniero IM3).</p>
      {isLoading ? <p className="text-sm text-gray-400">Cargando…</p> : rows.length === 0 ? <p className="text-sm text-gray-400">Sin cambios registrados.</p> : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900">{r.actionType}{r.target ? ` · ${r.target}` : ""}</span>
                <span className="text-[11px] text-gray-400">{new Date(r.createdAt).toLocaleString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {r.result && <div className="text-xs text-gray-600 mt-0.5 font-mono break-words">{r.result}</div>}
              <div className="text-[11px] text-gray-400 mt-0.5">por {r.performedBy}{r.reason ? ` — ${r.reason}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
