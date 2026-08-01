import React from "react";
import { Composition } from "remotion";
import { BallScene } from "./render/BallScene";
import { resolveScene } from "./scene/resolve";
import type { SceneProps } from "./scene/types";

const defaultScene = resolveScene({ name: "preview", preset: "classic" });

export const RemotionRoot: React.FC = () => (
  <Composition
    id="BallSim"
    component={BallScene}
    durationInFrames={defaultScene.durationSeconds * defaultScene.fps}
    fps={defaultScene.fps}
    width={defaultScene.width}
    height={defaultScene.height}
    defaultProps={{ scene: defaultScene, audioFile: null } as SceneProps}
    calculateMetadata={({ props }) => {
      const scene = resolveScene(props.scene);
      return {
        props: { ...props, scene },
        durationInFrames: Math.round(scene.durationSeconds * scene.fps),
        fps: scene.fps,
        width: scene.width,
        height: scene.height,
      };
    }}
  />
);
