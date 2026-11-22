/**
 * 沙尘暴：多层橙褐色沙尘沿水平方向奔涌（域扭曲 fbm），细沙粒条纹高速掠过，
 * 周期性阵风让浓度起伏，四周暗角压低能见度。
 */
import type { FxContext } from "../../core/fx";
import { GlFx } from "../../core/glfx";
import { HEADER, NOISE } from "./glsl";

const FS =
  HEADER +
  NOISE +
  `
// 沙粒条纹：拉伸成横向短线的哈希网格，按层速度平移
float grains(vec2 p, float speed, float scale, float seed) {
  vec2 q = vec2(p.x * scale * 0.18 - uTime * speed, p.y * scale);
  vec2 id = floor(q);
  vec2 f = fract(q);
  float h = hash12(id + seed);
  if (h < 0.82) return 0.0;
  float y = hash12(id + seed + 3.1);
  float len = 0.35 + 0.6 * hash12(id + seed + 7.7);
  float line = smoothstep(0.09, 0.0, abs(f.y - y)) * smoothstep(len, 0.0, abs(f.x - 0.5) * 2.0);
  return line * (h - 0.82) / 0.18;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime;

  // 阵风：缓慢变化的整体浓度 + 横向扫过的一道强风带
  float gust = 0.75 + 0.25 * sin(t * 0.35) + 0.15 * sin(t * 0.9 + 1.3);
  float band = smoothstep(0.35, 0.0, abs(fract(p.x * 0.25 - t * 0.12) - 0.5) - 0.15) * 0.35;

  // 三层沙尘，越近越快、越粗
  float dens = 0.0;
  vec3 tint = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float spd = 0.18 + fi * 0.22;
    float sc = 1.2 + fi * 1.1;
    vec2 q = p * sc + vec2(-t * spd * sc, fi * 13.7);
    vec2 warp = vec2(fbm(q * 0.7 + t * 0.05), fbm(q * 0.7 + 5.2 - t * 0.04));
    float n = fbm(q + warp * 1.6);
    float d = smoothstep(0.35, 0.85, n) * (0.55 + 0.25 * fi);
    dens += d * (1.0 - dens * 0.5);
    tint += d * mix(vec3(0.78, 0.55, 0.32), vec3(0.62, 0.40, 0.22), fi / 2.0);
  }
  tint /= max(dens, 1e-3);

  // 底部更浓（贴地扬沙），顶部稍淡
  float ground = mix(1.15, 0.75, uv.y);
  float base = mix(0.22, 0.42, uIntensity);
  float a = clamp((base + dens * mix(0.35, 0.55, uIntensity) + band) * gust * ground, 0.0, 0.85);

  // 暗角：四周更昏暗
  vec2 c = uv - 0.5;
  float vig = smoothstep(0.25, 0.85, length(c * vec2(aspect * 0.7, 1.0)));
  a = clamp(a + vig * 0.18, 0.0, 0.9);
  vec3 col = mix(tint, vec3(0.45, 0.28, 0.15), vig * 0.6);

  // 亮色沙粒
  float g = grains(p, 2.6, 60.0, 1.0) + grains(p, 4.2, 38.0, 9.0) * 0.8;
  vec3 gc = vec3(1.0, 0.86, 0.62);
  float ga = clamp(g * 0.7, 0.0, 1.0);

  vec4 o = vec4(col * a, a);
  o = vec4(gc * ga, ga) + o * (1.0 - ga);
  fragColor = o * uFade;
}
`;

class Sandstorm extends GlFx {
  constructor(ctx: FxContext) {
    super(ctx, FS);
    this.fadeIn = 2.5;
    this.fadeOut = 2;
  }
  protected resolutionScale() {
    return 0.5;
  }
}

export const sandstorm = (ctx: FxContext) => new Sandstorm(ctx);
