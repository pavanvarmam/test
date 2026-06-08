import { WebSocketServer } from "ws";
import { simulatePlayer }  from './physics.js';

const allowedOrigins = [
    'http://localhost:5173',
    'https://mygame.com'
];

// ── Constants ─────────────────────────────────────────────────────
const PORT              = 3001;
const MAX_PLAYERS       = 6;
const MIN_PLAYERS       = 2;
const WORLD_WIDTH       = 2000;
const WORLD_HEIGHT      = 2000;
const MAX_ROUNDS        = 10;
const PRE_GAME_COUNTDOWN = 5;   // seconds before round 1 starts
const BETWEEN_ROUND_MS  = 3000; // ms break between rounds
const GAME_RESET_MS     = 10000; // ms after game over before lobby reset

let serverTickCounter = 0;

const SPAWNS = [
  { x: WORLD_WIDTH / 2 - 100, y: WORLD_HEIGHT / 2 },
  { x: WORLD_WIDTH / 2 + 100, y: WORLD_HEIGHT / 2 },
  { x: WORLD_WIDTH / 2 + 200, y: WORLD_HEIGHT / 2 },
  { x: WORLD_WIDTH / 2 - 200, y: WORLD_HEIGHT / 2 },
];

const ZONE_ROUNDS = [
  { radius: 400, duration: 40 },
  { radius: 350, duration: 30 },
  { radius: 300, duration: 28 },
  { radius: 250, duration: 26 },
  { radius:  200, duration:  24 },
  { radius: 150, duration: 22 },
  { radius: 120, duration: 20 },
  { radius: 100, duration: 18 },
  { radius: 80, duration: 15 },
  { radius:  50, duration:  10 },
];

const EDGE_MARGIN  = 150;
const SPAWN_MARGIN = 200;

// ── Game state ────────────────────────────────────────────────────
// waiting | countdown | playing
let gameState      = "waiting";
let countdownTimer = null;
let zoneInterval   = null;

// ── Zone ──────────────────────────────────────────────────────────
const zone = {
  x:        WORLD_WIDTH  / 2,
  y:        WORLD_HEIGHT / 2,
  radius:   ZONE_ROUNDS[0].radius,
  round:    0,
  timeLeft: ZONE_ROUNDS[0].duration,
  active:   false,
};

// ── World objects ─────────────────────────────────────────────────
function isTooCloseToSpawn(x, y) {
  return SPAWNS.some(s => {
    const dx = s.x - x, dy = s.y - y;
    return Math.sqrt(dx * dx + dy * dy) < SPAWN_MARGIN;
  });
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function generateObjects() {
  const objects = [];
  let id = 1;

  const place = (type, props) => {
    let x, y;
    do {
      x = randomBetween(EDGE_MARGIN, WORLD_WIDTH  - EDGE_MARGIN);
      y = randomBetween(EDGE_MARGIN, WORLD_HEIGHT - EDGE_MARGIN);
    } while (isTooCloseToSpawn(x, y));
    objects.push({ id: `${type}_${id++}`, type, x, y, ...props });
  };

  for (let i = 0; i < 5; i++) place("oil",        { radius: randomBetween(40, 90) });
  for (let i = 0; i < 5; i++) place("sand",        { size:   randomBetween(120, 250) });
  for (let i = 0; i < 3; i++) place("pit",         { radius: 50 });
  for (let i = 0; i < 3; i++) place("gravitypit",  { radius: 55 });

  return objects;
}

const worldObjects = generateObjects();

// ── Zone / object helpers ─────────────────────────────────────────
function getZones(state) {
  const z = { inOil: false, inSand: false, inPit: false, inGravityPit: false };

  for (const obj of worldObjects) {
    const dx = state.x - obj.x, dy = state.y - obj.y;

    if (obj.type === "oil") {
      if (Math.sqrt(dx * dx + dy * dy) < obj.radius) z.inOil = true;
    } else if (obj.type === "sand") {
      const half = obj.size / 2;
      if (Math.abs(dx) < half && Math.abs(dy) < half) z.inSand = true;
    } else if (obj.type === "pit") {
      if (Math.sqrt(dx * dx + dy * dy) < obj.radius) z.inPit = true;
    } else if (obj.type === "gravitypit") {
      if (Math.sqrt(dx * dx + dy * dy) < obj.radius) z.inGravityPit = true;
    }
  }

  return z;
}

function isInsideSafeZone(state) {
  if (!zone.active) return true;
  const dx = state.x - zone.x, dy = state.y - zone.y;
  return Math.sqrt(dx * dx + dy * dy) < zone.radius;
}

// ── Players ───────────────────────────────────────────────────────
const players = new Map();
let nextId = 1;

const wss = new WebSocketServer({ port: PORT });
console.log(`[Server] Game server on ws://localhost:${PORT}`);

wss.on("connection", (ws, request) => {

  //check origin
  const origin = request.headers.origin;

  if (!allowedOrigins.includes(origin)) {
      ws.close();
      return;
  }

  if (players.size >= MAX_PLAYERS) {
    ws.send(JSON.stringify({ type: "full" }));
    ws.close();
    return;
  }

  const id    = nextId++;
  const spawn = SPAWNS[(id - 1) % SPAWNS.length];

  const player = {
    id,
    ws,
    inputQueue:  [],
    ready:       false,
    status:      "out",
    wins:        0,
    lastSeq:     0,
    lastInput:   { forward: false, backward: false, left: false, right: false, boost: false, handbrake: false },
    lastPong:    Date.now(),
    state:       { x: spawn.x, y: spawn.y, rotation: 0, vx: 0, vy: 0 },
  };

  players.set(id, player);
  console.log(`[+] Player ${id} connected. Total: ${players.size}`);

  ws.send(JSON.stringify({ type: "init", id, state: player.state, worldObjects }));
  broadcastLobby();

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);

      // ── Inputs ──────────────────────────────────────────────────
      if (msg.type === "inputs" && Array.isArray(msg.frames)) {
        for (const frame of msg.frames) {
          if (typeof frame.seq !== "number") continue;
          if (frame.seq <= player.lastSeq)   continue;
          const inp = frame.input || {};
          player.inputQueue.push({
            seq: frame.seq,
            input: {
              forward:   !!inp.forward,
              backward:  !!inp.backward,
              left:      !!inp.left,
              right:     !!inp.right,
              boost:     !!inp.boost,
              handbrake: !!inp.handbrake,
            },
          });
        }
        if (player.inputQueue.length > 60) {
          player.inputQueue = player.inputQueue.slice(-60);
        }
      }

      // ── Ready ───────────────────────────────────────────────────
      if (msg.type === "ready") {
        if (gameState !== "waiting") return;
        player.ready = true;
        ws.send(JSON.stringify({ type: "ready_ack" }));
        broadcastLobby();
        checkGameStart();
      }

      // ── Heartbeat ────────────────────────────────────────────────
      if (msg.type === "pong") {
        player.lastPong = Date.now();
      }
    } catch (_) {}
  });

  ws.on("close", () => removePlayer(id));
  ws.on("error", () => removePlayer(id));
});

function removePlayer(id) {
  if (!players.has(id)) return;
  players.delete(id);
  console.log(`[-] Player ${id} left. Total: ${players.size}`);
  broadcast({ type: "leave", id });

  if (gameState === "waiting" || gameState === "countdown") {
    checkGameStart(); // may cancel countdown if too few ready
  } else if (gameState === "playing") {
    checkRoundEnd();  // a disconnect might end the round
  }
}

// ── Broadcast helpers ─────────────────────────────────────────────
function broadcast(msg) {
  const raw = JSON.stringify(msg);
  for (const [, p] of players) {
    if (p.ws.readyState === 1) p.ws.send(raw);
  }
}

function broadcastLobby() {
  broadcast({
    type:      "lobby",
    gameState,
    players:   [...players.values()].map(p => ({ id: p.id, ready: p.ready })),
  });
}

function allPlayersReady(){
  const connected = [...players.values()];
  const allReady  = connected.length >= MIN_PLAYERS && connected.every(p => p.ready);

  return allReady;
}

// ── Lobby flow ────────────────────────────────────────────────────
function checkGameStart() {

  if (!allPlayersReady()) {
    if (gameState === "countdown") stopCountdown();
    return;
  }

  if (gameState === "countdown") return; // already started
  startCountdown(PRE_GAME_COUNTDOWN);
}

function startCountdown(seconds) {
  gameState = "countdown";
  console.log(`[Lobby] All ready — starting in ${seconds}s`);
  broadcast({ type: "countdown", seconds });

  countdownTimer = setTimeout(startGame, seconds * 1000);
}

function stopCountdown() {
  if (countdownTimer) { clearTimeout(countdownTimer); countdownTimer = null; }
  gameState = "waiting";
  console.log("[Lobby] Countdown cancelled — not enough ready players");
  broadcast({ type: "countdown_cancelled" });
  broadcastLobby();
}

// ── Game start ────────────────────────────────────────────────────
function startGame() {
  if (!allPlayersReady()) {
    if (gameState === "countdown") stopCountdown();
    return;
  }

  gameState      = "playing";
  countdownTimer = null;

  // Reset every player to their spawn — clean slate
  for (const [, p] of players) {
    p.status     = "in"
    p.ready      = false;
    p.wins       = 0;
    p.inputQueue = [];
    p.lastSeq    = 0;
    p.lastInput  = { forward: false, backward: false, left: false, right: false, boost: false, handbrake: false };

    const spawn   = SPAWNS[(p.id - 1) % SPAWNS.length];
    p.state.x        = spawn.x;
    p.state.y        = spawn.y;
    p.state.vx       = 0;
    p.state.vy       = 0;
    p.state.rotation = 0;
  }

  const spawns = [...players.values()].map(p => ({ id: p.id, x: p.state.x, y: p.state.y, vx: p.vx, vy: p.state.vy, rotation: p.state.rotation }));

  broadcast({ type: "game_start", spawns });
  broadcastLobby();
  console.log("[Game] Started");
  startRound(0);
}

// ── Round flow ────────────────────────────────────────────────────
function startRound(roundIndex) {
  const cfg    = ZONE_ROUNDS[roundIndex];
  const margin = cfg.radius + 100;

  zone.x        = randomBetween(margin, WORLD_WIDTH  - margin);
  zone.y        = randomBetween(margin, WORLD_HEIGHT - margin);
  zone.radius   = cfg.radius;
  zone.round    = roundIndex;
  zone.timeLeft = cfg.duration;
  zone.active   = true;

  broadcast({
    type:    "round_start",
    round:   roundIndex + 1,
    timeLeft: zone.timeLeft,
    zone:    { x: zone.x, y: zone.y, radius: zone.radius },
    players: [...players.values()].map(p => ({
      id:     p.id,
      wins:   p.wins
    })),
  });

  console.log(`[Round ${roundIndex + 1}] Started — radius ${cfg.radius}, ${cfg.duration}s`);

  if (zoneInterval) { clearInterval(zoneInterval); zoneInterval = null; }
  zoneInterval = setInterval(zoneTick, 1000);
}

function zoneTick() {
  zone.timeLeft--;

  if (zone.timeLeft <= 0) {
    clearInterval(zoneInterval);
    zoneInterval = null;
    eliminatePlayers();
  }
}

function eliminatePlayers() {
  const eleminated = [];

  for (const [, p] of players) {
    if (!isInsideSafeZone(p.state)) {
      eleminated.push(p.id);
      console.log(`[Round ${zone.round + 1}] Player ${p.id} eliminated`);
    }else {
      p.status      = "out";
      p.wins        = p.wins + 1;
      console.log(`[Round ${zone.round + 1}] Player ${p.id} won`);
    }
  }

  broadcast({
    type:      "round_end",
    round:     zone.round + 1,
    eleminated,
    players:  [...players.values()].map(p => ({
      id:     p.id,
      wins: p.wins
    }))
  });

  zone.active = false;
  checkRoundEnd();
}

function checkRoundEnd() {

  if (zone.round >= ZONE_ROUNDS.length-1) {
    // All rounds done — whoever's alive wins
    endGame();
    return;
  }

  console.log(`[Round ${zone.round + 1}] — next round in ${BETWEEN_ROUND_MS / 1000}s`);
  setTimeout(() => startRound(zone.round + 1), BETWEEN_ROUND_MS);
}

function endGame() {
  zone.active = false;
  if (zoneInterval) { clearInterval(zoneInterval); zoneInterval = null; }

  broadcast({
    type:     "game_over",
    players:  [...players.values()].map(p => ({
      id:     p.id,
      wins: p.wins
    })),
  });
  setTimeout(resetGame, GAME_RESET_MS);
}

function resetGame() {
  gameState = "waiting";
  zone.active = false;
  if (zoneInterval) { clearInterval(zoneInterval); zoneInterval = null; }

  for (const [, p] of players) {
    p.ready      = false;
    p.status     = "out";
    p.wins       = 0;
    p.inputQueue = [];
    p.lastSeq    = 0;
    p.lastInput  = { forward: false, backward: false, left: false, right: false, boost: false, handbrake: false };

    const spawn   = SPAWNS[(p.id - 1) % SPAWNS.length];
    p.state.x        = spawn.x;
    p.state.y        = spawn.y;
    p.state.vx       = 0;
    p.state.vy       = 0;
    p.state.rotation = 0;
  }

  broadcast({
    type:    "game_reset",
    players: [...players.values()].map(p => ({ id: p.id, ready: false })),
  });

  broadcastLobby();
  console.log("[Game] Reset to lobby");
}

// ── Physics game loop ─────────────────────────────────────────────
// Always runs — keeps input queue drained and reconciler in sync.
// Movement is gated inside simulateTick by gameState.
const SERVER_DT         = 1 / 30;
const SNAPSHOT_INTERVAL = 1000 / 20;

let lastTime            = process.hrtime.bigint();
let accumulator         = 0;
let snapshotAccumulator = 0;

function gameLoop() {
  const now       = process.hrtime.bigint();
  const elapsedMs = Number(now - lastTime) / 1_000_000;
  lastTime        = now;

  accumulator += elapsedMs / 1000;
  if (accumulator > 0.25) accumulator = 0.25;

  while (accumulator >= SERVER_DT) {
    simulateTick(SERVER_DT);
    accumulator -= SERVER_DT;
  }

  snapshotAccumulator += elapsedMs;
  if (snapshotAccumulator >= SNAPSHOT_INTERVAL) {
    serverTickCounter++;
    broadcastSnapshot(serverTickCounter);
    snapshotAccumulator -= snapshotAccumulator % SNAPSHOT_INTERVAL;
  }

  setTimeout(gameLoop, 8);
}

function simulateTick(dt) {
  for (const [, player] of players) {

    // ── Waiting / countdown — drain queue to keep seq synced, but no movement
    if (gameState !== "playing") {
      if (player.inputQueue.length > 0) {
        player.lastSeq    = player.inputQueue[player.inputQueue.length - 1].seq;
        player.inputQueue = [];
      }
      continue;
    }

    if (player.inputQueue.length > 1) {
      player.inputQueue.sort((a, b) => a.seq - b.seq);
    }

    const zones = getZones(player.state);

    // Black pit — instant teleport to spawn
    if (zones.inPit) {
      const spawn       = SPAWNS[(player.id - 1) % SPAWNS.length];
      player.state.x        = spawn.x;
      player.state.y        = spawn.y;
      player.state.vx       = 0;
      player.state.vy       = 0;
      player.state.rotation = 0;
      player.inputQueue     = [];
      continue;
    }
    let simulated  = 0;

    while (player.inputQueue.length > 0 && simulated < 2) {
      const frame = player.inputQueue.shift();
      if (frame.seq <= player.lastSeq) continue;
      player.lastSeq   = frame.seq;
      player.lastInput = frame.input;
      simulatePlayer(player.state, 1 / 60, player.lastInput, zones);
      simulated++;
    }

    // Fill missing substeps
    if (player.lastInput) {
      for (let i = simulated; i < 2; i++) {
        simulatePlayer(player.state, 1 / 60, player.lastInput, zones);
      }
    }

    player.state.x = Math.max(0, Math.min(WORLD_WIDTH,  player.state.x));
    player.state.y = Math.max(0, Math.min(WORLD_HEIGHT, player.state.y));
  }

  resolvePlayerCollisions();
}

// ── Player vs Player collision ────────────────────────────────────
const CAR_HALF_L  = 40;
const CAR_HALF_W  = 24;
const RESTITUTION = 0.6;

function resolvePlayerCollisions() {
  const list = [...players.values()]

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].state;
      const b = list[j].state;

      const dx        = b.x - a.x;
      const dy        = b.y - a.y;
      const quickDist = Math.sqrt(dx * dx + dy * dy);

      if (quickDist > (CAR_HALF_L + CAR_HALF_W) * 2 || quickDist === 0) continue;

      const cosA   = Math.cos(-a.rotation);
      const sinA   = Math.sin(-a.rotation);
      const localX = dx * cosA - dy * sinA;
      const localY = dx * sinA + dy * cosA;

      const ex          = localX / (CAR_HALF_W * 2);
      const ey          = localY / (CAR_HALF_L * 2);
      const ellipseDist = ex * ex + ey * ey;

      if (ellipseDist >= 1) continue;

      const nx          = dx / quickDist;
      const ny          = dy / quickDist;
      const penetration = (1 - Math.sqrt(ellipseDist)) * (CAR_HALF_L + CAR_HALF_W);

      a.x -= nx * penetration * 0.5;
      a.y -= ny * penetration * 0.5;
      b.x += nx * penetration * 0.5;
      b.y += ny * penetration * 0.5;

      const dvx    = b.vx - a.vx;
      const dvy    = b.vy - a.vy;
      const relVel = dvx * nx + dvy * ny;

      if (relVel > 0) continue;

      const impulse = -(1 + RESTITUTION) * relVel / 2;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }
}

// ── Snapshot broadcast ────────────────────────────────────────────
function broadcastSnapshot(tick) {
  const snapshot = {
    tick,
    serverTimestamp: Date.now(),
    players: [...players.values()].map(p => ({
      id:         p.id,
      seq:        p.lastSeq,
      x:          Math.round(p.state.x        * 100)   / 100,
      y:          Math.round(p.state.y        * 100)   / 100,
      rotation:   Math.round(p.state.rotation * 10000) / 10000,
      vx:         Math.round(p.state.vx       * 100)   / 100,
      vy:         Math.round(p.state.vy       * 100)   / 100
    })),
  };

  for (const [, p] of players) {
    if (p.ws.readyState === 1) {
      p.ws.send(JSON.stringify({ type: "snapshot", snapshot }));
    }
  }
}

// ── Heartbeat ─────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of players) {
    if (now - p.lastPong > 10000) {
      console.log(`[!] Player ${id} timed out`);
      p.ws.terminate();
    } else if (p.ws.readyState === 1) {
      p.ws.send(JSON.stringify({ type: "ping" }));
    }
  }
}, 5000);

gameLoop();
