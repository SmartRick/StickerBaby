/**
 * 分节爬虫（程序化绘制）：
 * - 蜈蚣：红褐色油亮背甲分节，黄色两段式步足按“后传波”节律摆动，
 *   头部毒颚 + 摆动的长触角，尾部一对向后拖的长尾足
 * - 千足虫：圆柱形环节（明暗环带 + 高光），每节两对短腿形成密集波浪；
 *   受惊时原地卷成螺旋，过一会儿再舒展开
 * 两者都用“弯曲角受限”的跟随链，转弯平滑、身体不会折叠。
 */
import { clamp, rand } from "../../core/layer";
import { TAU, angleDiff, dist } from "../base";
import { Critter, type Params, type World } from "./critter";

interface SP {
  x: number;
  y: number;
  a: number;
}

export class Segmented extends Critter {
  private pts: { x: number; y: number }[] = [];
  private spine: SP[] = [];
  private phase = 0;
  private sc = rand(0.95, 1.25);
  private coil = 0; // 0..1 卷曲程度（千足虫）
  private coilT = 0;
  private hue = rand(-12, 12);

  constructor(
    P: Params,
    private n: number,
    private spacing: number,
    private milli: boolean,
  ) {
    super(P);
    this.spacing *= this.sc;
  }

  private init() {
    this.pts = [];
    for (let i = 0; i < this.n; i++) {
      this.pts.push({ x: this.x - Math.cos(this.heading) * i * this.spacing, y: this.y - Math.sin(this.heading) * i * this.spacing });
    }
    this.buildSpine();
  }

  spawnAtEdge(W: number, H: number) {
    super.spawnAtEdge(W, H);
    this.init();
  }

  place(x: number, y: number) {
    super.place(x, y);
    this.init();
  }

  scare(x: number, y: number) {
    super.scare(x, y);
    if (this.milli) this.coilT = rand(2.5, 4);
  }

  protected steer(dt: number, w: World) {
    if (this.milli) {
      // 鼠标贴近时千足虫也会卷起来
      const c = w.cursor;
      if (c.inside && dist(c.x, c.y, this.x, this.y) < 60 && this.coilT <= 0) this.coilT = rand(2, 3.5);
      if (this.coilT > 0) {
        this.speed = 0;
        return;
      }
    }
    const h0 = this.heading;
    super.steer(dt, w);
    const maxTurn = (0.5 + this.speed / 60) * dt;
    this.heading = h0 + clamp(angleDiff(h0, this.heading), -maxTurn, maxTurn);
  }

  update(dt: number, w: World) {
    super.update(dt, w);
    if (this.dead || !this.pts.length) return;
    this.coilT = Math.max(0, this.coilT - dt);
    const coilTarget = this.coilT > 0.6 ? 1 : 0;
    this.coil += (coilTarget - this.coil) * Math.min(1, dt * (coilTarget ? 5 : 2));

    this.pts[0].x = this.x;
    this.pts[0].y = this.y;
    let prevDir = this.heading + Math.PI;
    const maxBend = this.milli ? 0.16 : 0.2;
    for (let i = 1; i < this.n; i++) {
      const p = this.pts[i - 1];
      const c = this.pts[i];
      let a = Math.atan2(c.y - p.y, c.x - p.x);
      a = prevDir + clamp(angleDiff(prevDir, a), -maxBend, maxBend);
      if (this.coil > 0.01) {
        // 卷曲：每节向同一侧弯，越靠尾越弯 -> 螺旋
        const target = prevDir + (0.22 + 0.5 * (i / this.n)) * this.coil;
        a = a + angleDiff(a, target) * this.coil;
      }
      c.x = p.x + Math.cos(a) * this.spacing;
      c.y = p.y + Math.sin(a) * this.spacing;
      prevDir = a;
    }
    this.phase += (this.speed * dt) / (this.spacing * (this.milli ? 0.9 : 1.4));
    this.buildSpine();
  }

  private buildSpine() {
    const out: SP[] = [];
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[Math.max(0, i - 1)];
      const q = this.pts[Math.min(this.pts.length - 1, i + 1)];
      out.push({ x: this.pts[i].x, y: this.pts[i].y, a: Math.atan2(p.y - q.y, p.x - q.x) });
    }
    this.spine = out;
  }

  hit(x: number, y: number) {
    if (this.dead) return false;
    for (let i = 0; i < this.spine.length; i += 2) {
      const p = this.spine[i];
      if (dist(x, y, p.x, p.y) < 9 * this.sc + 5) return true;
    }
    return false;
  }

  protected drawAlive(ctx: CanvasRenderingContext2D) {
    if (!this.spine.length) return;
    if (this.milli) this.drawMillipede(ctx);
    else this.drawCentipede(ctx);
  }

  // ---------------------------------------------------------------------------

  private drawCentipede(ctx: CanvasRenderingContext2D) {
    const sc = this.sc;
    const sp = this.spine;
    const n = sp.length;
    const halfW = (i: number) => (i === 0 ? 5.8 : 5.2 + Math.sin((i / n) * Math.PI) * 1.4 - (i > n - 3 ? 1.4 : 0)) * sc;

    // 投影
    ctx.save();
    ctx.globalAlpha *= 0.2;
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 12 * sc;
    ctx.beginPath();
    sp.forEach((p, i) => (i ? ctx.lineTo(p.x + 3, p.y + 5) : ctx.moveTo(p.x + 3, p.y + 5)));
    ctx.stroke();
    ctx.restore();

    // 步足：每节一对，两段式（向外伸 -> 向后下折），相位沿身体向后传播
    ctx.lineCap = "round";
    for (let i = 1; i < n - 1; i++) {
      const p = sp[i];
      for (const side of [-1, 1]) {
        const swing = Math.sin(this.phase * Math.PI - i * 0.7 + (side > 0 ? Math.PI : 0)) * 0.55;
        const base = p.a + side * (Math.PI / 2) - side * swing * 0.6 - side * 0.15;
        const r0 = halfW(i) * 0.8;
        const hx = p.x + Math.cos(p.a + (side * Math.PI) / 2) * r0;
        const hy = p.y + Math.sin(p.a + (side * Math.PI) / 2) * r0;
        const l1 = 7 * sc;
        const kx = hx + Math.cos(base) * l1;
        const ky = hy + Math.sin(base) * l1;
        const a2 = base - side * 0.9 + Math.PI * 0.08 * side;
        const fx = kx + Math.cos(a2 + Math.PI * 0.1 * -side) * 6.5 * sc;
        const fy = ky + Math.sin(a2 + Math.PI * 0.1 * -side) * 6.5 * sc;
        ctx.strokeStyle = "#8a5a1c";
        ctx.lineWidth = 2.4 * sc;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.strokeStyle = "#e0b04f";
        ctx.lineWidth = 1.4 * sc;
        ctx.stroke();
      }
    }
    // 尾足：一对向后拖的长腿
    const tail = sp[n - 1];
    for (const side of [-1, 1]) {
      const a = tail.a + Math.PI + side * 0.35 + Math.sin(this.t * 3 + side) * 0.08;
      ctx.strokeStyle = "#8a5a1c";
      ctx.lineWidth = 2.2 * sc;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.quadraticCurveTo(
        tail.x + Math.cos(a) * 9 * sc,
        tail.y + Math.sin(a) * 9 * sc,
        tail.x + Math.cos(a - side * 0.2) * 20 * sc,
        tail.y + Math.sin(a - side * 0.2) * 20 * sc,
      );
      ctx.stroke();
      ctx.strokeStyle = "#e0b04f";
      ctx.lineWidth = 1.2 * sc;
      ctx.stroke();
    }

    // 背甲：从尾到头逐节绘制（前一节盖住后一节）
    for (let i = n - 1; i >= 1; i--) {
      const p = sp[i];
      const w = halfW(i);
      const l = this.spacing * 0.62;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      const g = ctx.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, `hsl(${12 + this.hue}, 70%, 34%)`);
      g.addColorStop(0.35, `hsl(${10 + this.hue}, 75%, 22%)`);
      g.addColorStop(0.65, `hsl(${8 + this.hue}, 70%, 16%)`);
      g.addColorStop(1, `hsl(${14 + this.hue}, 65%, 30%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-l, -w, l * 2, w * 2, w * 0.55);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,5,0,0.7)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // 油亮高光
      ctx.fillStyle = "rgba(255,200,170,0.28)";
      ctx.beginPath();
      ctx.ellipse(l * 0.1, -w * 0.38, l * 0.6, w * 0.18, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 头：圆盾形头板 + 毒颚 + 触角
    const h = sp[0];
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.a);
    // 触角：多节感的长弧线，随时间摆动
    for (const side of [-1, 1]) {
      const sw = Math.sin(this.t * 4 + side * 1.3) * 0.25;
      ctx.strokeStyle = "#6b3a17";
      ctx.lineWidth = 1.4 * sc;
      ctx.beginPath();
      ctx.moveTo(4 * sc, side * 2.5 * sc);
      ctx.quadraticCurveTo(14 * sc, side * (8 + sw * 10) * sc, 26 * sc, side * (14 + sw * 14) * sc);
      ctx.stroke();
    }
    // 毒颚
    ctx.strokeStyle = "#1e0d05";
    ctx.lineWidth = 2.2 * sc;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(3 * sc, side * 3 * sc);
      ctx.quadraticCurveTo(10 * sc, side * 4.5 * sc, 9 * sc, side * 0.6 * sc);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(-1 * sc, -2 * sc, 1, 0, 0, 7 * sc);
    g.addColorStop(0, `hsl(${16 + this.hue}, 70%, 40%)`);
    g.addColorStop(1, `hsl(${10 + this.hue}, 75%, 18%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0.5 * sc, 0, 6.5 * sc, 6 * sc, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,5,0,0.7)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }

  private drawMillipede(ctx: CanvasRenderingContext2D) {
    const sc = this.sc;
    const sp = this.spine;
    const n = sp.length;
    const r = (i: number) => (i === 0 ? 5 : i > n - 4 ? 5.6 - (i - (n - 4)) * 1.1 : 5.8) * sc;

    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 12 * sc;
    ctx.beginPath();
    sp.forEach((p, i) => (i ? ctx.lineTo(p.x + 3, p.y + 4) : ctx.moveTo(p.x + 3, p.y + 4)));
    ctx.stroke();
    ctx.restore();

    // 短腿：每节两对，密集的后传波；卷曲时收起
    const legOut = 1 - this.coil;
    if (legOut > 0.05) {
      ctx.strokeStyle = "#d8c7a4";
      ctx.lineWidth = 1 * sc;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 1; i < n - 1; i++) {
        const p = sp[i];
        for (const k of [0, 0.5]) {
          const ph = this.phase * Math.PI * 1.4 - (i + k) * 0.9;
          for (const side of [-1, 1]) {
            const sw = Math.sin(ph + (side > 0 ? Math.PI : 0)) * 0.6;
            const off = (k - 0.25) * this.spacing;
            const bx = p.x + Math.cos(p.a) * off + Math.cos(p.a + (side * Math.PI) / 2) * r(i) * 0.85;
            const by = p.y + Math.sin(p.a) * off + Math.sin(p.a + (side * Math.PI) / 2) * r(i) * 0.85;
            const a = p.a + side * (Math.PI / 2) - side * sw;
            const len = 4.2 * sc * legOut;
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
          }
        }
      }
      ctx.stroke();
    }

    // 圆柱环节：暗色主体 + 浅色环带 + 顶部高光，从尾往头画
    for (let i = n - 1; i >= 0; i--) {
      const p = sp[i];
      const rr = r(i);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      const g = ctx.createLinearGradient(0, -rr, 0, rr);
      g.addColorStop(0, `hsl(${20 + this.hue}, 35%, 30%)`);
      g.addColorStop(0.3, `hsl(${18 + this.hue}, 40%, 16%)`);
      g.addColorStop(0.75, `hsl(${15 + this.hue}, 35%, 10%)`);
      g.addColorStop(1, `hsl(${20 + this.hue}, 30%, 24%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.spacing * 0.68, rr, 0, 0, TAU);
      ctx.fill();
      // 环节后缘浅色环带
      ctx.strokeStyle = `hsla(${28 + this.hue}, 45%, 55%, 0.55)`;
      ctx.lineWidth = 1.1 * sc;
      ctx.beginPath();
      ctx.ellipse(-this.spacing * 0.35, 0, this.spacing * 0.2, rr * 0.92, 0, -Math.PI / 2, Math.PI / 2, true);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,240,220,0.22)";
      ctx.beginPath();
      ctx.ellipse(0, -rr * 0.42, this.spacing * 0.45, rr * 0.18, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // 头部短触角
    const h = sp[0];
    for (const side of [-1, 1]) {
      const a = h.a + side * (0.45 + Math.sin(this.t * 5 + side) * 0.15);
      ctx.strokeStyle = "#3a2a1c";
      ctx.lineWidth = 1.2 * sc;
      ctx.beginPath();
      ctx.moveTo(h.x + Math.cos(h.a) * 3 * sc, h.y + Math.sin(h.a) * 3 * sc);
      ctx.lineTo(h.x + Math.cos(a) * 10 * sc, h.y + Math.sin(a) * 10 * sc);
      ctx.stroke();
    }
  }
}
