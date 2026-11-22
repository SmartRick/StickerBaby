/** 阻尼弹簧，用于 Q 弹 / 挤压 / 摇晃等手感动画 */
export class Spring {
  v = 0;
  constructor(
    public x: number,
    public target = x,
    public k = 320,
    public d = 16,
  ) {}

  step(dt: number) {
    // 半隐式欧拉，分步积分保证大 dt 下稳定
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const f = -this.k * (this.x - this.target) - this.d * this.v;
      this.v += f * h;
      this.x += this.v * h;
    }
  }

  get settled() {
    return Math.abs(this.v) < 0.002 && Math.abs(this.x - this.target) < 0.0005;
  }

  snap() {
    this.x = this.target;
    this.v = 0;
  }
}
