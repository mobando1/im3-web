import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ERROR_LABELS: Record<string, string> = {
  link_invalido: "Ese link no es válido. Pídele al equipo que te envíe uno nuevo.",
  link_ya_usado: "Ese link ya fue usado. Pide uno nuevo abajo.",
  link_expirado: "Ese link expiró. Pide uno nuevo abajo.",
  cuenta_deshabilitada: "Tu cuenta está deshabilitada. Contacta al equipo de IM3.",
  login_fallo: "No pudimos iniciar tu sesión. Intenta de nuevo.",
  error_inesperado: "Ocurrió un error. Intenta de nuevo en un momento.",
};

export default function PortalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [magicSubmitted, setMagicSubmitted] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const { login, isLoggingIn, loginError, isAuthenticated } = useClientAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err && ERROR_LABELS[err]) setLinkError(ERROR_LABELS[err]);
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate("/portal/projects");
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email: email.trim().toLowerCase(), password });
      const res = await fetch("/api/portal/projects", { credentials: "include" });
      if (res.ok) {
        const projects = (await res.json()) as Array<{ id: string }>;
        if (projects.length === 1) {
          navigate(`/portal/projects/${projects[0].id}`);
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/portal/projects"] });
      navigate("/portal/projects");
    } catch {
      // loginError will display
    }
  };

  const handleMagicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLoading(true);
    try {
      await fetch("/api/portal/auth/magic-link-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setMagicSubmitted(true);
    } finally {
      setMagicLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #0f2438 0%, #0B1C2D 50%, #060e18 100%)" }}
    >
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(rgba(47,164,169,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(47,164,169,0.5) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, #2FA4A9 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/assets/im3-logo.png" alt="IM3 Systems" className="h-10 mb-4 opacity-90" />
          <p className="text-[13px] tracking-[0.2em] uppercase text-[#2FA4A9]/70 font-medium">
            Portal del cliente
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-8">
          {linkError && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 mb-5">
              <p className="text-amber-300 text-sm">{linkError}</p>
            </div>
          )}

          {mode === "magic" ? (
            magicSubmitted ? (
              <div className="space-y-4 text-center">
                <div className="text-3xl">📧</div>
                <h2 className="text-white text-lg font-medium">Revisa tu correo</h2>
                <p className="text-white/60 text-sm leading-relaxed">
                  Si <strong className="text-white/80">{email}</strong> tiene acceso al portal, te enviamos un link para entrar. Es válido por 30 minutos.
                </p>
                <button
                  type="button"
                  onClick={() => { setMagicSubmitted(false); setEmail(""); }}
                  className="text-xs text-white/40 hover:text-[#2FA4A9] transition-colors"
                >
                  Usar otro correo
                </button>
              </div>
            ) : (
              <form onSubmit={handleMagicSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-medium text-white/40 uppercase tracking-wider">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@empresa.com"
                    className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-[#2FA4A9]/50 focus:ring-[#2FA4A9]/20"
                    autoComplete="email"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={magicLoading}
                  className="w-full h-11 bg-[#2FA4A9] hover:bg-[#2FA4A9]/90 text-white font-medium"
                >
                  {magicLoading ? "Enviando..." : "Enviarme un link de acceso"}
                </Button>

                <p className="text-[11px] text-white/30 text-center leading-relaxed">
                  Te enviamos un link por email. Sin contraseñas.
                </p>

                <div className="text-center pt-1 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setMode("password")}
                    className="text-xs text-white/40 hover:text-[#2FA4A9] transition-colors mt-3"
                  >
                    Prefiero usar contraseña
                  </button>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-[#2FA4A9]/50 focus:ring-[#2FA4A9]/20"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Contraseña
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-[#2FA4A9]/50 focus:ring-[#2FA4A9]/20"
                  autoComplete="current-password"
                  required
                />
              </div>

              {loginError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                  <p className="text-red-400 text-sm">{loginError.replace(/^\d+:\s*/, "")}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full h-11 bg-[#2FA4A9] hover:bg-[#2FA4A9]/90 text-white font-medium"
              >
                {isLoggingIn ? "Ingresando..." : "Ingresar"}
              </Button>

              <div className="flex justify-between items-center pt-1 border-t border-white/[0.06] mt-3">
                <button
                  type="button"
                  onClick={() => setMode("magic")}
                  className="text-xs text-white/40 hover:text-[#2FA4A9] transition-colors"
                >
                  ← Usar link por email
                </button>
                <Link href="/portal/forgot-password" className="text-xs text-white/40 hover:text-[#2FA4A9] transition-colors">
                  Olvidé mi contraseña
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
