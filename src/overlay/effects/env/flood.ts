/**
 * 桌面水淹：水位从底部涨起并晃荡，水面波浪 + 高光 + 泡沫，水下染色、焦散光纹、
 * 斜射光柱和上升气泡；鼠标靠近水面会拨起局部波浪。退场时水位回落排干。
 */
import type { FxContext } from "../../core/fx";
import { GlFx } from "../../core/glfx";
import { HEADER, NOISE } from "./glsl";

const FS =
  HEADER +
  NOISE +
  `
uniform float uLevel;   // 水位（0..1，屏幕高度比例）
uniform float uSlosh;   // 晃荡幅度

// 水面高度（屏幕高度比例）
float surface(float x, float aspect) {
  float t = uTime;
  float xs = x * aspect;
  float h = uLevel;
  h += uSlosh * sin(xs * 1.3 - t * 0.9) * 0.5;
  h += 0.006 * sin(xs * 9.0 + t * 1.7) + 0.004 * sin(xs * 17.0 - t * 2.4) + 0.0025 * sin(xs * 31.0 + t * 3.1);
  h += 0.006 * (vnoise(vec2(xs * 4.0 - t * 0.5, t * 0.3)) - 0.5);
  // 鼠标拨水：靠近水面时形成局部涟漪
  if (uMouse.z > 0.5) {
    vec2 m = uMouse.xy / uRes;
    float near = exp(-pow((m.y - uLevel) / 0.08, 2.0));
    float dx = (x - m.x) * aspect;
    h += 0.018 * near * exp(-dx * dx * 60.0) * cos(dx * 70.0 - t * 9.0);
  }
  return h;
}

// 焦散：两层 voronoi 边缘叠加
float caustics(vec2 p) {
  float t = uTime * 0.6;
  vec2 w = vec2(fbm(p * 3.0 + t * 0.2), fbm(p * 3.0 + 4.7 - t * 0.15)) - 0.5;
  vec2 v1 = voronoi(p * 6.0 + w * 1.6 + vec2(t * 0.5, t * 0.25));
  vec2 v2 = voronoi(p * 10.0 - w * 1.2 - vec2(t * 0.35, -t * 0.4));
  float c1 = pow(smoothstep(0.22, 0.0, v1.y - v1.x), 2.5);
  float c2 = pow(smoothstep(0.16, 0.0, v2.y - v2.x), 2.5);
  // 大尺度明暗起伏，避免整屏均匀的网格感
  float m = smoothstep(0.3, 0.7, fbm(p * 1.5 + t * 0.1));
  return (c1 * 0.6 + c2 * 0.4) * (0.35 + 0.65 * m);
}

// 气泡：按格子哈希，向上浮并左右摆
float bubbles(vec2 p, float scale, float speed, float seed) {
  vec2 g = vec2(p.x * scale, p.y * scale - uTime * speed);
  vec2 id = floor(g);
  float h = hash12(id + seed);
  if (h > 0.12) return 0.0;
  vec2 pos = hash22(id + seed) * 0.6 + 0.2;
  pos.x += 0.15 * sin(uTime * 2.0 + h * 50.0 + g.y);
  float r = 0.07 + 0.12 * fract(h * 37.0);
  float d = length(fract(g) - pos);
  float ring = smoothstep(r, r - 0.025, d) - smoothstep(r - 0.035, r - 0.07, d) * 0.7;
  float spec = smoothstep(r * 0.35, 0.0, length(fract(g) - pos - vec2(-r * 0.35, r * 0.35)));
  return clamp(ring * 0.6 + spec, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  float s = surface(uv.x, aspect);
  float depth = s - uv.y;              // >0 在水下
  float px = 1.0 / uRes.y;
  if (depth < -0.02 || uLevel <= 0.001) { fragColor = vec4(0.0); return; }

  vec2 p = vec2(uv.x * aspect, uv.y);
  float under = smoothstep(-px, px, depth);
  float dn = clamp(depth / max(uLevel, 0.05), 0.0, 1.0);   // 0 水面 .. 1 水底

  // 水体颜色：越深越浓
  vec3 shallow = vec3(0.12, 0.55, 0.62);
  vec3 deep = vec3(0.02, 0.18, 0.32);
  vec3 water = mix(shallow, deep, smoothstep(0.0, 1.0, dn));
  float a = mix(0.24, 0.48, smoothstep(0.0, 1.0, dn)) * (0.75 + 0.25 * uIntensity);

  // 焦散（靠近水面更亮）
  float c = caustics(p) * (1.0 - dn * 0.75);
  // 光柱：沿倾斜方向拉伸的噪声，随深度衰减
  float rays = fbm(vec2((p.x + p.y * 0.35) * 5.0 + uTime * 0.08, uTime * 0.15));
  rays = smoothstep(0.5, 0.85, rays) * (1.0 - smoothstep(0.0, 0.8, dn)) * 0.5;
  float b = bubbles(p, 26.0, 1.2, 3.0) + bubbles(p, 44.0, 1.8, 9.0) * 0.8;

  vec3 col = water * a;
  col += vec3(0.75, 0.95, 1.0) * (c * 0.35 + rays * 0.25) * a * 1.6;
  float alpha = a;
  // 气泡叠加
  vec4 bub = vec4(vec3(0.9, 0.98, 1.0) * b * 0.8, b * 0.8);
  vec4 under4 = bub + vec4(col, alpha) * (1.0 - bub.a);

  // 水面：高光线 + 泡沫带 + 下方亮边
  float d = abs(depth) / px;           // 像素距离
  float line = exp(-d * d / 3.0);
  float foamN = fbm(vec2(p.x * 22.0 - uTime * 0.4, uTime * 0.6));
  float foam = smoothstep(0.45, 0.75, foamN) * smoothstep(px * 14.0, 0.0, depth) * under;
  float glint = pow(max(0.0, sin(p.x * 40.0 + uTime * 2.0 + foamN * 6.0)), 18.0) * exp(-d / 2.0);
  vec4 surf = vec4(vec3(1.0), clamp(line * 0.85 + foam * 0.55 + glint * 0.8, 0.0, 1.0));
  surf.rgb *= surf.a;

  vec4 o = under4 * under;
  o = surf + o * (1.0 - surf.a);
  fragColor = o;
}
`;

class Flood extends GlFx {
  private level = 0;
  private vel = 0;

  constructor(ctx: FxContext) {
    super(ctx, FS);
    this.fadeIn = 3.2;
    this.fadeOut = 2.6;
  }

  protected beforeRender(dt: number) {
    // 弹簧驱动水位：涨水时有晃荡过冲，排水时回落
    const target = (0.42 + 0.18 * this.intensity) * this.easedFade();
    const k = 6;
    const damp = 2.2;
    this.vel += ((target - this.level) * k - this.vel * damp) * dt;
    this.level += this.vel * dt;
  }

  private easedFade() {
    const f = this.fade;
    return f * f * (3 - 2 * f);
  }

  protected render() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1f(this.u("uLevel"), Math.max(0, this.level));
    gl.uniform1f(this.u("uSlosh"), Math.min(0.03, Math.abs(this.vel) * 0.12) + 0.004);
    super.render();
  }
}

export const flood = (ctx: FxContext) => new Flood(ctx);
