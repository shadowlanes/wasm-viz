// Renders grid + visited + path to a canvas using an ImageData backbuffer.
// Colors are written as 32-bit values for speed.

// Okabe–Ito palette: sky blue (visited) + orange (path) + vermillion (endpoints)
// is distinguishable for the three common color-vision deficiencies. Stored as
// 0xAA_BB_GG_RR to match Uint32Array view of RGBA ImageData on little-endian.
const COLOR_EMPTY = 0xffffffff;     // white
const COLOR_WALL = 0xff111111;      // near-black
const COLOR_VISITED = 0xffe9b456;   // #56B4E9 sky blue
const COLOR_PATH = 0xff009fe6;      // #E69F00 orange
const COLOR_ENDPOINT = 0xff005ed5;  // #D55E00 vermillion

export class GridRenderer {
  constructor(canvas, n) {
    this.canvas = canvas;
    this.n = n;
    this.ctx = canvas.getContext('2d');
    canvas.width = n;
    canvas.height = n;
    this.image = this.ctx.createImageData(n, n);
    this.pixels = new Uint32Array(this.image.data.buffer);
  }

  drawBaseGrid(grid) {
    const px = this.pixels;
    for (let i = 0; i < grid.length; i++) {
      px[i] = grid[i] ? COLOR_WALL : COLOR_EMPTY;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  // Animate visited cells in chunks via requestAnimationFrame.
  // Then draw the final path. Resolves when done.
  // msTotal paces the animation in wall-clock ms; pass algorithm time scaled
  // up so faster runs visibly finish sooner.
  async animate(visited, path, start, end, msTotal = 1500) {
    const px = this.pixels;
    const total = visited.length;
    if (total === 0) return;

    // Aim for ~60 frames over msTotal duration.
    const frames = Math.max(1, Math.min(120, Math.ceil(msTotal / 16)));
    const perFrame = Math.ceil(total / frames);

    let i = 0;
    await new Promise((resolve) => {
      const step = () => {
        const stop = Math.min(total, i + perFrame);
        for (; i < stop; i++) px[visited[i]] = COLOR_VISITED;
        this.ctx.putImageData(this.image, 0, 0);
        if (i < total) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    // Thicken the path by painting a 3x3 block per cell — visually equivalent
    // to using a bolder stroke. Endpoints are painted last so they stay on top.
    for (let k = 0; k < path.length; k++) this._splat3(path[k], COLOR_PATH);
    this._splat3(start, COLOR_ENDPOINT);
    this._splat3(end, COLOR_ENDPOINT);
    this.ctx.putImageData(this.image, 0, 0);
  }

  // Paint a 3x3 patch centered at idx so endpoints are also distinguishable by
  // shape, not only hue.
  _splat3(idx, color) {
    const px = this.pixels;
    const n = this.n;
    const r = (idx / n) | 0;
    const c = idx - r * n;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= n) continue;
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc >= n) continue;
        px[rr * n + cc] = color;
      }
    }
  }

  clear() {
    this.pixels.fill(COLOR_EMPTY);
    this.ctx.putImageData(this.image, 0, 0);
  }
}
