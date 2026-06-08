// Player.jsx — remove useTick, just expose spriteRef up to World
import { useEffect, useRef, useState } from "react";
import { Assets } from "pixi.js";
import carImage from "../sprites/Audi.png";
import { CAR_WIDTH } from "../game/constants";

export default function Player({ playerRef }) {
  const [texture, setTexture] = useState(null);
  const spriteRef = useRef();

  useEffect(() => {
    Assets.load(carImage)
      .then(setTexture)
      .catch((e) => console.error("Failed to load car texture:", e));
  }, []);

  // Give World access to the sprite so it can update position
  useEffect(() => {
    playerRef.current.spriteRef = spriteRef;
  }, [playerRef]);

  if (!texture) return null;

  // return (
  //   <pixiSprite
  //     ref={spriteRef}
  //     texture={texture}
  //     anchor={0.5}
  //     // scale={0.5}
  //   />
  // );

  return (
    <pixiSprite
      ref={spriteRef}
      texture={texture}
      anchor={0.5}
      width={CAR_WIDTH}
      height={CAR_WIDTH}
    />
  )
}