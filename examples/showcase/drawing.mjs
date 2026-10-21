/** Native pixel geometry helpers. Every mark stays an individually named shape. */
export const WIDTH = 192, HEIGHT = 128, FRAMES = 32, FPS = 10;
export const cellFor = i => `${Math.floor(i / 8)},${i % 8}`;
export const wave = (i, period = FRAMES, phase = 0) => Math.sin(2 * Math.PI * (i / period + phase));
export const mod = (n, d) => ((n % d) + d) % d;
export const noise = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class Painter {
  constructor(ops, cell = '0,0') { this.ops = ops; this.cell = cell; this.serial = 0; }
  mark(type, name, params) {
    this.ops.push({ command: 'draw', type, cell: this.cell, name: `${name}_${this.serial++}`, ...params });
  }
  rect(name, x, y, w, h, color) {
    if (w > 0 && h > 0) this.mark('rect', name, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), color, filled: true });
  }
  point(name, x, y, color) { this.rect(name, x, y, 1, 1, color); }
  line(name, x1, y1, x2, y2, color) {
    this.mark('line', name, { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), color });
  }
  poly(name, points, color) {
    this.mark('polygon', name, { points: points.map(p => p.map(Math.round)), color, filled: true });
  }
  ellipse(name, cx, cy, rx, ry, color) {
    this.mark('ellipse', name, { cx: Math.round(cx), cy: Math.round(cy), rx: Math.max(1, Math.round(rx)), ry: Math.max(1, Math.round(ry)), color, filled: true });
  }
  leaf(name, x, y, dx, dy, color) {
    this.poly(name, [[x,y],[x+dx*.28-dy*.2,y+dy*.28+dx*.2],[x+dx,y+dy],[x+dx*.65+dy*.15,y+dy*.65-dx*.15]], color);
  }
  pot(name, x, y, w, h, c) {
    this.poly(`${name}_body`, [[x,y],[x+w,y],[x+w-2,y+h],[x+2,y+h]], c[0]);
    this.rect(`${name}_lit_face`, x+2,y+1, Math.max(1,w/3),h-1,c[1]);
    this.rect(`${name}_rim_shadow`,x-1,y,w+2,3,c[2]);
    this.rect(`${name}_rim_light`,x,y,w,1,c[1]);
    this.rect(`${name}_earth`,x+1,y+1,w-2,1,c[3]);
  }
  fern(name, x, y, s, colors) {
    this.line(`${name}_stem`, x,y,x,y-13*s,colors[1]);
    for (let j=0;j<5;j++) {
      const yy=y-(j*2+2)*s, reach=(6-j*.8)*s;
      this.leaf(`${name}_left`,x,yy,-reach,-(4-j*.3)*s,colors[j%colors.length]);
      this.leaf(`${name}_right`,x,yy,reach,-(5-j*.4)*s,colors[(j+1)%colors.length]);
    }
  }
  flower(name,x,y,color,center) {
    this.rect(`${name}_horizontal`,x-2,y,5,2,color);
    this.rect(`${name}_vertical`,x,y-2,2,5,color);
    this.rect(`${name}_heart`,x,y,1,1,center);
  }
}

export function createScene(config, base, animate) {
  const ops = [{ command:'new', name:config.slug, size:`${WIDTH}x${HEIGHT}`, rows:4, cols:8, palette:'db-32' },
    { command:'clear', cell:'0,0' }];
  base(new Painter(ops));
  // Copy only completed scenery. Each frame gets its independent effect geometry.
  for (let i=1;i<FRAMES;i++) ops.push({command:'copy',from:'0,0',to:cellFor(i)});
  for (let i=0;i<FRAMES;i++) {
    const cell=cellFor(i);
    animate(new Painter(ops,cell), i);
    ops.push({command:'name',cell,as:`${config.slug}_${String(i).padStart(2,'0')}`});
  }
  ops.push({command:'group',sub:'create',name:'ambience',cells:Array.from({length:FRAMES},(_,i)=>cellFor(i)),fps:FPS});
  return ops;
}
