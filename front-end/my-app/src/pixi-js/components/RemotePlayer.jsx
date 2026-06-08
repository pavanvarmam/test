import { useEffect, useRef, useState } from "react";
import { Assets } from "pixi.js";
import carImage from "../sprites/Audi.png";
import { CAR_WIDTH } from "../game/constants";

export default function RemotePlayer({ id, remoteSpriteRefs }) {
  const [texture, setTexture] = useState(null);
  const spriteRef = useRef();

  useEffect(() => {
    Assets.load(carImage).then(setTexture);
  }, []);

  // Register into tick-owned remoteSpriteRefs
  useEffect(() => {
    const map = remoteSpriteRefs.current;

    map.set(id, spriteRef);

    return () => map.delete(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!texture) return null;

  return (
    <pixiSprite
      ref={spriteRef}
      texture={texture}
      anchor={0.5}
      width={CAR_WIDTH}
      height={CAR_WIDTH}
      tint={0xff6666}
    />
  );
}
