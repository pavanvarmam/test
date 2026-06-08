export const input = {
  forward:   false,
  backward:  false,
  left:      false,
  right:     false,
  boost:     false,
  handbrake: false,
};

const KEYS = new Set(["KeyW","KeyS","KeyA","KeyD","ShiftLeft","Space"]);

function onKeyDown(e) {
  if (KEYS.has(e.code)) e.preventDefault();
  if (e.code === "KeyW")      input.forward   = true;
  if (e.code === "KeyS")      input.backward  = true;
  if (e.code === "KeyA")      input.left      = true;
  if (e.code === "KeyD")      input.right     = true;
  if (e.code === "ShiftLeft") input.boost     = true;
  if (e.code === "Space")     input.handbrake = true;
}

function onKeyUp(e) {
  if (e.code === "KeyW")      input.forward   = false;
  if (e.code === "KeyS")      input.backward  = false;
  if (e.code === "KeyA")      input.left      = false;
  if (e.code === "KeyD")      input.right     = false;
  if (e.code === "ShiftLeft") input.boost     = false;
  if (e.code === "Space")     input.handbrake = false;
}

export function setupKeyboard() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup",   onKeyUp);
}

export function cleanupKeyboard() {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup",   onKeyUp);
}

// TOUCH/UI CONTROL API

export function setForward(v) {
  input.forward = v;
}

export function setBackward(v) {
  input.backward = v;
}

export function setLeft(v) {
  input.left = v;
}

export function setRight(v) {
  input.right = v;
}

export function setBoost(v) {
  input.boost = v;
}

export function setHandbrake(v) {
  input.handbrake = v;
}