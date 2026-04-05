// Jampack - yugop tribute
// 2D physics with circles, color schemes, sound, drag & drop, shrink-remove

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

// --- Color palettes ---
const PALETTES = [
  { name: 'Mono',       bg: '#ffffff', colors: ['#000000'],                                                  cross: 'rgba(255,255,255,0.4)' },
  { name: 'Tokyo',      bg: '#f5f0eb', colors: ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560'],      cross: 'rgba(255,255,255,0.35)' },
  { name: 'Forest',     bg: '#f7f7f2', colors: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d'],      cross: 'rgba(255,255,255,0.35)' },
  { name: 'Sunset',     bg: '#fff8f0', colors: ['#d62828', '#f77f00', '#fcbf49', '#003049', '#264653'],      cross: 'rgba(255,255,255,0.4)' },
  { name: 'Ocean',      bg: '#f0f4f8', colors: ['#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4'],      cross: 'rgba(255,255,255,0.35)' },
  { name: 'Earth',      bg: '#faf6f1', colors: ['#582f0e', '#7f4f24', '#936639', '#a68a64', '#b6ad90'],      cross: 'rgba(255,255,255,0.35)' },
  { name: 'Berry',      bg: '#fdf2f8', colors: ['#4a0e4e', '#812b91', '#c74bab', '#e879a8', '#f5a3c7'],      cross: 'rgba(255,255,255,0.35)' },
  { name: 'Charcoal',   bg: '#f8f9fa', colors: ['#212529', '#343a40', '#495057', '#6c757d', '#adb5bd'],      cross: 'rgba(255,255,255,0.4)' },
  { name: 'Bauhaus',    bg: '#f5f1eb', colors: ['#d32f2f', '#1565c0', '#fbc02d', '#212121', '#e0e0e0'],      cross: 'rgba(255,255,255,0.4)' },
  { name: 'Neon',       bg: '#0a0a0a', colors: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'],      cross: 'rgba(0,0,0,0.4)', dark: true },
];

let currentPalette = 0;

function getPalette() {
  return PALETTES[currentPalette];
}

function randomColor() {
  const p = getPalette();
  return p.colors[Math.floor(Math.random() * p.colors.length)];
}

// --- Palette selector UI ---
const selectorEl = document.getElementById('palette-selector');

function buildPaletteUI() {
  selectorEl.innerHTML = '';
  PALETTES.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'palette-btn' + (i === currentPalette ? ' active' : '');
    btn.title = p.name;
    // show color dots
    p.colors.slice(0, 5).forEach(c => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = c;
      btn.appendChild(dot);
    });
    btn.addEventListener('click', () => {
      currentPalette = i;
      applyPaletteToDom(p);
      for (const c of circles) {
        c.color = randomColor();
      }
      buildPaletteUI();
    });
    selectorEl.appendChild(btn);
  });
}
function applyPaletteToDom(p) {
  document.body.style.background = p.bg;
  const credit = document.getElementById('credit');
  if (credit) {
    const alpha = p.dark ? '0.3' : '0.25';
    const base = p.dark ? '255,255,255' : '0,0,0';
    credit.style.color = `rgba(${base},${alpha})`;
    const link = credit.querySelector('a');
    if (link) link.style.borderBottomColor = `rgba(${base},0.15)`;
  }
}

buildPaletteUI();
applyPaletteToDom(getPalette());

// --- Audio: removal ping ---
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playRemoveSound(radius) {
  if (!audioCtx) return;
  // clean short ping, pitch varies with circle size
  const now = audioCtx.currentTime;
  const baseFreq = 1800 + (1 - radius / 120) * 1200; // higher register

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.12);

  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.2);
}

// init audio on first interaction
canvas.addEventListener('pointerdown', () => { initAudio(); }, { once: true });

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
    this.color = randomColor();
    this.vx = (Math.random() - 0.5) * 30;
    this.vy = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.angularVel = 0;
    this.mass = r * r;
    this.removing = false;
    this.soundPlayed = false;
    this.dragging = false;
    this.scale = 0.01;
    this.opacity = 1;
  }

  update(dt) {
    if (this.removing) {
      if (!this.soundPlayed) {
        this.soundPlayed = true;
        playRemoveSound(this.r);
      }
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
    ctx.fillStyle = this.color;
    ctx.fill();

    // two tiny crosses, symmetrically placed
    ctx.rotate(this.angle);
    const crossSize = r * 0.04;
    const offset = r * 0.32;
    ctx.strokeStyle = getPalette().cross;
    ctx.lineWidth = Math.max(0.4, r * 0.012);
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
        b.vx += nx * overlap * 8;
        b.vy += ny * overlap * 8;
        b.angularVel += (nx * b.vy - ny * b.vx) * 0.003;
      } else {
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        a.vx -= nx * overlap * 8;
        a.vy -= ny * overlap * 8;
        a.angularVel -= (nx * a.vy - ny * a.vx) * 0.003;
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
      b.angularVel -= dvt * 0.002;
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

function findCircleAt(px, py) {
  for (let i = circles.length - 1; i >= 0; i--) {
    if (!circles[i].removing && circles[i].containsPoint(px, py)) {
      return circles[i];
    }
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
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
    canvas.setPointerCapture(e.pointerId);
  } else {
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
  dragTarget.angularVel = dragVelX * 0.008;
});

canvas.addEventListener('pointerup', () => {
  if (!dragTarget) return;
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
  // fill with palette background (not clearRect, so canvas exports have bg)
  ctx.fillStyle = getPalette().bg;
  ctx.fillRect(0, 0, W, H);
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

setInterval(() => {
  tick();
  render();
}, 16);
requestAnimationFrame(draw);

window._state = () => ({ circles, MAX_CIRCLES, W, H, currentPalette });
