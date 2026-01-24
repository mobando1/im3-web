import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Layers, 
  GitMerge, 
  Users, 
  Settings, 
  Bell, 
  Search, 
  Menu, 
  X, 
  ChevronRight, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight,
  Database,
  Cpu,
  Shield,
  FileText,
  Clock,
  Zap,
  Layout,
  BarChart3,
  Check,
  Calendar
} from "lucide-react";

// --- Types ---
type View = 'overview' | 'modules' | 'workflow' | 'audit' | 'planning';

// --- Dashboard Shell ---

const Sidebar = ({ currentView, setView, mobileOpen, setMobileOpen }: { 
  currentView: View, 
  setView: (v: View) => void,
  mobileOpen: boolean,
  setMobileOpen: (v: boolean) => void
}) => {
  const menu = [
    { id: 'overview', label: 'Visión General', icon: LayoutDashboard },
    { id: 'modules', label: 'Módulos del Sistema', icon: Layers },
    { id: 'workflow', label: 'Flujo de Trabajo', icon: GitMerge },
    { id: 'audit', label: 'Registro de Auditoría', icon: Users },
    { id: 'planning', label: 'Planificación', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-[#0B1C2D] text-gray-300 flex flex-col transition-transform duration-300 ease-in-out border-r border-white/10",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Logo Area */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-white/10">
          <div className="w-8 h-8 rounded bg-[hsl(var(--teal))] flex items-center justify-center text-white font-bold text-xs shadow-[0_0_15px_rgba(47,164,169,0.5)]">
            IM3
          </div>
          <div className="font-display font-bold text-white tracking-tight">IM3 OS</div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-3 space-y-1">
          {menu.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id as View);
                  setMobileOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                  isActive 
                    ? "bg-[hsl(var(--teal))]/10 text-[hsl(var(--teal))]" 
                    : "hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-[hsl(var(--teal))]" : "text-gray-500 group-hover:text-gray-300")} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Profile (Bottom) */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5 border border-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-xs font-bold text-white">
              G
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">Guest User</div>
              <div className="text-[10px] text-gray-500 truncate">Read-only access</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          </div>
        </div>
      </aside>
    </>
  );
};

const TopBar = ({ setMobileOpen, currentView }: { setMobileOpen: (v: boolean) => void, currentView: string }) => {
  const titles: Record<string, string> = {
    overview: 'Visión General',
    modules: 'Módulos',
    workflow: 'Flujo de Trabajo',
    audit: 'Auditoría',
    planning: 'Planificación'
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button 
          className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>IM3 OS</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-[hsl(var(--ink))]">{titles[currentView]}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
          <Activity className="w-3 h-3" />
          Sistema Operativo: Estable
        </div>
        <div className="h-8 w-[1px] bg-gray-200 mx-2 hidden md:block"></div>
        <button className="p-2 text-gray-400 hover:text-[hsl(var(--ink))] transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        <button className="bg-[hsl(var(--ink))] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2e44] transition-colors"
           onClick={() => window.open("https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei", "_blank")}
        >
          Agendar Soporte
        </button>
      </div>
    </header>
  );
};

// --- Views ---

const OverviewView = ({ setView }: { setView: (v: View) => void }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[hsl(var(--ink))] to-[#162d44] rounded-2xl p-8 text-white relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--teal))] opacity-10 blur-[80px] rounded-full pointer-events-none"></div>
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Bienvenido a la Operación Centralizada
          </h1>
          <p className="text-gray-300 text-lg mb-8 leading-relaxed">
            IM3 construye sistemas operativos a medida para empresas que necesitan orden, claridad y escalabilidad. Esto no es solo una web, es una demostración de control.
          </p>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => setView('modules')}
              className="bg-[hsl(var(--teal))] text-white px-5 py-2.5 rounded-xl font-medium hover:bg-[#258a8e] transition-all shadow-lg shadow-teal-900/20"
            >
              Explorar Módulos
            </button>
            <button 
              onClick={() => setView('workflow')}
              className="bg-white/10 text-white border border-white/10 px-5 py-2.5 rounded-xl font-medium hover:bg-white/20 transition-all"
            >
              Ver Metodología
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Cpu className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+12% vs mes anterior</span>
          </div>
          <h3 className="text-2xl font-bold text-[hsl(var(--ink))] mb-1">Eficiencia</h3>
          <p className="text-sm text-gray-500">Automatización de tareas repetitivas.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">3 Alertas</span>
          </div>
          <h3 className="text-2xl font-bold text-[hsl(var(--ink))] mb-1">Fricción Detectada</h3>
          <p className="text-sm text-gray-500">Procesos manuales requieren atención.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Database className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">Estable</span>
          </div>
          <h3 className="text-2xl font-bold text-[hsl(var(--ink))] mb-1">Integridad de Datos</h3>
          <p className="text-sm text-gray-500">Información centralizada y confiable.</p>
        </div>
      </div>

      {/* Recent Activity / Value Props */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-[hsl(var(--ink))]">Log de Prioridades del Sistema</h3>
          <button className="text-xs text-[hsl(var(--teal))] font-medium hover:underline">Ver todo</button>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { icon: CheckCircle2, color: "text-emerald-500", title: "Ejecución Clara", desc: "Alcance, entregables y criterios definidos.", time: "Always" },
            { icon: Layout, color: "text-blue-500", title: "Estructura Robusta", desc: "Diseño del sistema antes de escribir código.", time: "Pre-code" },
            { icon: Shield, color: "text-purple-500", title: "Mantenibilidad", desc: "Documentación y handoff para operar sin dependencias.", time: "Post-deploy" },
          ].map((item, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
              <item.icon className={cn("w-5 h-5", item.color)} />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <div className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">{item.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ModulesView = () => {
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[hsl(var(--ink))]">Módulos Disponibles</h2>
          <p className="text-gray-500">Soluciones técnicas para resolver problemas operativos.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          {
            icon: Layout,
            title: "Aplicaciones Internas",
            desc: "Herramientas a medida para control operativo, reportes y flujos.",
            features: ["Paneles de Control", "Formularios Inteligentes", "Gestión de Inventario"],
            status: "Instalado",
            color: "blue"
          },
          {
            icon: Zap,
            title: "Automatización",
            desc: "Conexión de APIs y datos para eliminar tareas repetitivas.",
            features: ["Webhooks & APIs", "Sincronización en tiempo real", "Bots de notificación"],
            status: "Activo",
            color: "amber"
          },
          {
            icon: Activity,
            title: "Sistemas de Control",
            desc: "Dashboards y auditoría para visibilidad real.",
            features: ["Alertas automáticas", "KPIs en vivo", "Conciliación de datos"],
            status: "Premium",
            color: "emerald"
          }
        ].map((mod, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col h-full group">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110", 
                mod.color === "blue" ? "bg-blue-50 text-blue-600" : 
                mod.color === "amber" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
              )}>
                <mod.icon className="w-6 h-6" />
              </div>
              <span className={cn("text-xs font-medium px-2 py-1 rounded-full border",
                 mod.status === "Premium" ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-gray-50 text-gray-600 border-gray-100"
              )}>
                {mod.status}
              </span>
            </div>
            
            <h3 className="text-lg font-bold text-[hsl(var(--ink))] mb-2">{mod.title}</h3>
            <p className="text-sm text-gray-500 mb-6 flex-1">{mod.desc}</p>
            
            <div className="space-y-2 mb-6">
              {mod.features.map((f, j) => (
                <div key={j} className="flex items-center gap-2 text-xs text-gray-600">
                  <Check className="w-3 h-3 text-[hsl(var(--teal))]" /> {f}
                </div>
              ))}
            </div>

            <button className="w-full py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[hsl(var(--ink))] transition-colors">
              Ver Detalles
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const WorkflowView = () => {
  const steps = [
    { num: "01", title: "Diagnóstico", text: "Entendemos tu operación y dónde se pierde tiempo o dinero." },
    { num: "02", title: "Diseño", text: "Definimos estructura de datos, flujo, roles y métricas." },
    { num: "03", title: "Construcción", text: "Desarrollamos un MVP funcional con foco en uso real." },
    { num: "04", title: "Automatización", text: "Conectamos lo necesario para eliminar tareas repetitivas." },
    { num: "05", title: "Transferencia", text: "Documentación + handoff para que el sistema se mantenga." },
  ];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-[hsl(var(--ink))]">Pipeline de Implementación</h2>
        <p className="text-gray-500">Nuestro proceso estándar para garantizar resultados predecibles.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <div className="relative">
          {/* Vertical line for mobile, Horizontal for desktop could be tricky, let's stick to vertical list with nice UI */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100"></div>
          
          <div className="space-y-8 relative">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-6 relative group">
                <div className="w-8 h-8 rounded-full bg-[hsl(var(--ink))] text-white flex items-center justify-center text-xs font-bold shrink-0 z-10 ring-4 ring-white group-hover:ring-[hsl(var(--teal))]/20 transition-all">
                  {step.num}
                </div>
                <div className="bg-gray-50 p-6 rounded-xl flex-1 border border-gray-100 group-hover:border-[hsl(var(--teal))]/30 group-hover:bg-white transition-all shadow-sm">
                  <h3 className="font-bold text-[hsl(var(--ink))] text-lg mb-2">{step.title}</h3>
                  <p className="text-gray-600">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const AuditView = () => {
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
       <div className="grid md:grid-cols-2 gap-6">
          {/* Target Audience Card */}
          <div className="bg-[hsl(var(--ink))] text-white p-8 rounded-2xl relative overflow-hidden shadow-lg">
             <div className="absolute top-0 right-0 w-40 h-40 bg-[hsl(var(--teal))] opacity-20 blur-[60px] rounded-full"></div>
             <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6 text-[hsl(var(--teal))]" />
                <h3 className="text-xl font-bold">Perfil de Acceso Autorizado</h3>
             </div>
             <p className="text-gray-400 text-sm mb-4 font-mono uppercase tracking-wider">Access Granted If:</p>
             <ul className="space-y-3 relative z-10">
               {[
                 "Operación depende de personas/WhatsApp.",
                 "Reportes manuales consumen >4 horas/semana.",
                 "Múltiples apps desconectadas.",
                 "Busca sistema mantenible a largo plazo."
               ].map((item, i) => (
                 <li key={i} className="flex gap-3 items-start text-sm">
                   <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />
                   <span className="text-gray-300">{item}</span>
                 </li>
               ))}
             </ul>
          </div>

          {/* Anti-Persona Card */}
          <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <h3 className="text-xl font-bold text-[hsl(var(--ink))]">Acceso Denegado</h3>
             </div>
             <p className="text-gray-500 text-sm mb-4 font-mono uppercase tracking-wider">Access Denied If:</p>
             <ul className="space-y-3">
               {[
                 "Busca 'solución mágica' sin cambiar procesos.",
                 "Proyectos sin dueño interno.",
                 "Implementaciones genéricas 'copia y pega'.",
                 "Sin interés en documentar."
               ].map((item, i) => (
                 <li key={i} className="flex gap-3 items-start text-sm">
                   <X className="w-4 h-4 text-red-400 mt-0.5" />
                   <span className="text-gray-500">{item}</span>
                 </li>
               ))}
             </ul>
          </div>
       </div>

       {/* Testimonials "Logs" */}
       <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
             <h3 className="font-bold text-[hsl(var(--ink))] flex items-center gap-2">
               <FileText className="w-4 h-4 text-gray-400" /> User Impact Logs
             </h3>
          </div>
          <div className="divide-y divide-gray-100">
             {[
                { user: "Laura Méndez", role: "Ops @ Bodega 72", msg: "Tiempo de cierre reducido: 4 días → 4 horas.", status: "Success" },
                { user: "Carlos Rojas", role: "Admin @ CasaMesa", msg: "Visibilidad de inventario en tiempo real activada.", status: "Verified" },
                { user: "Paula Andrade", role: "Dir @ Quanta", msg: "Implementación ordenada. Adopción de equipo exitosa.", status: "Optimal" }
             ].map((log, i) => (
                <div key={i} className="p-6 flex flex-col md:flex-row md:items-center gap-4 hover:bg-gray-50 transition-colors">
                   <div className="flex items-center gap-3 md:w-1/4">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                         {log.user.charAt(0)}
                      </div>
                      <div>
                         <div className="text-sm font-semibold text-[hsl(var(--ink))]">{log.user}</div>
                         <div className="text-xs text-gray-500">{log.role}</div>
                      </div>
                   </div>
                   <div className="flex-1 text-sm text-gray-600 font-mono">
                      "{log.msg}"
                   </div>
                   <div className="px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                      {log.status}
                   </div>
                </div>
             ))}
          </div>
       </div>
    </div>
  );
};

const PlanningView = () => {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
       <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center max-w-3xl mx-auto">
          <Calendar className="w-12 h-12 text-[hsl(var(--teal))] mx-auto mb-6" />
          <h2 className="text-2xl md:text-3xl font-bold text-[hsl(var(--ink))] mb-4">Agenda tu Diagnóstico Operativo</h2>
          <p className="text-gray-500 text-lg mb-8">
            Analizamos tu operación, detectamos cuellos de botella y te entregamos un mapa claro de qué sistema implementar. Sin costo inicial.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 text-left mb-8">
             <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h4 className="font-bold text-[hsl(var(--ink))] mb-2 flex items-center gap-2">
                   <Zap className="w-4 h-4 text-blue-500" /> Implementación Completa
                </h4>
                <p className="text-sm text-gray-500">Nos encargamos de todo. Llave en mano.</p>
             </div>
             <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h4 className="font-bold text-[hsl(var(--ink))] mb-2 flex items-center gap-2">
                   <Users className="w-4 h-4 text-amber-500" /> Acompañamiento
                </h4>
                <p className="text-sm text-gray-500">Diseñamos la arquitectura, tu equipo construye.</p>
             </div>
          </div>

          <button 
             onClick={() => window.open("https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei", "_blank")}
             className="w-full md:w-auto bg-[hsl(var(--ink))] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#1a2e44] transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
             Iniciar Diagnóstico Ahora <ArrowUpRight className="w-5 h-5" />
          </button>
       </div>
    </div>
  );
};

// --- Main App Layout ---

export default function Home() {
  const [currentView, setView] = useState<View>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex font-sans selection:bg-[hsl(var(--teal))] selection:text-white">
      <Sidebar 
        currentView={currentView} 
        setView={setView} 
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar setMobileOpen={setMobileOpen} currentView={currentView} />
        
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            {currentView === 'overview' && <OverviewView setView={setView} />}
            {currentView === 'modules' && <ModulesView />}
            {currentView === 'workflow' && <WorkflowView />}
            {currentView === 'audit' && <AuditView />}
            {currentView === 'planning' && <PlanningView />}
          </div>
        </main>
      </div>
    </div>
  );
}
