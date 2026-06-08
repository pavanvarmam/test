export const WORLD_WIDTH  = 2000;
export const WORLD_HEIGHT = 2000;

const GRID_SIZE    = 80;
const LINE_COLOR   = 0x333333;
const LINE_ALPHA   = 0.6;
const LINE_WIDTH   = 1;
const BG_COLOR     = 0x111111;
const BORDER_COLOR = 0xff4444;
const BORDER_WIDTH = 4;

export function drawGrid(g, camera, screen) {
  g.clear();

  const viewLeft   = -camera.x;
  const viewTop    = -camera.y;
  const viewRight  = viewLeft + screen.width;
  const viewBottom = viewTop  + screen.height;

  // Background
  g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  g.fill({ color: BG_COLOR });

  // Viewport culled grid lines
  const startX = Math.max(0,            Math.floor(viewLeft / GRID_SIZE) * GRID_SIZE);
  const endX   = Math.min(WORLD_WIDTH,  Math.ceil(viewRight  / GRID_SIZE) * GRID_SIZE);
  const startY = Math.max(0,            Math.floor(viewTop   / GRID_SIZE) * GRID_SIZE);
  const endY   = Math.min(WORLD_HEIGHT, Math.ceil(viewBottom / GRID_SIZE) * GRID_SIZE);

  g.setStrokeStyle({ width: LINE_WIDTH, color: LINE_COLOR, alpha: LINE_ALPHA });
  for (let x = startX; x <= endX; x += GRID_SIZE) {
    g.moveTo(x, startY);
    g.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += GRID_SIZE) {
    g.moveTo(startX, y);
    g.lineTo(endX,   y);
  }
  g.stroke();

  // World border
  g.setStrokeStyle({ width: BORDER_WIDTH, color: BORDER_COLOR, alpha: 1 });
  g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  g.stroke();
}
