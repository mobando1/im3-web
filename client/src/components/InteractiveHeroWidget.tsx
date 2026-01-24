import { useState, useEffect, useRef, useCallback } from "react";
import { 
  Activity, 
  ArrowUpRight, 
  Zap,
  Database,
  Box,
  LayoutDashboard,
  Search,
  Bell,
  MoreHorizontal,
  Plus,
  Trash2,
  Settings,
  GitBranch,
  Filter,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Package,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

// --- Mock Data Generators ---

const generateInitialData = (points = 20) => {
  return Array.from({ length: points }).map((_, i) => ({
    time: i,
    value: 85 + Math.random() * 15,
    traffic: 100 + Math.random() * 50
  }));
};

// --- Animated Number Component ---

const AnimatedNumber = ({ value, duration = 1000 }: { value: number, duration?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    const startValue = displayValue;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplayValue(startValue + (value - startValue) * eased);
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);
  
  return <>{displayValue.toFixed(1)}</>;
};

// --- Toast Notification Component ---

const ToastNotification = ({ message, type, onClose }: { message: string, type: 'success' | 'warning' | 'info', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className={cn(
      "absolute top-16 right-4 px-4 py-3 rounded-lg shadow-xl border backdrop-blur-md animate-in slide-in-from-right-5 fade-in duration-300 flex items-center gap-3 z-50",
      type === 'success' && "bg-emerald-500/20 border-emerald-500/30 text-emerald-300",
      type === 'warning' && "bg-amber-500/20 border-amber-500/30 text-amber-300",
      type === 'info' && "bg-blue-500/20 border-blue-500/30 text-blue-300"
    )}>
      {type === 'success' && <CheckCircle2 className="w-4 h-4" />}
      {type === 'warning' && <AlertTriangle className="w-4 h-4" />}
      {type === 'info' && <Bell className="w-4 h-4" />}
      <span className="text-xs font-medium">{message}</span>
    </div>
  );
};

// --- Custom Chart Component with Glow ---

const LiveChart = ({ data }: { data: any[] }) => {
  const width = 100;
  const height = 100;
  const padding = 5;
  
  const minValue = Math.min(...data.map(d => Math.min(d.value, d.traffic))) - 10;
  const maxValue = Math.max(...data.map(d => Math.max(d.value, d.traffic))) + 10;
  
  const scaleY = (value: number) => {
    return height - padding - ((value - minValue) / (maxValue - minValue)) * (height - 2 * padding);
  };
  
  const scaleX = (index: number) => {
    return padding + (index / (data.length - 1)) * (width - 2 * padding);
  };
  
  const valuePath = data.map((d, i) => 
    `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.value)}`
  ).join(' ');
  
  const trafficPath = data.map((d, i) => 
    `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.traffic)}`
  ).join(' ');
  
  const areaPath = `M ${scaleX(0)} ${height - padding} L ${valuePath.slice(2)} L ${scaleX(data.length - 1)} ${height - padding} Z`;
  
  // Current point for glow effect
  const lastPoint = data[data.length - 1];
  const lastX = scaleX(data.length - 1);
  const lastY = scaleY(lastPoint.value);
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Area fill */}
      <path d={areaPath} fill="url(#areaGradient)" stroke="none" />
      
      {/* Value line with glow */}
      <path
        d={valuePath}
        fill="none"
        stroke="#10B981"
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
        filter="url(#glow)"
      />
      
      {/* Traffic line */}
      <path
        d={trafficPath}
        fill="none"
        stroke="#3B82F6"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
        opacity="0.7"
      />
      
      {/* Live indicator point */}
      <circle cx={lastX} cy={lastY} r="1.5" fill="#10B981" filter="url(#glow)">
        <animate attributeName="r" values="1.5;2.5;1.5" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

// --- Mini Bar Chart ---

const MiniBarChart = () => {
  const [bars, setBars] = useState([65, 80, 45, 90, 70, 85, 55]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setBars(prev => prev.map(v => Math.max(30, Math.min(100, v + (Math.random() - 0.5) * 20))));
    }, 1500);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="flex items-end gap-1 h-8">
      {bars.map((height, i) => (
        <div 
          key={i} 
          className="flex-1 bg-gradient-to-t from-purple-500 to-purple-400 rounded-t transition-all duration-500 ease-out"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
};

// --- Operations Map ---

const OperationsMap = () => {
  const [nodes, setNodes] = useState(Array.from({ length: 9 }).map((_, i) => ({
    id: i,
    status: Math.random() > 0.9 ? 'warning' : 'active',
    pulse: Math.random()
  })));
  const [activeConnection, setActiveConnection] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(prev => prev.map(n => ({
        ...n,
        status: Math.random() > 0.98 ? 'warning' : 'active',
        pulse: Math.random()
      })));
      // Animate a random connection
      setActiveConnection(Math.floor(Math.random() * 8));
      setTimeout(() => setActiveConnection(null), 800);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-2 p-4 bg-[#0B1221] rounded-lg border border-white/5 relative overflow-hidden h-full">
      {/* Animated Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>
      
      {/* Data flow animation */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {activeConnection !== null && (
          <div 
            className="absolute w-1 h-1 bg-emerald-400 rounded-full animate-ping"
            style={{ 
              left: `${((activeConnection % 3) + 0.5) * 33.33}%`,
              top: `${(Math.floor(activeConnection / 3) + 0.5) * 33.33}%`
            }}
          />
        )}
      </div>
      
      {nodes.map((node) => (
        <div key={node.id} className="relative aspect-square bg-[#1E293B] rounded border border-white/5 flex items-center justify-center transition-colors duration-500 hover:border-white/20 group cursor-pointer hover:bg-[#1E293B]/80">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full transition-all duration-1000 relative",
            node.status === 'warning' ? "bg-amber-500" : "bg-emerald-500",
            "group-hover:scale-150"
          )}>
            {/* Glow ring */}
            <div className={cn(
              "absolute inset-0 rounded-full animate-ping opacity-75",
              node.status === 'warning' ? "bg-amber-500" : "bg-emerald-500"
            )} style={{ animationDuration: '2s' }} />
          </div>
          
          {/* Connecting Lines */}
          {node.id % 3 !== 2 && (
            <div className={cn(
              "absolute right-0 top-1/2 w-4 h-[2px] translate-x-2 z-0 transition-colors duration-300",
              activeConnection === node.id ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-white/10"
            )} />
          )}
          {node.id < 6 && (
            <div className={cn(
              "absolute bottom-0 left-1/2 w-[2px] h-4 translate-y-2 z-0 transition-colors duration-300",
              activeConnection === node.id ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-white/10"
            )} />
          )}
        </div>
      ))}
      <div className="absolute bottom-2 right-2 text-[8px] text-emerald-500 font-mono flex items-center gap-1">
        <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
        LIVE
      </div>
    </div>
  );
};

// --- Activity Feed Item ---

const ActivityItem = ({ log, isNew }: { log: any, isNew: boolean }) => (
  <div className={cn(
    "flex gap-2 py-1",
    isNew && "animate-in slide-in-from-left-2 duration-300"
  )}>
    <span className="text-slate-600 shrink-0 font-mono">{log.time}</span>
    <span className={cn(
      "truncate flex items-center gap-1",
      log.type === 'success' ? "text-emerald-400" :
      log.type === 'warning' ? "text-amber-400" :
      "text-blue-300"
    )}>
      {log.type === 'success' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
      {log.type === 'warning' && <AlertTriangle className="w-3 h-3 shrink-0" />}
      {log.type === 'info' && <Clock className="w-3 h-3 shrink-0" />}
      {log.msg}
    </span>
  </div>
);

// --- Stat Card ---

const StatCard = ({ icon: Icon, value, label, trend, color, delay }: { 
  icon: any, 
  value: string | number, 
  label: string, 
  trend?: string, 
  color: string,
  delay: number 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  return (
    <div className={cn(
      "bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-white/20 transition-all duration-500 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-black/20",
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
    )}>
      {/* Gradient overlay on hover */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        `bg-gradient-to-br ${color}/5 to-transparent`
      )} />
      
      <div className="flex justify-between items-start mb-2 relative">
        <div className={cn("p-2 rounded-lg transition-all duration-300 group-hover:scale-110", `bg-${color}/10 text-${color}`)}>
          <Icon className="w-4 h-4" />
        </div>
        {trend && (
          <span className="text-emerald-400 text-xs font-mono flex items-center gap-0.5">
            {trend} <ArrowUpRight className="w-3 h-3" />
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1 relative">{value}</div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium relative">{label}</div>
    </div>
  );
};

// --- Dashboard View ---

const DashboardView = ({ data, logs, logEndRef, stats }: { data: any[], logs: any[], logEndRef: any, stats: any }) => (
  <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6 animate-in fade-in duration-300">
    {/* Top Stats */}
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-white/20 transition-all duration-300 hover:translate-y-[-2px]">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex justify-between items-start mb-2 relative">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 group-hover:bg-blue-500/20 transition-colors group-hover:scale-110 duration-300">
            <Zap className="w-4 h-4" />
          </div>
          <span className="text-emerald-400 text-xs font-mono flex items-center">+2.4% <ArrowUpRight className="w-3 h-3" /></span>
        </div>
        <div className="text-2xl font-bold text-white mb-1 relative">
          <AnimatedNumber value={stats.efficiency} />%
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium relative">System Efficiency</div>
      </div>
       
      <div className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-white/20 transition-all duration-300 hover:translate-y-[-2px]">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex justify-between items-start mb-2 relative">
          <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 group-hover:bg-purple-500/20 transition-colors group-hover:scale-110 duration-300">
            <Activity className="w-4 h-4" />
          </div>
          <span className="text-emerald-400 text-xs font-mono flex items-center">Stable</span>
        </div>
        <div className="text-2xl font-bold text-white mb-1 relative">
          <AnimatedNumber value={stats.latency} />ms
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium relative">Avg Latency</div>
      </div>

      <div className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-white/20 transition-all duration-300 hover:translate-y-[-2px]">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex justify-between items-start mb-2 relative">
          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 group-hover:bg-amber-500/20 transition-colors group-hover:scale-110 duration-300">
            <Box className="w-4 h-4" />
          </div>
          <span className="text-slate-400 text-xs font-mono">live</span>
        </div>
        <div className="text-2xl font-bold text-white mb-1 relative">
          {stats.operations.toLocaleString()}
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium relative">Daily Operations</div>
      </div>
    </div>

    {/* Main Visuals Row */}
    <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
       
      {/* Chart Section */}
      <div className="col-span-2 bg-[#1E293B]/30 border border-white/5 rounded-xl p-4 flex flex-col hover:border-white/10 transition-colors">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-semibold text-slate-200 text-sm">Real-time Throughput</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Last 20 data points</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
              <span className="text-[10px] text-slate-400">Efficiency</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span className="text-[10px] text-slate-400">Traffic</span>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 w-full">
          <LiveChart data={data} />
        </div>
      </div>

      {/* Right Column: Map & Logs */}
      <div className="flex flex-col gap-4">
        <div className="flex-1 min-h-[140px]">
          <OperationsMap />
        </div>
        
        <div className="flex-1 bg-[#0B1221] border border-white/5 rounded-lg p-3 overflow-hidden flex flex-col min-h-[140px] hover:border-white/10 transition-colors">
          <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Activity Feed
            </span>
            <MoreHorizontal className="w-3 h-3 cursor-pointer hover:text-white transition-colors" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[10px] scrollbar-thin scrollbar-thumb-white/10 pr-1">
            {logs.map((log: any, i: number) => (
              <ActivityItem key={log.id} log={log} isNew={i === logs.length - 1} />
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const WorkflowsView = ({ addLog }: { addLog: (msg: string, type: string) => void }) => {
  const [rules, setRules] = useState([
    { id: 1, trigger: "Low Stock (< 10)", action: "Reorder & Alert", active: true },
    { id: 2, trigger: "New Lead (High Value)", action: "Notify Sales Team", active: true },
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [newRule, setNewRule] = useState({ trigger: "", action: "" });

  const handleAddRule = () => {
    if (!newRule.trigger || !newRule.action) return;
    setRules(prev => [...prev, { id: Date.now(), trigger: newRule.trigger, action: newRule.action, active: true }]);
    addLog(`Rule deployed: ${newRule.trigger}`, "success");
    setIsAdding(false);
    setNewRule({ trigger: "", action: "" });
  };

  return (
    <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-200">Logic & Automations</h3>
          <p className="text-xs text-slate-500">Configure operational rules for your system.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all duration-300 hover:translate-y-[-1px] hover:shadow-lg hover:shadow-emerald-500/20"
          data-testid="button-add-rule"
        >
          <Plus className="w-3.5 h-3.5" /> New Rule
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {isAdding && (
          <div className="bg-[#1E293B] border border-emerald-500/50 p-5 rounded-xl flex flex-col gap-4 animate-in slide-in-from-top-2 shadow-lg shadow-emerald-500/10">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <GitBranch className="w-4 h-4" /> Configure Logic
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-400 mb-1.5 block font-medium">IF (Trigger)</label>
                <input 
                  autoFocus
                  value={newRule.trigger}
                  onChange={e => setNewRule(p => ({ ...p, trigger: e.target.value }))}
                  placeholder="e.g. Daily Close > 5PM"
                  className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  data-testid="input-trigger"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 mb-1.5 block font-medium">THEN (Action)</label>
                <input 
                  value={newRule.action}
                  onChange={e => setNewRule(p => ({ ...p, action: e.target.value }))}
                  placeholder="e.g. Generate PDF Report"
                  className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  data-testid="input-action"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setIsAdding(false)} className="text-xs text-slate-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 transition-colors" data-testid="button-cancel">Cancel</button>
              <button onClick={handleAddRule} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all hover:shadow-lg hover:shadow-emerald-500/20" data-testid="button-deploy">Deploy Rule</button>
            </div>
          </div>
        )}

        {rules.map((rule, i) => (
          <div 
            key={rule.id} 
            className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-white/20 transition-all duration-300 hover:translate-x-1"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full relative",
                rule.active ? "bg-emerald-500" : "bg-slate-600"
              )}>
                {rule.active && <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-50" />}
              </div>
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-mono text-blue-300 border border-white/5">{rule.trigger}</div>
                <TrendingUp className="w-4 h-4 text-slate-500" />
                <div className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-mono text-purple-300 border border-white/5">{rule.action}</div>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                <Settings className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  setRules(prev => prev.filter(r => r.id !== rule.id));
                  addLog(`Rule removed: ${rule.trigger}`, "warning");
                }}
                className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                data-testid={`button-delete-rule-${rule.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DatabaseView = () => {
  const [data] = useState([
    { id: "INV-001", name: "Premium Widget A", stock: 142, status: "In Stock" },
    { id: "INV-002", name: "Standard Widget B", stock: 12, status: "Low Stock" },
    { id: "INV-003", name: "Budget Widget C", stock: 0, status: "Out of Stock" },
    { id: "INV-004", name: "Premium Widget X", stock: 89, status: "In Stock" },
    { id: "INV-005", name: "Mega Pack v2", stock: 45, status: "In Stock" },
  ]);

  return (
    <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-200">System Data</h3>
          <p className="text-xs text-slate-500">Live view of persistent records.</p>
        </div>
        <div className="flex gap-2">
          <button className="p-2.5 bg-[#1E293B] border border-white/10 rounded-lg text-slate-400 hover:text-white hover:border-white/20 transition-all">
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-2.5 bg-[#1E293B] border border-white/10 rounded-lg text-slate-400 hover:text-white hover:border-white/20 transition-all">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-[#1E293B]/30 border border-white/5 rounded-xl overflow-hidden flex-1 hover:border-white/10 transition-colors">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#1E293B] text-slate-400 font-medium">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Item Name</th>
              <th className="px-4 py-3">Stock Level</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-300">
            {data.map((row, i) => (
              <tr 
                key={row.id} 
                className="hover:bg-white/5 transition-colors cursor-default animate-in fade-in slide-in-from-left-2"
                style={{ animationDelay: `${i * 50}ms` }}
                data-testid={`row-inventory-${row.id}`}
              >
                <td className="px-4 py-3.5 font-mono text-slate-500">{row.id}</td>
                <td className="px-4 py-3.5 font-medium flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-500" />
                  {row.name}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          row.stock < 20 ? "bg-gradient-to-r from-red-600 to-red-400" : "bg-gradient-to-r from-emerald-600 to-emerald-400"
                        )} 
                        style={{ width: `${Math.min(100, (row.stock / 150) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono w-8">{row.stock}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-medium border inline-flex items-center gap-1",
                    row.status === "In Stock" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    row.status === "Low Stock" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                    "bg-red-500/10 text-red-400 border-red-500/20"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      row.status === "In Stock" ? "bg-emerald-500" :
                      row.status === "Low Stock" ? "bg-amber-500" : "bg-red-500"
                    )} />
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


// --- Main Widget ---

export const InteractiveHeroWidget = () => {
  const [data, setData] = useState(generateInitialData());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workflows' | 'database'>('dashboard');
  const [logs, setLogs] = useState([
    { id: 1, msg: "System initialized", type: "info", time: "10:00:01" },
    { id: 2, msg: "Connecting to API...", type: "info", time: "10:00:02" },
    { id: 3, msg: "Sync established", type: "success", time: "10:00:03" }
  ]);
  const [stats, setStats] = useState({ efficiency: 98.2, latency: 12, operations: 1284 });
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'warning' | 'info' } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string, type: string) => {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    setLogs(prev => [...prev.slice(-8), { id: Date.now(), msg, type, time: now }]);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'info') => {
    setToast({ message, type });
  }, []);

  // Live Chart Update
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const next = [...prev.slice(1), {
          time: prev[prev.length - 1].time + 1,
          value: Math.max(80, Math.min(100, prev[prev.length - 1].value + (Math.random() - 0.5) * 5)),
          traffic: 100 + Math.random() * 50
        }];
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Live Stats Update
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        efficiency: Math.max(95, Math.min(99.9, prev.efficiency + (Math.random() - 0.5) * 0.5)),
        latency: Math.max(8, Math.min(20, prev.latency + (Math.random() - 0.5) * 2)),
        operations: prev.operations + Math.floor(Math.random() * 5)
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Live Logs & Toasts Generator
  useEffect(() => {
    const messages = [
      { msg: "Order #492 processed", type: "success", toast: true },
      { msg: "Inventory sync complete", type: "info", toast: false },
      { msg: "Latency check: OK", type: "info", toast: false },
      { msg: "Auto-backup initiated", type: "warning", toast: true },
      { msg: "New user session", type: "info", toast: false },
      { msg: "Cache refreshed", type: "success", toast: false }
    ];

    const interval = setInterval(() => {
      if (Math.random() > 0.5) {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
        setLogs(prev => [...prev.slice(-8), { ...randomMsg, id: Date.now(), time: now }]);
        
        if (randomMsg.toast && Math.random() > 0.7) {
          showToast(randomMsg.msg, randomMsg.type as any);
        }
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [showToast]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  return (
    <div className="w-full h-full bg-[#0F172A] text-white flex flex-row font-sans text-xs sm:text-sm overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 relative">
      
      {/* Toast Notification */}
      {toast && (
        <ToastNotification 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      
      {/* Sidebar (Mini) */}
      <div className="w-14 bg-[#1E293B] border-r border-white/5 flex flex-col items-center py-4 gap-4 z-10">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-[#0F172A] font-bold shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)] transition-shadow cursor-pointer">
          IM
        </div>
        <div className="flex-1 flex flex-col gap-2 w-full px-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard },
            { id: 'workflows', icon: GitBranch },
            { id: 'database', icon: Database },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 relative group",
                activeTab === tab.id 
                  ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" 
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              )}
              data-testid={`button-tab-${tab.id}`}
            >
              <tab.icon className={cn("w-5 h-5 transition-transform duration-300", activeTab === tab.id && "scale-110")} />
              {/* Active indicator */}
              {activeTab === tab.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-500 rounded-r" />
              )}
              {/* Tooltip */}
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/10 transition-all duration-200 translate-x-1 group-hover:translate-x-0 shadow-xl">
                {tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}
              </div>
            </button>
          ))}
        </div>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-[10px] font-bold border border-white/10 cursor-pointer hover:border-white/30 transition-colors">
          U
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-[#0F172A] relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
        
        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-200 tracking-tight text-lg">
              {activeTab === 'dashboard' ? 'Operations Dashboard' : 
               activeTab === 'workflows' ? 'Automation Logic' : 'System Data'}
            </h2>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20 flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]"></span>
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-white transition-colors" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-[#1E293B] border border-white/5 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 w-32 md:w-48 transition-all" 
              />
            </div>
            <button className="p-2.5 text-slate-400 hover:text-white transition-colors relative hover:bg-white/5 rounded-lg">
              <Bell className="w-4 h-4" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]"></span>
            </button>
          </div>
        </div>

        {/* Dynamic Content */}
        {activeTab === 'dashboard' && <DashboardView data={data} logs={logs} logEndRef={logEndRef} stats={stats} />}
        {activeTab === 'workflows' && <WorkflowsView addLog={addLog} />}
        {activeTab === 'database' && <DatabaseView />}

      </div>
    </div>
  );
};
