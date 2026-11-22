/**
 * WebGL 全屏着色器特效基类（火焰 / 水淹 / 冰冻 / 沙尘 / 水波纹……）。
 *
 * 每个实例拥有独立的全屏 WebGL2 canvas（class="layer layer-gl"），用自己的 ticker 订阅渲染，
 * 同时作为 FxEntity 挂在 2D 图层上，只用于统一的生命周期管理（运行表、stop、一键清场），
 * 在 2D 图层上不绘制任何内容、也不触发 2D 重绘。
 *
 * 子类：提供 fragment shader 源码；可重写 setUniforms()/beforeRender() 做额外绑定或多 pass 模拟。
 * 内置 uniform：
 *   uRes(vec2, 物理像素) uTime(float, 秒) uFade(float, 0..1 出场/退场) uIntensity(float)
 *   uMouse(vec3: xy 物理像素且 y 向上, z=鼠标是否在屏内) uDpr(float)
 */
import type { PlayOptions } from "../../shared/protocol";
import type { FxContext } from "./fx";
import type { FxEntity } from "./layer";

export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`shader compile failed: ${log}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link failed: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export abstract class GlFx implements FxEntity {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  protected program: WebGLProgram;
  protected quad: WebGLVertexArrayObject;
  protected time = 0;
  protected fade = 0;
  protected stopping = false;
  protected dead = false;
  protected readonly options: PlayOptions;
  private unsub: () => void;
  private unsubResize: () => void;
  private uniforms = new Map<string, WebGLUniformLocation | null>();

  /** 出场 / 退场时长（秒） */
  protected fadeIn = 1.2;
  protected fadeOut = 1.2;
  /** 一次性特效的时长（秒），null = 常驻 */
  protected duration: number | null = null;

  constructor(
    protected ctx: FxContext,
    fragmentSource: string,
    zIndex = 25,
  ) {
    this.options = ctx.options;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "layer layer-gl";
    this.canvas.style.zIndex = String(zIndex);
    document.getElementById("stage")!.appendChild(this.canvas);
    const gl = this.canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error("WebGL2 不可用");
    this.gl = gl;
    this.program = compile(gl, FULLSCREEN_VS, fragmentSource);
    this.quad = gl.createVertexArray()!;
    gl.bindVertexArray(this.quad);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.resize();
    this.unsubResize = ctx.rt.onResize(() => this.resize());
    this.unsub = ctx.rt.ticker.add(this.frame);
  }

  get intensity() {
    return this.options.intensity ?? 0.6;
  }

  /** 物理像素尺寸 */
  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
  }

  protected resize() {
    const { width, height, dpr } = this.ctx.rt;
    this.canvas.width = Math.round(width * dpr * this.resolutionScale());
    this.canvas.height = Math.round(height * dpr * this.resolutionScale());
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.onResize();
  }

  /** 渲染分辨率缩放（软效果如烟雾可降到 0.5 节省填充率） */
  protected resolutionScale() {
    return 1;
  }

  protected onResize() {}

  protected u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  /** 子类绑定额外 uniform / 纹理（program 已 use） */
  protected setUniforms(_dt: number) {}

  /** 子类在主 pass 之前执行额外 pass（如水波模拟），需自行恢复 framebuffer/viewport/program */
  protected beforeRender(_dt: number) {}

  /** 主 pass；默认绘制全屏三角形 */
  protected render() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    const c = this.ctx.rt.cursor;
    const s = this.ctx.rt.dpr * this.resolutionScale();
    gl.uniform2f(this.u("uRes"), this.width, this.height);
    gl.uniform1f(this.u("uTime"), this.time);
    gl.uniform1f(this.u("uFade"), this.fade);
    gl.uniform1f(this.u("uIntensity"), this.intensity);
    gl.uniform1f(this.u("uDpr"), s);
    gl.uniform3f(this.u("uMouse"), c.x * s, this.height - c.y * s, c.inside ? 1 : 0);
    this.setUniforms(0);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private frame = (dt: number) => {
    if (this.dead) return false;
    this.time += dt;
    if (this.duration !== null && this.time > this.duration - this.fadeOut) this.stopping = true;
    this.fade = this.stopping
      ? Math.max(0, this.fade - dt / this.fadeOut)
      : Math.min(1, this.fade + dt / this.fadeIn);
    if (this.stopping && this.fade <= 0) {
      this.finish();
      return false;
    }
    try {
      this.beforeRender(dt);
      this.render();
    } catch (e) {
      console.error("[glfx]", e);
      this.finish();
      return false;
    }
    return true;
  };

  private finish() {
    if (this.dead) return;
    this.dead = true;
    // 从 2D 图层移除自己 -> 触发 dispose -> 运行表同步
    this.ctx.layer.remove(this);
  }

  // ---- FxEntity ----
  stop() {
    this.stopping = true;
  }
  update() {
    return !this.dead;
  }
  draw() {}
  isAnimating() {
    return false;
  }
  dispose() {
    this.dead = true;
    this.unsub();
    this.unsubResize();
    this.onDispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.remove();
  }
  protected onDispose() {}
}
