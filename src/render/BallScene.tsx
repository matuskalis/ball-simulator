import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import type { SceneProps } from "../scene/types";
import { simulateCached } from "../sim/simulate";

const TWO_PI = Math.PI * 2;
const BURST_FRAMES = 26;
const BURST_FRAGMENTS = 18;

const polar = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const from = polar(cx, cy, r, start);
  const to = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

export const BallScene: React.FC<SceneProps> = ({ scene, audioFile }) => {
  const frame = useCurrentFrame();
  const { frames, bursts } = simulateCached(scene);
  const state = frames[Math.min(frame, frames.length - 1)];
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  const { arena, style, effects } = scene;
  const color = (index: number) => style.palette[index % style.palette.length];
  const showTrails = effects.trailLength > 0 && state.balls.length <= 8;

  return (
    <AbsoluteFill style={{ backgroundColor: style.background }}>
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
      <svg width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
        {arena.kind === "box" ? (
          <rect
            x={cx - arena.boxWidth / 2}
            y={cy - arena.boxHeight / 2}
            width={arena.boxWidth}
            height={arena.boxHeight}
            fill="none"
            stroke={style.wallColor}
            strokeWidth={6}
          />
        ) : state.segments.length > 0 ? (
          state.segments.map((alive, index) =>
            alive ? (
              <path
                key={`seg-${index}`}
                d={arcPath(
                  cx,
                  cy,
                  arena.radius,
                  (index / state.segments.length) * TWO_PI + 0.006,
                  ((index + 1) / state.segments.length) * TWO_PI - 0.006,
                )}
                fill="none"
                stroke={style.wallColor}
                strokeWidth={8}
                strokeLinecap="round"
              />
            ) : null,
          )
        ) : (
          <circle cx={cx} cy={cy} r={arena.radius} fill="none" stroke={style.wallColor} strokeWidth={6} />
        )}

        {state.rings.map((ring, index) =>
          ring.alive ? (
            <path
              key={`ring-${index}`}
              d={arcPath(cx, cy, ring.radius, ring.angle + ring.gap / 2, ring.angle + TWO_PI - ring.gap / 2)}
              fill="none"
              stroke={color(index)}
              strokeWidth={7}
              strokeLinecap="round"
              opacity={0.9}
            />
          ) : null,
        )}

        {bursts.map((burst, burstIndex) => {
          const age = frame - burst.frame;
          if (age < 0 || age >= BURST_FRAMES) return null;
          const progress = age / BURST_FRAMES;
          const radius = burst.radius + progress * 110;
          return (
            <g key={`burst-${burstIndex}`} opacity={1 - progress}>
              {Array.from({ length: BURST_FRAGMENTS }, (_, i) => {
                const start = (i / BURST_FRAGMENTS) * TWO_PI + progress * 0.3;
                return (
                  <path
                    key={i}
                    d={arcPath(cx, cy, radius, start, start + (TWO_PI / BURST_FRAGMENTS) * 0.55)}
                    fill="none"
                    stroke={color(burst.colorIndex)}
                    strokeWidth={7 * (1 - progress * 0.6)}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          );
        })}

        {showTrails
          ? state.balls.map((ball, ballIndex) => {
              const points: string[] = [];
              const start = Math.max(0, frame - effects.trailLength);
              for (let f = start; f <= frame; f += 2) {
                const past = frames[f]?.balls[ballIndex];
                if (past) points.push(`${past.x},${past.y}`);
              }
              return points.length > 1 ? (
                <polyline
                  key={`trail-${ballIndex}`}
                  points={points.join(" ")}
                  fill="none"
                  stroke={color(ball.c)}
                  strokeWidth={ball.r * 0.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.28}
                />
              ) : null;
            })
          : null}

        {state.balls.map((ball, index) => (
          <g key={`ball-${index}`}>
            {style.glow ? <circle cx={ball.x} cy={ball.y} r={ball.r * 1.9} fill={color(ball.c)} opacity={0.16} /> : null}
            <circle cx={ball.x} cy={ball.y} r={ball.r} fill={color(ball.c)} />
          </g>
        ))}
      </svg>

      {style.title ? (
        <div
          style={{
            position: "absolute",
            top: 120,
            width: "100%",
            textAlign: "center",
            color: "#ffffff",
            fontSize: 68,
            fontWeight: 800,
            fontFamily: "Helvetica, Arial, sans-serif",
            letterSpacing: -1,
          }}
        >
          {style.title}
        </div>
      ) : null}

      {style.showCounter ? (
        <div
          style={{
            position: "absolute",
            bottom: 160,
            width: "100%",
            textAlign: "center",
            color: "#ffffff",
            fontSize: 96,
            fontWeight: 900,
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          {state.balls.length > 1 ? state.balls.length : state.bounces}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
