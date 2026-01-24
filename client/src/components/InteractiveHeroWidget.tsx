import { useState, useEffect } from "react";
import { Activity, Check, Clock, AlertCircle, ArrowUpRight, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const InteractiveHeroWidget = () => {
  const [tasks, setTasks] = useState([
    { id: 1, type: "Automación", title: "Sincronización de Inventario", status: "completed", time: "Hace 2m" },
    { id: 2, type: "Alerta", title: "Stock bajo: Ref. 4829", status: "pending", time: "Ahora" },
    { id: 3, type: "Reporte", title: "Cierre diario generado", status: "processing", time: "Hace 5m" },
    { id: 4, type: "Sistema", title: "Backup base de datos", status: "completed", time: "Hace 15m" },
  ]);

  const [stats, setStats] = useState({
    efficiency: 94,
    uptime: 99.9,
    tasks: 128
  });

  // Simulate live activity
  useEffect(() => {
    const interval = setInterval(() => {
      // Randomly update a stat
      setStats(prev => ({
        ...prev,
        efficiency: Math.min(100, Math.max(90, prev.efficiency + (Math.random() - 0.5))),
        tasks: prev.tasks + (Math.random() > 0.7 ? 1 : 0)
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = (id: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, status: t.status === "pending" ? "completed" : "pending" };
      }
      return t;
    }));
  };

  return (
    <div className="w-full h-full bg-[#0F172A] text-white flex flex-col font-sans text-xs sm:text-sm">
      {/* Widget Header */}
      <div className="h-10 border-b border-white/10 flex items-center justify-between px-4 bg-[#1E293B]/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold tracking-wide text-slate-200">OPS CENTER</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          EN LÍNEA
        </div>
      </div>

      <div className="flex-1 p-4 grid grid-cols-1 gap-4 overflow-hidden">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1E293B] p-3 rounded-lg border border-white/5">
            <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Eficiencia</div>
            <div className="text-xl font-bold text-white flex items-end gap-1">
              {stats.efficiency.toFixed(1)}%
              <ArrowUpRight className="w-3 h-3 text-emerald-400 mb-1" />
            </div>
          </div>
          <div className="bg-[#1E293B] p-3 rounded-lg border border-white/5">
            <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Uptime</div>
            <div className="text-xl font-bold text-white">{stats.uptime}%</div>
          </div>
          <div className="bg-[#1E293B] p-3 rounded-lg border border-white/5">
             <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Tareas</div>
             <div className="text-xl font-bold text-white">{stats.tasks}</div>
          </div>
        </div>

        {/* Live Feed */}
        <div className="flex flex-col gap-2 flex-1 overflow-hidden">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">Actividad Reciente</div>
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <div 
                key={task.id} 
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all duration-300",
                  task.status === "pending" 
                    ? "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20" 
                    : "bg-[#1E293B] border-white/5 hover:bg-[#283548]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded flex items-center justify-center",
                    task.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : 
                    task.status === "pending" ? "bg-amber-500/20 text-amber-400" :
                    "bg-blue-500/20 text-blue-400"
                  )}>
                    {task.type === "Automación" && <Zap className="w-4 h-4" />}
                    {task.type === "Alerta" && <AlertCircle className="w-4 h-4" />}
                    {task.type === "Reporte" && <Clock className="w-4 h-4" />}
                    {task.type === "Sistema" && <Shield className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="font-medium text-slate-200">{task.title}</div>
                    <div className="text-[10px] text-slate-500">{task.type} • {task.time}</div>
                  </div>
                </div>

                {task.status === "pending" ? (
                   <button 
                     onClick={() => handleAction(task.id)}
                     className="px-2 py-1 bg-amber-500 text-amber-950 text-[10px] font-bold rounded hover:bg-amber-400 transition-colors"
                   >
                     RESOLVER
                   </button>
                ) : (
                  <div className="text-emerald-500">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Footer Banner */}
      <div className="mt-auto border-t border-white/10 p-3 bg-[#0B1221] text-[10px] text-center text-slate-500">
        Vista en tiempo real del sistema operativo
      </div>
    </div>
  );
};
