/**
 * 屏幕扰动引擎（PRD 4.4.3，视觉覆盖层模拟方案）：
 *   截屏（Rust，原始 BGRA）-> WebGL 纹理 -> 全屏画布逐帧着色器扭曲 -> 移除画布
 * 截图期间悬浮层显示的是“冻结的桌面”，因此效果时长控制在几秒内；
 * 任何异常路径都会走 cleanup，确保不会留下一张盖住桌面的静态截图。
 */
import { invoke } from "@tauri-apps/api/core";
import type { DistortKind, PlayOptions } from "../../shared/protocol";
import type { Runtime } from "../core/runtime";
import { DEFAULT_DURATION, PROGRAMS, baseFrame } from "./programs";
import { FRAG, KIND_ID, VERT } from "./shader";

export interface DistortHooks {
  /** 扰动期间隐藏其他实时图层（截图里已经包含它们） */
  setLayersHidden(hidden: boolean): void;
}

/** 单次效果的硬上限，防止参数异常导致长时间冻结屏幕 */
const MAX_DURATION_MS = 10_000;

interface GLState {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  tex: WebGLTexture;
  u: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = [
  "uTex", "uKind", "uTime", "uAmt", "uSeed", "uRes", "uCenter", "uOffset", "uRot",
  "uScale", "uPersp", "uClamp", "uFlash", "uColorFx", "uVignette",
];

export class DistortEngine {
  active: DistortKind | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private glState: GLState | null = null;
  /** 每次 play / stop 自增，用于让过期的异步流程自行退出 */
  private token = 0;
  private raf = 0;
  private finish: (() => void) | null = null;
  private layersHidden = false;

  constructor(
    readonly rt: Runtime,
    readonly hooks: DistortHooks,
  ) {}

  async play(kind: DistortKind, options: PlayOptions = {}): Promise<void> {
    this.stop();
    const token = ++this.token;
    this.active = kind;
    try {
      const raw = await invoke<ArrayBuffer | number[]>("capture_screen");
      if (token !== this.token) return;
      const buf = raw instanceof ArrayBuffer ? raw : new Uint8Array(raw).buffer;
      const head = new DataView(buf, 0, 8);
      const w = head.getUint32(0, true);
      const h = head.getUint32(4, true);
      if (!w || !h || buf.byteLength < 8 + w * h * 4) throw new Error("bad capture payload");

      const s = this.ensureGL();
      if (!s || w > s.gl.getParameter(s.gl.MAX_TEXTURE_SIZE) || h > s.gl.getParameter(s.gl.MAX_TEXTURE_SIZE)) {
        throw new Error("WebGL unavailable or screen too large");
      }
      this.upload(s, w, h, new Uint8Array(buf, 8, w * h * 4));
      if (token !== this.token) return;
      await this.run(s, kind, options, token);
    } catch (e) {
      console.error("[distort]", e);
    } finally {
      if (token === this.token) this.cleanup();
    }
  }

  stop() {
    this.token++;
    this.cleanup();
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.canvas) this.canvas.style.display = "none";
    if (this.layersHidden) {
      this.layersHidden = false;
      try {
        this.hooks.setLayersHidden(false);
      } catch (e) {
        console.error("[distort]", e);
      }
    }
    const s = this.glState;
    if (s && !s.gl.isContextLost()) {
      // 释放显存：用 1x1 替换大纹理
      s.gl.bindTexture(s.gl.TEXTURE_2D, s.tex);
      s.gl.texImage2D(s.gl.TEXTURE_2D, 0, s.gl.RGBA, 1, 1, 0, s.gl.RGBA, s.gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
    this.active = null;
    const f = this.finish;
    this.finish = null;
    f?.();
  }

  private run(s: GLState, kind: DistortKind, options: PlayOptions, token: number) {
    const { gl, u } = s;
    const canvas = this.canvas!;
    const dpr = this.rt.dpr;
    const cw = Math.round(this.rt.width * dpr);
    const ch = Math.round(this.rt.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    gl.viewport(0, 0, cw, ch);

    const durationMs = Math.min(MAX_DURATION_MS, Math.max(100, options.durationMs ?? DEFAULT_DURATION[kind]));
    const intensity = Math.min(1, Math.max(0, options.intensity ?? 0.6));
    const cx = options.x ?? (this.rt.cursor.inside ? this.rt.cursor.x : this.rt.width / 2);
    const cy = options.y ?? (this.rt.cursor.inside ? this.rt.cursor.y : this.rt.height / 2);
    const rnd = [Math.random(), Math.random(), Math.random(), Math.random()];
    const program = PROGRAMS[kind];

    gl.useProgram(s.prog);
    gl.uniform1i(u.uTex, 0);
    gl.uniform1i(u.uKind, KIND_ID[kind]);
    gl.uniform1f(u.uSeed, rnd[3] * 100);
    gl.uniform2f(u.uRes, cw, ch);
    gl.uniform2f(u.uCenter, cx / this.rt.width, cy / this.rt.height);

    return new Promise<void>((resolve) => {
      this.finish = resolve;
      let start = -1;
      const frame = (now: number) => {
        if (token !== this.token) return;
        if (start < 0) start = now;
        const elapsed = now - start;
        const p = Math.min(1, elapsed / durationMs);
        const f = baseFrame();
        program(f, { t: elapsed / 1000, p, durationSec: durationMs / 1000, intensity, dpr, r: rnd });

        gl.uniform1f(u.uTime, elapsed / 1000);
        gl.uniform1f(u.uAmt, f.amt);
        gl.uniform2f(u.uOffset, f.offset[0], f.offset[1]);
        gl.uniform1f(u.uRot, f.rot);
        gl.uniform2f(u.uScale, f.scale[0], f.scale[1]);
        gl.uniform2f(u.uPersp, f.persp[0], f.persp[1]);
        gl.uniform1i(u.uClamp, f.clamp ? 1 : 0);
        gl.uniform4f(u.uFlash, ...f.flash);
        gl.uniform3f(u.uColorFx, ...f.colorFx);
        gl.uniform1f(u.uVignette, f.vignette);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (!this.layersHidden) {
          // 第一帧（恒等变换）已画好：同一帧内显示画布并隐藏实时图层，切换无缝
          canvas.style.display = "block";
          this.layersHidden = true;
          this.hooks.setLayersHidden(true);
        }
        if (p >= 1) {
          this.finish = null;
          resolve();
          return;
        }
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  private upload(s: GLState, w: number, h: number, pixels: Uint8Array) {
    const { gl } = s;
    gl.bindTexture(gl.TEXTURE_2D, s.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  }

  private ensureGL(): GLState | null {
    if (this.glState && !this.glState.gl.isContextLost()) return this.glState;
    if (!this.canvas) {
      const c = document.createElement("canvas");
      c.className = "layer layer-distort";
      Object.assign(c.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        zIndex: "50",
        pointerEvents: "none",
        display: "none",
      });
      c.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.glState = null;
        this.stop();
      });
      c.addEventListener("webglcontextrestored", () => {
        this.glState = null; // 下次 play 时重建
      });
      (document.getElementById("stage") ?? document.body).appendChild(c);
      this.canvas = c;
    }
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl || gl.isContextLost()) return null;

    const prog = link(gl, compile(gl, gl.VERTEX_SHADER, VERT), compile(gl, gl.FRAGMENT_SHADER, FRAG));
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const u: GLState["u"] = {};
    for (const name of UNIFORMS) u[name] = gl.getUniformLocation(prog, name);
    this.glState = { gl, prog, tex, u };
    return this.glState;
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}
