// Renders grid + visited + path to a canvas using an ImageData backbuffer.
// Colors are written as 32-bit values for speed.

const COLOR_EMPTY = 0xffffffff; // white (RGBA little-endian: AABBGGRR)
const COLOR_WALL = 0xff111111;
const COLOR_VISITED = 0xffe07a3a; // blue-ish (BGR: 3A 7A E0 -> #3A7AE0)
const COLOR_PATH = 0xff00cc44; // green
const COLOR_ENDPOINT = 0xff2a2aff; // red-ish

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

    for (let k = 0; k < path.length; k++) px[path[k]] = COLOR_PATH;
    px[start] = COLOR_ENDPOINT;
    px[end] = COLOR_ENDPOINT;
    this.ctx.putImageData(this.image, 0, 0);
  }

  clear() {
    this.pixels.fill(COLOR_EMPTY);
    this.ctx.putImageData(this.image, 0, 0);
  }
}
