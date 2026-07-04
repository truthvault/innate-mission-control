"use client";

/**
 * Tuesday delight layer: pineapple-unicorn done celebration + badge.
 * Split from PlanClient so the ~650-line canvas engine loads lazily via
 * next/dynamic (ssr:false) instead of shipping in the board bundle.
 */

import { useEffect, useRef } from "react";
import { DT } from "@/components/mission-control-tokens";

const DELIGHT_CANVAS_DURATION_MS = 3000;
export type DelightOrigin = { x: number; y: number; cardRect?: DOMRect };

type DelightParticle = { angle: number; distance: number; speed: number; size: number; hue: number; spin: number };
type DelightShard = { x: number; y: number; width: number; height: number; angle: number; vx: number; vy: number; spin: number; color: string };

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function drawCardShard(ctx: CanvasRenderingContext2D, shard: DelightShard, t: number) {
  const drift = easeOutCubic(t);
  const fall = t * t * 52;
  ctx.save();
  ctx.translate(shard.x + shard.vx * drift, shard.y + shard.vy * drift + fall);
  ctx.rotate(shard.angle + shard.spin * drift);
  ctx.globalAlpha = Math.max(0, 1 - t * 0.92);
  ctx.fillStyle = shard.color;
  ctx.strokeStyle = "rgba(34,32,26,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-shard.width / 2, -shard.height / 2, shard.width, shard.height, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRainbowTrail(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], t: number) {
  const alpha = Math.max(0, Math.min(0.72, 1 - t));
  const colours = ["#ff4faf", "#ffd84a", "#62dbff", "#9a6cff"];
  colours.forEach((colour, index) => {
    ctx.save();
    ctx.globalAlpha = alpha * (1 - index * 0.08);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 14 - index * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((point, pointIndex) => {
      const y = point.y + (index - 1.5) * 5;
      if (pointIndex === 0) ctx.moveTo(point.x, y);
      else ctx.lineTo(point.x, y);
    });
    ctx.stroke();
    ctx.restore();
  });
}

function drawSmokeTrail(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], t: number, flameMix: number) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  points.forEach((point, index) => {
    const age = index / Math.max(1, points.length - 1);
    const puff = 18 + age * 38 + t * 16;
    ctx.globalAlpha = Math.max(0, (0.42 - age * 0.20) * (1 - flameMix * 0.72) * (1 - t * 0.28));
    const smoke = ctx.createRadialGradient(point.x, point.y, 2, point.x, point.y, puff);
    smoke.addColorStop(0, "rgba(255,255,255,0.78)");
    smoke.addColorStop(0.46, "rgba(215,205,189,0.36)");
    smoke.addColorStop(1, "rgba(90,85,73,0)");
    ctx.fillStyle = smoke;
    ctx.beginPath();
    ctx.arc(point.x + Math.sin(index * 1.7 + t * 8) * 8, point.y + Math.cos(index * 1.2 + t * 7) * 6, puff, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawFlameTrail(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], t: number, flameMix: number, flameJetTightness = 0) {
  if (flameMix <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  points.slice(0, 13).forEach((point, index) => {
    const age = index / 13;
    const flame = flameMix * Math.max(0, 1 - age * 0.82);
    const tight = clamp01(flameJetTightness);
    const radius = (12 + flame * 36 + Math.sin(t * 20 + index) * 5) * (1 - tight * 0.42);
    const jetY = point.y + age * tight * 28;
    ctx.globalAlpha = flame * (0.34 + age * 0.14) * (1 - tight * age * 0.55);
    const glow = ctx.createRadialGradient(point.x, jetY, 2, point.x, jetY, radius * (1.8 - tight * 0.38));
    glow.addColorStop(0, "rgba(255,245,223,0.96)");
    glow.addColorStop(0.26, "rgba(255,181,41,0.82)");
    glow.addColorStop(0.62, "rgba(255,73,24,0.40)");
    glow.addColorStop(1, "rgba(255,45,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, jetY, radius * (1.8 - tight * 0.38), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = index % 2 ? "rgba(255,91,25,0.72)" : "rgba(255,210,58,0.82)";
    ctx.beginPath();
    ctx.moveTo(point.x, jetY - radius * (1.4 + tight * 0.35));
    ctx.quadraticCurveTo(point.x + radius * (0.82 - tight * 0.28), jetY - radius * 0.15, point.x + radius * 0.18, jetY + radius);
    ctx.quadraticCurveTo(point.x - radius * (0.74 - tight * 0.24), jetY + radius * 0.18, point.x, jetY - radius * (1.4 + tight * 0.35));
    ctx.fill();
  });
  ctx.restore();
}


const noBlackExitBlink = true;


function drawPineapple(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, crack: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(Math.sin(crack * Math.PI) * 0.08);
  ctx.shadowColor = "rgba(34,32,26,0.20)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#77a24a";
  for (let i = -2; i <= 2; i += 1) {
    ctx.save();
    ctx.translate(i * 8, -36 - Math.abs(i) * 2);
    ctx.rotate(i * 0.28);
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#f4b739";
  ctx.strokeStyle = "#b87916";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 6, 26, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(138,91,31,0.48)";
  ctx.lineWidth = 1.5;
  for (let i = -3; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-28, -14 + i * 12);
    ctx.lineTo(28, 12 + i * 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(28, -14 + i * 12);
    ctx.lineTo(-28, 12 + i * 12);
    ctx.stroke();
  }
  if (crack > 0.28) {
    ctx.strokeStyle = "rgba(68,39,20,0.82)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-4, -22);
    ctx.lineTo(4, -6);
    ctx.lineTo(-2, 8);
    ctx.lineTo(8, 28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawUnicornSmile(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = "rgba(70,48,58,0.82)";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(45, -7);
  ctx.quadraticCurveTo(53, -1, 62, -8);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,139,181,0.62)";
  ctx.beginPath();
  ctx.ellipse(58, -5.5, 3.8, 1.9, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


function drawFrontFacingSunglasses(ctx: CanvasRenderingContext2D, bounce: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lensGradient = ctx.createLinearGradient(16, -27 + bounce, 69, -9 + bounce);
  lensGradient.addColorStop(0, "rgba(20,18,16,0.98)");
  lensGradient.addColorStop(0.48, "rgba(39,34,27,0.99)");
  lensGradient.addColorStop(1, "rgba(20,18,16,0.98)");
  ctx.fillStyle = lensGradient;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.roundRect(14, -29 + bounce, 23, 15, 6);
  ctx.roundRect(45, -29 + bounce, 23, 15, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(20,18,16,0.96)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(37, -21 + bounce);
  ctx.lineTo(45, -21 + bounce);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.52)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(19, -27 + bounce);
  ctx.lineTo(30, -28 + bounce);
  ctx.moveTo(50, -28 + bounce);
  ctx.lineTo(61, -27 + bounce);
  ctx.stroke();
  ctx.restore();
}

function drawFaceHighlight(ctx: CanvasRenderingContext2D, bounce: number) {
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(25, -38 + bounce);
  ctx.quadraticCurveTo(40, -45 + bounce, 57, -38 + bounce);
  ctx.moveTo(21, -5 + bounce);
  ctx.quadraticCurveTo(40, 5 + bounce, 61, -5 + bounce);
  ctx.stroke();
  ctx.restore();
}

function drawFrontFacingUnicornFace(ctx: CanvasRenderingContext2D, bounce: number, ghost = false) {
  ctx.save();
  ctx.shadowColor = ghost ? "transparent" : "rgba(66,52,94,0.18)";
  ctx.shadowBlur = ghost ? 0 : 18;

  ctx.fillStyle = "rgba(248,233,230,0.78)";
  ctx.strokeStyle = "rgba(78,60,86,0.24)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(16, -40 + bounce, 8, 16, -0.45, 0, Math.PI * 2);
  ctx.ellipse(66, -40 + bounce, 8, 16, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const hornGradient = ctx.createLinearGradient(40, -42 + bounce, 42, -88 + bounce);
  hornGradient.addColorStop(0, DT.goldLine);
  hornGradient.addColorStop(0.46, "#f8c64f");
  hornGradient.addColorStop(1, DT.goldPale);
  ctx.fillStyle = hornGradient;
  ctx.strokeStyle = "rgba(138,91,31,0.40)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(31, -39 + bounce);
  ctx.lineTo(42, -89 + bounce);
  ctx.lineTo(53, -39 + bounce);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(138,91,31,0.45)";
  ctx.lineWidth = 1.25;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(36 + i * 1.5, -47 - i * 8 + bounce);
    ctx.lineTo(50 - i * 1.5, -50 - i * 8 + bounce);
    ctx.stroke();
  }

  const headGradient = ctx.createRadialGradient(32, -34 + bounce, 9, 41, -17 + bounce, 48);
  headGradient.addColorStop(0, DT.cardBg);
  headGradient.addColorStop(0.50, DT.surfaceSoft);
  headGradient.addColorStop(1, DT.lineStrong);
  ctx.fillStyle = headGradient;
  ctx.strokeStyle = "rgba(78,60,86,0.28)";
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.ellipse(41, -19 + bounce, 31, 27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const muzzleGradient = ctx.createRadialGradient(41, -2 + bounce, 4, 41, -2 + bounce, 23);
  muzzleGradient.addColorStop(0, DT.cardBg);
  muzzleGradient.addColorStop(0.72, DT.clayPale);
  muzzleGradient.addColorStop(1, DT.lineStrong);
  ctx.fillStyle = muzzleGradient;
  ctx.beginPath();
  ctx.ellipse(41, -2 + bounce, 21, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!ghost) drawFrontFacingSunglasses(ctx, bounce);
  if (!ghost) {
    ctx.fillStyle = "rgba(90,85,73,0.68)";
    ctx.beginPath();
    ctx.ellipse(34, -1 + bounce, 2.2, 1.7, -0.18, 0, Math.PI * 2);
    ctx.ellipse(48, -1 + bounce, 2.2, 1.7, 0.18, 0, Math.PI * 2);
    ctx.fill();
    drawUnicornSmile(ctx);
    drawFaceHighlight(ctx, bounce);
  }
  ctx.restore();
}

function drawUnicornLeg(ctx: CanvasRenderingContext2D, x: number, y: number, lean: number, motion: number, rear = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean + Math.sin(motion) * 0.13);
  const legGradient = ctx.createLinearGradient(0, 0, 8, 38);
  legGradient.addColorStop(0, rear ? DT.clayPale : DT.surface);
  legGradient.addColorStop(1, rear ? DT.lineStrong : DT.line);
  ctx.fillStyle = legGradient;
  ctx.strokeStyle = "rgba(78,60,86,0.22)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-4, -1, 9, 34, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(90,85,73,0.28)";
  ctx.beginPath();
  ctx.ellipse(1, 34, 8, 4, 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawUnicornMotionBlur(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, rotation: number, motion: number) {
  for (let i = 3; i >= 1; i -= 1) {
    ctx.save();
    ctx.globalAlpha = 0.08 * i;
    ctx.filter = `blur(${i * 2}px)`;
    drawHyperRealisticUnicorn(ctx, x - i * 22, y + i * 9, scale * (1 - i * 0.025), rotation - i * 0.035, motion - i * 0.45, true);
    ctx.restore();
  }
}

function drawHyperRealisticUnicorn(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, rotation: number, motion = 0, ghost = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  const maneFlow = Math.sin(motion * 1.8) * 4;
  const bounce = Math.sin(motion * 2.2) * 2.5;
  if (!ghost) {
    ctx.shadowColor = "rgba(66,52,94,0.34)";
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 13;
  }

  const bodyGradient = ctx.createRadialGradient(24, -22, 6, -4, 8 + bounce, 88);
  bodyGradient.addColorStop(0, DT.cardBg);
  bodyGradient.addColorStop(0.38, DT.surface);
  bodyGradient.addColorStop(0.74, DT.clayPale);
  bodyGradient.addColorStop(1, DT.lineStrong);
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = "rgba(78,60,86,0.28)";
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.ellipse(-6, 9 + bounce, 50, 30, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = "transparent";
  drawUnicornLeg(ctx, -30, 29 + bounce, -0.22, motion, true);
  drawUnicornLeg(ctx, -4, 31 + bounce, 0.10, motion + 1.4);
  drawUnicornLeg(ctx, 21, 28 + bounce, -0.02, motion + 2.5);

  ctx.shadowColor = ghost ? "transparent" : "rgba(66,52,94,0.16)";
  ctx.shadowBlur = ghost ? 0 : 16;
  const neckGradient = ctx.createLinearGradient(18, -32, 4, 26);
  neckGradient.addColorStop(0, DT.cardBg);
  neckGradient.addColorStop(1, DT.line);
  ctx.fillStyle = neckGradient;
  ctx.beginPath();
  ctx.moveTo(16, -30 + bounce);
  ctx.quadraticCurveTo(-12, -14, -1, 19 + bounce);
  ctx.quadraticCurveTo(18, 28, 34, 2 + bounce);
  ctx.quadraticCurveTo(35, -20, 16, -30 + bounce);
  ctx.fill();
  ctx.stroke();

  // Front-facing face is drawn after the mane/tail so it looks at the user instead of flying side-on.


  const maneColours = ["#ff4faf", "#7a5cff", "#25c8ff", "#ffd84a", "#ff7c4d", "#72f0aa"];
  maneColours.forEach((colour, index) => {
    const mx = 14 - index * 8 + Math.sin(motion + index) * 2.3;
    const my = -26 + index * 5 + maneFlow * (1 - index * 0.10);
    const maneGradient = ctx.createRadialGradient(mx, my, 2, mx, my, 22);
    maneGradient.addColorStop(0, DT.cardBg);
    maneGradient.addColorStop(0.20, colour);
    maneGradient.addColorStop(1, "rgba(96,56,130,0.58)");
    ctx.fillStyle = maneGradient;
    ctx.beginPath();
    ctx.ellipse(mx, my, 10, 25, 0.70 + Math.sin(motion + index) * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });

  const tailGradient = ctx.createLinearGradient(-78, -54, -31, 8);
  tailGradient.addColorStop(0, "#ff4faf");
  tailGradient.addColorStop(0.30, "#7a5cff");
  tailGradient.addColorStop(0.62, "#25c8ff");
  tailGradient.addColorStop(1, "#ffd84a");
  ctx.strokeStyle = tailGradient;
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-43, 0 + bounce);
  ctx.quadraticCurveTo(-86, -33 + maneFlow, -56, -68 + maneFlow * 1.2);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.globalAlpha = ghost ? ctx.globalAlpha : 0.55;
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.beginPath();
  ctx.moveTo(-49, -4 + bounce);
  ctx.quadraticCurveTo(-76, -30 + maneFlow, -54, -55 + maneFlow);
  ctx.stroke();
  ctx.globalAlpha = ghost ? ctx.globalAlpha : 1;

  drawFrontFacingUnicornFace(ctx, bounce, ghost);

  ctx.globalAlpha = ghost ? ctx.globalAlpha : 0.46;
  ctx.strokeStyle = "rgba(255,255,255,0.94)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 0 + bounce);
  ctx.quadraticCurveTo(31, 9 + bounce, 55, -1 + bounce);
  ctx.stroke();
  ctx.restore();
}

function drawUnicorn(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, rotation: number, motion = 0) {
  drawHyperRealisticUnicorn(ctx, x, y, scale, rotation, motion);
}


function runPineappleUnicornCanvas(canvas: HTMLCanvasElement, origin: DelightOrigin) {
  // Canvas Delight Engine: use a real drawing layer instead of HTML/CSS keyframe puppets.
  const maybeContext = canvas.getContext("2d");
  if (!maybeContext) return () => undefined;
  const ctx = maybeContext;
  // Keep the delight smooth on Retina screens. Full DPR 2-3 canvas + blur filters
  // makes the unicorn render millions of pixels per frame while the board is also
  // saving/re-rendering the completed task.
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const card = origin.cardRect;
  const cx = card ? card.left + card.width / 2 : origin.x;
  const cy = card ? card.top + card.height / 2 : origin.y;
  const cardWidth = card?.width ?? 116;
  const cardHeight = card?.height ?? 86;
  const particleCount = width < 760 ? 58 : 82;
  const shardCount = width < 760 ? 12 : 16;
  const trailCount = width < 760 ? 14 : 20;
  const particles: DelightParticle[] = Array.from({ length: particleCount }, (_, index) => ({
    angle: (Math.PI * 2 * index) / particleCount + ((index % 9) - 4) * 0.038,
    distance: 86 + (index % 13) * 17,
    speed: 0.76 + (index % 5) * 0.08,
    size: 2.5 + (index % 6) * 1.3,
    hue: (index * 23) % 360,
    spin: ((index % 2 ? 1 : -1) * (0.8 + (index % 4) * 0.35)),
  }));
  const shards: DelightShard[] = Array.from({ length: shardCount }, (_, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = cx - cardWidth * 0.42 + col * cardWidth * 0.28;
    const y = cy - cardHeight * 0.38 + row * cardHeight * 0.19;
    const angle = -0.26 + index * 0.034;
    return {
      x,
      y,
      width: Math.max(20, cardWidth / 3.7),
      height: Math.max(16, cardHeight / 4.8),
      angle,
      vx: Math.cos((Math.PI * 2 * index) / shardCount) * (72 + (index % 4) * 27),
      vy: Math.sin((Math.PI * 2 * index) / shardCount) * (58 + (index % 5) * 19) - 42,
      spin: (index % 2 ? 1 : -1) * (1.4 + index * 0.08),
      color: index % 2 ? "rgba(255,253,249,0.94)" : "rgba(255,245,223,0.90)",
    };
  });

  let raf = 0;
  const started = performance.now();
  function frame(now: number) {
    const raw = (now - started) / DELIGHT_CANVAS_DURATION_MS;
    const t = clamp01(raw);
    ctx.clearRect(0, 0, width, height);

    const flashAlpha = Math.max(0, 0.24 * (1 - t * 2.2));
    ctx.fillStyle = `rgba(255,245,223,${flashAlpha})`;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = Math.max(0, 0.78 * (1 - t));
    const shock = 24 + easeOutCubic(t) * 340;
    const gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, shock);
    gradient.addColorStop(0, "rgba(255,255,255,0.86)");
    gradient.addColorStop(0.22, "rgba(255,214,74,0.50)");
    gradient.addColorStop(0.55, "rgba(91,211,255,0.26)");
    gradient.addColorStop(1, "rgba(255,79,175,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, shock, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    shards.forEach((shard) => drawCardShard(ctx, shard, t));

    const straightOutLaunch = easeOutCubic(clamp01((t - 0.06) / 0.28));
    const screenApproach = easeOutCubic(clamp01((t - 0.18) / 0.62));
    const targetX = cx;
    const targetY = height * 0.46;
    const launchLift = 36 * straightOutLaunch * (1 - screenApproach * 0.45);
    const rightExitAtEightyPercent = easeOutCubic(clamp01((screenApproach - 0.80) / 0.20));
    const forwardThenRightExit = rightExitAtEightyPercent;
    const offscreenRightExit = rightExitAtEightyPercent * (width - cx + 220);
    const unicornX = targetX + Math.sin(t * Math.PI * 5) * 3 * (1 - screenApproach) + offscreenRightExit;
    const unicornY = cy - launchLift + (targetY - cy) * screenApproach - rightExitAtEightyPercent * 36;
    const flameMix = easeOutCubic(clamp01((screenApproach - 0.22) / 0.78));
    const cameraPassThrough = easeOutCubic(clamp01((t - 0.66) / 0.22));
    const impactStart = 0.74;
    const cameraImpact = easeOutCubic(clamp01((t - impactStart) / 0.16));
    const rightExitFade = 1 - easeOutCubic(clamp01((rightExitAtEightyPercent - 0.72) / 0.26));
    const slickOffscreenCutoff = rightExitAtEightyPercent >= 0.985;
    const noPostExitGlow = true;
    if (slickOffscreenCutoff) {
      void noPostExitGlow;
      if (t < 1) raf = requestAnimationFrame(frame);
      return;
    }
    const trailFadeBeforeImpact = 1 - easeOutCubic(clamp01((t - 0.66) / 0.08));
    const trailCutoff = trailFadeBeforeImpact > 0.02;
    const originFade = 1 - easeOutCubic(clamp01((t - 0.56) / 0.18));
    const flameJetTightness = easeOutCubic(clamp01((t - 0.58) / 0.14));
    const trail = Array.from({ length: trailCount }, (_, index) => {
      const lag = index / trailCount;
      const trailApproach = Math.max(0, screenApproach - lag * 0.50);
      const depthDrift = straightOutLaunch * (1 - lag) * 22;
      return {
        x: cx + Math.sin(index * 0.9 + t * 12) * (5 + lag * 14) * (1 - trailApproach),
        y: cy + depthDrift + (targetY - cy) * trailApproach + Math.cos(index * 1.1 + t * 10) * 4,
      };
    }).reverse();
    if (trailCutoff) {
      ctx.save();
      ctx.globalAlpha = trailFadeBeforeImpact;
      drawSmokeTrail(ctx, trail, t, flameMix);
      drawRainbowTrail(ctx, trail, t);
      if (t < impactStart) drawFlameTrail(ctx, trail, t, flameMix, flameJetTightness);
      ctx.restore();
    }

    particles.forEach((particle, index) => {
      const blast = easeOutCubic(clamp01((t - 0.05) / particle.speed));
      const px = cx + Math.cos(particle.angle) * particle.distance * blast;
      const py = cy + Math.sin(particle.angle) * particle.distance * blast + t * t * 42;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(particle.spin * blast + index);
      ctx.globalAlpha = Math.max(0, 1 - t * 1.06) * originFade;
      ctx.fillStyle = `hsl(${particle.hue} 92% 62%)`;
      if (index % 9 === 0) {
        ctx.font = `${particle.size * 4}px system-ui`;
        ctx.fillText(index % 18 === 0 ? "🍍" : "✨", -particle.size * 2, particle.size * 2);
      } else {
        ctx.beginPath();
        ctx.roundRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2, 2);
        ctx.fill();
      }
      ctx.restore();
    });

    const pineappleScale = Math.max(0, Math.sin(Math.min(1, t / 0.66) * Math.PI)) * (1.24 + 0.28 * Math.sin(t * Math.PI * 8));
    if (originFade > 0.02) {
      ctx.save();
      ctx.globalAlpha = originFade;
      drawPineapple(ctx, cx, cy, pineappleScale, t);
      ctx.restore();
    }
    const screenFillScale = 0.52 + straightOutLaunch * 0.50 + Math.pow(screenApproach, 2.1) * 2.8 + Math.pow(cameraPassThrough, 2.2) * 4.2;
    const unicornRotation = -0.10 + Math.sin(t * Math.PI * 8) * 0.035 * (1 - screenApproach) + forwardThenRightExit * 0.16;
    if (rightExitFade > 0) {
      ctx.save();
      ctx.globalAlpha = rightExitFade;
      if (ratio <= 1.25 && width >= 760) drawUnicornMotionBlur(ctx, unicornX, unicornY, screenFillScale, unicornRotation, now / 180);
      drawUnicorn(ctx, unicornX, unicornY, screenFillScale, unicornRotation, now / 180);
      ctx.restore();
    }
    void cameraImpact;
    void noPostExitGlow;
    void noBlackExitBlink;

    if (t < 1) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export function DelightDoneBurst({ origin }: { origin: DelightOrigin }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return runPineappleUnicornCanvas(canvas, origin);
  }, [origin]);
  return (
    <div
      data-delight-done-burst="delight-done-burst"
      aria-label="Tuesday done unicorn pineapple explosion"
      style={{ position: "fixed", inset: 0, zIndex: 120, pointerEvents: "none", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} data-delight-canvas="pineapple-unicorn-canvas" style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }} />
      <span data-delight-pineapple="delight-pineapple" style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}>🍍</span>
      <span data-delight-flying-unicorn="delight-flying-unicorn" style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}>🦄</span>
    </div>
  );
}

export function DelightUnicorn() {
  return (
    <div
      aria-label="Tuesday delight unicorn"
      title="Tuesday delight unicorn"
      data-delight-badge-placement="in-flow-safe"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        marginTop: 12,
        width: "fit-content",
        padding: "7px 10px",
        borderRadius: 999,
        border: "1px solid rgba(211,154,35,0.30)",
        background: "rgba(255,245,223,0.86)",
        color: DT.goldInk,
        fontFamily: DT.sans,
        fontSize: 12,
        fontWeight: 900,
        boxShadow: "0 8px 18px rgba(80,57,20,0.08)",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🦄</span>
      <span>delight on</span>
    </div>
  );
}
