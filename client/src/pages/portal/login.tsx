import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function PortalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoggingIn, loginError, isAuthenticated } = useClientAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isAuthenticated) navigate("/portal/projects");
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email: email.trim().toLowerCase(), password });
      // After login, fetch projects to decide where to land
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
          <form onSubmit={handleSubmit} className="space-y-5">
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

            <div className="text-center pt-1">
              <Link href="/portal/forgot-password" className="text-xs text-white/40 hover:text-[#2FA4A9] transition-colors">
                Olvidé mi contraseña
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
