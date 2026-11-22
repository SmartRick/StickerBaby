/**
 * 鼠标水波纹：GPU 高度场波动模拟（两张 RGBA16F 纹理乒乓，r=高度 g=速度）。
 * 光标移动时沿轨迹注入扰动，按下鼠标注入更强的一圈；渲染时由高度梯度求法线，
 * 只画光照（高光 + 背光阴影 + 淡青色），平静水面完全透明。
 * 依赖全局光标流，点击穿透状态下同样生效。
 */
import type { FxContext } from "../../core/fx";
import { compile, FULLSCREEN_VS, GlFx } from "../../core/glfx";
import { HEADER } from "./glsl";

const MAX_DROPS = 8;
const SIM_SCALE = 0.35; // 模拟分辨率 = 屏幕物理像素 × SIM_SCALE
const STEP = 1 / 90; // 固定步长，保证不同刷新率下波速一致

const SIM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec4 uDrops[${MAX_DROPS}]; // xy uv, z 半径(模拟像素), w 强度
uniform int uDropCount;
uniform float uDamp;

void main() {
  vec4 s = texture(uState, vUv);
  float h = s.r;
  float v = s.g;
  float avg = (
    texture(uState, vUv + vec2(uTexel.x, 0.0)).r +
    texture(uState, vUv - vec2(uTexel.x, 0.0)).r +
    texture(uState, vUv + vec2(0.0, uTexel.y)).r +
    texture(uState, vUv - vec2(0.0, uTexel.y)).r) * 0.25;
  v += (avg - h) * 2.0;
  v *= uDamp;
  h += v;
  h *= 0.9995;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec4 d = uDrops[i];
    float dist = length((vUv - d.xy) / uTexel);
    float k = max(0.0, 1.0 - dist / d.z);
    h -= (0.5 - 0.5 * cos(k * 3.14159265)) * d.w;
  }
  o = vec4(h, v, 0.0, 1.0);
}`;

const RENDER_FS =
  HEADER +
  `
uniform sampler2D uHeight;
uniform vec2 uSimTexel;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float hl = texture(uHeight, uv - vec2(uSimTexel.x, 0.0)).r;
  float hr = texture(uHeight, uv + vec2(uSimTexel.x, 0.0)).r;
  float hd = texture(uHeight, uv - vec2(0.0, uSimTexel.y)).r;
  float hu = texture(uHeight, uv + vec2(0.0, uSimTexel.y)).r;
  vec2 grad = vec2(hr - hl, hu - hd);
  float slope = length(grad);
  vec3 n = normalize(vec3(-grad * 9.0, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.6, 0.75));
  float shade = dot(n, L) - L.z;                 // >0 迎光面，<0 背光面
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);

  float hiA = clamp(spec * 0.9 + max(shade, 0.0) * 1.6, 0.0, 0.85);
  float shA = clamp(-shade * 1.3, 0.0, 0.45);
  float tintA = clamp(slope * 2.2, 0.0, 0.18);

  vec4 col = vec4(vec3(0.55, 0.85, 1.0) * tintA, tintA);
  col = vec4(vec3(0.02, 0.06, 0.1) * shA, shA) + col * (1.0 - shA);
  col = vec4(vec3(1.0) * hiA, hiA) + col * (1.0 - hiA);
  fragColor = col * uFade;
}
`;

interface Tex {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

class Ripple extends GlFx {
  private sim: WebGLProgram;
  private state: [Tex, Tex] | null = null;
  private simW = 1;
  private simH = 1;
  private acc = 0;
  private last: { x: number; y: number } | null = null;
  private wasDown = false;
  private drops: [number, number, number, number][] = [];
  private dropBuf = new Float32Array(MAX_DROPS * 4);

  constructor(ctx: FxContext) {
    super(ctx, RENDER_FS, 26);
    if (!this.gl.getExtension("EXT_color_buffer_float")) throw new Error("需要 EXT_color_buffer_float");
    this.sim = compile(this.gl, FULLSCREEN_VS, SIM_FS);
    this.fadeIn = 0.3;
    this.fadeOut = 1.2;
    this.allocate();
  }

  protected resolutionScale() {
    return 0.5;
  }

  protected onResize() {
    if (this.sim) this.allocate();
  }

  private allocate() {
    const gl = this.gl;
    this.freeState();
    const { width, height, dpr } = this.ctx.rt;
    this.simW = Math.max(16, Math.round(width * dpr * SIM_SCALE));
    this.simH = Math.max(16, Math.round(height * dpr * SIM_SCALE));
    const mk = (): Tex => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.simW, this.simH, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo };
    };
    this.state = [mk(), mk()];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private freeState() {
    if (!this.state) return;
    for (const t of this.state) {
      this.gl.deleteTexture(t.tex);
      this.gl.deleteFramebuffer(t.fbo);
    }
    this.state = null;
  }

  /** 光标（CSS 像素）-> 模拟 uv（y 向上） */
  private toUv(x: number, y: number): [number, number] {
    return [x / this.ctx.rt.width, 1 - y / this.ctx.rt.height];
  }

  private collectDrops() {
    const c = this.ctx.rt.cursor;
    if (!c.inside) {
      this.last = null;
      return;
    }
    const k = this.intensity;
    // 按下瞬间：一圈强波
    if (c.down && !this.wasDown) {
      const [u, v] = this.toUv(c.x, c.y);
      this.drops.push([u, v, 9, 0.9 * (0.6 + k)]);
    }
    this.wasDown = c.down;
    if (this.last) {
      const dx = c.x - this.last.x;
      const dy = c.y - this.last.y;
      const d = Math.hypot(dx, dy);
      if (d > 2) {
        // 沿轨迹每隔一段注入，强度随速度增大但有上限
        const n = Math.min(MAX_DROPS - this.drops.length, Math.max(1, Math.floor(d / 14)));
        const strength = Math.min(0.35, 0.05 + d * 0.004) * (0.5 + k) * (c.down ? 1.6 : 1);
        for (let i = 1; i <= n; i++) {
          const [u, v] = this.toUv(this.last.x + (dx * i) / n, this.last.y + (dy * i) / n);
          this.drops.push([u, v, 4.5, strength / Math.sqrt(n)]);
        }
      }
    }
    this.last = { x: c.x, y: c.y };
  }

  protected beforeRender(dt: number) {
    if (!this.state) return;
    this.collectDrops();
    const gl = this.gl;
    this.acc = Math.min(this.acc + dt, STEP * 4);
    let first = true;
    gl.useProgram(this.sim);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.bindVertexArray(this.quad);
    gl.uniform2f(gl.getUniformLocation(this.sim, "uTexel"), 1 / this.simW, 1 / this.simH);
    gl.uniform1f(gl.getUniformLocation(this.sim, "uDamp"), 0.985);
    gl.uniform1i(gl.getUniformLocation(this.sim, "uState"), 0);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const drops = first ? this.drops.slice(0, MAX_DROPS) : [];
      first = false;
      this.dropBuf.fill(0);
      drops.forEach((d, i) => this.dropBuf.set(d, i * 4));
      gl.uniform4fv(gl.getUniformLocation(this.sim, "uDrops"), this.dropBuf);
      gl.uniform1i(gl.getUniformLocation(this.sim, "uDropCount"), drops.length);
      const pair: [Tex, Tex] = this.state;
      const src = pair[0];
      const dst = pair[1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.state = [dst, src];
    }
    if (!first) this.drops = [];
  }

  protected setUniforms() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state![0].tex);
    gl.uniform1i(this.u("uHeight"), 0);
    gl.uniform2f(this.u("uSimTexel"), 1 / this.simW, 1 / this.simH);
  }

  protected onDispose() {
    this.freeState();
  }
}

export const ripple = (ctx: FxContext) => new Ripple(ctx);
