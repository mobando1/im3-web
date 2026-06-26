import { useEffect, useRef } from "react";

// Fondo de aurora con WebGL puro (sin dependencias). Domain-warped fbm noise
// mapeado a una paleta navy→teal de marca. Respeta prefers-reduced-motion
// (renderiza un solo frame estático) y se pausa cuando la pestaña está oculta.
// Si WebGL no está disponible, el canvas queda transparente y se ve el fallback
// CSS del contenedor padre.

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;   // uv.y: 0 abajo, 1 arriba
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * 0.06;

  vec3 deep = vec3(0.012, 0.035, 0.066);   // casi negro azulado
  vec3 navy = vec3(0.050, 0.125, 0.196);   // #0B1C2D (un pelín más vivo)
  vec3 teal = vec3(0.184, 0.643, 0.663);   // #2FA4A9
  vec3 cyan = vec3(0.42, 0.86, 0.90);      // cresta brillante (algo desaturada)

  // base navy con domain warp
  vec2 q = vec2(fbm(p*1.5 + vec2(0.0, t)), fbm(p*1.5 + vec2(5.2, 1.3 - t)));
  float f = fbm(p*1.5 + q*1.9 + vec2(t*0.8, -t*0.45));
  vec3 col = mix(deep, navy, smoothstep(-0.1, 0.7, f));
  col = mix(col, teal, smoothstep(0.55, 1.05, f) * 0.45);

  // CORTINAS DE AURORA en el cuarto superior (arriba del logo), fluyendo
  float aurora = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float yc = 0.78 + 0.085 * fi
      + 0.07 * sin(p.x * 2.0 + t * 1.5 + fi * 1.9)
      + 0.13 * fbm(vec2(p.x * 1.7 + t * 1.0, fi * 3.0 + t * 0.3));
    float band = exp(-pow((uv.y - yc) * 7.5, 2.0));
    aurora += band * (0.6 + 0.4 * sin(t * 1.3 + fi * 2.0));
  }
  aurora *= smoothstep(0.45, 1.0, uv.y);   // intensa arriba, nula en logo/tarjeta
  vec3 auroraCol = mix(teal, cyan, smoothstep(0.7, 1.7, aurora));
  col += auroraCol * aurora * 0.85;

  // resplandor teal difuso en la franja superior
  col += teal * smoothstep(0.55, 1.0, uv.y) * 0.06;

  // calmar la franja central (logo + tarjeta) para legibilidad
  float d2 = length((uv - vec2(0.5, 0.5)) * vec2(1.0, 1.12));
  col *= mix(0.5, 1.0, smoothstep(0.05, 0.62, d2));

  // viñeta suave
  col *= mix(0.78, 1.0, smoothstep(1.3, 0.4, length(uv - 0.5)));

  gl_FragColor = vec4(col, 1.0);
}
`;

export function ShaderBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = (canvas.getContext("webgl", { antialias: true, alpha: false, premultipliedAlpha: false })
      || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      console.warn("[shader] WebGL no disponible — usando fallback CSS");
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[shader] compile error:", gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[shader] link error:", gl.getProgramInfoLog(prog));
      return; // fallback CSS
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };

    if (reduce) {
      gl.uniform1f(uTime, 6.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(frame);
    }

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
