/**
 * 血迹流淌（WebGL 有向距离场液体）：
 * - 顶部不规则血带 + 若干条向下流淌的血痕，用 smooth-min 融合成连续的液体
 * - 每条血痕“粘滞-滑落”：停顿时末端积成血珠，滑落时拉长变细；偶尔有血滴脱落坠下
 * - 着色：配色取自恐怖素材（暗红 -> 深褐红，厚处更暗），由距离场梯度求法线，
 *   左上方光源的湿润高光 + 边缘暗边，呈现粘稠的液体质感
 * 全部流完后不再重绘（画面保持），零持续开销。
 */
import type { FxContext } from "../core/fx";
import { GlFx } from "../core/glfx";
import { clamp, rand } from "../core/layer";

const MAX_DRIPS = 24;
const MAX_DROPS = 12;

const FS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;      // 渲染像素
uniform float uScale;   // CSS 像素 -> 渲染像素
uniform float uFade;
uniform float uBand;    // 顶部血带厚度系数 0..1
uniform float uSeed;
uniform vec4 uDrips[${MAX_DRIPS}]; // x, len, 宽度, 末端血珠半径（CSS 像素）
uniform int uDripCount;
uniform vec4 uDrops[${MAX_DROPS}]; // x, y, 半径, 拉伸
uniform int uDropCount;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash(i + uSeed), hash(i + 1.0 + uSeed), f * f * (3.0 - 2.0 * f));
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// 返回 (距离, 局部半厚度)
vec2 scene(vec2 p) {
  float bandH = uBand * (22.0 + 18.0 * noise(p.x * 0.012) + 9.0 * noise(p.x * 0.05 + 5.0) + 4.0 * noise(p.x * 0.2));
  float d = p.y - bandH;
  float thick = max(bandH, 6.0);
  for (int i = 0; i < ${MAX_DRIPS}; i++) {
    if (i >= uDripCount) break;
    vec4 dr = uDrips[i];
    float dx = abs(p.x - dr.x);
    if (dx > dr.z * 2.5 + dr.w * 2.0 + 20.0) continue;
    float len = dr.y;
    // 由上到下逐渐变细的流痕（略带蜿蜒）
    float yy = clamp(p.y, 0.0, len);
    float t = len > 0.0 ? yy / len : 0.0;
    float wob = (noise(yy * 0.03 + dr.x) - 0.5) * dr.z * 0.6;
    float r = mix(dr.z * 0.55, dr.z * 0.32, t);
    float dd = length(vec2(p.x - dr.x - wob * t, p.y - yy)) - r;
    // 末端血珠
    float wobEnd = (noise(len * 0.03 + dr.x) - 0.5) * dr.z * 0.6;
    vec2 head = vec2(dr.x + wobEnd, len - dr.w * 0.35);
    float dh = length((p - head) * vec2(1.0, 0.82)) - dr.w;
    float di = smin(dd, dh, dr.w * 0.9);
    float k = 6.0;
    if (di < d) thick = mix(r, dr.w, smoothstep(0.6, 1.0, t));
    d = smin(d, di, k);
  }
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec4 dp = uDrops[i];
    vec2 q = (p - dp.xy) / vec2(1.0, dp.w);
    float dd = length(q) * min(1.0, dp.w) - dp.z;
    if (dd < d) thick = dp.z;
    d = min(d, dd);
  }
  return vec2(d, thick);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = frag / uScale; // CSS 像素，y 向下
  vec2 s = scene(p);
  float d = s.x;
  float aa = 1.0 / uScale;
  float alpha = smoothstep(aa, -aa, d);
  if (alpha <= 0.0) { fragColor = vec4(0.0); return; }

  // 截面看作圆柱：越靠中心越厚；由距离场梯度得到横向法线
  vec2 g = vec2(dFdx(d), -dFdy(d));
  vec2 gn = length(g) > 1e-5 ? normalize(g) : vec2(0.0, -1.0);
  float depth = clamp(-d / max(s.y, 1.5), 0.0, 1.0);
  float nz = sqrt(depth * (2.0 - depth));
  vec3 n = normalize(vec3(gn * (1.0 - nz) , nz + 0.25));
  vec3 L = normalize(vec3(-0.45, -0.55, 0.7));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 60.0);

  // 配色：边缘鲜红 -> 中心深褐红，厚处更暗
  vec3 edge = vec3(0.62, 0.03, 0.05);
  vec3 core = vec3(0.30, 0.0, 0.015);
  vec3 col = mix(edge, core, smoothstep(0.0, 0.85, depth));
  col *= 0.65 + 0.55 * diff;
  // 外缘一圈暗边（液体表面张力的厚边）
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.18, depth));
  col += vec3(1.0, 0.82, 0.82) * spec * 0.85;
  float a = alpha * 0.96 * uFade;
  fragColor = vec4(col * a, a);
}
`;

interface Drip {
  x: number;
  len: number;
  max: number;
  w: number;
  head: number;
  v: number;
  /** 粘滞计时：>0 时停住积血 */
  stick: number;
  delay: number;
}

interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
}

class BloodFlow extends GlFx {
  private drips: Drip[] = [];
  private drops: Drop[] = [];
  private band = 0;
  private dirty = true;
  private dripBuf = new Float32Array(MAX_DRIPS * 4);
  private dropBuf = new Float32Array(MAX_DROPS * 4);
  private seed = rand(0, 100);

  constructor(ctx: FxContext) {
    super(ctx, FS, 21);
    this.fadeIn = 0.01;
    this.fadeOut = 1;
    const W = ctx.rt.width;
    const H = ctx.rt.height;
    const k = ctx.options.intensity ?? 0.6;
    const n = Math.min(MAX_DRIPS, Math.round(8 + k * 14));
    for (let i = 0; i < n; i++) {
      const w = rand(5, 15) * (0.8 + k * 0.4);
      this.drips.push({
        x: rand(0.02, 0.98) * W,
        len: 0,
        max: H * rand(0.12, 0.85) * (0.6 + k * 0.5),
        w,
        head: w * rand(0.75, 1.0),
        v: 0,
        stick: 0,
        delay: rand(0.3, 2.5),
      });
    }
  }

  protected resolutionScale() {
    return 0.75;
  }

  protected beforeRender(dt: number) {
    const H = this.ctx.rt.height;
    if (this.band < 1) {
      this.band = Math.min(1, this.band + dt / 1.2);
      this.dirty = true;
    }
    for (const d of this.drips) {
      if (d.delay > 0) {
        d.delay -= dt;
        continue;
      }
      if (d.len >= d.max) continue;
      this.dirty = true;
      if (d.stick > 0) {
        // 停住：末端慢慢积成更大的血珠
        d.stick -= dt;
        d.head = Math.min(d.w * 1.7, d.head + dt * d.w * 0.35);
        d.v = 0;
        continue;
      }
      // 滑落：积得越多冲得越快，越往下流得越慢（血越来越少）
      const remain = 1 - d.len / d.max;
      const target = (40 + d.head * 9) * (0.35 + 0.65 * remain);
      d.v += (target - d.v) * Math.min(1, dt * 3);
      d.len = Math.min(d.max, d.len + d.v * dt);
      // 滑动时血珠被拉长消耗
      d.head = Math.max(d.w * 0.7, d.head - dt * d.w * 0.25);
      if (Math.random() < dt * 0.55) d.stick = rand(0.3, 1.6);
      // 偶尔脱落一滴
      if (d.head > d.w * 1.1 && Math.random() < dt * 0.25 && this.drops.length < MAX_DROPS) {
        this.drops.push({ x: d.x, y: d.len + d.head * 0.4, r: d.head * 0.75, vy: 30 });
        d.head *= 0.75;
      }
    }
    for (const p of this.drops) {
      p.vy += 1400 * dt;
      p.y += p.vy * dt;
      this.dirty = true;
    }
    this.drops = this.drops.filter((p) => p.y < H + 60);
  }

  protected render() {
    // 全部静止且没有出场/退场变化时保留上一帧，不再重绘
    if (!this.dirty && !this.stopping && this.fade >= 1) return;
    this.dirty = false;
    super.render();
  }

  protected setUniforms() {
    const gl = this.gl;
    const sc = this.ctx.rt.dpr * this.resolutionScale();
    gl.uniform1f(this.u("uScale"), sc);
    gl.uniform1f(this.u("uBand"), clamp(this.band, 0, 1));
    gl.uniform1f(this.u("uSeed"), this.seed);
    this.dripBuf.fill(0);
    this.drips.forEach((d, i) => this.dripBuf.set([d.x, d.delay > 0 ? 0 : d.len, d.delay > 0 ? 0 : d.w, d.delay > 0 ? 0 : d.head], i * 4));
    gl.uniform4fv(this.u("uDrips"), this.dripBuf);
    gl.uniform1i(this.u("uDripCount"), this.drips.length);
    this.dropBuf.fill(0);
    this.drops.forEach((p, i) => this.dropBuf.set([p.x, p.y, p.r, 1 + Math.min(1.6, p.vy / 900)], i * 4));
    gl.uniform4fv(this.u("uDrops"), this.dropBuf);
    gl.uniform1i(this.u("uDropCount"), this.drops.length);
  }
}

export const createBloodFlow = (ctx: FxContext) => new BloodFlow(ctx);
