import React from "react";
import { AbsoluteFill, Composition, continueRender, delayRender, registerRoot } from "remotion";
import type { Scene } from "../src/scene/types";
import { simulate } from "../src/sim/simulate";

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** Runs the simulation in the browser and logs the same digest `test/helpers/golden.ts` computes in Node. */
const Parity: React.FC<{ scene: Scene; label: string }> = ({ scene, label }) => {
  React.useEffect(() => {
    const handle = delayRender("hashing the simulation");
    const { frames, bounceSeconds, bursts } = simulate(scene);
    const text = JSON.stringify({ frames, bounceSeconds, bursts });
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then((digest) => {
      console.log(`PARITY ${label} ${toHex(digest).slice(0, 16)} ${navigator.userAgent}`);
      continueRender(handle);
    });
  }, [scene, label]);
  return <AbsoluteFill />;
};

registerRoot(() => (
  <Composition id="Parity" component={Parity} durationInFrames={1} fps={60} width={64} height={64} defaultProps={{ scene: {} as Scene, label: "" }} />
));
