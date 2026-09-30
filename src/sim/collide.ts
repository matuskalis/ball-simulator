export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  frozen: boolean;
}

/**
 * Mirrors the velocity about a wall with inward unit normal (nx, ny), then scales it by `restitution`.
 * Restitution scales the whole velocity, so a wall below 1 also slows the sliding component.
 * Returns the velocity along the normal before the hit: negative when the ball was moving into the wall.
 */
export function reflect(ball: Pick<Body, "vx" | "vy">, nx: number, ny: number, restitution: number): number {
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx = (ball.vx - 2 * dot * nx) * restitution;
  ball.vy = (ball.vy - 2 * dot * ny) * restitution;
  return dot;
}

/**
 * Pushes two overlapping balls apart and exchanges momentum along the line between their centres.
 * Equal masses; a frozen ball behaves as an immovable wall. Returns false when they do not overlap.
 */
export function collidePair(a: Body, b: Body, restitution: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.r + b.r;
  if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) return false;
  const dist = Math.hypot(dx, dy) || 1e-6;
  if (dist >= minDist) return false;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  if (a.frozen) {
    b.x += nx * overlap;
    b.y += ny * overlap;
  } else if (b.frozen) {
    a.x -= nx * overlap;
    a.y -= ny * overlap;
  } else {
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
  }

  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relative > 0) return true;
  if (a.frozen) {
    const impulse = -(1 + restitution) * relative;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  } else if (b.frozen) {
    const impulse = -(1 + restitution) * relative;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
  } else {
    const impulse = (-(1 + restitution) * relative) / 2;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }
  return true;
}
