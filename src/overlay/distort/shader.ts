/**
 * 屏幕扰动的“超级着色器”：一次绘制完成 仿射变换 -> 像素扭曲 -> 采样 -> 颜色后处理。
 * 截图字节是 BGRA，按 RGBA 上传后在采样处 swizzle（t.bgr），避免 CPU 逐像素转换。
 */
import type { DistortKind } from "../../shared/protocol";

export const KIND_ID: Record<DistortKind, number> = {
  shake: 0,
  "explosion-shake": 1,
  sway: 2,
  bob: 3,
  tilt: 4,
  wave: 5,
  bulge: 6,
  stretch: 7,
  swirl: 8,
  "rgb-shift": 9,
  tear: 10,
  noise: 11,
  flash: 12,
  "digital-glitch": 13,
  flip: 14,
  "color-shift": 15,
  blur: 16,
};

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // 左上角为原点，与截图行序（top-down）一致
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform int uKind;
uniform float uTime;
uniform float uAmt;      // 当前帧效果强度（已含包络）
uniform float uSeed;
uniform vec2 uRes;       // 画布物理像素
uniform vec2 uCenter;    // 0..1，局部效果中心
uniform vec2 uOffset;    // 物理像素位移
uniform float uRot;      // 弧度
uniform vec2 uScale;
uniform vec2 uPersp;     // 翻转时的伪透视
uniform int uClamp;      // 0 越界填黑，1 边缘拉伸
uniform vec4 uFlash;     // rgb + 混合比例
uniform vec3 uColorFx;   // x 色相旋转, y 反色, z 灰度
uniform float uVignette;
in vec2 vUv;
out vec4 outColor;

const int K_WAVE = 5, K_BULGE = 6, K_SWIRL = 8, K_RGB = 9, K_TEAR = 10, K_NOISE = 11,
          K_GLITCH = 13, K_BLUR = 16;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 tex(vec2 uv) {
  if (uClamp == 0 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) return vec3(0.0);
  return texture(uTex, clamp(uv, 0.0, 1.0)).bgr;
}

vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  float aspect = uRes.x / uRes.y;
  float tick = floor(uTime * 12.0);

  // ---- 1. 整屏仿射（抖动 / 倾斜 / 拉伸 / 翻转） ----
  vec2 c = uRes * 0.5;
  vec2 p = vUv * uRes - c - uOffset;
  float cs = cos(uRot), sn = sin(uRot);
  p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
  p /= uScale;
  p.x *= 1.0 + uPersp.x * (p.y / uRes.y);
  p.y *= 1.0 + uPersp.y * (p.x / uRes.x);
  vec2 uv = (p + c) / uRes;

  // ---- 2. 像素级扭曲 ----
  bool glitchBlock = false;
  if (uKind == K_WAVE) {
    uv.x += sin(uv.y * 16.0 + uTime * 5.0) * 0.012 * uAmt;
    uv.y += sin(uv.x * 9.0 + uTime * 3.5) * 0.006 * uAmt;
  } else if (uKind == K_BULGE || uKind == K_SWIRL) {
    vec2 d = (uv - uCenter) * vec2(aspect, 1.0);
    float r = length(d);
    float R = 0.32;
    if (r < R) {
      float k = r / R;
      if (uKind == K_BULGE) {
        d *= mix(1.0, smoothstep(0.0, 1.0, k), 0.75 * uAmt);
      } else {
        float a = uAmt * 4.0 * (1.0 - k) * (1.0 - k);
        d = vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
      }
      uv = uCenter + d / vec2(aspect, 1.0);
    }
  } else if (uKind == K_TEAR) {
    float rows = 18.0 + floor(hash(vec2(tick, 1.0)) * 30.0);
    float band = floor(uv.y * rows);
    float on = step(0.72, hash(vec2(band, tick)));
    uv.x += (hash(vec2(band, tick + 7.0)) - 0.5) * 0.16 * uAmt * on;
  } else if (uKind == K_GLITCH) {
    vec2 grid = vec2(16.0, 9.0) * (1.0 + floor(hash(vec2(tick, 3.0)) * 3.0));
    vec2 block = floor(uv * grid);
    if (hash(block + tick) > 1.0 - 0.28 * uAmt) {
      glitchBlock = true;
      uv += (vec2(hash(block + 1.7 + tick), hash(block + 9.1 + tick)) - 0.5) * 0.08 * uAmt;
    }
  } else if (uKind == K_NOISE) {
    float ln = floor(uv.y * uRes.y / 2.0);
    uv.x += (hash(vec2(ln, tick)) - 0.5) * 0.004 * uAmt;
    float bar = exp(-pow((fract(uv.y - uTime * 0.35) - 0.5) * 18.0, 2.0));
    uv.x += 0.012 * uAmt * bar;
  }

  // ---- 3. 采样 ----
  vec3 col;
  if (uKind == K_RGB || uKind == K_GLITCH || uKind == K_NOISE) {
    float s = uKind == K_RGB ? 0.008 : 0.003;
    vec2 o = vec2(s, s * 0.35) * uAmt * (1.0 + 0.6 * sin(uTime * 37.0));
    col = vec3(tex(uv + o).r, tex(uv).g, tex(uv - o).b);
  } else if (uKind == K_BLUR) {
    vec2 r = uAmt * 14.0 / uRes;
    col = tex(uv) * 0.2;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 d = vec2(cos(a), sin(a));
      col += tex(uv + d * r) * 0.06 + tex(uv + d * r * 0.5 + d.yx * r * 0.25) * 0.04;
    }
  } else {
    col = tex(uv);
  }

  // ---- 4. 颜色后处理 ----
  if (uKind == K_GLITCH && glitchBlock) {
    col = hash(vec2(tick, 5.0)) > 0.5 ? col.gbr : floor(col * 4.0) / 4.0;
  }
  if (uKind == K_NOISE) {
    vec2 px = vUv * uRes;
    col = mix(col, vec3(hash(px + uTime)), 0.22 * uAmt);
    col *= 1.0 - 0.18 * uAmt * step(0.5, fract(px.y / 3.0));
    col += 0.08 * uAmt * exp(-pow((fract(vUv.y - uTime * 0.35) - 0.5) * 18.0, 2.0));
  }
  if (uColorFx.x != 0.0) col = clamp(hueRotate(col, uColorFx.x), 0.0, 1.0);
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), uColorFx.z);
  col = mix(col, 1.0 - col, uColorFx.y);
  col = mix(col, uFlash.rgb, uFlash.a);
  col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(aspect, 1.0)) / aspect * 1.4);
  outColor = vec4(col, 1.0);
}`;
