import { CAR_WIDTH } from "./constants.js";

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

// Zone effect constants
const OIL_GRIP_MULT         = 0.02;  // near zero grip on oil
const SAND_ACCEL_MULT       = 0.3;   // 30% acceleration on sand
const SAND_SPEED_MULT       = 0.4;   // 40% max speed on sand
const GRAVITY_BOOST_MULT    = 2.2;   // 220% speed on grey pit
const GRAVITY_ACCEL_MULT    = 2.0;   // 200% acceleration on grey pit
const GRAVITY_GRIP_MULT     = 0.01;  // near zero grip on grey pit (out of control)

export function simulatePlayer(player, dt, input, zones = {}) {

  // ── Zone modifiers ──────────────────────────────────────────────
  let accelMult = 1.0;
  let speedMult = 1.0;
  let gripMult  = 1.0;

  if (zones.inSand) {
    accelMult = SAND_ACCEL_MULT;
    speedMult = SAND_SPEED_MULT;
  }

  if (zones.inOil) {
    gripMult = OIL_GRIP_MULT;
  }

  if (zones.inGravityPit) {
    // Speed boost + total loss of control
    accelMult = GRAVITY_ACCEL_MULT;
    speedMult = GRAVITY_BOOST_MULT;
    gripMult  = GRAVITY_GRIP_MULT;
  }

  // ── Physics ─────────────────────────────────────────────────────
  const speed    = Math.hypot(player.vx, player.vy);
  const forwardX = Math.cos(player.rotation - Math.PI / 2);
  const forwardY = Math.sin(player.rotation - Math.PI / 2);
  const dot      = player.vx * forwardX + player.vy * forwardY;

  let steering = 0;
  if (input.left)  steering = -1;
  if (input.right) steering =  1;

  const effectiveMaxSpeed = MAX_SPEED * speedMult;
  const speedFactor       = Math.min(speed / Math.max(effectiveMaxSpeed, 1), 1);
  const steerActive       = speed > MIN_STEER_SPEED;

  if (steerActive) {
    const turnRate   = TURN_SPEED * (1 - Math.pow(1 - speedFactor, 3)) * (1 - speedFactor * 0.25);
    const steerDir   = dot < -10 ? -1 : 1;
    const angularVel = steering * steerDir * turnRate * dt;

    const axleOffset = CAR_WIDTH * 0.25;
    const pivotX = player.x - forwardX * axleOffset;
    const pivotY = player.y - forwardY * axleOffset;

    const cos = Math.cos(angularVel);
    const sin = Math.sin(angularVel);
    const dx  = player.x - pivotX;
    const dy  = player.y - pivotY;

    player.x = pivotX + dx * cos - dy * sin;
    player.y = pivotY + dx * sin + dy * cos;
    player.rotation += angularVel;
  }

  if (input.forward) {
    let accel = ACCELERATION * accelMult;
    if (input.boost) accel *= BOOST_MULTIPLIER;
    player.vx += forwardX * accel * dt;
    player.vy += forwardY * accel * dt;
  }

  if (input.backward) {
    if (dot > 20) {
      player.vx *= BRAKE_FORCE;
      player.vy *= BRAKE_FORCE;
    } else {
      player.vx -= forwardX * ACCELERATION * accelMult * 0.75 * dt;
      player.vy -= forwardY * ACCELERATION * accelMult * 0.75 * dt;

      const reverseSpeed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
      const revMax       = REVERSE_MAX_SPEED * speedMult;
      if (reverseSpeed > revMax) {
        const scale = revMax / reverseSpeed;
        player.vx *= scale;
        player.vy *= scale;
      }
    }
  }

  const rightX =  Math.sin(player.rotation - Math.PI / 2);
  const rightY = -Math.cos(player.rotation - Math.PI / 2);

  const forwardSpeed = player.vx * forwardX + player.vy * forwardY;
  const lateralSpeed = player.vx * rightX   + player.vy * rightY;

  // Grip — oil and gravitypit both override handbrake
  const baseGrip = input.handbrake ? HANDBRAKE_GRIP : LATERAL_GRIP;
  const grip     = (zones.inOil || zones.inGravityPit)
    ? baseGrip * gripMult
    : baseGrip;

  if (input.handbrake && steerActive) {
    player.rotation += steering * TURN_SPEED * 1.4 * speedFactor * dt;
  }

  const newLateral = lateralSpeed * (1 - grip);
  player.vx = forwardX * forwardSpeed + rightX * newLateral;
  player.vy = forwardY * forwardSpeed + rightY * newLateral;

  // Speed clamp
  const currentSpeed = Math.hypot(player.vx, player.vy);
  const isReversing  = input.backward && dot < -10;
  const effectiveMax = input.boost
    ? effectiveMaxSpeed * BOOST_MULTIPLIER
    : isReversing ? REVERSE_MAX_SPEED * speedMult : effectiveMaxSpeed;

  if (currentSpeed > effectiveMax) {
    const scale = effectiveMax / currentSpeed;
    player.vx *= scale;
    player.vy *= scale;
  }

  // Drag
  if (input.handbrake) {
    player.vx *= 0.95;
    player.vy *= 0.95;
  } else if (!input.forward && !input.backward) {
    player.vx *= 0.978;
    player.vy *= 0.978;
  } else {
    player.vx *= DRAG;
    player.vy *= DRAG;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
}
