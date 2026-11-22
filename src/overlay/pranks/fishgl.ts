/**
 * 金鱼 WebGL 渲染：每条鱼是一条沿脊柱铺开的连续贴图三角带（无接缝、半透明鳍不会重叠变深），
 * 投影用同一网格偏移后在着色器里多点采样 alpha 做模糊，颜色只取黑色、整体很淡。
 */
import type { Atlas } from "../core/assets";

const VS = `#version 300 es
in vec2 aPos;   // CSS 像素
in vec2 aUv;
uniform vec2 uRes;
uniform vec2 uOffset;
out vec2 vUv;
void main() {
  vUv = aUv;
  vec2 p = (aPos + uOffset) / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uAlpha;
uniform float uShadow;   // 1 = 投影 pass
uniform vec2 uBlur;      // 投影模糊半径（uv）
out vec4 o;
void main() {
  if (uShadow > 0.5) {
    float a = 0.0;
    for (int x = -2; x <= 2; x++)
      for (int y = -2; y <= 2; y++)
        a += texture(uTex, vUv + vec2(float(x), float(y)) * uBlur).a;
    a /= 25.0;
    o = vec4(0.0, 0.0, 0.0, a * uAlpha);
  } else {
    o = texture(uTex, vUv) * uAlpha; // 纹理已预乘
  }
}`;

export interface FishMesh {
  /** 交错数组：x, y, u, v（三角带，每段 2 个顶点） */
  data: Float32Array;
  count: number;
}

export class FishGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private tex: WebGLTexture | null = null;
  private texSrc: Atlas | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(zIndex: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "layer layer-gl";
    this.canvas.style.zIndex = String(zIndex);
    document.getElementById("stage")!.appendChild(this.canvas);
    const gl = this.canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) throw new Error("WebGL2 不可用");
    this.gl = gl;
    const sh = (t: number, src: string) => {
      const s = gl.createShader(t)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(this.prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(this.prog, 0, "aPos");
    gl.bindAttribLocation(this.prog, 1, "aUv");
    gl.linkProgram(this.prog);
    for (const n of ["uRes", "uOffset", "uTex", "uAlpha", "uShadow", "uBlur"]) this.loc[n] = gl.getUniformLocation(this.prog, n);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private ensureTexture(a: Atlas) {
    if (this.texSrc === a) return;
    const gl = this.gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texSrc = a;
  }

  render(
    a: Atlas,
    meshes: FishMesh[],
    view: { width: number; height: number; dpr: number },
    alpha: number,
    shadow: { dx: number; dy: number; alpha: number },
  ) {
    const gl = this.gl;
    const w = Math.round(view.width * view.dpr);
    const h = Math.round(view.height * view.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${view.width}px`;
      this.canvas.style.height = `${view.height}px`;
    }
    this.ensureTexture(a);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform2f(this.loc.uRes, view.width, view.height);
    gl.uniform2f(this.loc.uBlur, 7 / a.image.width, 7 / a.image.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    // 先画全部投影，再画鱼身
    for (const pass of [1, 0]) {
      gl.uniform1f(this.loc.uShadow, pass);
      gl.uniform1f(this.loc.uAlpha, pass ? alpha * shadow.alpha : alpha);
      gl.uniform2f(this.loc.uOffset, pass ? shadow.dx : 0, pass ? shadow.dy : 0);
      for (const m of meshes) {
        gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, m.count);
      }
    }
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.remove();
  }
}
