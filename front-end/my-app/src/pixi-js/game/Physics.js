import { CAR_WIDTH } from "./constants";

const ACCELERATION      = 800;
const MAX_SPEED         = 500;
const REVERSE_MAX_SPEED = 500;
const TURN_SPEED        = 2.0;
const DRAG              = 0.985;
const LATERAL_GRIP      = 0.88;
const HANDBRAKE_GRIP    = 0.18;
const BOOST_MULTIPLIER  = 1.5;
const BRAKE_FORCE       = 0.90;
const MIN_STEER_SPEED   = 20;

export function simulatePlayer(player, dt, input) {
  const speed = Math.hypot(player.vx, player.vy);

  const forwardX = Math.cos(player.rotation - Math.PI / 2);
  const forwardY = Math.sin(player.rotation - Math.PI / 2);

  const dot = player.vx * forwardX + player.vy * forwardY;

  // Steering
  let steering = 0;
  if (input.left)  steering = -1;
  if (input.right) steering =  1;

  const speedFactor = Math.min(speed / MAX_SPEED, 1);
  const steerActive = speed > MIN_STEER_SPEED;

  if (steerActive) {
    const turnRate = TURN_SPEED * (1 - Math.pow(1 - speedFactor, 3)) * (1 - speedFactor * 0.25);
    const steerDir = dot < -10 ? -1 : 1;

    const angularVel = steering * steerDir * turnRate * dt;

    const axleOffset = CAR_WIDTH * 0.25;
    const pivotX = player.x - forwardX * axleOffset;
    const pivotY = player.y - forwardY * axleOffset;

    const cos = Math.cos(angularVel);
    const sin = Math.sin(angularVel);
    const dx = player.x - pivotX;
    const dy = player.y - pivotY;

    player.x = pivotX + dx * cos - dy * sin;
    player.y = pivotY + dx * sin + dy * cos;

    player.rotation += angularVel;
  }

  // Acceleration
  if (input.forward) {
    let accel = ACCELERATION;
    if (input.boost) accel *= BOOST_MULTIPLIER;

    player.vx += forwardX * accel * dt;
    player.vy += forwardY * accel * dt;
  }

  // Brake / Reverse
  if (input.backward) {
    if (dot > 20) {
      // Braking while moving forward
      player.vx *= BRAKE_FORCE;
      player.vy *= BRAKE_FORCE;
    } else {
      // Reverse acceleration
      player.vx -= forwardX * ACCELERATION * 0.75 * dt;
      player.vy -= forwardY * ACCELERATION * 0.75 * dt;

      const reverseSpeed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
      if (reverseSpeed > REVERSE_MAX_SPEED) {
        const scale = REVERSE_MAX_SPEED / reverseSpeed;
        player.vx *= scale;
        player.vy *= scale;
      }
    }
  }

  // Lateral grip
  const rightX =  Math.sin(player.rotation - Math.PI / 2);
  const rightY = -Math.cos(player.rotation - Math.PI / 2);

  const forwardSpeed = player.vx * forwardX + player.vy * forwardY;
  const lateralSpeed = player.vx * rightX   + player.vy * rightY;

  const grip = input.handbrake ? HANDBRAKE_GRIP : LATERAL_GRIP;

  // Handbrake
  if (input.handbrake && steerActive) {
    player.rotation += steering * TURN_SPEED * 1.4 * speedFactor * dt;
  }

  const newLateral = lateralSpeed * (1 - grip);
  player.vx = forwardX * forwardSpeed + rightX * newLateral;
  player.vy = forwardY * forwardSpeed + rightY * newLateral;

  // Speed clamp — respects reverse max
  const currentSpeed = Math.hypot(player.vx, player.vy);
  const isReversing = input.backward && dot < -10;
  const effectiveMax = input.boost
    ? MAX_SPEED * BOOST_MULTIPLIER
    : isReversing ? REVERSE_MAX_SPEED : MAX_SPEED;

  if (currentSpeed > effectiveMax) {
    const scale = effectiveMax / currentSpeed;
    player.vx *= scale;
    player.vy *= scale;
  }

  // Drag / friction
  if (input.handbrake) {
    player.vx *= 0.95;
    player.vy *= 0.95;
  } else if (!input.forward && !input.backward) {
    // Coasting — engine braking
    player.vx *= 0.978;
    player.vy *= 0.978;
  } else {
    // Accelerating or reversing — normal drag
    player.vx *= DRAG;
    player.vy *= DRAG;
  }

  // Position
  player.x += player.vx * dt;
  player.y += player.vy * dt;
}