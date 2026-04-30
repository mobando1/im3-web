import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function PortalResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres");
    if (password !== confirm) return setError("Las contraseñas no coinciden");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Error reseteando contraseña");
      }
      setDone(true);
      setTimeout(() => navigate("/portal/login"), 2500);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
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
            Nueva contraseña
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-8">
          {done ? (
            <div className="text-center space-y-3">
              <p className="text-emerald-400 text-sm">✓ Contraseña actualizada</p>
              <p className="text-white/60 text-xs">Redirigiendo al login...</p>
            </div>
          ) : !token ? (
            <div className="text-center space-y-3">
              <p className="text-red-400 text-sm">Link inválido</p>
              <Link href="/portal/forgot-password" className="text-[#2FA4A9] text-sm hover:underline">
                Solicitar nuevo link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Nueva contraseña
                </label>
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
                <label className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Confirmar
                </label>
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
              <Button type="submit" disabled={loading} className="w-full h-11 bg-[#2FA4A9] hover:bg-[#2FA4A9]/90 text-white">
                {loading ? "Guardando..." : "Establecer contraseña"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
