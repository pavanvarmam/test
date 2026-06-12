import { useTick, useApplication, extend } from "@pixi/react";
import { useEffect, useRef, useState } from "react";
import { Graphics, Container } from "pixi.js";

import Player from "./Player";
import RemotePlayer from "./RemotePlayer";
import { drawGrid, WORLD_WIDTH, WORLD_HEIGHT } from "../game/Grid";
import { setupKeyboard, cleanupKeyboard, input } from "../game/Input";
import { simulatePlayer } from "../game/Physics";
import { network } from "../game/Network";
import { Reconciler } from "../game/Reconciler";

extend({ Graphics, Container });

const CAMERA_LERP          = 0.1;
const FIXED_DT             = 1 / 60;
const VISUAL_LERP          = 0.15;
const MAX_EXTRAPOLATION_MS = 200;
const SNAP_THRESHOLD       = 80;

const OIL_COLOR        = 0x1a1a2e;
const OIL_ALPHA        = 0.85;
const SAND_COLOR       = 0xc2a060;
const SAND_ALPHA       = 0.75;
const PIT_COLOR        = 0x000000;
const PIT_ALPHA        = 1.0;
const PIT_RIM_COLOR    = 0x222222;
const GRAVITYPIT_COLOR = 0x888888;
const GRAVITYPIT_ALPHA = 0.95;
const GRAVITYPIT_RIM   = 0xaaaaaa;
const ZONE_COLOR       = 0x00ff88;
const ZONE_BORDER_W    = 3;

export default function World({ 
  playerRef, 
  remoteSnapshotRef, 
  worldObjectsRef, 
  minimapRef
  // setGameScreen,
  // setPlayerList,
  // setMyReady
}) {
  const { app } = useApplication();

  const visualPosRef      = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, rotation: 0 });
  const zoneRef           = useRef(null);
  const remoteRenderRef   = useRef(new Map());
  const remoteSnapFlagRef = useRef(new Set());
  const remoteSpriteRefs  = useRef(new Map());
  const myIdRef           = useRef(null);
  const isSpectatingRef   = useRef(false);

  const [remoteIds, setRemoteIds]         = useState([]);

  const containerRef   = useRef(null);
  const gridGfxRef     = useRef(null);
  const objectsGfxRef  = useRef(null);
  const zoneGfxRef     = useRef(null);
  const cameraRef      = useRef({ x: 0, y: 0 });
  const reconciler     = useRef(new Reconciler());
  const accumulatorRef = useRef(0);
  const lastTimeRef    = useRef(0);
  const objectsDrawn   = useRef(false);

  useEffect(() => {
    setupKeyboard();
    network.connect();

    const onInit = ({id, state, worldObjects}) => {
      myIdRef.current = id;
      const p = playerRef.current;
      p.x = state.x; p.y = state.y;
      p.rotation = 0; p.vx = 0; p.vy = 0;
      const v = visualPosRef.current;
      v.x = state.x; v.y = state.y; v.rotation = 0;
      worldObjectsRef.current = worldObjects || [];
      objectsDrawn.current    = false;
    }

    const onGameStart = (spawns) => {

      const now = performance.now();

      for (const sp of spawns) {

        // LOCAL PLAYER
        if (sp.id === myIdRef.current) {

          if (!isSpectatingRef.current) {

            // Hard reset authoritative spawn
            playerRef.current.x = sp.x;
            playerRef.current.y = sp.y;

            playerRef.current.vx = sp.vx ?? 0;
            playerRef.current.vy = sp.vy ?? 0;

            playerRef.current.rotation = sp.rotation;

            // Optional:
            reconciler.current.reset();
          }

          continue;
        }

        // REMOTE PLAYER
        const isNew =
          !remoteSnapshotRef.current.has(sp.id);

        remoteSnapshotRef.current.set(sp.id, {
          t: now,

          x: sp.x,
          y: sp.y,

          rotation: sp.rotation,

          vx: sp.vx ?? 0,
          vy: sp.vy ?? 0,

          status: sp.status,
        });

        if (isNew) {
          setRemoteIds(ids => [...ids, sp.id]);
        }
      }
    };

    const onSnapShot = (snapshot) => {
      const now = performance.now();

      for (const sp of snapshot.players) {
        if (sp.id === myIdRef.current) {
          if (!isSpectatingRef.current) {
            reconciler.current.reconcile(playerRef.current, sp);
          }
        } else {
          const isNew = !remoteSnapshotRef.current.has(sp.id);
          if (!isNew) {
            const prev = remoteSnapshotRef.current.get(sp.id);
            const age  = (now - prev.t) / 1000;
            const extX = prev.x + prev.vx * age;
            const extY = prev.y + prev.vy * age;
            if (Math.abs(extX - sp.x) > SNAP_THRESHOLD || Math.abs(extY - sp.y) > SNAP_THRESHOLD) {
              remoteSnapFlagRef.current.add(sp.id);
            }
          }
          remoteSnapshotRef.current.set(sp.id, {
            t: now, x: sp.x, y: sp.y, rotation: sp.rotation,
            vx: sp.vx ?? 0, vy: sp.vy ?? 0, status: sp.status,
          });
          if (isNew) setRemoteIds(ids => [...ids, sp.id]);
        }
      }
    }

    const onLeave = (id) => {
      remoteSnapshotRef.current.delete(id);
      setRemoteIds(ids => ids.filter(i => i !== id));
    }
  
    const onFull = () => console.warn("[World] Server full")

    // ── Game flow ──────────────────────────────────────────────

    const onRoundStart = (data) => {
      zoneRef.current = data.zone;
    };

    const onGameOver = () => {
      zoneRef.current = null;
    };

    const onGameReset = () => {
      zoneRef.current = null;
    };

    const onConnectionLost = () => {
      reconciler.current.reset();
    }

    network.on("init",onInit);

    network.on("game_start",onGameStart);

    network.on("round_start", onRoundStart);

    network.on("snapshot", onSnapShot);

    network.on("game_over", onGameOver);

    network.on("game_reset", onGameReset);

    network.on("leave", onLeave);

    network.on("full", onFull);

    network.on("connection_lost", onConnectionLost);

    return () => {
      cleanupKeyboard();
      network.off("init",onInit);
      network.off("game_start",onGameStart);
      network.off("round_start", onRoundStart);
      network.off("snapshot", onSnapShot);
      network.off("game_over", onGameOver);
      network.off("game_reset", onGameReset);
      network.off("leave", onLeave);
      network.off("full", onFull);
      network.off("connection_lost", onConnectionLost);
      network.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTick((ticker) => {
    const now          = performance.now();
    const deltaSeconds = ticker.deltaMS / 1000;

    if (lastTimeRef.current === 0) { lastTimeRef.current = now; return; }
    lastTimeRef.current = now;

    const player = playerRef.current;
    const visual = visualPosRef.current;
    const camera = cameraRef.current;
    const screen = app.screen;

    // ── 1. Physics (skip if spectating) ──────────────────────────
    if (!isSpectatingRef.current) {
      accumulatorRef.current += Math.min(deltaSeconds, 0.25);
      while (accumulatorRef.current >= FIXED_DT) {
        simulatePlayer(player, FIXED_DT, input);
        if (network.connect) {
          const seq = reconciler.current.getSeq();
          network.queueInput(seq, { ...input });
          reconciler.current.recordInput(seq, { ...input });
        }
        player.x = Math.max(0, Math.min(WORLD_WIDTH,  player.x));
        player.y = Math.max(0, Math.min(WORLD_HEIGHT, player.y));
        accumulatorRef.current -= FIXED_DT;
      }
    }

    // ── 2. Visual proxy ───────────────────────────────────────────
    visual.x += (player.x - visual.x) * VISUAL_LERP;
    visual.y += (player.y - visual.y) * VISUAL_LERP;
    let diffRot = player.rotation - visual.rotation;
    if (diffRot >  Math.PI) diffRot -= Math.PI * 2;
    if (diffRot < -Math.PI) diffRot += Math.PI * 2;
    visual.rotation += diffRot * VISUAL_LERP;

    if (player.spriteRef?.current) {
      player.spriteRef.current.x        = visual.x;
      player.spriteRef.current.y        = visual.y;
      player.spriteRef.current.rotation = visual.rotation;
    }

    // ── 3. Draw world objects once ────────────────────────────────
    if (!objectsDrawn.current && objectsGfxRef.current && worldObjectsRef.current.length > 0) {
      drawWorldObjects(objectsGfxRef.current, worldObjectsRef.current);
      objectsDrawn.current = true;
    }

    // ── 4. Safe zone ──────────────────────────────────────────────
    if (zoneGfxRef.current) {
      if (zoneRef.current) drawSafeZone(zoneGfxRef.current, zoneRef.current, now);
      else zoneGfxRef.current.clear();
    }

    // ── 5. Remote player extrapolation ────────────────────────────
    const lerpSpeed = Math.min(1, deltaSeconds * 20);

    for (const [id, snap] of remoteSnapshotRef.current) {
      const age = (now - snap.t) / 1000;

      if (!remoteRenderRef.current.has(id)) {
        remoteRenderRef.current.set(id, { x: snap.x, y: snap.y, rotation: snap.rotation });
      }

      const render = remoteRenderRef.current.get(id);

      if (remoteSnapFlagRef.current.has(id)) {
        render.x = snap.x; render.y = snap.y; render.rotation = snap.rotation;
        remoteSnapFlagRef.current.delete(id);
      }

      if (age * 1000 < MAX_EXTRAPOLATION_MS) {
        const extX = snap.x + snap.vx * age;
        const extY = snap.y + snap.vy * age;
        render.x += (extX - render.x) * lerpSpeed;
        render.y += (extY - render.y) * lerpSpeed;
        let da = snap.rotation - render.rotation;
        if (da >  Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        render.rotation += da * lerpSpeed;
      }

      const spriteRef = remoteSpriteRefs.current.get(id);
      if (spriteRef?.current) {
        spriteRef.current.x        = render.x;
        spriteRef.current.y        = render.y;
        spriteRef.current.rotation = render.rotation;
      }
    }

    // ── 6. Camera ─────────────────────────────────────────────────
    // Spectators follow the first alive remote player
    let camTargetX = visual.x;
    let camTargetY = visual.y;

    if (isSpectatingRef.current) {
      for (const [, snap] of remoteSnapshotRef.current) {
        if (snap.status === "alive") {
          camTargetX = snap.x;
          camTargetY = snap.y;
          break;
        }
      }
    }

    const targetX  = screen.width  / 2 - camTargetX;
    const targetY  = screen.height / 2 - camTargetY;
    const clampedX = Math.min(0, Math.max(screen.width  - WORLD_WIDTH,  targetX));
    const clampedY = Math.min(0, Math.max(screen.height - WORLD_HEIGHT, targetY));

    camera.x += (clampedX - camera.x) * CAMERA_LERP;
    camera.y += (clampedY - camera.y) * CAMERA_LERP;

    if (containerRef.current) {
      containerRef.current.x = camera.x;
      containerRef.current.y = camera.y;
    }

    // ── 7. Grid ───────────────────────────────────────────────────
    if (gridGfxRef.current) drawGrid(gridGfxRef.current, camera, screen);

    // ── 8. Minimap ────────────────────────────────────────────────
    minimapRef?.current?.draw(
      player,
      remoteSnapshotRef.current,
      worldObjectsRef.current,
      screen.width,
      screen.height,
      zoneRef.current,
    );
  });

  return (
    <>
      <pixiContainer ref={containerRef}>
        <pixiGraphics ref={gridGfxRef} />
        <pixiGraphics ref={objectsGfxRef} />
        <pixiGraphics ref={zoneGfxRef} />
        {/* {!isSpectating && <Player playerRef={playerRef} />} */}
        {<Player playerRef={playerRef} />}
        {remoteIds.map((id) => (
          <RemotePlayer key={id} id={id} remoteSpriteRefs={remoteSpriteRefs} />
        ))}
      </pixiContainer>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────

// ── Pixi draw functions ───────────────────────────────────────────
function drawSafeZone(g, zone, now) {
  g.clear();
  const pulse = 0.15 + Math.sin(now / 400) * 0.07;
  g.circle(zone.x, zone.y, zone.radius);
  g.fill({ color: ZONE_COLOR, alpha: pulse });
  g.setStrokeStyle({ width: ZONE_BORDER_W, color: ZONE_COLOR, alpha: 0.9 });
  g.circle(zone.x, zone.y, zone.radius);
  g.stroke();
}

function drawWorldObjects(g, objects) {
  g.clear();
  const order = ["sand", "oil", "gravitypit", "pit"];
  for (const type of order) {
    for (const obj of objects) {
      if (obj.type !== type) continue;
      if (obj.type === "sand") {
        const half = obj.size / 2;
        g.rect(obj.x - half, obj.y - half, obj.size, obj.size);
        g.fill({ color: SAND_COLOR, alpha: SAND_ALPHA });
      } else if (obj.type === "oil") {
        g.circle(obj.x, obj.y, obj.radius);
        g.fill({ color: OIL_COLOR, alpha: OIL_ALPHA });
      } else if (obj.type === "gravitypit") {
        g.circle(obj.x, obj.y, obj.radius + 8);
        g.fill({ color: GRAVITYPIT_RIM, alpha: 1 });
        g.circle(obj.x, obj.y, obj.radius);
        g.fill({ color: GRAVITYPIT_COLOR, alpha: GRAVITYPIT_ALPHA });
      } else if (obj.type === "pit") {
        g.circle(obj.x, obj.y, obj.radius + 8);
        g.fill({ color: PIT_RIM_COLOR, alpha: 1 });
        g.circle(obj.x, obj.y, obj.radius);
        g.fill({ color: PIT_COLOR, alpha: PIT_ALPHA });
      }
    }
  }
}
