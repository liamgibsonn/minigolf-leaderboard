// ms from the start of the animation. See CODE_GUIDE.md.
const TIMES = { drop: 300, flagUp: 400, land: 1000, settle: 1670, edge: 2170, tip: 2720 };
const BOUNCES = [7, 2.5, 0.8]; // vmin, each lower than the last
const BALL = 3.6; // vmin
const POLE = 10; // vmin
const LAND = 14; // vmin along the strip from its curved corner where the ball first lands
const ROLL_OFF = 40; // degrees round the strip's curved corner before it leaves it
const CREEP = 1.6; // vmin per second at the edge, about the eagle's hover drift
const FLAG_LEFT = 3; // vmin the flag stands to the left of where the ball falls
const CLEAR = 1; // vmin the ball eases left as it drops, so it clears the strip's corner

const GRAVITY = 'cubic-bezier(0.55, 0.085, 0.68, 0.53)';
const RISING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

// Starts the flag and ball. The flag stays up until sink() is called.
export function playFlag() {
  const strip = document.querySelector('.cta-text');
  if (!strip || matchMedia('(prefers-reduced-motion: reduce)').matches) return { sink: () => Promise.resolve() };

  const vmin = Math.min(innerWidth, innerHeight) / 100;
  const ball = BALL * vmin;
  const pole = POLE * vmin;
  const rect = strip.getBoundingClientRect();
  const ground = rect.top;
  const bottom = innerHeight;
  const radius = parseFloat(getComputedStyle(strip).borderTopLeftRadius) || 0;
  const edgeX = rect.left + radius; // where the strip's top starts curving down
  const landX = Math.min(rect.right - ball, edgeX + LAND * vmin);
  // Brakes evenly from landing down to a creep at the edge, and comes in at the speed it
  // starts braking from.
  const creep = (CREEP * vmin) / 1000; // px per ms
  const brakeTime = TIMES.edge - TIMES.land;
  const speed = Math.max(creep, (2 * (landX - edgeX)) / brakeTime - creep);
  const startX = landX + speed * (TIMES.land - TIMES.drop);
  const startSlope = (speed * brakeTime) / (landX - edgeX || 1);
  const braking = `cubic-bezier(0.333, ${startSlope / 3}, 0.667, ${(1 + startSlope) / 3})`;

  // Over the corner it speeds up evenly from the creep until it leaves the curve at
  // ROLL_OFF degrees.
  const around = radius + ball / 2;
  const turnTime = TIMES.tip - TIMES.edge;
  const endAngle = (ROLL_OFF * Math.PI) / 180;
  const spin = creep / around; // radians per ms at the edge
  const speedUp = Math.max(0, (2 * (endAngle - spin * turnTime)) / turnTime ** 2);
  const pointAt = (angle) => ({ x: edgeX - around * Math.sin(angle), y: ground + radius - around * Math.cos(angle) });
  const path = Array.from({ length: 16 }, (_, i) => {
    const ms = (turnTime * (i + 1)) / 16;
    return { time: TIMES.edge + ms, ...pointAt(spin * ms + (speedUp * ms * ms) / 2) };
  });

  // Then it falls under the same gravity as its bounces, keeping the speed and direction
  // it left the curve with, so it drops more and more steeply. The flag goes where it
  // reaches the bottom of the screen.
  const bounceTime = TIMES.settle - TIMES.land;
  const weights = BOUNCES.map(Math.sqrt);
  const total = weights.reduce((a, b) => a + b, 0);
  const firstBounce = (bounceTime * weights[0]) / total;
  const gravity = (8 * BOUNCES[0] * vmin) / firstBounce ** 2; // px per ms²
  const exit = path.at(-1);
  const exitSpeed = around * (spin + speedUp * turnTime);
  const across = -exitSpeed * Math.cos(endAngle);
  const down = exitSpeed * Math.sin(endAngle);
  const timeToFall = (distance) => (-down + Math.sqrt(down ** 2 + 2 * gravity * distance)) / gravity;
  const flagX = exit.x + across * timeToFall(bottom - exit.y);
  const fallTime = timeToFall(bottom + ball / 2 - exit.y);
  // Eases CLEAR to the left over the first half of the fall, so it doesn't clip the corner.
  const clear = (u) => CLEAR * vmin * (1 - (1 - Math.min(1, u * 2)) ** 2);
  for (let i = 1; i <= 16; i++) {
    const ms = (fallTime * i) / 16;
    path.push({
      time: TIMES.tip + ms,
      x: exit.x + across * ms - clear(i / 16),
      y: exit.y + down * ms + (gravity * ms * ms) / 2,
    });
  }
  const duration = TIMES.tip + fallTime;

  const layer = document.createElement('div');
  layer.className = 'flag-layer';
  layer.innerHTML = `
    <svg class="flag" viewBox="0 0 40 100"><rect width="3" height="100" fill="#f2f2f2"/><path d="M3 3 L38 15 L3 27 Z" fill="#e5484d"/></svg>
    <div class="ball-x"><div class="ball-y"><svg class="ball" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="9.3" fill="#fff" stroke="#bdbdbd" stroke-width="0.8"/>
    </svg></div></div>`;
  document.body.append(layer);

  const place = (el, left, top, width, height) =>
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  const flag = layer.querySelector('.flag');
  const poleX = Math.max(1.5 * vmin, flagX - FLAG_LEFT * vmin); // stays on screen when the strip is wide (portrait)
  place(flag, poleX - pole * 0.015, bottom - pole, pole * 0.4, pole); // pole is 3/40 of the flag's width
  place(layer.querySelector('.ball-x'), 0, 0, ball, ball);

  flag.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], {
    duration: TIMES.flagUp,
    easing: 'ease-out',
    fill: 'forwards',
  });

  const at = (ms) => ms / duration;
  const animate = (el, keyframes) => el.animate(keyframes, { duration, fill: 'forwards' });

  // Across and down are separate so each can have its own easing. The easing on
  // each keyframe shapes the segment after it.
  const x = (px) => `translateX(${px - ball / 2}px)`;
  animate(layer.querySelector('.ball-x'), [
    { offset: 0, transform: x(startX) },
    { offset: at(TIMES.drop), transform: x(startX) },
    { offset: at(TIMES.land), transform: x(landX), easing: braking },
    { offset: at(TIMES.edge), transform: x(edgeX) },
    ...path.map((point) => ({ offset: at(point.time), transform: x(point.x) })),
  ]);

  const rest = ground - ball;
  const y = (px) => `translateY(${px}px)`;
  const bounces = [];
  let t = TIMES.land;
  BOUNCES.forEach((height, i) => {
    const length = (bounceTime * weights[i]) / total;
    bounces.push(
      { offset: at(t), transform: y(rest), easing: RISING },
      { offset: at(t + length / 2), transform: y(rest - height * vmin), easing: GRAVITY },
    );
    t += length;
  });
  animate(layer.querySelector('.ball-y'), [
    { offset: 0, transform: y(-ball * 2) },
    { offset: at(TIMES.drop), transform: y(-ball * 2), easing: GRAVITY },
    ...bounces,
    { offset: at(TIMES.settle), transform: y(rest) },
    { offset: at(TIMES.edge), transform: y(rest) },
    ...path.map((point) => ({ offset: at(point.time), transform: y(point.y - ball / 2) })),
  ]);

  return {
    sink(ms) {
      const down = flag.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], {
        duration: ms,
        easing: 'ease-in',
        fill: 'forwards',
      });
      return down.finished.then(() => layer.remove());
    },
  };
}
