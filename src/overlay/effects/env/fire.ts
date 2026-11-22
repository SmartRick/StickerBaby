/**
 * 桌面火焰：底边燃起的火舌（domain-warped fbm），上方烟熏，余烬火星上飘。
 * 出场时火焰从底部升起，退场时回落熄灭。
 */
import type { FxContext } from "../../core/fx";
import { GlFx } from "../../core/glfx";
import { HEADER, NOISE } from "./glsl";

const FS =
  HEADER +
  NOISE +
  `
vec3 fireRamp(float f) {
  vec3 c = mix(vec3(0.35, 0.01, 0.0), vec3(0.95, 0.22, 0.02), smoothstep(0.05, 0.4, f));
  c = mix(c, vec3(1.0, 0.62, 0.12), smoothstep(0.38, 0.68, f));
  return mix(c, vec3(1.0, 0.9, 0.55), smoothstep(0.75, 1.0, f));
}

// 单层余烬：按格子哈希出零星火星，随时间上升并左右摆动
float embers(vec2 p, float scale, float speed, float H, float seed) {
  vec2 g = vec2(p.x * scale, p.y * scale - uTime * speed);
  g.x += sin(g.y * 0.7 + seed) * 0.6;
  vec2 id = floor(g);
  float h = hash12(id + seed);
  if (h > 0.22) return 0.0;
  vec2 pos = hash22(id + seed * 3.1) * 0.7 + 0.15;
  vec2 d = fract(g) - pos;
  float r = length(d * vec2(1.0, 0.55));
  float flicker = 0.55 + 0.45 * sin(uTime * (6.0 + h * 20.0) + h * 40.0);
  float life = 1.0 - smoothstep(H * 0.4, H * 3.2, p.y);
  return smoothstep(0.09, 0.0, r) * flicker * life;
}

void main() {
  vec2 p = gl_FragCoord.xy / uRes.y;
  float t = uTime;
  float rise = smoothstep(0.0, 1.0, uFade);

  // 火焰高度：强度 + 缓慢阵风
  float gust = 0.82 + 0.18 * sin(t * 0.37 + p.x * 1.9) * sin(t * 0.21 + 1.3);
  float H = mix(0.17, 0.34, uIntensity) * gust * rise;
  // 每列高度不同，形成高低错落的火舌群
  float c1 = fbm(vec2(p.x * 7.5, t * 0.7));
  float c2 = vnoise(vec2(p.x * 2.2 - t * 0.15, t * 0.3));
  float cols = c1 * c1 * 2.2 * (0.55 + 0.6 * c2);
  float hx = max(H * (0.22 + 1.25 * cols), 1e-3);

  // 上升湍流 + 域扭曲
  vec2 q = vec2(p.x * 8.5, p.y * 2.8 - t * 2.4);
  vec2 w = vec2(fbm(q * 0.6 + vec2(0.0, t * 0.5)), fbm(q * 0.6 + vec2(5.2, 1.3)));
  float n = fbm(q + (w - 0.5) * 2.4);

  float y = p.y / hx;
  float f = (1.0 - y) * 1.0 + (n - 0.5) * 1.55;
  // 底部更饱满
  f += 0.1 * exp(-p.y / (hx * 0.15));
  f = clamp(f, 0.0, 1.0);
  float flameA = smoothstep(0.14, 0.5, f) * 0.92;
  vec3 flame = fireRamp(f);

  // 底部辉光
  float glow = 0.3 * exp(-p.y / max(H * 0.45, 1e-3)) * rise;
  vec3 glowC = vec3(1.0, 0.45, 0.1);

  // 烟：火焰上方暗色烟雾，向上飘散
  float sy = p.y / max(H, 1e-3);
  float sn = fbm(vec2(p.x * 2.5 + sin(t * 0.2) * 0.5, p.y * 2.2 - t * 0.45));
  float smokeA = 0.36 * smoothstep(0.45, 1.0, sy) * (1.0 - smoothstep(1.4, 3.0, sy)) * smoothstep(0.35, 0.75, sn) * rise;
  vec3 smokeC = vec3(0.07, 0.055, 0.05);

  // 火星
  float e = embers(p, 22.0, 2.3, H, 1.0) + embers(p, 34.0, 3.1, H, 7.0) * 0.8;
  vec3 emberC = mix(vec3(1.0, 0.45, 0.05), vec3(1.0, 0.85, 0.4), e);

  // 合成（预乘 alpha）：烟 -> 辉光 -> 火焰 -> 火星
  vec4 col = vec4(smokeC * smokeA, smokeA);
  float ga = clamp(glow, 0.0, 1.0);
  col = vec4(glowC * ga, ga) + col * (1.0 - ga);
  col = vec4(flame * flameA, flameA) + col * (1.0 - flameA);
  float ea = clamp(e, 0.0, 1.0) * rise;
  col = vec4(emberC * ea, ea) + col * (1.0 - ea);
  fragColor = col * min(1.0, uFade * 1.5);
}
`;

class Fire extends GlFx {
  constructor(ctx: FxContext) {
    super(ctx, FS);
    this.fadeIn = 1.6;
    this.fadeOut = 1.4;
  }
  protected resolutionScale() {
    return 0.6;
  }
}

export const fire = (ctx: FxContext) => new Fire(ctx);
