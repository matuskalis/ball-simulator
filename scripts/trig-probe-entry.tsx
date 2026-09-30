import React from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";
import { measure } from "./trig-probe-shared";

const Probe: React.FC = () => {
  React.useEffect(() => {
    console.log(`TRIG ${JSON.stringify({ ...measure(), userAgent: navigator.userAgent })}`);
  }, []);
  return <AbsoluteFill />;
};

registerRoot(() => <Composition id="Probe" component={Probe} durationInFrames={1} fps={60} width={64} height={64} />);
