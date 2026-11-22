/**
 * 桌面冰冻：霜花从屏幕四边（角落更快）向中心蔓延，晶体纹理 + 闪烁冰晶，
 * 顶部挂冰锥，整体冷色暗角。鼠标经过处融化出透明区域，几秒后重新结霜。
 */
import type { FxContext } from "../../core/fx";
import { GlFx } from "../../core/glfx";
import { HEADER, NOISE } from "./glsl";

const MELT_POINTS = 24;
const MELT_LIFE = 6; // 秒：融化点完全重新冻结的时间

const FS =
  HEADER +
  NOISE +
  `
uniform vec4 uMelt[${MELT_POINTS}]; // xy 渲染像素(y 向上) z 半径 w 强度

float meltAt(vec2 frag) {
  float m = 0.0;
  float edgeN = vnoise(frag * 0.05) * 0.35 + 0.65;
  for (int i = 0; i < ${MELT_POINTS}; i++) {
    vec4 mp = uMelt[i];
    if (mp.w <= 0.0) continue;
    float d = length(frag - mp.xy);
    m = max(m, mp.w * smoothstep(mp.z * edgeN, mp.z * 0.45, d));
  }
  return m;
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// 晶体纹理：两级 voronoi 冰晶边 + 每个晶胞内定向的蕨叶状细纹
float frostTex(vec2 p) {
  vec2 v1 = voronoi(p * 9.0);
  vec2 v2 = voronoi(p * 26.0 + 3.7);
  float e1 = smoothstep(0.07, 0.0, v1.y - v1.x);
  float e2 = smoothstep(0.06, 0.0, v2.y - v2.x);
  vec2 cell = floor(p * 9.0);
  float ang = hash12(cell) * 6.2831;
  vec2 rp = rot(ang) * p;
  float fern = smoothstep(0.55, 0.85, vnoise(rp * vec2(140.0, 9.0)));
  float fern2 = smoothstep(0.6, 0.9, vnoise(rot(ang + 1.1) * p * vec2(90.0, 7.0)));
  float grain = fbm(p * 30.0);
  return clamp(0.18 + 0.5 * e1 + 0.3 * e2 + 0.35 * fern + 0.25 * fern2 + 0.25 * (grain - 0.5), 0.0, 1.0);
}

// 顶部冰锥（返回预乘颜色）
vec4 icicles(vec2 uv, float aspect, float grow) {
  float x = uv.x * aspect;
  float y = 1.0 - uv.y; // 距顶部
  float w = 0.022;
  float id = floor(x / w);
  float h = hash12(vec2(id, 7.0));
  if (h < 0.35) return vec4(0.0);
  float len = (0.015 + 0.085 * h * h) * grow;
  float lx = fract(x / w) - 0.5;
  if (y > len) return vec4(0.0);
  float k = y / len;
  float hw = 0.42 * pow(1.0 - k, 1.4) + 0.02;
  if (abs(lx) > hw) return vec4(0.0);
  float side = lx / hw; // -1..1
  float hl = smoothstep(-0.2, -0.7, side);          // 左侧高光
  float edge = smoothstep(0.65, 1.0, abs(side));
  vec3 c = mix(vec3(0.62, 0.8, 0.98), vec3(0.97, 0.99, 1.0), hl * 0.9);
  c = mix(c, vec3(0.45, 0.62, 0.85), edge * 0.5);
  float a = mix(0.6, 0.85, hl) * smoothstep(1.0, 0.85, k + 0.0);
  return vec4(c * a, a);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float grow = smoothstep(0.0, 1.0, uFade);

  // 到边缘的距离（屏幕高度单位），角落更小 -> 角落先冻
  float dx = min(uv.x, 1.0 - uv.x) * aspect;
  float dy = min(uv.y, 1.0 - uv.y);
  float e = (dx * dy) / (dx + dy + 1e-4) * 1.6;
  e += (fbm(p * 5.0) - 0.5) * 0.12 + (vnoise(p * 28.0) - 0.5) * 0.025;

  float reach = grow * mix(0.11, 0.24, uIntensity);
  float cov = smoothstep(reach, reach - 0.03, e);
  float inner = clamp((reach - e) / 0.16, 0.0, 1.0);   // 越靠边越厚

  float melt = meltAt(gl_FragCoord.xy);
  cov *= 1.0 - melt;

  float tex = frostTex(p);
  float a = cov * (0.2 + 0.6 * inner) * (0.45 + 0.75 * tex);
  vec3 c = mix(vec3(0.72, 0.86, 1.0), vec3(1.0), tex * 0.8);

  // 霜前沿微亮
  float front = smoothstep(0.035, 0.0, abs(e - reach + 0.015)) * grow * (1.0 - melt) * 0.25;
  a = clamp(a + front, 0.0, 0.95);

  // 冰晶闪光：网格哈希的小十字星，随时间闪烁
  vec2 g = p * 55.0;
  vec2 gid = floor(g);
  float gh = hash12(gid);
  float tw = pow(max(0.0, sin(uTime * (1.5 + gh * 3.0) + gh * 80.0)), 24.0);
  vec2 gl = fract(g) - 0.5;
  float star = (smoothstep(0.06, 0.0, abs(gl.x)) * smoothstep(0.45, 0.0, abs(gl.y)) +
                smoothstep(0.06, 0.0, abs(gl.y)) * smoothstep(0.45, 0.0, abs(gl.x)));
  float glint = gh > 0.86 ? star * tw * cov * inner : 0.0;

  // 整体冷色暗角
  float vig = (1.0 - smoothstep(0.0, 0.55, e)) * 0.16 * grow * (1.0 - melt * 0.7);

  vec4 col = vec4(vec3(0.55, 0.75, 1.0) * vig, vig);
  col = vec4(c * a, a) + col * (1.0 - a);
  col += vec4(vec3(glint), glint) * (1.0 - col.a * 0.3);
  vec4 ice = icicles(uv, aspect, grow);
  col = ice + col * (1.0 - ice.a);
  fragColor = clamp(col, 0.0, 1.0);
}
`;

interface MeltPoint {
  x: number;
  y: number;
  age: number;
}

class Freeze extends GlFx {
  private melts: MeltPoint[] = [];
  private buf = new Float32Array(MELT_POINTS * 4);

  constructor(ctx: FxContext) {
    super(ctx, FS);
    this.fadeIn = 4;
    this.fadeOut = 2.5;
  }

  protected resolutionScale() {
    return 0.75;
  }

  protected beforeRender(dt: number) {
    const melts = this.melts;
    for (const m of melts) m.age += dt;
    while (melts.length && melts[0].age > MELT_LIFE) melts.shift();
    const c = this.ctx.rt.cursor;
    if (c.inside) {
      const last = melts[melts.length - 1];
      if (last && Math.hypot(last.x - c.x, last.y - c.y) < 24) {
        last.age = Math.min(last.age, 0.4); // 停在原地：保持融化
      } else {
        melts.push({ x: c.x, y: c.y, age: 0 });
        if (melts.length > MELT_POINTS) melts.shift();
      }
    }
  }

  protected setUniforms() {
    const s = this.ctx.rt.dpr * this.resolutionScale();
    const H = this.height;
    const b = this.buf;
    b.fill(0);
    this.melts.forEach((m, i) => {
      // 融化先快速扩开，之后随时间重新冻结
      const t = m.age / MELT_LIFE;
      b[i * 4] = m.x * s;
      b[i * 4 + 1] = H - m.y * s;
      b[i * 4 + 2] = 70 * s * Math.min(1, 0.4 + m.age * 3);
      b[i * 4 + 3] = Math.max(0, 1 - t * t);
    });
    this.gl.uniform4fv(this.u("uMelt"), b);
  }
}

export const freeze = (ctx: FxContext) => new Freeze(ctx);
