import { useEffect } from "react";

const WORLD_WIDTH  = 2000;
const WORLD_HEIGHT = 2000;

const MAP_W = 200;
const MAP_H = 160;
const PAD   = 12;

const OIL_COL      = "#1a1a2e";
const SAND_COL     = "#c2a060";
const PIT_COL      = "#000000";
const PIT_RIM      = "#333333";
const GPIT_COL     = "#888888";
const GPIT_RIM     = "#aaaaaa";
const LOCAL_COL    = "#00ff88";
const REMOTE_COL   = "#ff4444";
const BG_COL       = "rgba(8,8,20,0.90)";
const BORDER_COL   = "rgba(0,255,136,0.35)";
const VIEWPORT_COL = "rgba(255,255,255,0.22)";

function toMap(wx, wy) {
  return [
    PAD + (wx / WORLD_WIDTH)  * MAP_W,
    PAD + (wy / WORLD_HEIGHT) * MAP_H,
  ];
}

export default function Minimap({ minimapRef }) {
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = `
      position: fixed; top: 16px; left: 16px;
      z-index: 50; pointer-events: none; border-radius: 10px;
    `;
    document.body.appendChild(canvas);

    const dpr = window.devicePixelRatio || 1;
    canvas.width        = (MAP_W + PAD * 2) * dpr;
    canvas.height       = (MAP_H + PAD * 2) * dpr;
    canvas.style.width  = `${MAP_W + PAD * 2}px`;
    canvas.style.height = `${MAP_H + PAD * 2}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Write draw() onto the shared ref — World's useTick calls this every frame
    minimapRef.current = {
      draw(player, remotes, objects, screenW, screenH, zoneRef) {
        drawMinimap(ctx, player, remotes, objects, screenW, screenH, zoneRef);
      },
    };

    return () => {
      document.body.removeChild(canvas);
      minimapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ── Drawing ───────────────────────────────────────────────────────

function drawMinimap(ctx, player, remotes, objects, screenW, screenH, zoneRef) {
  ctx.clearRect(0, 0, MAP_W + PAD * 2, MAP_H + PAD * 2);

  // Background
  ctx.fillStyle = BG_COL;
  ctx.beginPath();
  ctx.roundRect(PAD, PAD, MAP_W, MAP_H, 6);
  ctx.fill();

  ctx.strokeStyle = BORDER_COL;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(PAD, PAD, MAP_W, MAP_H, 6);
  ctx.stroke();

  // Clip world content
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(PAD, PAD, MAP_W, MAP_H, 6);
  ctx.clip();

  // World objects
  for (const type of ["sand", "oil", "gravitypit", "pit"]) {
    for (const obj of objects) {
      if (obj.type !== type) continue;
      const [mx, my] = toMap(obj.x, obj.y);

      if (obj.type === "sand") {
        const mSize = (obj.size / WORLD_WIDTH) * MAP_W;
        ctx.fillStyle   = SAND_COL;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(mx - mSize / 2, my - mSize / 2, mSize, mSize);
        ctx.globalAlpha = 1;

      } else if (obj.type === "oil") {
        const r = (obj.radius / WORLD_WIDTH) * MAP_W;
        ctx.fillStyle   = OIL_COL;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(r, 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

      } else if (obj.type === "gravitypit") {
        const r = (obj.radius / WORLD_WIDTH) * MAP_W;
        ctx.fillStyle = GPIT_RIM;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(r + 1.5, 3), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = GPIT_COL;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(r, 2), 0, Math.PI * 2);
        ctx.fill();

      } else if (obj.type === "pit") {
        const r = (obj.radius / WORLD_WIDTH) * MAP_W;
        ctx.fillStyle = PIT_RIM;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(r + 1.5, 3), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PIT_COL;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(r, 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Safe zone
  if (zoneRef) {
    const z = zoneRef;
    const [zx, zy] = toMap(z.x, z.y);
    const zr = (z.radius / WORLD_WIDTH) * MAP_W;
    ctx.strokeStyle = "rgba(0,255,136,0.6)";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(zx, zy, Math.max(zr, 2), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Viewport box
  if (player && screenW && screenH) {
    const vx = player.x - screenW / 2;
    const vy = player.y - screenH / 2;
    const [vmx, vmy] = toMap(vx, vy);
    const vmw = (screenW / WORLD_WIDTH)  * MAP_W;
    const vmh = (screenH / WORLD_HEIGHT) * MAP_H;
    ctx.strokeStyle = VIEWPORT_COL;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(vmx, vmy, vmw, vmh);
  }

  // Remote players
  if (remotes) {
    for (const [, snap] of remotes) {
      const [rx, ry] = toMap(snap.x, snap.y);
      drawCar(ctx, rx, ry, snap.rotation, REMOTE_COL, 3.5);
    }
  }

  // Local player
  if (player) {
    const [lx, ly] = toMap(player.x, player.y);
    drawCar(ctx, lx, ly, player.rotation, LOCAL_COL, 4);
  }

  ctx.restore();

  // "MAP" label
  ctx.fillStyle    = "rgba(0,255,136,0.45)";
  ctx.font         = "bold 8px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("MAP", PAD + 5, PAD + 4);
}

function drawCar(ctx, x, y, rotation, color, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-size * 0.6, -size, size * 1.2, size * 2, 1.5);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(0, -size, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
