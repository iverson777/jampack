// Jampack - yugop tribute
// 2D physics with circles, dual cross rotation indicators, drag & drop, shrink-remove

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let W, H;
let dpr = window.devicePixelRatio || 1;
let MAX_CIRCLES = 18;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateMaxCircles();
}

function updateMaxCircles() {
  const screenArea = W * H;
  const avgScale = Math.min(W, H) / 600;
  const avgR = 50 * avgScale;
  const avgCircleArea = Math.PI * avgR * avgR;
  MAX_CIRCLES = Math.max(8, Math.round((screenArea * 0.6) / avgCircleArea));
}

resize();
window.addEventListener('resize', resize);

// --- Physics constants ---
const GRAVITY = 900;
const BOUNCE = 0.45;
const FRICTION = 0.35;
const ANGULAR_DAMPING = 0.93;
const DROP_INTERVAL = 600;
const SUBSTEPS = 8;

// --- Circle class ---
class Circle {
  constructor(x, y, r) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.vx = (Math.random() - 0.5) * 30;
    this.vy = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.angularVel = 0;
    this.mass = r * r;
    this.removing = false;
    this.dragging = false;
    this.scale = 0.01;
    this.opacity = 1;
  }

  update(dt) {
    if (this.removing) {
      this.scale += (0 - this.scale) * 5 * dt;
      this.opacity += (0 - this.opacity) * 5 * dt;
      return this.scale < 0.02;
    }

    // grow in
    this.scale += (1 - this.scale) * 8 * dt;

    // skip physics when dragging
    if (this.dragging) return false;

    // gravity
    this.vy += GRAVITY * dt;

    // velocity
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // rotation from movement
    this.angle += this.angularVel * dt;
    this.angularVel *= Math.pow(ANGULAR_DAMPING, dt * 60);

    // floor
    const effectiveR = this.r * this.scale;
    if (this.y + effectiveR > H) {
      this.y = H - effectiveR;
      this.vy *= -BOUNCE;
      this.angularVel += this.vx * 0.003 * FRICTION;
      this.vx *= (1 - FRICTION * 0.25);
      if (Math.abs(this.vy) < 3) this.vy = 0;
    }

    // walls
    if (this.x - effectiveR < 0) {
      this.x = effectiveR;
      this.vx *= -BOUNCE;
      this.angularVel -= this.vy * 0.002;
    }
    if (this.x + effectiveR > W) {
      this.x = W - effectiveR;
      this.vx *= -BOUNCE;
      this.angularVel += this.vy * 0.002;
    }

    return false;
  }

  draw(ctx) {
    const s = this.scale;
    const r = this.r * s;
    if (r < 0.5) return;

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y);

    // circle body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // two tiny crosses, symmetrically placed
    ctx.rotate(this.angle);
    const crossSize = r * 0.06;
    const offset = r * 0.35;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(0.5, r * 0.018);
    ctx.lineCap = 'round';

    // cross 1 (upper-left)
    ctx.beginPath();
    ctx.moveTo(-offset - crossSize, -offset - crossSize);
    ctx.lineTo(-offset + crossSize, -offset + crossSize);
    ctx.moveTo(-offset + crossSize, -offset - crossSize);
    ctx.lineTo(-offset - crossSize, -offset + crossSize);
    ctx.stroke();

    // cross 2 (lower-right)
    ctx.beginPath();
    ctx.moveTo(offset - crossSize, offset - crossSize);
    ctx.lineTo(offset + crossSize, offset + crossSize);
    ctx.moveTo(offset + crossSize, offset - crossSize);
    ctx.lineTo(offset - crossSize, offset + crossSize);
    ctx.stroke();

    ctx.restore();
  }

  containsPoint(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy <= (this.r * this.scale) * (this.r * this.scale);
  }
}

// --- Circle-circle collision ---
function resolveCollision(a, b) {
  if (a.dragging || b.dragging) {
    // dragged circle pushes others but isn't pushed back
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rA = a.r * a.scale;
    const rB = b.r * b.scale;
    const minDist = rA + rB;

    if (dist < minDist && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;

      if (a.dragging) {
        b.x += nx * overlap;
        b.y += ny * overlap;
        // give velocity based on drag movement
        b.vx += nx * overlap * 8;
        b.vy += ny * overlap * 8;
        b.angularVel += (nx * b.vy - ny * b.vx) * 0.003;
      } else {
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        a.vx -= nx * overlap * 8;
        a.vy -= ny * overlap * 8;
        a.angularVel -= (nx * a.vy - ny * a.vx) * 0.01;
      }
    }
    return;
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const rA = a.r * a.scale;
  const rB = b.r * b.scale;
  const minDist = rA + rB;

  if (dist < minDist && dist > 0.001) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    const totalMass = a.mass + b.mass;
    const ratioA = b.mass / totalMass;
    const ratioB = a.mass / totalMass;
    a.x -= nx * overlap * ratioA * 0.5;
    a.y -= ny * overlap * ratioA * 0.5;
    b.x += nx * overlap * ratioB * 0.5;
    b.y += ny * overlap * ratioB * 0.5;

    const dvx = a.vx - b.vx;
    const dvy = a.vy - b.vy;
    const dvn = dvx * nx + dvy * ny;

    if (dvn > 0) {
      const impulse = (1 + BOUNCE) * dvn / totalMass;

      a.vx -= impulse * b.mass * nx;
      a.vy -= impulse * b.mass * ny;
      b.vx += impulse * a.mass * nx;
      b.vy += impulse * a.mass * ny;

      const tx = -ny;
      const ty = nx;
      const dvt = dvx * tx + dvy * ty;
      a.angularVel += dvt * 0.002;
      b.angularVel -= dvt * 0.004;
    }
  }
}

// --- State ---
let circles = [];
let dropCount = 0;

function randomRadius() {
  const sizes = [18, 24, 30, 38, 48, 58, 68, 80, 95];
  const weights = [2, 3, 4, 5, 4, 3, 3, 2, 1];
  let total = 0;
  for (const w of weights) total += w;
  let roll = Math.random() * total;
  let idx = 0;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { idx = i; break; }
  }
  const base = sizes[idx];
  const scale = Math.min(W, H) / 600;
  return base * scale;
}

function dropCircle() {
  const r = randomRadius();
  const x = Math.random() * (W - r * 2) + r;
  const c = new Circle(x, -r * 2, r);
  circles.push(c);
  dropCount++;
}

function removeOldest() {
  for (let i = 0; i < circles.length; i++) {
    if (!circles[i].removing) {
      circles[i].removing = true;
      return;
    }
  }
}

// --- Drag and drop ---
let dragTarget = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragPrevX = 0;
let dragPrevY = 0;
let dragVelX = 0;
let dragVelY = 0;
let didDrag = false;

function findCircleAt(px, py) {
  // search from top (last drawn = visually on top)
  for (let i = circles.length - 1; i >= 0; i--) {
    if (!circles[i].removing && circles[i].containsPoint(px, py)) {
      return circles[i];
    }
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  const px = e.clientX;
  const py = e.clientY;
  const hit = findCircleAt(px, py);

  if (hit) {
    dragTarget = hit;
    dragTarget.dragging = true;
    dragOffsetX = hit.x - px;
    dragOffsetY = hit.y - py;
    dragPrevX = px;
    dragPrevY = py;
    dragVelX = 0;
    dragVelY = 0;
    didDrag = false;
    canvas.setPointerCapture(e.pointerId);
  } else {
    // tap empty space -> drop new circle
    const r = randomRadius();
    const c = new Circle(px, -r, r);
    circles.push(c);
    dropCount++;

    const active = circles.filter(c => !c.removing).length;
    if (active > MAX_CIRCLES) {
      removeOldest();
    }
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragTarget) return;
  const px = e.clientX;
  const py = e.clientY;

  dragVelX = (px - dragPrevX) * 3;
  dragVelY = (py - dragPrevY) * 3;
  dragPrevX = px;
  dragPrevY = py;

  dragTarget.x = px + dragOffsetX;
  dragTarget.y = py + dragOffsetY;

  // rotation from drag movement
  dragTarget.angularVel = dragVelX * 0.008;

  if (Math.abs(px - (dragTarget.x - dragOffsetX)) > 3 || Math.abs(py - (dragTarget.y - dragOffsetY)) > 3) {
    didDrag = true;
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!dragTarget) return;
  // release with velocity
  dragTarget.vx = dragVelX;
  dragTarget.vy = dragVelY;
  dragTarget.dragging = false;
  dragTarget = null;
});

canvas.addEventListener('pointercancel', () => {
  if (dragTarget) {
    dragTarget.dragging = false;
    dragTarget = null;
  }
});

// --- Main loop ---
const FIXED_DT = 1 / 60;
let lastTime = performance.now();
let dropAccumulator = 0;
let needsDraw = true;

function physicsTick(dt) {
  for (let i = 0; i < circles.length; i++) {
    circles[i].update(dt);
  }
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      if (!circles[i].removing && !circles[j].removing) {
        resolveCollision(circles[i], circles[j]);
      }
    }
  }
}

function tick() {
  const now = performance.now();
  let elapsed = (now - lastTime) / 1000;
  lastTime = now;

  elapsed = Math.min(elapsed, 0.5);

  // auto drop
  dropAccumulator += elapsed;
  const dropSec = DROP_INTERVAL / 1000;
  while (dropAccumulator >= dropSec) {
    dropAccumulator -= dropSec;
    dropCircle();

    const active = circles.filter(c => !c.removing).length;
    if (active > MAX_CIRCLES) {
      removeOldest();
    }
  }

  // fixed timestep physics
  const steps = Math.round(elapsed / FIXED_DT);
  const actualSteps = Math.min(steps, 30);
  const stepDt = FIXED_DT / SUBSTEPS;
  for (let i = 0; i < actualSteps; i++) {
    for (let s = 0; s < SUBSTEPS; s++) {
      physicsTick(stepDt);
    }
  }

  // remove dead
  circles = circles.filter(c => !(c.removing && c.scale < 0.02));

  needsDraw = true;
}

function render() {
  ctx.clearRect(0, 0, W, H);
  for (const c of circles) {
    c.draw(ctx);
  }
}

function draw() {
  requestAnimationFrame(draw);
  if (!needsDraw) return;
  needsDraw = false;
  render();
}

// initial drop
setTimeout(() => { dropCircle(); }, 100);

// logic on setInterval (works in background tabs)
setInterval(() => {
  tick();
  render();
}, 16);
// drawing on rAF (smooth when visible)
requestAnimationFrame(draw);

// expose for debugging
window._state = () => ({ circles, MAX_CIRCLES, W, H });
