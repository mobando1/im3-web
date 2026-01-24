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
  MoreHorizontal,
  Plus,
  Trash2,
  Play,
  Settings,
  GitBranch,
  Filter
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

// --- Components ---

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
    <div className="grid grid-cols-3 gap-2 p-4 bg-[#0B1221] rounded-lg border border-white/5 relative overflow-hidden h-full">
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

// --- View Components ---

const DashboardView = ({ data, logs, logEndRef }: { data: any[], logs: any[], logEndRef: any }) => (
  <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6 animate-in fade-in duration-300">
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
          <div className="flex-1 min-h-[140px]">
             <OperationsMap />
          </div>
          
          <div className="flex-1 bg-[#0B1221] border border-white/5 rounded-lg p-3 overflow-hidden flex flex-col min-h-[140px]">
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
    addLog(`New workflow rule deployed: ${newRule.trigger} -> ${newRule.action}`, "success");
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
           className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
        >
           <Plus className="w-3 h-3" /> New Rule
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {isAdding && (
           <div className="bg-[#1E293B] border border-emerald-500/50 p-4 rounded-xl flex flex-col gap-3 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                 <GitBranch className="w-3 h-3" /> Configure Logic
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">IF (Trigger)</label>
                    <input 
                       autoFocus
                       value={newRule.trigger}
                       onChange={e => setNewRule(p => ({ ...p, trigger: e.target.value }))}
                       placeholder="e.g. Daily Close > 5PM"
                       className="w-full bg-[#0F172A] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">THEN (Action)</label>
                    <input 
                       value={newRule.action}
                       onChange={e => setNewRule(p => ({ ...p, action: e.target.value }))}
                       placeholder="e.g. Generate PDF Report"
                       className="w-full bg-[#0F172A] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                    />
                 </div>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                 <button onClick={() => setIsAdding(false)} className="text-xs text-slate-400 hover:text-white px-3 py-1">Cancel</button>
                 <button onClick={handleAddRule} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold">Deploy Rule</button>
              </div>
           </div>
        )}

        {rules.map(rule => (
          <div key={rule.id} className="bg-[#1E293B]/50 border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-white/10 transition-colors">
             <div className="flex items-center gap-4">
                <div className={cn("w-2 h-2 rounded-full", rule.active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-600")}></div>
                <div className="flex items-center gap-3">
                   <div className="px-2 py-1 bg-slate-800 rounded text-xs font-mono text-blue-300 border border-white/5">{rule.trigger}</div>
                   <ArrowUpRight className="w-3 h-3 text-slate-500 rotate-45" />
                   <div className="px-2 py-1 bg-slate-800 rounded text-xs font-mono text-purple-300 border border-white/5">{rule.action}</div>
                </div>
             </div>
             <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/5">
                   <Settings className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => {
                     setRules(prev => prev.filter(r => r.id !== rule.id));
                     addLog(`Rule deactivated: ${rule.trigger}`, "warning");
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-red-500/10"
                >
                   <Trash2 className="w-3 h-3" />
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
           <button className="p-2 bg-[#1E293B] border border-white/10 rounded-lg text-slate-400 hover:text-white">
              <Filter className="w-4 h-4" />
           </button>
           <button className="p-2 bg-[#1E293B] border border-white/10 rounded-lg text-slate-400 hover:text-white">
              <Search className="w-4 h-4" />
           </button>
        </div>
      </div>

      <div className="bg-[#1E293B]/30 border border-white/5 rounded-xl overflow-hidden flex-1">
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
               {data.map(row => (
                  <tr key={row.id} className="hover:bg-white/5 transition-colors cursor-default">
                     <td className="px-4 py-3 font-mono text-slate-500">{row.id}</td>
                     <td className="px-4 py-3 font-medium">{row.name}</td>
                     <td className="px-4 py-3">
                        <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                           <div 
                              className={cn("h-full rounded-full", row.stock < 20 ? "bg-red-500" : "bg-emerald-500")} 
                              style={{ width: `${Math.min(100, (row.stock / 150) * 100)}%` }}
                           ></div>
                        </div>
                     </td>
                     <td className="px-4 py-3">
                        <span className={cn(
                           "px-2 py-0.5 rounded text-[10px] font-medium border",
                           row.status === "In Stock" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                           row.status === "Low Stock" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                           "bg-red-500/10 text-red-400 border-red-500/20"
                        )}>
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
    { id: 1, msg: "System initialization complete", type: "info", time: "10:00:01" },
    { id: 2, msg: "Connecting to inventory API...", type: "info", time: "10:00:02" },
    { id: 3, msg: "Sync established (4ms latency)", type: "success", time: "10:00:03" }
  ]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, type: string) => {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    setLogs(prev => [...prev.slice(-8), { id: Date.now(), msg, type, time: now }]);
  };

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
        setLogs(prev => [...prev.slice(-8), { ...randomMsg, id: Date.now(), time: now }]);
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
          {[
            { id: 'dashboard', icon: LayoutDashboard },
            { id: 'workflows', icon: GitBranch },
            { id: 'database', icon: Database },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 relative group",
                activeTab === tab.id ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              )}
            >
              <tab.icon className="w-5 h-5" />
              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/10 transition-opacity">
                {tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}
              </div>
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
            <h2 className="font-semibold text-slate-200 tracking-tight text-lg">
              {activeTab === 'dashboard' ? 'Operations Dashboard' : 
               activeTab === 'workflows' ? 'Automation Logic' : 'System Data'}
            </h2>
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

        {/* Dynamic Content */}
        {activeTab === 'dashboard' && <DashboardView data={data} logs={logs} logEndRef={logEndRef} />}
        {activeTab === 'workflows' && <WorkflowsView addLog={addLog} />}
        {activeTab === 'database' && <DatabaseView />}

      </div>
    </div>
  );
};
