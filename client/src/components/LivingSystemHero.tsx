import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { audio } from '@/lib/audio';
import { Volume2, VolumeX, ArrowRight, RefreshCcw, Plus, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types & Constants ---

interface Node {
  id: string;
  x: number;
  y: number;
  type: 'core' | 'added' | 'critical';
  radius: number;
  vx: number;
  vy: number;
}

interface Edge {
  id: string;
  from: string;
  to: string;
  throughput: number; // 0.0 to 1.0 (speed)
  isBottleneck?: boolean;
}

interface Particle {
  id: string;
  edgeId: string;
  progress: number; // 0.0 to 1.0
  speed: number;
}

const COLORS = {
  ink: '#0B1C2D',
  teal: '#2FA4A9',
  tealLight: '#8CD4D6',
  white: '#FFFFFF',
  bg: '#F4F6F8',
  coal: '#1F1F1F',
  alert: '#E11D48',
};

// --- Physics & Canvas Logic ---

export const LivingSystemHero = () => {
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [stage, setStage] = useState<'initial' | 'complexity' | 'optimized'>('initial');
  const [message, setMessage] = useState<string | null>(null);
  const [closingMessage, setClosingMessage] = useState<string | null>(null);

  // Simulation State refs (for performance without re-renders)
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number>(0);
  const draggingNodeRef = useRef<string | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const mousePos = useRef({ x: 0, y: 0 });

  // Add Tool Interaction State
  const [isDraggingTool, setIsDraggingTool] = useState(false);

  // --- Initialization ---

  const initSystem = useCallback(() => {
    // Create a balanced initial graph
    const w = canvasRef.current?.width || 800;
    const h = canvasRef.current?.height || 600;
    const cx = w / 2;
    const cy = h / 2;

    const initialNodes: Node[] = [
      { id: '1', x: cx - 100, y: cy - 50, type: 'core', radius: 6, vx: 0, vy: 0 },
      { id: '2', x: cx + 100, y: cy - 50, type: 'core', radius: 6, vx: 0, vy: 0 },
      { id: '3', x: cx, y: cy + 80, type: 'core', radius: 6, vx: 0, vy: 0 },
      { id: '4', x: cx - 150, y: cy + 50, type: 'core', radius: 4, vx: 0, vy: 0 },
      { id: '5', x: cx + 150, y: cy + 50, type: 'core', radius: 4, vx: 0, vy: 0 },
    ];

    const initialEdges: Edge[] = [
      { id: 'e1', from: '1', to: '2', throughput: 0.5 },
      { id: 'e2', from: '2', to: '3', throughput: 0.5 },
      { id: 'e3', from: '3', to: '1', throughput: 0.5 },
      { id: 'e4', from: '4', to: '1', throughput: 0.3 },
      { id: 'e5', from: '2', to: '5', throughput: 0.3 },
    ];

    nodesRef.current = initialNodes;
    edgesRef.current = initialEdges;
    particlesRef.current = [];
    setStage('initial');
    setMessage(null);
    setClosingMessage(null);
  }, []);

  useEffect(() => {
    initSystem();
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        // Re-center nodes slightly? simplified for now
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial sizing
    return () => window.removeEventListener('resize', handleResize);
  }, [initSystem]);

  // --- Animation Loop ---

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updatePhysics = () => {
      const w = canvas.width;
      const h = canvas.height;
      const k = 0.05; // Spring constant
      const repel = 2000; // Repulsion
      const damping = 0.9;

      // 1. Forces
      nodesRef.current.forEach(node => {
        let fx = 0, fy = 0;

        // Repulsion
        nodesRef.current.forEach(other => {
          if (node.id === other.id) return;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repel / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        });

        // Spring
        edgesRef.current.forEach(edge => {
          if (edge.from !== node.id && edge.to !== node.id) return;
          const otherId = edge.from === node.id ? edge.to : edge.from;
          const other = nodesRef.current.find(n => n.id === otherId);
          if (other) {
            const dx = node.x - other.x;
            const dy = node.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const targetLen = 120; // Ideal length
            const force = (dist - targetLen) * k;
            fx -= (dx / dist) * force;
            fy -= (dy / dist) * force;
          }
        });

        // Center gravity (keep in canvas)
        const dx = node.x - w / 2;
        const dy = node.y - h / 2;
        fx -= dx * 0.005;
        fy -= dy * 0.005;

        // Apply
        if (draggingNodeRef.current !== node.id) {
            node.vx = (node.vx + fx) * damping;
            node.vy = (node.vy + fy) * damping;
            node.x += node.vx;
            node.y += node.vy;
        }
      });

      // 2. Particles
      // Spawn logic
      if (Math.random() < 0.05) {
        const edge = edgesRef.current[Math.floor(Math.random() * edgesRef.current.length)];
        if (edge) {
            particlesRef.current.push({
                id: Math.random().toString(),
                edgeId: edge.id,
                progress: 0,
                speed: 0.005 + (edge.throughput * 0.01)
            });
        }
      }

      // Move particles
      particlesRef.current.forEach(p => {
        const edge = edgesRef.current.find(e => e.id === p.edgeId);
        if (edge) {
             // Bottlenecks slow down particles
             const speedMod = edge.isBottleneck ? 0.2 : 1.0;
             p.progress += p.speed * speedMod;
        } else {
            p.progress = 1.1; // Kill orphaned particles
        }
      });
      particlesRef.current = particlesRef.current.filter(p => p.progress < 1);
    };

    const draw = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Edges
      edgesRef.current.forEach(edge => {
        const n1 = nodesRef.current.find(n => n.id === edge.from);
        const n2 = nodesRef.current.find(n => n.id === edge.to);
        if (n1 && n2) {
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.strokeStyle = edge.isBottleneck ? COLORS.alert : COLORS.ink;
          ctx.globalAlpha = edge.isBottleneck ? 0.5 : 0.1;
          ctx.lineWidth = edge.isBottleneck ? 2 : 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });

      // Particles
      particlesRef.current.forEach(p => {
        const edge = edgesRef.current.find(e => e.id === p.edgeId);
        if (!edge) return;
        const n1 = nodesRef.current.find(n => n.id === edge.from);
        const n2 = nodesRef.current.find(n => n.id === edge.to);
        if (n1 && n2) {
          const x = n1.x + (n2.x - n1.x) * p.progress;
          const y = n1.y + (n2.y - n1.y) * p.progress;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fillStyle = edge.isBottleneck ? COLORS.alert : COLORS.teal;
          ctx.fill();
        }
      });

      // Nodes
      nodesRef.current.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.type === 'critical' ? COLORS.alert : COLORS.ink;
        ctx.fill();
        // Hover/Halo effect
        if (node.type === 'added') {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS.teal;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
      });

    };

    const loop = () => {
      updatePhysics();
      draw();
      frameRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  // --- Interaction Handlers ---

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePos.current = { x, y };

    // Dragging Logic
    if (draggingNodeRef.current) {
        const node = nodesRef.current.find(n => n.id === draggingNodeRef.current);
        if (node) {
            node.x = x;
            node.y = y;
            node.vx = 0;
            node.vy = 0;
        }
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Detect click on node
    const clickedNode = nodesRef.current.find(n => {
        const dx = n.x - x;
        const dy = n.y - y;
        return dx * dx + dy * dy < 20 * 20; // larger hit area
    });

    if (clickedNode) {
        draggingNodeRef.current = clickedNode.id;
        if (soundEnabled) audio.play('click');
    } else {
        // Detect click on edge (Automate Step)
        const clickedEdge = edgesRef.current.find(edge => {
            const n1 = nodesRef.current.find(n => n.id === edge.from);
            const n2 = nodesRef.current.find(n => n.id === edge.to);
            if (!n1 || !n2) return false;
            // Point to line distance
            const A = x - n1.x;
            const B = y - n1.y;
            const C = n2.x - n1.x;
            const D = n2.y - n1.y;
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;
            let xx, yy;
            if (param < 0) { xx = n1.x; yy = n1.y; }
            else if (param > 1) { xx = n2.x; yy = n2.y; }
            else { xx = n1.x + param * C; yy = n1.y + param * D; }
            const dx = x - xx;
            const dy = y - yy;
            return (dx * dx + dy * dy) < 100; // 10px dist
        });

        if (clickedEdge) {
            handleAutomateEdge(clickedEdge);
        }
    }
  };

  const handleCanvasMouseUp = () => {
    draggingNodeRef.current = null;
  };

  // --- Specific Interactions ---

  const handleAddTool = () => {
    // Add complex nodes
    if (stage === 'optimized') return; // Don't ruin perfection immediately

    const w = canvasRef.current?.width || 800;
    const h = canvasRef.current?.height || 600;
    
    const newNodeId = `new-${Date.now()}`;
    const newNode: Node = { 
        id: newNodeId, 
        x: mousePos.current.x || w/2, 
        y: mousePos.current.y || h/2, 
        type: 'added', 
        radius: 5, 
        vx: 0, 
        vy: 0 
    };
    
    // Connect to 2 random nodes
    const target1 = nodesRef.current[Math.floor(Math.random() * nodesRef.current.length)];
    const target2 = nodesRef.current[Math.floor(Math.random() * nodesRef.current.length)];

    nodesRef.current.push(newNode);
    if (target1) edgesRef.current.push({ id: `e-${newNodeId}-1`, from: newNodeId, to: target1.id, throughput: 0.4 });
    if (target2 && target2.id !== target1?.id) edgesRef.current.push({ id: `e-${newNodeId}-2`, from: newNodeId, to: target2.id, throughput: 0.4 });

    setStage('complexity');
    setMessage("La complejidad aumentó. Nuevas dependencias creadas.");
    if (soundEnabled) audio.play('pop');
    
    // Auto clear message
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAutomateEdge = (edge: Edge) => {
    // Make edge faster but maybe create bottleneck elsewhere
    edge.throughput = 0.9;
    edge.isBottleneck = false; // Fix if it was
    
    // Create bottleneck elsewhere randomly
    const otherEdge = edgesRef.current.find(e => e.id !== edge.id && Math.random() > 0.7);
    if (otherEdge) {
        otherEdge.isBottleneck = true;
        otherEdge.throughput = 0.1;
        setMessage("Automatización local: Se aceleró un proceso, pero surgió fricción en otro.");
    } else {
        setMessage("Flujo optimizado localmente.");
    }
    
    if (soundEnabled) audio.play('connect');
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRedesign = () => {
    // Simplify graph
    const centerNode = nodesRef.current[0];
    if (!centerNode) return;

    // Filter out 'added' nodes or simplify connections
    // For visual effect: Move all nodes to a grid or circle
    nodesRef.current.forEach((n, i) => {
        const angle = (i / nodesRef.current.length) * Math.PI * 2;
        const r = 100;
        // Target positions (physics will pull them there if we dampen existing velocity)
        n.vx += (Math.cos(angle) * 5);
        n.vy += (Math.sin(angle) * 5);
    });

    // Remove random edges to simplify
    if (edgesRef.current.length > 5) {
        edgesRef.current = edgesRef.current.filter((_, i) => i % 2 === 0 || i < 4);
    }
    
    // Clear bottlenecks
    edgesRef.current.forEach(e => { e.isBottleneck = false; e.throughput = 0.6; });

    setStage('optimized');
    setMessage("Sistema rediseñado: Topología simplificada y mantenible.");
    setClosingMessage("El control no se compra. Se diseña.");
    if (soundEnabled) audio.play('stabilize');
  };

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    audio.toggle(newState);
  };

  return (
    <section className="relative w-full min-h-[600px] md:h-[80vh] flex flex-col md:flex-row overflow-hidden bg-[#F4F6F8]">
      {/* Left Column: Text & Context */}
      <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center z-10 relative pointer-events-none">
        <div className="pointer-events-auto max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 text-xs font-medium tracking-wide text-[hsl(var(--ink))] mb-8 shadow-sm">
                <div className={cn("w-2 h-2 rounded-full", stage === 'optimized' ? "bg-teal-500" : "bg-amber-500 animate-pulse")}></div>
                IM3 · SISTEMAS VIVOS
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-[1.1] tracking-tight text-[hsl(var(--ink))] mb-6">
                Sistemas de software aplicados a la operación.
            </h1>

            <AnimatePresence mode='wait'>
                {closingMessage ? (
                    <motion.p 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xl md:text-2xl text-[hsl(var(--teal))] font-medium mb-8"
                    >
                        {closingMessage}
                    </motion.p>
                ) : (
                    <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-lg text-gray-500 leading-relaxed mb-8 max-w-md"
                    >
                        Interrumpe el sistema para entenderlo. <br/>
                        <span className="text-sm opacity-70">Arrastra nodos, añade herramientas (+) o rediseña la estructura.</span>
                    </motion.p>
                )}
            </AnimatePresence>

            <div className="flex flex-wrap gap-4 items-center">
                <button 
                  onClick={() => navigate("/booking")}
                  className="bg-[hsl(var(--ink))] text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-gray-800 transition-all hover:translate-y-[-2px] shadow-lg flex items-center gap-2"
                >
                  Agendar diagnóstico operativo <ArrowRight className="w-4 h-4" />
                </button>
                
                <button 
                    onClick={initSystem}
                    className="p-3 text-gray-400 hover:text-[hsl(var(--ink))] transition-colors"
                    title="Reiniciar sistema"
                >
                    <RefreshCcw className="w-5 h-5" />
                </button>
            </div>
        </div>
      </div>

      {/* Right Column: Interactive Canvas */}
      <div className="absolute inset-0 md:relative md:w-1/2 h-full bg-white/50 md:bg-transparent">
        <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair touch-none"
            onMouseMove={handleCanvasMouseMove}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
        />

        {/* Floating Controls / Feedback */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none">
            <button 
                onClick={toggleSound}
                className="pointer-events-auto p-2 bg-white rounded-full shadow border border-gray-100 text-gray-400 hover:text-[hsl(var(--ink))] transition-colors"
            >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            
            <AnimatePresence>
                {message && (
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="bg-[hsl(var(--ink))] text-white text-xs px-4 py-2 rounded-lg shadow-lg font-mono border-l-2 border-[hsl(var(--teal))]"
                    >
                        {message}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Interaction Prompts (Floating buttons on canvas) */}
        <div className="absolute bottom-8 right-8 flex gap-3 pointer-events-auto">
             <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddTool}
                className="bg-white text-[hsl(var(--ink))] px-4 py-2 rounded-lg shadow-md border border-gray-200 text-xs font-bold flex items-center gap-2 hover:border-[hsl(var(--teal))]"
             >
                <Plus className="w-3 h-3" /> Añadir herramienta
             </motion.button>

             <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRedesign}
                className="bg-[hsl(var(--teal))] text-white px-4 py-2 rounded-lg shadow-md border border-transparent text-xs font-bold flex items-center gap-2"
             >
                <MousePointer2 className="w-3 h-3" /> Rediseñar
             </motion.button>
        </div>
      </div>
    </section>
  );
};
