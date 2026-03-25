import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type InviteData = {
  email: string;
  contactName: string;
  contactEmpresa: string;
};

export default function InviteLanding() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token || "";
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: invite, isLoading, error } = useQuery<InviteData>({
    queryKey: [`/api/invite/${token}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invite/${token}/accept`, { password });
      return res.json();
    },
    onSuccess: () => {
      navigate("/portal");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return;
    if (password.length < 6) return;
    acceptMutation.mutate();
  };

  const errorMessage = error?.message?.replace(/^\d+:\s*/, "") || acceptMutation.error?.message?.replace(/^\d+:\s*/, "");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "radial-gradient(ellipse at center, #0f2438 0%, #0B1C2D 50%, #060e18 100%)" }}>
        <div className="h-8 w-8 border-4 border-white/10 border-t-[#2FA4A9] rounded-full animate-spin" />
      </div>
    );
  }

  if (errorMessage || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "radial-gradient(ellipse at center, #0f2438 0%, #0B1C2D 50%, #060e18 100%)" }}>
        <div className="text-center max-w-sm">
          <img src="/assets/im3-logo.png" alt="IM3 Systems" className="h-10 mx-auto mb-6 opacity-90" />
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-8">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <h2 className="text-white text-lg font-semibold mb-2">Invitacion no valida</h2>
            <p className="text-white/50 text-sm">{errorMessage || "Esta invitacion no existe, ya fue utilizada o ha expirado."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #0f2438 0%, #0B1C2D 50%, #060e18 100%)" }}>

      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(47,164,169,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(47,164,169,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.08]"
        style={{ background: "radial-gradient(circle, #2FA4A9 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/assets/im3-logo.png" alt="IM3 Systems" className="h-10 mb-4 opacity-90" />
          <p className="text-[13px] tracking-[0.2em] uppercase text-[#2FA4A9]/70 font-medium">
            Portal de cliente
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-8">
          {/* Welcome message */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-white mb-2">
              Bienvenido, {invite.contactName.split(" ")[0]}
            </h1>
            <p className="text-white/40 text-sm">
              {invite.contactEmpresa}
            </p>
          </div>

          {/* Value props */}
          <div className="space-y-3 mb-8">
            {[
              { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", text: "Seguimiento en tiempo real del avance de tu proyecto" },
              { icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", text: "Acceso a entregables y actualizaciones" },
              { icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", text: "Comunicacion directa con tu equipo de desarrollo" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#2FA4A9]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-[#2FA4A9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.06] mb-6" />

          {/* Registration form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Email</label>
              <Input
                value={invite.email}
                disabled
                className="h-11 bg-white/[0.02] border-white/[0.06] text-white/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Contrasena</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-[#2FA4A9]/50 focus:ring-[#2FA4A9]/20"
                required
                minLength={6}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Confirmar contrasena</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetir contrasena"
                className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-[#2FA4A9]/50 focus:ring-[#2FA4A9]/20"
                required
                minLength={6}
              />
            </div>

            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-red-400 text-xs">Las contrasenas no coinciden</p>
            )}

            {acceptMutation.error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <p className="text-red-400 text-sm">{acceptMutation.error.message?.replace(/^\d+:\s*/, "")}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={acceptMutation.isPending || password !== confirmPassword || password.length < 6}
              className="w-full h-11 bg-[#2FA4A9] hover:bg-[#2FA4A9]/90 text-white font-medium transition-all hover:shadow-[0_0_20px_rgba(47,164,169,0.25)]"
            >
              {acceptMutation.isPending ? "Creando cuenta..." : "Crear mi cuenta"}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-white/20">
            IM3 Systems &middot; Portal de proyecto
          </p>
        </div>
      </div>
    </div>
  );
}
