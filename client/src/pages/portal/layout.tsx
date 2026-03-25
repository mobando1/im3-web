import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

const navItems = [
  { href: "/portal", label: "Proyecto", icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
  { href: "/portal/profile", label: "Perfil", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#060e18]">
      {/* Top bar */}
      <header className="border-b border-white/[0.06] bg-[#0B1C2D]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <img src="/assets/im3-logo.png" alt="IM3 Systems" className="h-7 opacity-90" />
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/portal" && location.startsWith(item.href));
                const isProjectActive = item.href === "/portal" && location === "/portal";
                const active = isActive || isProjectActive;
                return (
                  <button
                    key={item.href}
                    onClick={() => navigate(item.href)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      active
                        ? "bg-[#2FA4A9]/10 text-[#2FA4A9]"
                        : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm text-white/60">{user?.displayName || user?.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="sm:hidden border-b border-white/[0.06] bg-[#0B1C2D]/50 px-4 py-2 flex gap-2">
        {navItems.map((item) => {
          const active = location === item.href;
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? "bg-[#2FA4A9]/10 text-[#2FA4A9]" : "text-white/40"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
