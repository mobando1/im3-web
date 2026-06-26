import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, MotionConfig } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShaderBackground } from "@/components/shader-background";

const EASE = [0.23, 1, 0.32, 1] as [number, number, number, number];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoggingIn, loginError, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated) navigate("/admin");
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ username, password });
      navigate("/admin");
    } catch {
      // Error handled by loginError
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060e18] p-4">
        {/* Aurora WebGL */}
        <ShaderBackground className="absolute inset-0 h-full w-full" />

        {/* Grano/vignette sutil + glow superior para profundidad */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 50% -10%, rgba(47,164,169,0.10) 0%, transparent 45%), radial-gradient(100% 100% at 50% 120%, rgba(6,14,24,0.55) 0%, transparent 50%)" }}
        />

        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="relative z-10 w-full max-w-sm"
        >
          {/* Logo */}
          <motion.div variants={item} className="mb-8 flex flex-col items-center">
            <img
              src="/assets/im3-logo.png"
              alt="IM3 Systems"
              className="mb-4 h-11"
              style={{ filter: "brightness(0) invert(1) drop-shadow(0 0 16px rgba(47,164,169,0.55))" }}
            />
            <p className="text-[13px] font-medium uppercase tracking-[0.25em] text-[#2FA4A9]/80">
              Panel de control
            </p>
          </motion.div>

          {/* Card */}
          <motion.div
            variants={item}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)] backdrop-blur-xl"
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-xs font-medium uppercase tracking-wider text-white/40">
                  Usuario
                </label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="h-11 border-white/[0.10] bg-white/[0.05] text-white transition-colors placeholder:text-white/20 focus:border-[#2FA4A9]/60 focus:ring-[#2FA4A9]/20"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-white/40">
                  Contraseña
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 border-white/[0.10] bg-white/[0.05] text-white transition-colors placeholder:text-white/20 focus:border-[#2FA4A9]/60 focus:ring-[#2FA4A9]/20"
                  autoComplete="current-password"
                  required
                />
              </div>

              {loginError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                  <p className="text-sm text-red-400">{loginError.replace(/^\d+:\s*/, "")}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="h-11 w-full bg-[#2FA4A9] font-medium text-white transition-all hover:bg-[#2FA4A9]/90 hover:shadow-[0_0_28px_rgba(47,164,169,0.4)]"
              >
                {isLoggingIn ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>
          </motion.div>

          {/* Footer */}
          <motion.div variants={item} className="mt-6 text-center">
            <button
              onClick={() => navigate("/")}
              className="text-xs text-white/25 transition-colors hover:text-white/50"
            >
              &larr; Volver al sitio
            </button>
          </motion.div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
