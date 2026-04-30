import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type InviteInfo = { email: string; projectName: string | null };

export default function PortalAcceptInvite() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") || "";
    setToken(t);
    if (!t) {
      setLoadError("Link inválido");
      return;
    }
    fetch(`/api/portal/auth/invite/${encodeURIComponent(t)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || "Invitación inválida");
        }
        return r.json();
      })
      .then((data: InviteInfo) => setInfo(data))
      .catch((e) => setLoadError(e?.message || "Invitación inválida"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres");
    if (password !== confirm) return setError("Las contraseñas no coinciden");
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name.trim() || undefined }),
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Error aceptando invitación");
      }
      const data = await res.json();
      queryClient.setQueryData(["/api/portal/auth/me"], data);
      // Fetch projects to decide where to land
      const r2 = await fetch("/api/portal/projects", { credentials: "include" });
      if (r2.ok) {
        const projects = (await r2.json()) as Array<{ id: string }>;
        if (projects.length === 1) {
          navigate(`/portal/projects/${projects[0].id}`);
          return;
        }
      }
      navigate("/portal/projects");
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at center, #0f2438 0%, #0B1C2D 50%, #060e18 100%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/assets/im3-logo.png" alt="IM3" className="h-10 mb-4 opacity-90" />
          <p className="text-[13px] tracking-[0.2em] uppercase text-[#2FA4A9]/70 font-medium">
            Configurar mi acceso
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-8">
          {loadError ? (
            <div className="text-center space-y-3">
              <p className="text-red-400 text-sm">{loadError}</p>
              <p className="text-white/40 text-xs">
                Pídele al equipo de IM3 que te envíe una nueva invitación.
              </p>
            </div>
          ) : !info ? (
            <p className="text-white/60 text-sm text-center">Validando invitación...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Email</p>
                <p className="text-white text-sm font-medium">{info.email}</p>
                {info.projectName && (
                  <p className="text-white/40 text-xs mt-2">Proyecto: <span className="text-white/70">{info.projectName}</span></p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Nombre (opcional)</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="h-11 bg-white/[0.04] border-white/[0.08] text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Contraseña</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-white/[0.04] border-white/[0.08] text-white"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <p className="text-[10px] text-white/30">Mínimo 8 caracteres</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Confirmar</label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-11 bg-white/[0.04] border-white/[0.08] text-white"
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              <Button type="submit" disabled={submitting} className="w-full h-11 bg-[#2FA4A9] hover:bg-[#2FA4A9]/90 text-white">
                {submitting ? "Configurando..." : "Configurar mi acceso"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
