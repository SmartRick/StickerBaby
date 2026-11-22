/**
 * 视频绿幕实时抠像（WebGL）。算法同 OBS Chroma Key：在 CbCr 平面上计算与键色的距离，
 * similarity 以内全透明，smoothness 范围内羽化，spill 范围内对残留绿色去饱和（去溢色）。
 *
 * 只在视频有新帧时重绘（requestVideoFrameCallback），暂停 / 隐藏时零开销。
 * 同时维护一张低分辨率 alpha 遮罩供贴纸做像素级命中测试。
 */
import type { ChromaKey } from "../../shared/protocol";

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uKey;        // 键色的 CbCr
uniform float uSimilarity;
uniform float uSmoothness;
uniform float uSpill;
uniform vec2 uTexel;

vec2 cbcr(vec3 c) {
  return vec2(
    dot(c, vec3(-0.100644, -0.338572, 0.439216)) + 0.501961,
    dot(c, vec3(0.439216, -0.398942, -0.040274)) + 0.501961);
}

float chromaDist(vec2 uv) {
  return distance(cbcr(texture2D(uTex, uv).rgb), uKey);
}

void main() {
  vec4 rgba = texture2D(uTex, vUv);
  // 3x3 平均距离，抑制压缩噪点导致的边缘闪烁
  float d = 0.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      d += chromaDist(vUv + vec2(float(x), float(y)) * uTexel);
  d /= 9.0;
  float base = d - uSimilarity;
  float alpha = pow(clamp(base / uSmoothness, 0.0, 1.0), 1.5);
  float spillVal = pow(clamp(base / uSpill, 0.0, 1.0), 1.5);
  float desat = dot(rgba.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 rgb = mix(vec3(desat), rgba.rgb, spillVal);
  gl_FragColor = vec4(rgb * alpha, alpha);
}`;

const MASK_W = 96;

function cbcr(r: number, g: number, b: number): [number, number] {
  return [
    -0.100644 * r - 0.338572 * g + 0.439216 * b + 0.501961,
    0.439216 * r - 0.398942 * g - 0.040274 * b + 0.501961,
  ];
}

export class ChromaVideo {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private tex: WebGLTexture;
  private prog: WebGLProgram;
  private key: [number, number];
  private frameReq = 0;
  private disposed = false;
  private maskCanvas = document.createElement("canvas");
  private maskCtx: CanvasRenderingContext2D;
  private lastMask = 0;
  mask: Uint8ClampedArray | null = null;
  maskH = 0;

  constructor(
    readonly video: HTMLVideoElement,
    private params: ChromaKey,
  ) {
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error("WebGL 不可用");
    this.gl = gl;
    this.maskCtx = this.maskCanvas.getContext("2d", { willReadFrequently: true })!;
    this.key = cbcr(...params.color);

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(this.prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(this.prog, 0, "aPos");
    gl.linkProgram(this.prog);
    gl.useProgram(this.prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [p, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ])
      gl.texParameteri(gl.TEXTURE_2D, p, v);
    this.setParams(params);
    this.schedule();
  }

  setParams(p: ChromaKey) {
    this.params = p;
    this.key = cbcr(...p.color);
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform2f(gl.getUniformLocation(this.prog, "uKey"), this.key[0], this.key[1]);
    gl.uniform1f(gl.getUniformLocation(this.prog, "uSimilarity"), p.similarity);
    gl.uniform1f(gl.getUniformLocation(this.prog, "uSmoothness"), Math.max(p.smoothness, 1e-3));
    gl.uniform1f(gl.getUniformLocation(this.prog, "uSpill"), Math.max(p.spill, 1e-3));
  }

  private schedule() {
    if (this.disposed) return;
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (v.requestVideoFrameCallback) this.frameReq = v.requestVideoFrameCallback(() => this.onFrame());
    else this.frameReq = requestAnimationFrame(() => this.onFrame());
  }

  private onFrame() {
    if (this.disposed) return;
    const v = this.video;
    if (v.videoWidth) {
      const gl = this.gl;
      if (this.canvas.width !== v.videoWidth || this.canvas.height !== v.videoHeight) {
        this.canvas.width = v.videoWidth;
        this.canvas.height = v.videoHeight;
        gl.viewport(0, 0, v.videoWidth, v.videoHeight);
        gl.uniform2f(gl.getUniformLocation(this.prog, "uTexel"), 1 / v.videoWidth, 1 / v.videoHeight);
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const now = performance.now();
      if (now - this.lastMask > 250) {
        this.lastMask = now;
        this.updateMask();
      }
    }
    this.schedule();
  }

  /** 低分辨率 CPU 抠像，只生成 alpha，用于命中测试 */
  private updateMask() {
    const v = this.video;
    const w = MASK_W;
    const h = Math.max(1, Math.round((w * v.videoHeight) / v.videoWidth));
    if (this.maskCanvas.width !== w || this.maskCanvas.height !== h) {
      this.maskCanvas.width = w;
      this.maskCanvas.height = h;
    }
    this.maskCtx.drawImage(v, 0, 0, w, h);
    const d = this.maskCtx.getImageData(0, 0, w, h).data;
    const { similarity, smoothness } = this.params;
    for (let i = 0; i < d.length; i += 4) {
      const [cb, cr] = cbcr(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      const dist = Math.hypot(cb - this.key[0], cr - this.key[1]);
      d[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (dist - similarity) / smoothness)));
    }
    this.mask = d;
    this.maskH = h;
  }

  dispose() {
    this.disposed = true;
    const v = this.video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void };
    v.cancelVideoFrameCallback?.(this.frameReq);
    cancelAnimationFrame(this.frameReq);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
