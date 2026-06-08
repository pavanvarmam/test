import { Application, extend } from "@pixi/react";
import { useRef } from "react";
import { Container, Graphics, Sprite } from "pixi.js";
import GameUI from "./GameUI";

import World from "./World";
import Minimap from "./Minimap";

extend({ Container, Graphics, Sprite });

export default function PixiApp() {
  const playerRef                         = useRef({ x: 1000, y: 1000, rotation: 0, vx: 0, vy: 0, spriteRef: { current: null } });
  const remoteSnapshotRef                 = useRef(new Map());
  const worldObjectsRef                   = useRef([]);
  const minimapRef                        = useRef(null);

  return (
    <>
      <Application
        width={window.innerWidth}
        height={window.innerHeight}
        backgroundColor={0x000000}
        resizeTo={window}
      >
        <World
          playerRef={playerRef}
          remoteSnapshotRef={remoteSnapshotRef}
          worldObjectsRef={worldObjectsRef}
          minimapRef={minimapRef}
        />
      </Application>

      {/* Minimap lives outside Pixi — receives minimapRef as a plain prop */}
      <Minimap minimapRef={minimapRef} />

      <GameUI/>
    </>
  );
}