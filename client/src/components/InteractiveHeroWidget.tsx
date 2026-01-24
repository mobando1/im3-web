import { useState, useEffect, useRef } from "react";
import { 
  Activity, 
  Check, 
  Clock, 
  AlertCircle, 
  ArrowUpRight, 
  Shield, 
  Zap,
  BarChart2,
  Database,
  Users,
  Box,
  LayoutDashboard,
  Search,
  Bell,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  LineChart, 
  Line, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip,
  AreaChart,
  Area
} from "recharts";

// --- Mock Data Generators ---

const generateInitialData = (points = 20) => {
  return Array.from({ length: points }).map((_, i) => ({
    time: i,
    value: 85 + Math.random() * 15,
    traffic: 100 + Math.random() * 50
  }));
};

const OperationsMap = () => {
  const [nodes, setNodes] = useState(Array.from({ length: 9 }).map((_, i) => ({
    id: i,
    status: Math.random() > 0.9 ? 'warning' : 'active',
    pulse: Math.random()
  })));

  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(prev => prev.map(n => ({
        ...n,
        status: Math.random() > 0.98 ? 'warning' : 'active',
        pulse: Math.random()
      })));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-2 p-4 bg-[#0B1221] rounded-lg border border-white/5 relative overflow-hidden">
      {/* Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>
      
      {nodes.map((node) => (
        <div key={node.id} className="relative aspect-square bg-[#1E293B] rounded border border-white/5 flex items-center justify-center transition-colors duration-500 hover:border-white/20 group">
          <div className={cn(
            "w-2 h-2 rounded-full transition-all duration-1000",
            node.status === 'warning' ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]",
            "group-hover:scale-150"
          )}></div>
          
          {/* Connecting Lines (Visual Only) */}
          {node.id % 3 !== 2 && <div className="absolute right-0 top-1/2 w-4 h-[1px] bg-white/5 translate-x-2 z-0"></div>}
          {node.id < 6 && <div className="absolute bottom-0 left-1/2 w-[1px] h-4 bg-white/5 translate-y-2 z-0"></div>}
        </div>
      ))}
      <div className="absolute bottom-2 right-2 text-[8px] text-slate-500 font-mono">LIVE MAP</div>
    </div>
  );
};

export const InteractiveHeroWidget = () => {
  const [data, setData] = useState(generateInitialData());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([
    { id: 1, msg: "System initialization complete", type: "info", time: "10:00:01" },
    { id: 2, msg: "Connecting to inventory API...", type: "info", time: "10:00:02" },
    { id: 3, msg: "Sync established (4ms latency)", type: "success", time: "10:00:03" }
  ]);
  const logEndRef = useRef<HTMLDivElement>(null);

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

  // Live Logs Generator
  useEffect(() => {
    const messages = [
      { msg: "Order #492 processed", type: "success" },
      { msg: "Inventory updated (Stock: OK)", type: "info" },
      { msg: "Latency check: 12ms", type: "info" },
      { msg: "Backup started...", type: "warning" },
      { msg: "User activity detected", type: "info" },
      { msg: "Cache invalidated", type: "warning" }
    ];

    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
        setLogs(prev => [...prev.slice(-6), { ...randomMsg, id: Date.now(), time: now }]);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="w-full h-full bg-[#0F172A] text-white flex flex-row font-sans text-xs sm:text-sm overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
      
      {/* Sidebar (Mini) */}
      <div className="w-14 bg-[#1E293B] border-r border-white/5 flex flex-col items-center py-4 gap-4 z-10">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-[#0F172A] font-bold shadow-[0_0_15px_rgba(16,185,129,0.4)]">
          IM
        </div>
        <div className="flex-1 flex flex-col gap-2 w-full px-2">
          {['dashboard', 'analytics', 'database', 'users'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200",
                activeTab === tab ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              )}
            >
              {tab === 'dashboard' && <LayoutDashboard className="w-5 h-5" />}
              {tab === 'analytics' && <BarChart2 className="w-5 h-5" />}
              {tab === 'database' && <Database className="w-5 h-5" />}
              {tab === 'users' && <Users className="w-5 h-5" />}
            </button>
          ))}
        </div>
        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold border border-white/10">
          U
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-[#0F172A] relative">
        {/* Background Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

        {/* Header */}
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-200 tracking-tight text-lg">Operations Dashboard</h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-3">
             <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search..." className="bg-[#1E293B] border border-white/5 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-white/20 w-32 md:w-48 transition-all" />
             </div>
             <button className="p-2 text-slate-400 hover:text-white transition-colors relative">
               <Bell className="w-4 h-4" />
               <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
             </button>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
          
          {/* Top Stats */}
          <div className="grid grid-cols-3 gap-4">
             <div className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                   <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                      <Zap className="w-4 h-4" />
                   </div>
                   <span className="text-emerald-400 text-xs font-mono flex items-center">+2.4% <ArrowUpRight className="w-3 h-3" /></span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">98.2%</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">System Efficiency</div>
             </div>
             
             <div className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                   <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                      <Activity className="w-4 h-4" />
                   </div>
                   <span className="text-emerald-400 text-xs font-mono flex items-center">Stable</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">12ms</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Avg Latency</div>
             </div>

             <div className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                   <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                      <Box className="w-4 h-4" />
                   </div>
                   <span className="text-slate-400 text-xs font-mono">2m ago</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">1,284</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Daily Operations</div>
             </div>
          </div>

          {/* Main Visuals Row */}
          <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
             
             {/* Chart Section */}
             <div className="col-span-2 bg-[#1E293B]/30 border border-white/5 rounded-xl p-4 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="font-semibold text-slate-200 text-xs">Real-time Throughput</h3>
                   <div className="flex gap-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                   </div>
                </div>
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', fontSize: '12px' }} 
                        itemStyle={{ color: '#E2E8F0' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#10B981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorValue)" 
                        isAnimationActive={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="traffic" 
                        stroke="#3B82F6" 
                        strokeWidth={2} 
                        dot={false}
                        isAnimationActive={false}
                        strokeDasharray="4 4"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* Right Column: Map & Logs */}
             <div className="flex flex-col gap-4">
                <OperationsMap />
                
                <div className="flex-1 bg-[#0B1221] border border-white/5 rounded-lg p-3 overflow-hidden flex flex-col">
                   <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex justify-between items-center">
                      System Logs 
                      <MoreHorizontal className="w-3 h-3" />
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[10px] scrollbar-thin scrollbar-thumb-white/10 pr-1">
                      {logs.map((log) => (
                         <div key={log.id} className="flex gap-2 animate-in slide-in-from-left-2 duration-300">
                            <span className="text-slate-600 shrink-0">{log.time}</span>
                            <span className={cn(
                               "truncate",
                               log.type === 'success' ? "text-emerald-400" :
                               log.type === 'warning' ? "text-amber-400" :
                               "text-blue-300"
                            )}>
                               {log.type === 'success' ? '✔ ' : log.type === 'warning' ? '⚠ ' : 'ℹ '}
                               {log.msg}
                            </span>
                         </div>
                      ))}
                      <div ref={logEndRef} />
                   </div>
                </div>
             </div>

          </div>
        </div>

      </div>
    </div>
  );
};
