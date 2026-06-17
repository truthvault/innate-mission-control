'use client';

import { startTransition, type CSSProperties, type DragEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip } from "@/components/mission-control-ui";
import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { UiOrder } from "@/lib/monday/mapping";
import {
  buildSuggestedPlanForOrder,
  formatOrderedDate,
  selectNewOrderForPlanning,
  summarizeLaneCapacity,
  type LaneCapacitySummary,
  type NewOrderPlanCandidate,
  type SuggestedOrderPlanStep,
} from "@/lib/production/new-order-planning";
import {
  type DraggablePlanTask,
} from "@/lib/production/plan-drag";
import { invoiceExpectationForOrder } from "@/lib/production/invoice-expectation.js";
import {
  DAYS,
  PEOPLE,
  derivePlanGrid as derivePlanWeek,
  groupPlanRowsByWeek,
  type PlanRow,
  type DayKey,
  type Person,
} from "@/lib/monday/production-plan-mapping";

const PLAN_TASK_LINKS_REALTIME_CHANNEL = "production-plan-task-links";
const PLAN_TASK_LINKS_REALTIME_EVENT = "plan-task-links-changed";
type PlanTaskLinksStorage = "blob" | "supabase";

const DT = {
  pageBg: "#f5f3ee",
  cardBg: "#ffffff",
  headerBg: "#1a1a1a",
  teal: "#0c7c7a",
  tealSoft: "rgba(12,124,122,0.08)",
  gold: "#c8a96e",
  sage: "#6e8a6a",
  goldSoft: "rgba(200,169,110,0.06)",
  textPrimary: "#22201a",
  textSecondary: "#5a5549",
  textMuted: "#7c746b",
  textFaint: "#9a9088",
  border: "rgba(0,0,0,0.06)",
  shadow: "0 1px 3px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.02)",
  radius: 14,
  radiusSm: 8,
  sans: "'DM Sans', -apple-system, sans-serif",
  serif: "'Fraunces', Georgia, serif",
};

const newOrderPalette = {
  clayBg: "rgba(111,143,123,0.14)",
  clayPanel: "rgba(249,251,247,0.98)",
  clayBorder: "rgba(111,143,123,0.30)",
  clayBorderStrong: "rgba(111,143,123,0.46)",
  clayAccent: "#55715f",
  clayAccentDark: "#3f5949",
  clayStripe: "#6f8f7b",
  clayGlow: "rgba(111,143,123,0.18)",
  clayTaskBg: "linear-gradient(135deg, rgba(249,251,247,0.98) 0%, rgba(111,143,123,0.20) 100%)",
};

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};
const PERSON_LABELS: Record<Person, string> = { nick: "Nick", dylan: "Dylan" };
const PERSON_SHORT: Record<Person, string> = { nick: "Nick", dylan: "Dylan" };
const PERSON_VISUALS: Record<Person, { stripe: string; stripeMuted: string; text: string; laneBg: string; laneBorder: string; taskBg: string; taskBorder: string; taskSoft: string }> = {
  nick: {
    stripe: "#8b1e1e",
    stripeMuted: "#c66f6f",
    text: "#8b1e1e",
    laneBg: "rgba(139,30,30,0.075)",
    laneBorder: "rgba(139,30,30,0.28)",
    taskBg: "linear-gradient(135deg, rgba(255,253,249,0.98), rgba(139,30,30,0.09))",
    taskBorder: "rgba(139,30,30,0.22)",
    taskSoft: "rgba(139,30,30,0.12)",
  },
  dylan: {
    stripe: "#1f1f1f",
    stripeMuted: "#77716a",
    text: "#1f1f1f",
    laneBg: "rgba(31,31,31,0.055)",
    laneBorder: "rgba(31,31,31,0.24)",
    taskBg: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(31,31,31,0.075))",
    taskBorder: "rgba(31,31,31,0.18)",
    taskSoft: "rgba(31,31,31,0.10)",
  },
};
const REVIEW_GLOW = {
  color: "#8a5d08",
  border: "rgba(190,137,24,0.62)",
  borderStrong: "rgba(190,137,24,0.86)",
  bg: "linear-gradient(135deg, rgba(255,246,199,0.78), rgba(255,253,249,0.96) 54%, rgba(255,255,255,0.98))",
  bgSoft: "linear-gradient(135deg, rgba(255,246,199,0.46), rgba(255,255,255,0.88))",
  shadow: "0 0 0 3px rgba(211,154,35,0.18), 0 0 0 8px rgba(211,154,35,0.08), 0 16px 34px rgba(80,57,20,0.10)",
  modalShadow: "0 0 0 4px rgba(211,154,35,0.20), 0 0 0 12px rgba(211,154,35,0.09), 0 28px 78px rgba(34,32,26,0.26)",
};
const CAPACITY_STYLES = {
  ok: { color: "#3f6f3f", bg: "rgba(63,111,63,0.09)", border: "rgba(63,111,63,0.22)", label: "OK" },
  watch: { color: "#9a6a14", bg: "rgba(200,169,110,0.14)", border: "rgba(200,169,110,0.35)", label: "Full" },
  over: { color: "#9b2f22", bg: "rgba(155,47,34,0.10)", border: "rgba(155,47,34,0.34)", label: "Over" },
} as const;

const DELIGHT_CANVAS_DURATION_MS = 3000;
type DelightOrigin = { x: number; y: number; cardRect?: DOMRect };

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
    smoke.addColorStop(0.46, "rgba(194,184,190,0.36)");
    smoke.addColorStop(1, "rgba(92,83,94,0)");
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
    glow.addColorStop(0, "rgba(255,255,220,0.96)");
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
  ctx.strokeStyle = "rgba(137,86,18,0.48)";
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
  lensGradient.addColorStop(0, "rgba(5,8,15,0.98)");
  lensGradient.addColorStop(0.48, "rgba(30,38,54,0.99)");
  lensGradient.addColorStop(1, "rgba(3,5,10,0.98)");
  ctx.fillStyle = lensGradient;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.roundRect(14, -29 + bounce, 23, 15, 6);
  ctx.roundRect(45, -29 + bounce, 23, 15, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(12,12,17,0.96)";
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

  ctx.fillStyle = "rgba(255,213,222,0.78)";
  ctx.strokeStyle = "rgba(78,60,86,0.24)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(16, -40 + bounce, 8, 16, -0.45, 0, Math.PI * 2);
  ctx.ellipse(66, -40 + bounce, 8, 16, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const hornGradient = ctx.createLinearGradient(40, -42 + bounce, 42, -88 + bounce);
  hornGradient.addColorStop(0, "#fff2a8");
  hornGradient.addColorStop(0.46, "#f8c64f");
  hornGradient.addColorStop(1, "#fff9d2");
  ctx.fillStyle = hornGradient;
  ctx.strokeStyle = "rgba(137,91,25,0.40)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(31, -39 + bounce);
  ctx.lineTo(42, -89 + bounce);
  ctx.lineTo(53, -39 + bounce);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(160,103,26,0.45)";
  ctx.lineWidth = 1.25;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(36 + i * 1.5, -47 - i * 8 + bounce);
    ctx.lineTo(50 - i * 1.5, -50 - i * 8 + bounce);
    ctx.stroke();
  }

  const headGradient = ctx.createRadialGradient(32, -34 + bounce, 9, 41, -17 + bounce, 48);
  headGradient.addColorStop(0, "#ffffff");
  headGradient.addColorStop(0.50, "#fff3f5");
  headGradient.addColorStop(1, "#d6c4dc");
  ctx.fillStyle = headGradient;
  ctx.strokeStyle = "rgba(78,60,86,0.28)";
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.ellipse(41, -19 + bounce, 31, 27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const muzzleGradient = ctx.createRadialGradient(41, -2 + bounce, 4, 41, -2 + bounce, 23);
  muzzleGradient.addColorStop(0, "#fffefd");
  muzzleGradient.addColorStop(0.72, "#f4dee6");
  muzzleGradient.addColorStop(1, "#dcc4d4");
  ctx.fillStyle = muzzleGradient;
  ctx.beginPath();
  ctx.ellipse(41, -2 + bounce, 21, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!ghost) drawFrontFacingSunglasses(ctx, bounce);
  if (!ghost) {
    ctx.fillStyle = "rgba(92,63,82,0.68)";
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
  legGradient.addColorStop(0, rear ? "#eee3ef" : "#fff8fa");
  legGradient.addColorStop(1, rear ? "#cdbbd2" : "#dacadc");
  ctx.fillStyle = legGradient;
  ctx.strokeStyle = "rgba(78,60,86,0.22)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-4, -1, 9, 34, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(94,67,86,0.28)";
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
  bodyGradient.addColorStop(0, "#ffffff");
  bodyGradient.addColorStop(0.38, "#fff6f8");
  bodyGradient.addColorStop(0.74, "#eaddea");
  bodyGradient.addColorStop(1, "#c9b6ce");
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
  neckGradient.addColorStop(0, "#fffefe");
  neckGradient.addColorStop(1, "#ddcede");
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
    maneGradient.addColorStop(0, "#ffffff");
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
      color: index % 2 ? "rgba(255,253,249,0.94)" : "rgba(255,246,199,0.90)",
    };
  });

  let raf = 0;
  const started = performance.now();
  function frame(now: number) {
    const raw = (now - started) / DELIGHT_CANVAS_DURATION_MS;
    const t = clamp01(raw);
    ctx.clearRect(0, 0, width, height);

    const flashAlpha = Math.max(0, 0.24 * (1 - t * 2.2));
    ctx.fillStyle = `rgba(255,246,199,${flashAlpha})`;
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

function DelightDoneBurst({ origin }: { origin: DelightOrigin }) {
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

function DelightUnicorn() {
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
        background: "rgba(255,246,199,0.86)",
        color: "#8a5d08",
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

const JOB_TASK_PRESETS = [
  "Material + spec check",
  "POs sent",
  "Timber pulled",
  "Materials received",
  "Stress cuts",
  "Cut / machine / prep",
  "Sand and coat",
  "Second coat",
  "3rd coat (clear final)",
  "4th coat (blackwash final)",
  "Curing",
  "Final QC photos",
  "QC + photos",
  "Assemble / box",
  "Pack / wrap",
  "Book freight",
  "Customer update",
  "Repair",
  "Custom",
] as const;
const SUPPORT_JOB_TASK_PRESETS = [
  "Pack / wrap",
  "Book freight",
  "Customer update",
  "Custom",
] as const;
const TABLE_TASK_STAGE_SUGGESTIONS = [
  "Material + spec check",
  "Timber pulled",
  "Stress cuts",
  "Cut / machine / prep",
  "Sand and coat",
  "3rd coat (clear final)",
  "4th coat (blackwash final)",
  "Curing",
  "QC + photos",
  "Assemble / box",
  "Pack / wrap",
  "Book freight",
  "Customer update",
] as const;
const STAGE_CUSTOM_VALUE = "__custom_task_stage__";
type Step = { key: string; label: string; who: string | null; wait: boolean; waitLabel?: string };
type JobTaskOption = { label: string; group: "production" | "support"; stepKey?: string };
const TABLE_STEPS: Step[] = [
  { key: "confirmed", label: "Order Confirmed", who: "Workshop", wait: false },
  { key: "pos", label: "POs Sent", who: "Workshop", wait: false },
  { key: "timber", label: "Timber Pulled", who: "Workshop", wait: false },
  { key: "matWait", label: "Materials Wait", who: null, wait: true, waitLabel: "~2 weeks" },
  { key: "received", label: "Materials Received", who: "Workshop", wait: false },
  { key: "stress", label: "Stress Cuts", who: "Workshop", wait: false },
  { key: "sand", label: "Sand", who: "Workshop", wait: false },
  { key: "coat1", label: "1st Coat", who: "Workshop", wait: false },
  { key: "coat2", label: "2nd Coat", who: "Workshop", wait: false },
  { key: "cure", label: "Curing", who: null, wait: true, waitLabel: "~1 week" },
  { key: "qc", label: "QC + Photos", who: "Workshop", wait: false },
  { key: "assemble", label: "Assemble / Box", who: "Workshop", wait: false },
  { key: "freight", label: "Book Freight", who: "Workshop", wait: false },
];
const PANEL_STEPS: Step[] = [
  { key: "confirmed", label: "Order Confirmed", who: "Workshop", wait: false },
  { key: "pos", label: "POs Sent", who: "Workshop", wait: false },
  { key: "matWait", label: "Materials Wait", who: null, wait: true, waitLabel: "~2 weeks" },
  { key: "received", label: "Materials Received", who: "Workshop", wait: false },
  { key: "cut", label: "CNC / Cut", who: "Workshop", wait: false },
  { key: "sand", label: "Sand", who: "Workshop", wait: false },
  { key: "coat1", label: "1st Coat", who: "Workshop", wait: false },
  { key: "coat2", label: "2nd Coat", who: "Workshop", wait: false },
  { key: "cure", label: "Curing", who: null, wait: true, waitLabel: "~1 week" },
  { key: "qc", label: "QC", who: "Workshop", wait: false },
  { key: "wrap", label: "Wrap + Dispatch", who: "Workshop", wait: false },
];
const STEPS_BY_KEY: Record<NonNullable<UiOrder["stepsKey"]>, Step[]> = {
  TABLE_STEPS,
  PANEL_STEPS,
};
type CapacityByLane = Partial<Record<string, LaneCapacitySummary>>;
const laneCapacityKey = (day: DayKey, person: Person): `${DayKey}:${Person}` => `${day}:${person}`;
const dateCapacityKey = (dateIso: string, person: Person) => `${dateIso}:${person}`;
type SuggestedDateOption = {
  dateIso: string;
  dateLabel: string;
  day: DayKey;
  weekId: string;
  weekTitle: string;
};

type OrderHealthLevel = "onTrack" | "watch" | "blocked";
type PlanTaskPlacement = {
  mode: "start" | "end" | "before" | "after";
  anchorTaskId?: string;
};
type PlanTaskLinkValue = number | { orderId: number; placement?: PlanTaskPlacement };
type WorkshopTask = {
  id: string;
  rowId: string;
  rowName: string;
  weekTitle: string;
  day: DayKey;
  person: Person;
  text: string;
  notes: string | null;
  sourceRowUrl: string;
  placement?: PlanTaskPlacement;
  assignedViaTuesday?: boolean;
};
type OrderPhoto = { url: string; pathname: string; uploadedAt?: string; size?: number };
type Carrier = "" | "Pinpoint" | "Mainfreight" | "Customer";
type WorkshopPerson = "" | "Nick" | "Dylan" | "Guido" | "Other";
type WorkflowTask = {
  id: string;
  title: string;
  owner: WorkshopPerson;
  scheduledDate: string;
  done: boolean;
  completedAt: string | null;
  completedBy: WorkshopPerson;
  notes: string;
};
type AppPlanTask = {
  id: string;
  orderId: number;
  title: string;
  scheduledDate: string;
  day: DayKey;
  person: Person;
  done: boolean;
};
type PlanTaskLinks = Record<string, PlanTaskLinkValue>;
type PlanTaskEditValue = { text?: string; rowName?: string; weekId?: string; day?: DayKey; person?: Person; estimatedHours?: number; sortOrder?: number; internal?: boolean; done?: boolean; updatedAt?: string };
type PlanTaskEdits = Record<string, PlanTaskEditValue>;
type PlanRowOrders = Record<string, string[]>;
type OrderOverrideValue = { status: "completed"; reason?: string; note?: string; updatedAt?: string; updatedBy?: string };
type OrderOverrides = Record<string, OrderOverrideValue>;
type PlanTaskLinkStatePayload = { links?: PlanTaskLinks; taskEdits?: PlanTaskEdits; orderRowOrders?: PlanRowOrders; orderOverrides?: OrderOverrides; updatedAt?: string };
type AssignablePlanTask = DraggablePlanTask & { weekTitle: string };
type ProductionPlanMode = "schedule" | "orderRows";
type PersonFilter = "all" | Person;
type RailFilter = "all" | "onTrack" | "watch" | "blocked" | "thisWeek" | "nextWeek" | "materials" | "noDate";
type RailSort = "soonest" | "latest" | "customer";
type OrderWorkflowState = {
  orderId: number;
  xeroInvoiceNumber?: string | null;
  repairNotes?: string | null;
  collection: {
    status: "open" | "booked" | "collected";
    bookedDay: string;
    bookedTime: string;
    by: Carrier;
    collectedAt: string | null;
  };
  qc: Record<string, { done: boolean; completedAt: string | null; completedBy: WorkshopPerson }>;
  tasks: WorkflowTask[];
  updatedAt: string;
};

function weekBoundaries() {
  const now = new Date();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(now);
  thisMon.setHours(0, 0, 0, 0);
  thisMon.setDate(thisMon.getDate() + monOffset);
  const nextMon = new Date(thisMon);
  nextMon.setDate(nextMon.getDate() + 7);
  const twoMon = new Date(thisMon);
  twoMon.setDate(twoMon.getDate() + 14);
  return { thisMon, nextMon, twoMon };
}

function currentDayKey(date = new Date()): DayKey | null {
  const day = date.getDay();
  if (day < 1 || day > 5) return null;
  return DAYS[day - 1] ?? null;
}

function orderDueThisWeek(order: UiOrder) {
  if (!order.shipDate) return false;
  const { thisMon, nextMon } = weekBoundaries();
  const due = new Date(order.shipDate);
  return due >= thisMon && due < nextMon;
}

function orderDueNextWeek(order: UiOrder) {
  if (!order.shipDate) return false;
  const { nextMon, twoMon } = weekBoundaries();
  const due = new Date(order.shipDate);
  return due >= nextMon && due < twoMon;
}

function orderDaysUntil(date: string | null) {
  if (!date) return null;
  const due = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function orderProgressPct(order: UiOrder) {
  const stepCount = order.stepsKey === "PANEL_STEPS" ? 11 : order.stepsKey === "TABLE_STEPS" ? 13 : 0;
  if (!stepCount) return 0;
  return Math.min(100, Math.round((order.currentStep / Math.max(1, stepCount - 1)) * 100));
}

function stepsForOrder(order: UiOrder) {
  return order.stepsKey ? STEPS_BY_KEY[order.stepsKey] ?? [] : [];
}

function pushUniqueJobTaskOption(options: JobTaskOption[], option: JobTaskOption) {
  if (options.some((current) => current.label === option.label)) return;
  options.push(option);
}

function productionTaskLabelForStep(step: Step, order: UiOrder): string | null {
  switch (step.key) {
    case "confirmed":
      return "Material + spec check";
    case "pos":
      return "POs sent";
    case "timber":
      return "Timber pulled";
    case "received":
      return "Materials received";
    case "stress":
      return "Stress cuts";
    case "cut":
      return order.stepsKey === "PANEL_STEPS" ? "CNC / cut" : "Cut / machine / prep";
    case "sand":
    case "coat1":
      return "Sand and coat";
    case "coat2":
      return "Second coat";
    case "cure":
      return "Curing";
    case "qc":
      return "QC + photos";
    case "assemble":
      return "Assemble / box";
    case "wrap":
      return "Pack / wrap";
    case "freight":
      return "Book freight";
    default:
      return null;
  }
}

function suggestedJobTaskLabelForStep(step: Step, order: UiOrder): string | null {
  if (step.key === "matWait") return "Materials received";
  if (step.key === "cure") return "QC + photos";
  return productionTaskLabelForStep(step, order);
}

function jobTaskOptionsForOrder(order: UiOrder): JobTaskOption[] {
  const options: JobTaskOption[] = [];
  if (order.rawMondayTopPanel === "Repair") {
    pushUniqueJobTaskOption(options, { label: "Repair", group: "production", stepKey: "repair" });
  }
  for (const step of stepsForOrder(order)) {
    const label = productionTaskLabelForStep(step, order);
    if (label) pushUniqueJobTaskOption(options, { label, group: "production", stepKey: step.key });
    if (order.stepsKey === "TABLE_STEPS" && step.key === "stress") {
      pushUniqueJobTaskOption(options, { label: "Cut / machine / prep", group: "production", stepKey: "cut-prep" });
    }
    if (step.key === "coat2") {
      pushUniqueJobTaskOption(options, { label: "3rd coat (clear final)", group: "production", stepKey: "final-clear" });
      pushUniqueJobTaskOption(options, { label: "4th coat (blackwash final)", group: "production", stepKey: "final-blackwash" });
    }
  }
  for (const label of SUPPORT_JOB_TASK_PRESETS) {
    pushUniqueJobTaskOption(options, { label, group: "support" });
  }
  if (options.length === 0) {
    for (const label of JOB_TASK_PRESETS) pushUniqueJobTaskOption(options, { label, group: "support" });
  }
  return options;
}

function currentProductionStepForOrder(order: UiOrder) {
  const steps = stepsForOrder(order);
  if (steps.length === 0) return null;
  return steps[Math.max(0, Math.min(order.currentStep, steps.length - 1))] ?? null;
}

function defaultJobTaskActionForOrder(order: UiOrder, options: JobTaskOption[]) {
  if (order.rawMondayTopPanel === "Repair" && options.some((option) => option.label === "Repair")) return "Repair";
  const activeStep = currentProductionStepForOrder(order);
  const preferred = activeStep ? suggestedJobTaskLabelForStep(activeStep, order) : null;
  if (preferred && options.some((option) => option.label === preferred)) return preferred;
  return options[0]?.label ?? JOB_TASK_PRESETS[0];
}

function isCompleteOrder(order: UiOrder) {
  return ["Collected", "Finished", "Shipped"].includes(order.status);
}

function orderHealth(order: UiOrder): OrderHealthLevel {
  const diff = orderDaysUntil(order.shipDate);
  const pct = orderProgressPct(order);
  if (!order.shipDate) return "watch";
  if (diff !== null && diff < 0) return "blocked";
  if (diff === 0 && !isCompleteOrder(order)) return "blocked";
  if (order.rawMondayStatus === "Materials Ordered" && diff !== null && diff <= 7) return "blocked";
  if (order.rawMondayStatus === "Materials Ordered") return "watch";
  if (order.rawMondayStatus === "To Process" && diff !== null && diff <= 14) return "watch";
  if (diff !== null && diff <= 7 && pct < 60) return "watch";
  if (diff !== null && diff <= 14 && pct < 30) return "watch";
  return "onTrack";
}

function orderHealthReason(order: UiOrder) {
  const diff = orderDaysUntil(order.shipDate);
  const pct = orderProgressPct(order);
  if (!order.shipDate) return "No due date";
  if (diff !== null && diff < 0) return "Past due";
  if (diff === 0 && !isCompleteOrder(order)) return "Due today: needs truth check";
  if (order.rawMondayStatus === "Materials Ordered" && diff !== null && diff <= 7) return "Materials not ready and due soon";
  if (order.rawMondayStatus === "Materials Ordered") return "Waiting on materials";
  if (order.rawMondayStatus === "To Process" && diff !== null && diff <= 14) return "Not started inside 2 weeks";
  if (diff !== null && diff <= 7 && pct < 60) return "Due soon for current progress";
  if (diff !== null && diff <= 14 && pct < 30) return "Low progress for next fortnight";
  return "No schedule flags";
}

function OrderHealthStrip({
  orders,
  activeFilter,
  onFilterChange,
}: {
  orders: UiOrder[];
  activeFilter: RailFilter;
  onFilterChange: (filter: RailFilter) => void;
}) {
  const active = orders.filter((order) => !isCompleteOrder(order));
  const { thisMon, nextMon, twoMon } = weekBoundaries();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueThis = active.filter((order) => order.shipDate && new Date(order.shipDate) >= thisMon && new Date(order.shipDate) < nextMon).length;
  const dueNext = active.filter((order) => order.shipDate && new Date(order.shipDate) >= nextMon && new Date(order.shipDate) < twoMon).length;
  const overdue = active.filter((order) => order.shipDate && new Date(order.shipDate) < today).length;
  const blocked = active.filter((order) => orderHealth(order) === "blocked").length;
  const watch = active.filter((order) => orderHealth(order) === "watch").length;
  const onTrack = active.filter((order) => orderHealth(order) === "onTrack").length;
  const cards: Array<{ label: string; value: number; color: string; filter: RailFilter }> = [
    { label: "Active Orders", value: active.length, color: DT.textPrimary, filter: "all" },
    { label: "On Track", value: onTrack, color: "#15803d", filter: "onTrack" },
    { label: "Watch", value: watch, color: "#b45309", filter: "watch" },
    { label: "Blocked", value: blocked || overdue, color: blocked || overdue ? "#991b1b" : "#15803d", filter: "blocked" },
    { label: "Due This Week", value: dueThis, color: DT.textPrimary, filter: "thisWeek" },
    { label: "Due Next Week", value: dueNext, color: DT.textPrimary, filter: "nextWeek" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "stretch", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
      {cards.map((card) => {
        const selected = activeFilter === card.filter;
        return (
        <button
          type="button"
          key={card.label}
          aria-pressed={selected}
          onClick={() => onFilterChange(selected ? "all" : card.filter)}
          style={{ flex: "1 1 88px", minWidth: 88, padding: "7px 9px", background: selected ? DT.tealSoft : "rgba(255,255,255,0.72)", borderRadius: 9, border: `1px solid ${selected ? "rgba(12,124,122,0.28)" : DT.border}`, boxShadow: selected ? "0 0 0 2px rgba(12,124,122,0.06)" : "0 1px 4px rgba(0,0,0,0.025)", cursor: "pointer", textAlign: "left" }}
        >
          <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: card.color, fontFamily: DT.serif, marginTop: 1, lineHeight: 1 }}>{card.value}</div>
        </button>
      );})}
    </div>
  );
}

const HEALTH_META: Record<OrderHealthLevel, { label: string; color: string; bg: string; border: string }> = {
  onTrack: { label: "On track", color: "#15803d", bg: "rgba(21,128,61,0.08)", border: "rgba(21,128,61,0.20)" },
  watch: { label: "Watch", color: "#b45309", bg: "rgba(180,83,9,0.09)", border: "rgba(180,83,9,0.22)" },
  blocked: { label: "Blocked", color: "#991b1b", bg: "rgba(153,27,27,0.09)", border: "rgba(153,27,27,0.24)" },
};

function formatShortDate(date: string | null) {
  if (!date) return "No due date";
  return new Date(date).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function formatRailDueDate(order: UiOrder) {
  return order.shipDate ? formatShortDate(order.shipDate) : "No date";
}

function formatCurrencyShort(value: number | null) {
  if (value == null) return "No value";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function dueLabel(order: UiOrder) {
  const diff = orderDaysUntil(order.shipDate);
  if (diff == null) return "No due date";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `${diff}d until due`;
}

function orderItemLabel(order: UiOrder) {
  return order.rawMondayItem || order.product || "Order";
}

function orderStatusLabel(order: UiOrder) {
  return order.rawMondayStatus || order.status;
}

function nextOrderPrompt(order: UiOrder) {
  const health = orderHealth(order);
  if (health === "blocked" || health === "watch") return orderHealthReason(order);
  return "No urgent attention flagged.";
}

function addWorkingDays(date: string | null, days: number) {
  if (!date) return null;
  const result = new Date(`${date}T12:00:00`);
  const step = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

function formatLongDate(date: Date | null) {
  if (!date) return "Needs due date";
  return date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

function deliveryMode(order: UiOrder) {
  const text = `${order.freightRef ?? ""} ${order.deliveryLocation ?? ""}`.toLowerCase();
  if (text.includes("mainfreight") || text.includes("freight")) {
    return { label: "Flat-packed", detail: "Mainfreight delivery", workingDays: 2 };
  }
  if (text.includes("pinpoint") || text.includes("christchurch") || text.includes("local")) {
    return { label: "Assembled", detail: "Local / Pinpoint delivery", workingDays: 1 };
  }
  return { label: "Confirm pack mode", detail: "No delivery method captured yet", workingDays: 2 };
}

function normalizeOrderText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function planRowMatchesOrder(row: PlanRow, order: UiOrder | null) {
  if (!order) return false;
  if (row.linkedOrders.some((linked) => Number(linked.mondayItemId) === order.id)) return true;
  const rowName = normalizeOrderText(row.name);
  const customer = normalizeOrderText(order.customer);
  if (!rowName || !customer) return false;
  return customer.includes(rowName) || rowName.includes(customer);
}

function planTaskMatchesOrder(task: DraggablePlanTask, order: UiOrder | null) {
  if (!order) return false;
  if (task.linkedOrderIds.includes(order.id)) return true;
  const rowName = normalizeOrderText(task.rowName);
  const customer = normalizeOrderText(order.customer);
  if (rowName && customer && (customer.includes(rowName) || rowName.includes(customer))) return true;
  return task.linkedOrders.some((linked) => orderNameMatchScore(order, linked.name, task.rowName) >= 2);
}

function orderIdFromPlanTaskLink(value: PlanTaskLinkValue | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && typeof value.orderId === "number" && Number.isFinite(value.orderId)) return value.orderId;
  return null;
}

function placementFromPlanTaskLink(value: PlanTaskLinkValue | undefined) {
  return value && typeof value === "object" ? value.placement : undefined;
}

function stablePlanTaskKey(task: Pick<DraggablePlanTask, "rowId" | "text" | "taskKey">) {
  return task.taskKey ?? planTaskLinkKey(task);
}

function linkValueForPlanTask(task: Pick<DraggablePlanTask, "id" | "rowId" | "text" | "taskKey">, links: PlanTaskLinks) {
  return links[stablePlanTaskKey(task)] ?? links[task.id];
}

function assignedOrderIdForTask(task: Pick<DraggablePlanTask, "id" | "rowId" | "text" | "taskKey">, links: PlanTaskLinks) {
  return orderIdFromPlanTaskLink(linkValueForPlanTask(task, links));
}

function cleanTaskEstimatedHours(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.round(parsed * 2) / 2);
}

function formatTaskHours(value: unknown) {
  return `${cleanTaskEstimatedHours(value)}h`;
}

function placementForTask(task: Pick<DraggablePlanTask, "id" | "rowId" | "text">, links: PlanTaskLinks) {
  return placementFromPlanTaskLink(linkValueForPlanTask(task, links));
}

function linkValueForPlanTaskSave(orderId: number, placement?: PlanTaskPlacement): PlanTaskLinkValue {
  return placement ? { orderId, placement } : orderId;
}

function effectiveTaskOrderIds(task: DraggablePlanTask, links: PlanTaskLinks) {
  const assigned = assignedOrderIdForTask(task, links);
  return assigned ? [assigned] : task.linkedOrderIds;
}

const LINK_MATCH_STOP_WORDS = new Set([
  "invoice",
  "inv",
  "from",
  "innate",
  "furniture",
  "limited",
  "ltd",
  "deposit",
  "order",
  "placed",
  "paid",
  "for",
  "the",
  "and",
]);

function matchTokens(value: string | null | undefined) {
  return normalizeOrderText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !LINK_MATCH_STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function orderNameMatchScore(order: UiOrder, ...candidates: Array<string | null | undefined>) {
  const customer = normalizeOrderText(order.customer);
  const customerTokens = new Set(matchTokens(order.customer));
  let best = 0;
  for (const candidate of candidates) {
    const normalized = normalizeOrderText(candidate);
    if (!normalized) continue;
    if (customer && (normalized.includes(customer) || customer.includes(normalized))) best = Math.max(best, 5);
    const tokens = matchTokens(candidate);
    const matches = tokens.filter((token) => customerTokens.has(token)).length;
    if (matches > 0) best = Math.max(best, matches);
  }
  return best;
}

function friendlyWorkshopTaskText(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  const normalized = compact.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return compact;
  if (/^snad( and)? coat$/.test(normalized) || /^sand coat$/.test(normalized) || /^sand and coat$/.test(normalized)) return "Sand and coat";
  if (/^wrap( check packing)?$/.test(normalized) || /^wrap packing$/.test(normalized)) return "Wrap / check packing";
  if (/^qc photos?$/.test(normalized) || /^final qc photos?$/.test(normalized)) return "QC + photos";
  if (/^book freight$/.test(normalized)) return "Book freight";
  if (/^customer update$/.test(normalized)) return "Customer update";
  return compact;
}

function taskCustomerDisplayName(task: Pick<DraggablePlanTask, "rowName">) {
  const compact = task.rowName.replace(/\s+/g, " ").trim();
  if (!compact) return "Customer / order";
  if (/^no customer\s*\/?\s*internal$/i.test(compact)) return "Internal";
  return compact;
}

function orderWorkshopTasksByPlacement(tasks: WorkshopTask[]) {
  const placedIds = new Set(tasks.filter((task) => task.placement).map((task) => task.id));
  const ordered = tasks.filter((task) => !placedIds.has(task.id));
  const placed = tasks.filter((task) => task.placement);

  for (const task of placed.filter((item) => item.placement?.mode === "start").reverse()) {
    ordered.unshift(task);
  }
  for (const task of placed.filter((item) => item.placement?.mode === "before" || item.placement?.mode === "after")) {
    const anchorId = task.placement?.anchorTaskId;
    const anchorIndex = anchorId ? ordered.findIndex((item) => item.id === anchorId) : -1;
    if (anchorIndex === -1) {
      ordered.push(task);
      continue;
    }
    ordered.splice(task.placement?.mode === "before" ? anchorIndex : anchorIndex + 1, 0, task);
  }
  for (const task of placed.filter((item) => item.placement?.mode === "end")) {
    ordered.push(task);
  }
  return ordered;
}

function planTasksForOrder(weeks: PlanWeek[], order: UiOrder | null, links: PlanTaskLinks = {}): WorkshopTask[] {
  if (!order) return [];
  const tasks = weeks.flatMap((week) =>
    week.rows.flatMap((row) =>
      DAYS.flatMap((day) =>
        PEOPLE.flatMap((person) => {
          const text = row.dayTasks[day][person];
          if (!text) return [];
          const task: WorkshopTask = {
            id: `${row.id}:${day}:${person}`,
            rowId: row.id,
            rowName: row.name,
            weekTitle: displayWeekTitle(week.title),
            day,
            person,
            text,
            notes: row.notes,
            sourceRowUrl: row.mondayUrl,
          };
          const assignedOrderId = assignedOrderIdForTask(task, links);
          const matchesOrder = planRowMatchesOrder(row, order);
          if (!matchesOrder && assignedOrderId !== order.id) return [];
          return [{
            ...task,
            placement: placementForTask(task, links),
            assignedViaTuesday: assignedOrderId === order.id && !matchesOrder,
          }];
        })
      )
    )
  );
  return orderWorkshopTasksByPlacement(tasks);
}

function defaultWorkflowState(orderId: number): OrderWorkflowState {
  return {
    orderId,
    xeroInvoiceNumber: null,
    repairNotes: null,
    collection: {
      status: "open",
      bookedDay: "",
      bookedTime: "",
      by: "",
      collectedAt: null,
    },
    qc: {},
    tasks: [],
    updatedAt: new Date().toISOString(),
  };
}

function useOrderWorkflow(order: UiOrder, onWorkflowChange?: (workflow: OrderWorkflowState | null) => void) {
  const realtimeInstanceId = useId();
  const [workflow, setWorkflow] = useState<OrderWorkflowState>(() => defaultWorkflowState(order.id));
  const [workflowStatus, setWorkflowStatus] = useState("");
  const saveInFlightRef = useRef(false);
  const pendingWorkflowRef = useRef<OrderWorkflowState | null>(null);
  const saveRequestIdRef = useRef(0);

  const loadWorkflow = useCallback((statusPrefix = "") => {
    let active = true;
    fetch(`/api/production/order-workflow?orderId=${order.id}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Workflow unavailable")))
      .then((data: { state?: OrderWorkflowState; disabledReason?: string }) => {
        if (!active) return;
        const next = data.state ?? defaultWorkflowState(order.id);
        setWorkflow(next);
        onWorkflowChange?.(next);
        setWorkflowStatus(data.disabledReason ?? statusPrefix);
      })
      .catch((err) => {
        if (active) setWorkflowStatus(err instanceof Error ? err.message : "Workflow unavailable");
      });
    return () => {
      active = false;
    };
  }, [order.id, onWorkflowChange]);

  useEffect(() => {
    const cancelLoad = loadWorkflow();
    return () => {
      cancelLoad();
      onWorkflowChange?.(null);
    };
  }, [loadWorkflow, onWorkflowChange]);

  const handleRealtimeWorkflowChange = useCallback(() => {
    loadWorkflow("Updated from workshop");
  }, [loadWorkflow]);

  useRealtimeRefresh({
    channelName: `production-order-workflow:${order.id}:${realtimeInstanceId}`,
    table: "production_order_workflows",
    filter: `order_id=eq.${order.id}`,
    refreshOnChange: false,
    onChange: handleRealtimeWorkflowChange,
  });

  function sendWorkflow(next: OrderWorkflowState) {
    saveInFlightRef.current = true;
    const requestId = ++saveRequestIdRef.current;
    fetch("/api/production/order-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: next }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Save failed"))))
      .then((data: { state?: OrderWorkflowState }) => {
        if (pendingWorkflowRef.current || requestId !== saveRequestIdRef.current) return;
        if (data.state) {
          setWorkflow(data.state);
          onWorkflowChange?.(data.state);
        }
        setWorkflowStatus("Saved");
      })
      .catch((err) => {
        if (pendingWorkflowRef.current || requestId !== saveRequestIdRef.current) return;
        setWorkflowStatus(err instanceof Error ? `${err.message} - reloading saved state` : "Save failed - reloading saved state");
        loadWorkflow("Reloaded saved state");
      })
      .finally(() => {
        if (requestId !== saveRequestIdRef.current && !pendingWorkflowRef.current) return;
        saveInFlightRef.current = false;
        const pending = pendingWorkflowRef.current;
        if (pending) {
          pendingWorkflowRef.current = null;
          setWorkflowStatus("Saving latest...");
          sendWorkflow(pending);
        }
      });
  }

  function saveWorkflow(next: OrderWorkflowState) {
    setWorkflow(next);
    onWorkflowChange?.(next);
    if (saveInFlightRef.current) {
      pendingWorkflowRef.current = next;
      setWorkflowStatus("Saving latest...");
      return;
    }
    setWorkflowStatus("Saving...");
    sendWorkflow(next);
  }

  function updateWorkflow(patch: (state: OrderWorkflowState) => OrderWorkflowState) {
    saveWorkflow(patch(workflow));
  }

  return { workflow, workflowStatus, updateWorkflow };
}

function dispatchQcItems(order: UiOrder) {
  const isSample = order.rawMondayItem === "Sample";
  const invoiceExpectation = invoiceExpectationForOrder(order);
  if (isSample) {
    return [
      "Correct species",
      "Correct finish",
      "Engraving / label matches",
      "Clean customer-ready sample",
      "Species card + business card included",
      "Photo before packaging",
      "Photo after packaging",
      "Follow-up date set",
    ];
  }
  return [
    "Final QC complete",
    "Final photos uploaded",
    "Freight / collection confirmed",
    "Customer update needed?",
    ...(invoiceExpectation.requiresInvoice ? ["Xero link present"] : []),
  ];
}

function formatCompletedAt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function workflowOwnerToPerson(owner: WorkshopPerson): Person | null {
  if (owner === "Nick") return "nick";
  if (owner === "Dylan") return "dylan";
  return null;
}

function dateToDayKey(value: string): DayKey | null {
  if (!value) return null;
  const day = new Date(`${value}T12:00:00`).getDay();
  if (day === 1) return "monday";
  if (day === 2) return "tuesday";
  if (day === 3) return "wednesday";
  if (day === 4) return "thursday";
  if (day === 5) return "friday";
  return null;
}

function workflowTasksForPlan(workflow: OrderWorkflowState | null): AppPlanTask[] {
  if (!workflow) return [];
  return workflow.tasks.flatMap((task) => {
    const person = workflowOwnerToPerson(task.owner);
    const day = dateToDayKey(task.scheduledDate);
    if (!person || !day || !task.title.trim()) return [];
    return [{
      id: task.id,
      orderId: workflow.orderId,
      title: task.title,
      scheduledDate: task.scheduledDate,
      day,
      person,
      done: task.done,
    }];
  });
}

function appTaskFallsInWeek(task: AppPlanTask, week: PlanWeek) {
  const range = weekRangeFromTitle(week.title);
  if (!range) return false;
  const date = new Date(`${task.scheduledDate}T12:00:00`);
  return range.start.getTime() <= date.getTime() && date.getTime() <= range.end.getTime();
}

function OrderRail({
  orders,
  selectedOrder,
  selectedOrderTasks,
  assignmentTask,
  assignmentStatus,
  onAssignTask,
  onRemoveTaskLink,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onWorkflowChange,
  onSelect,
  onOpenOrder,
  onClear,
  filter,
  onFilterChange,
  isNarrow,
  canRemoveAssignmentLink,
  newOrderCard,
  tasksForOrder,
}: {
  orders: UiOrder[];
  selectedOrder: UiOrder | null;
  selectedOrderTasks: OrderJourneyTask[];
  assignmentTask: AssignablePlanTask | null;
  assignmentStatus: string;
  onAssignTask: (task: AssignablePlanTask, orderId: number, placement?: PlanTaskPlacement) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
  onPlanTaskEdit: (task: BoardPlanTask) => void;
  onPlanTaskDoneToggle: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onWorkflowChange: (workflow: OrderWorkflowState | null) => void;
  onSelect: (id: number) => void;
  onOpenOrder: (id: number) => void;
  onClear: () => void;
  filter: RailFilter;
  onFilterChange: (filter: RailFilter) => void;
  isNarrow: boolean;
  canRemoveAssignmentLink: boolean;
  newOrderCard?: ReactNode;
  tasksForOrder: (order: UiOrder) => WorkshopTask[];
}) {
  const activeOrders = useMemo(() => orders.filter((order) => !isCompleteOrder(order)), [orders]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<RailSort>("soonest");
  const filteredOrders = useMemo(() => {
    const normalizedQuery = normalizeOrderText(query);
    const filtered = activeOrders.filter((order) => {
      if (filter === "onTrack" && orderHealth(order) !== "onTrack") return false;
      if (filter === "watch" && orderHealth(order) !== "watch") return false;
      if (filter === "blocked" && orderHealth(order) !== "blocked") return false;
      if (filter === "thisWeek" && !orderDueThisWeek(order)) return false;
      if (filter === "nextWeek" && !orderDueNextWeek(order)) return false;
      if (filter === "materials" && order.rawMondayStatus !== "Materials Ordered") return false;
      if (filter === "noDate" && order.shipDate) return false;
      if (!normalizedQuery) return true;
      return normalizeOrderText(`${order.customer} ${orderItemLabel(order)} ${orderStatusLabel(order)} ${order.deliveryLocation ?? ""}`).includes(normalizedQuery);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "customer") return a.customer.localeCompare(b.customer);
      const aTime = a.shipDate ? new Date(a.shipDate).getTime() : null;
      const bTime = b.shipDate ? new Date(b.shipDate).getTime() : null;
      if (aTime === null && bTime === null) return a.customer.localeCompare(b.customer);
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return sort === "latest" ? bTime - aTime : aTime - bTime;
    });
  }, [activeOrders, filter, query, sort]);
  const filterOptions: Array<{ id: RailFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "blocked", label: "Blocked" },
    { id: "thisWeek", label: "This week" },
    { id: "materials", label: "Materials" },
    { id: "noDate", label: "No date" },
  ];
  const railWidth = 318;
  return (
    <aside
      aria-label="Active orders"
      data-order-rail="neutral-command-panel"
      style={{
        alignSelf: "start",
        position: "static",
        top: undefined,
        width: isNarrow ? "100%" : railWidth,
        minWidth: isNarrow ? undefined : railWidth,
        maxHeight: undefined,
        overflow: "visible",
        transition: "box-shadow 1000ms ease, border-color 1000ms ease",
        background: "rgba(255,255,255,0.84)",
        border: "1px solid " + DT.border,
        borderRadius: DT.radius,
        boxShadow: DT.shadow,
        backdropFilter: "blur(12px)",
      }}
    >
      <style>{`
        @keyframes orderRailIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        [data-order-rail="neutral-command-panel"] input:focus,
        [data-order-rail="neutral-command-panel"] select:focus,
        [data-order-rail="neutral-command-panel"] button:focus-visible {
          outline: 2px solid rgba(12,124,122,0.24);
          outline-offset: 2px;
        }
        @media (max-width: 1040px) {
          @keyframes orderRailIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
      <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${DT.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans }}>Orders</div>
          <div style={{ marginTop: 2, fontFamily: DT.serif, fontSize: 18, color: DT.textPrimary, lineHeight: 1 }}>{assignmentTask ? "Assign task" : selectedOrder ? "Job command" : `${filteredOrders.length} active`}</div>
        </div>
        {(selectedOrder || assignmentTask) && (
          <button
            type="button"
            onClick={onClear}
            style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "6px 9px", fontSize: 10, fontFamily: DT.sans, fontWeight: 900, cursor: "pointer" }}
          >
            Back to list
          </button>
        )}
      </div>
      {assignmentTask ? (
        <TaskAssignmentPanel key={`assign-${assignmentTask.id}`} task={assignmentTask} orders={activeOrders} status={assignmentStatus} onAssign={onAssignTask} onRemove={onRemoveTaskLink} canRemoveLink={canRemoveAssignmentLink} tasksForOrder={tasksForOrder} />
      ) : selectedOrder ? (
        <OrderRailDetail
          key={`detail-${selectedOrder.id}`}
          order={selectedOrder}
          planTasks={selectedOrderTasks}
          onWorkflowChange={onWorkflowChange}
          onOpen={() => onOpenOrder(selectedOrder.id)}
          onPlanTaskEdit={onPlanTaskEdit}
          onPlanTaskDoneToggle={onPlanTaskDoneToggle}
          onRemoveTaskLink={onRemoveTaskLink}
        />
      ) : (
        <div key="list" style={{ maxHeight: undefined, overflowY: "visible", padding: 10, animation: "orderRailIn 1000ms ease both" }}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr auto", gap: 6 }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders"
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${DT.border}`, borderRadius: 9, padding: "8px 9px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg, outline: "none" }}
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as RailSort)}
              aria-label="Sort orders"
              style={{ width: isNarrow ? "100%" : 112, border: `1px solid ${DT.border}`, borderRadius: 9, padding: "8px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textMuted, background: DT.cardBg, outline: "none" }}
            >
              <option value="soonest">Due soonest</option>
              <option value="latest">Due latest</option>
              <option value="customer">Customer A-Z</option>
            </select>
          </div>
          {newOrderCard}
          <div style={{ marginTop: newOrderCard ? 8 : 0, display: "flex", gap: 4, flexWrap: "nowrap", paddingBottom: 2 }}>
            {filterOptions.map((option) => {
              const active = filter === option.id;
              return (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => onFilterChange(option.id)}
                  style={{ flex: "1 1 0", minWidth: 0, border: `1px solid ${active ? "rgba(12,124,122,0.32)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.72)", color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: "5px 5px", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", textAlign: "center" }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: isNarrow ? "row" : "column", gap: 8, overflowX: isNarrow ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
            {filteredOrders.map((order) => (
              <OrderRailItem key={order.id} order={order} onSelect={onSelect} isNarrow={isNarrow} />
            ))}
            {filteredOrders.length === 0 && (
              <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35, padding: "8px 2px" }}>No active orders match that view.</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function OrderRailItem({ order, onSelect, isNarrow }: { order: UiOrder; onSelect: (id: number) => void; isNarrow: boolean }) {
  const healthLevel = orderHealth(order);
  const health = HEALTH_META[healthLevel];
  const reason = orderHealthReason(order);
  const showReason = healthLevel !== "onTrack" && !(reason === "No due date" && !order.shipDate);
  return (
    <button
      type="button"
      onClick={() => onSelect(order.id)}
      style={{
        flex: isNarrow ? "0 0 260px" : undefined,
        width: "100%",
        minWidth: 0,
        textAlign: "left",
        borderWidth: "1px 1px 1px 4px",
        borderStyle: "solid",
        borderColor: `${DT.border} ${DT.border} ${DT.border} ${health.color}`,
        background: DT.cardBg,
        borderRadius: 10,
        padding: "10px 10px 9px",
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.025)",
        transition: "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateX(-2px)";
        event.currentTarget.style.boxShadow = "0 8px 18px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "translateX(0)";
        event.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.025)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 13, fontWeight: 900, color: DT.textPrimary, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer}</div>
          <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orderItemLabel(order)} · {orderStatusLabel(order)}</div>
          {showReason && <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: health.color, fontWeight: 850, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reason}</div>}
        </div>
        <div style={{ flex: "0 0 auto", textAlign: "right" }}>
          <div style={{ fontFamily: DT.sans, fontSize: 11, fontWeight: 950, color: DT.textPrimary }}>{formatRailDueDate(order)}</div>
          <div style={{ marginTop: 4, display: "inline-flex", border: `1px solid ${health.border}`, background: health.bg, color: health.color, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{health.label}</div>
        </div>
      </div>
    </button>
  );
}

function NewOrderRailCard({
  order,
  showingInMonth,
  approved,
  onOpen,
  onOpenOrder,
  onToggleMonthTasks,
  onApprove,
  fullListOpen,
}: {
  order: NewOrderPlanCandidate | null;
  showingInMonth: boolean;
  approved: boolean;
  onOpen: () => void;
  onOpenOrder: () => void;
  onToggleMonthTasks: () => void;
  onApprove: () => void;
  fullListOpen: boolean;
}) {
  if (!order) return null;
  const reviewActive = showingInMonth || approved;
  const activeAccent = newOrderPalette.clayAccentDark;
  const actionButtonStyle = {
    border: `1px solid ${reviewActive ? newOrderPalette.clayBorderStrong : newOrderPalette.clayBorder}`,
    background: reviewActive ? "rgba(255,255,255,0.84)" : "rgba(255,255,255,0.68)",
    color: activeAccent,
    borderRadius: 999,
    padding: "7px 8px",
    fontFamily: DT.sans,
    fontSize: 10,
    fontWeight: 950,
    cursor: "pointer",
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenOrder}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenOrder();
        }
      }}
      style={{ marginBottom: 8, borderWidth: "1px 1px 1px 5px", borderStyle: "solid", borderColor: `${reviewActive ? newOrderPalette.clayBorderStrong : newOrderPalette.clayBorder} ${reviewActive ? newOrderPalette.clayBorderStrong : newOrderPalette.clayBorder} ${reviewActive ? newOrderPalette.clayBorderStrong : newOrderPalette.clayBorder} ${newOrderPalette.clayStripe}`, background: newOrderPalette.clayPanel, borderRadius: 10, padding: "9px 10px", boxShadow: reviewActive ? "0 8px 18px rgba(85,113,95,0.10)" : "0 1px 4px rgba(154,82,49,0.06)", cursor: "pointer", outline: "none" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: newOrderPalette.clayAccent }}>New order</div>
          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 12, fontWeight: 950, color: DT.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer}</div>
          <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 10, fontWeight: 800, color: DT.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.product || "Order"} · Ordered {formatOrderedDate(order.orderedDate)}</div>
        </div>
        {reviewActive && <span style={{ flex: "0 0 auto", border: `1px solid ${newOrderPalette.clayBorderStrong}`, color: activeAccent, background: "rgba(255,255,255,0.72)", borderRadius: 999, padding: "3px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{approved ? "Approved" : "Tasks shown"}</span>}
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleMonthTasks(); }} style={actionButtonStyle}>
          {showingInMonth ? "Hide tasks" : "Show tasks"}
        </button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} style={actionButtonStyle}>
          {fullListOpen ? "Close full task list" : "Open full task list"}
        </button>
      </div>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onApprove(); }}
        style={{ marginTop: 6, width: "100%", border: `1px solid ${newOrderPalette.clayBorderStrong}`, background: approved ? "rgba(255,255,255,0.68)" : newOrderPalette.clayAccent, color: approved ? activeAccent : "#fff", borderRadius: 999, padding: "7px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer", boxShadow: reviewActive && !approved ? "0 8px 18px rgba(85,113,95,0.12)" : undefined }}
      >
        {approved ? "Draft approved" : "Approve draft plan"}
      </button>
    </div>
  );
}

function TaskAssignmentPanel({
  task,
  orders,
  status,
  onAssign,
  onRemove,
  canRemoveLink,
  tasksForOrder,
}: {
  task: AssignablePlanTask;
  orders: UiOrder[];
  status: string;
  onAssign: (task: AssignablePlanTask, orderId: number, placement?: PlanTaskPlacement) => void;
  onRemove: (task: AssignablePlanTask) => void;
  canRemoveLink: boolean;
  tasksForOrder: (order: UiOrder) => WorkshopTask[];
}) {
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [placementMode, setPlacementMode] = useState<PlanTaskPlacement["mode"]>("end");
  const [anchorTaskId, setAnchorTaskId] = useState("");
  const normalizedQuery = normalizeOrderText(query);
  const filteredOrders = useMemo(() => {
    if (!normalizedQuery) return orders.slice(0, 18);
    return orders
      .filter((order) => normalizeOrderText(`${order.customer} ${orderItemLabel(order)} ${orderStatusLabel(order)} ${order.deliveryLocation ?? ""}`).includes(normalizedQuery))
      .slice(0, 18);
  }, [orders, normalizedQuery]);
  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const selectedOrderTasks = useMemo(() => selectedOrder ? tasksForOrder(selectedOrder) : [], [selectedOrder, tasksForOrder]);
  const needsAnchor = placementMode === "before" || placementMode === "after";

  function chooseOrder(order: UiOrder) {
    setSelectedOrderId(order.id);
    setQuery(order.customer);
    const existingTasks = tasksForOrder(order);
    if (existingTasks.length > 0) {
      setPlacementMode("after");
      setAnchorTaskId(existingTasks[existingTasks.length - 1]?.id ?? "");
    } else {
      setPlacementMode("end");
      setAnchorTaskId("");
    }
  }

  function assignHere(mode = placementMode, anchorId = anchorTaskId) {
    if (!selectedOrder) return;
    const placement: PlanTaskPlacement = mode === "before" || mode === "after"
      ? { mode, anchorTaskId: anchorId || selectedOrderTasks[0]?.id }
      : { mode };
    if ((placement.mode === "before" || placement.mode === "after") && !placement.anchorTaskId) return;
    onAssign(task, selectedOrder.id, placement);
  }

  function placementText() {
    if (placementMode === "start") return "Start of job";
    if (placementMode === "end") return "End of job";
    const anchor = selectedOrderTasks.find((existingTask) => existingTask.id === anchorTaskId);
    return `${placementMode === "before" ? "Before" : "After"} ${anchor?.text ?? "selected task"}`;
  }

  return (
    <div style={{ padding: 10, animation: "orderRailIn 1000ms ease both" }}>
      <div style={{ border: "1px dashed rgba(125,122,115,0.28)", background: "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(232,230,224,0.55))", borderRadius: 10, padding: 10 }}>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7d7a73" }}>Assign this task to a job</div>
        <h3 style={{ margin: "5px 0 0", fontFamily: DT.serif, fontSize: 18, lineHeight: 1.1, color: DT.textPrimary }}>{task.text}</h3>
        <div style={{ marginTop: 6, fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>
          {task.weekTitle} · {DAY_LABELS[task.day]} · {PERSON_LABELS[task.person]}
        </div>
        <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, color: DT.textFaint, lineHeight: 1.35, overflowWrap: "anywhere" }}>{task.rowName}</div>
      </div>
      <div style={{ marginTop: 9, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", borderRadius: 10, padding: 9 }}>
        <label style={{ display: "block", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>
          Assign to order
        </label>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedOrderId(null);
          }}
          placeholder="Search customer, item, or address"
          style={{ marginTop: 7, width: "100%", boxSizing: "border-box", border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg, outline: "none" }}
        />
        {status && <div style={{ marginTop: 6, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 850 }}>{status}</div>}
        {canRemoveLink && (
          <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onRemove(task)}
              style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.74)", color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 900, cursor: "pointer" }}
            >
              Remove Tuesday link
            </button>
          </div>
        )}
        {selectedOrder && (
          <div style={{ marginTop: 8, border: `1px solid rgba(12,124,122,0.18)`, background: "rgba(12,124,122,0.05)", borderRadius: 10, padding: 9, boxShadow: "0 5px 16px rgba(12,124,122,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.teal }}>Selected order</div>
                <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 13, fontWeight: 950, color: DT.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedOrder.customer}</div>
                <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 10, fontWeight: 800, color: DT.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orderItemLabel(selectedOrder)} · Due {formatShortDate(selectedOrder.shipDate)}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                style={{ flex: "0 0 auto", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", color: DT.textMuted, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, cursor: "pointer" }}
              >
                Change
              </button>
            </div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {(["start", "end", "before", "after"] as Array<PlanTaskPlacement["mode"]>).map((mode) => {
                const disabled = (mode === "before" || mode === "after") && selectedOrderTasks.length === 0;
                const active = placementMode === mode;
                return (
                  <button
                    type="button"
                    key={mode}
                    disabled={disabled}
                    onClick={() => {
                      setPlacementMode(mode);
                      if ((mode === "before" || mode === "after") && !anchorTaskId) setAnchorTaskId(selectedOrderTasks[0]?.id ?? "");
                    }}
                    style={{ border: `1px solid ${active ? "rgba(12,124,122,0.24)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.72)", color: disabled ? DT.textFaint : active ? DT.teal : DT.textMuted, borderRadius: 999, padding: "6px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
                  >
                    {mode === "start" ? "At start" : mode === "end" ? "At end" : mode === "before" ? "Before task" : "After task"}
                  </button>
                );
              })}
            </div>
            {needsAnchor && selectedOrderTasks.length > 0 && (
              <select
                value={anchorTaskId}
                onChange={(event) => setAnchorTaskId(event.target.value)}
                style={{ marginTop: 7, width: "100%", border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
              >
                {selectedOrderTasks.map((existingTask) => (
                  <option key={existingTask.id} value={existingTask.id}>{existingTask.text} · {DAY_LABELS[existingTask.day]} {PERSON_LABELS[existingTask.person]}</option>
                ))}
              </select>
            )}
            {selectedOrderTasks.length > 0 && (
              <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Current job task order</div>
                {selectedOrderTasks.slice(0, 8).map((existingTask, index) => (
                  <div key={existingTask.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6, alignItems: "center", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.74)", borderRadius: 8, padding: "6px 7px" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: DT.sans, fontSize: 11, fontWeight: 900, color: DT.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{index + 1}. {existingTask.text}</div>
                      <div style={{ marginTop: 1, fontFamily: DT.sans, fontSize: 9, fontWeight: 750, color: DT.textMuted }}>{DAY_LABELS[existingTask.day]} · {PERSON_LABELS[existingTask.person]}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" onClick={() => assignHere("before", existingTask.id)} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "4px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, cursor: "pointer" }}>Before</button>
                      <button type="button" onClick={() => assignHere("after", existingTask.id)} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "4px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, cursor: "pointer" }}>After</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => assignHere()}
              style={{ marginTop: 9, width: "100%", border: `1px solid rgba(12,124,122,0.24)`, background: DT.teal, color: "#fff", borderRadius: 999, padding: "8px 10px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer", boxShadow: "0 8px 18px rgba(12,124,122,0.12)" }}
            >
              Assign here · {placementText()}
            </button>
          </div>
        )}
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {filteredOrders.map((order) => {
            const health = HEALTH_META[orderHealth(order)];
            const active = selectedOrderId === order.id;
            return (
              <button
                type="button"
                key={order.id}
                onClick={() => chooseOrder(order)}
                style={{ width: "100%", minWidth: 0, textAlign: "left", borderWidth: "1px 1px 1px 4px", borderStyle: "solid", borderColor: `${active ? "rgba(12,124,122,0.24)" : DT.border} ${active ? "rgba(12,124,122,0.24)" : DT.border} ${active ? "rgba(12,124,122,0.24)" : DT.border} ${active ? DT.teal : health.color}`, background: active ? "rgba(12,124,122,0.06)" : DT.cardBg, borderRadius: 9, padding: "8px 9px", cursor: "pointer", boxShadow: active ? "0 8px 18px rgba(12,124,122,0.08)" : "0 1px 4px rgba(0,0,0,0.025)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: DT.sans, fontSize: 12, fontWeight: 900, color: DT.textPrimary, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer}</div>
                    <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orderItemLabel(order)} · {orderStatusLabel(order)}</div>
                  </div>
                  <div style={{ flex: "0 0 auto", textAlign: "right", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, color: DT.textPrimary }}>{formatShortDate(order.shipDate)}</div>
                </div>
              </button>
            );
          })}
          {filteredOrders.length === 0 && (
            <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>No matching active orders.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderRailDetail({
  order,
  planTasks,
  onWorkflowChange,
  onOpen,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onRemoveTaskLink,
}: {
  order: UiOrder;
  planTasks: OrderJourneyTask[];
  onWorkflowChange: (workflow: OrderWorkflowState | null) => void;
  onOpen: () => void;
  onPlanTaskEdit: (task: BoardPlanTask) => void;
  onPlanTaskDoneToggle: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
}) {
  const health = HEALTH_META[orderHealth(order)];
  const { workflow, workflowStatus } = useOrderWorkflow(order, onWorkflowChange);
  const openJobTasks = workflow.tasks
    .filter((task) => !task.done)
    .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));
  const nextJobTask = openJobTasks[0] ?? null;
  const nextPlanTask = planTasks[0] ?? null;
  const visibleTasks = planTasks.slice(0, 5);

  return (
    <div style={{ padding: 10, animation: "orderRailIn 1000ms ease both" }}>
      <div style={{ border: "1px solid " + DT.border, background: "rgba(255,255,255,0.84)", borderRadius: 10, padding: 10, boxShadow: DT.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <h3 style={{ margin: 0, fontFamily: DT.serif, fontSize: 19, lineHeight: 1.04, color: DT.textPrimary }}>{order.customer}</h3>
          <span style={{ flex: "0 0 auto", border: `1px solid ${health.border}`, background: DT.cardBg, color: health.color, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{health.label}</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, fontWeight: 800, lineHeight: 1.3 }}>{nextOrderPrompt(order)}</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <MiniFact label="Due" value={`${formatShortDate(order.shipDate)} · ${dueLabel(order)}`} />
          <MiniFact label="Item" value={orderItemLabel(order)} />
          <MiniFact label="Next" value={nextJobTask?.title ?? nextPlanTask?.text ?? "No task set"} />
          <MiniFact label="Progress" value={`${orderProgressPct(order)}% · ${order.stepNote || "No step"}`} />
        </div>
        <button
          type="button"
          onClick={onOpen}
          style={{ marginTop: 9, width: "100%", border: "1px solid rgba(12,124,122,0.24)", background: DT.teal, color: "#fff", borderRadius: 999, padding: "8px 10px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer", boxShadow: "0 8px 20px rgba(12,124,122,0.12)" }}
        >
          Open order
        </button>
        {workflowStatus && <div style={{ marginTop: 6, textAlign: "center", fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, fontWeight: 850 }}>{workflowStatus}</div>}
      </div>
      <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", borderRadius: 10, padding: "9px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Schedule</div>
            <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 13, color: DT.textPrimary, fontWeight: 950 }}>Tasks on this order</div>
          </div>
          <span style={{ color: DT.teal, fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>{planTasks.length}</span>
        </div>
        <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
          {visibleTasks.length === 0 ? (
            <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>No scheduled tasks found yet.</div>
          ) : visibleTasks.map((task) => {
            const done = Boolean(task.done);
            return (
              <div key={task.id} style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.border : DT.border}`, background: done ? DONE_TASK_VISUAL.bg : DT.cardBg, borderRadius: 9, padding: "7px 8px" }}>
                <div style={{ fontFamily: DT.sans, fontSize: 11, color: done ? DONE_TASK_VISUAL.title : DT.textPrimary, fontWeight: 900, lineHeight: 1.2, textDecoration: done ? "line-through" : "none" }}>{task.text}</div>
                <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 9, color: done ? DONE_TASK_VISUAL.text : DT.textMuted, lineHeight: 1.25 }}>{task.dateLabel} · {PERSON_LABELS[task.person]}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button type="button" onClick={(event) => onPlanTaskDoneToggle(task, !done, { x: event.clientX, y: event.clientY })} style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.buttonBorder : "rgba(12,124,122,0.18)"}`, background: done ? DONE_TASK_VISUAL.buttonBg : DT.tealSoft, color: done ? DONE_TASK_VISUAL.title : DT.teal, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>{done ? "Undo" : "Done"}</button>
                  <button type="button" onClick={() => onPlanTaskEdit(task)} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Edit task</button>
                  {task.assignedViaTuesday && <button type="button" onClick={() => onRemoveTaskLink(task)} style={{ border: "1px solid rgba(146,42,35,0.16)", background: "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Unlink</button>}
                </div>
              </div>
            );
          })}
          {planTasks.length > visibleTasks.length && <button type="button" onClick={onOpen} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "6px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Open full order for all tasks</button>}
        </div>
      </div>
    </div>
  );
}

function OrderCommandPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "danger" | "teal";
}) {
  const tones = {
    neutral: { color: DT.textMuted, bg: "rgba(255,255,255,0.72)", border: DT.border },
    good: { color: "#408048", bg: "rgba(64,128,72,0.10)", border: "rgba(64,128,72,0.22)" },
    warn: { color: "#9a6a14", bg: "rgba(200,169,110,0.12)", border: "rgba(200,169,110,0.24)" },
    danger: { color: "#922a23", bg: "rgba(146,42,35,0.08)", border: "rgba(146,42,35,0.18)" },
    teal: { color: DT.teal, bg: DT.tealSoft, border: "rgba(12,124,122,0.18)" },
  }[tone];
  return (
    <span style={{ border: `1px solid ${tones.border}`, background: tones.bg, color: tones.color, borderRadius: 999, padding: "5px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function OrderCommandMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "good" | "warn" | "danger" | "teal";
}) {
  const color = tone === "good" ? "#408048" : tone === "warn" ? "#9a6a14" : tone === "danger" ? "#922a23" : tone === "teal" ? DT.teal : DT.textPrimary;
  return (
    <div style={{ minWidth: 0, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", borderRadius: 10, padding: "10px 11px" }}>
      <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 16, lineHeight: 1.15, fontWeight: 950, color, overflowWrap: "anywhere" }}>{value}</div>
      {detail && <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 11, lineHeight: 1.3, color: DT.textMuted }}>{detail}</div>}
    </div>
  );
}

function OrderCommandSection({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section data-order-command-section={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", borderRadius: 12, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>{eyebrow}</div>}
          <div style={{ marginTop: eyebrow ? 2 : 0, fontFamily: DT.sans, fontSize: 15, lineHeight: 1.2, color: DT.textPrimary, fontWeight: 950 }}>{title}</div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function collectionSummary(workflow: OrderWorkflowState) {
  const collection = workflow.collection;
  if (collection.status === "collected") return { label: "Collected / gone", tone: "good" as const };
  if (collection.status === "booked") return { label: "Booked", tone: "teal" as const };
  return { label: "Not booked", tone: "warn" as const };
}

function RepairNotesPanel({
  order,
  workflow,
  onChange,
}: {
  order: UiOrder;
  workflow: OrderWorkflowState;
  onChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
}) {
  const notes = workflow.repairNotes ?? "";
  const showRepair = order.rawMondayTopPanel === "Repair" || Boolean(notes);
  if (!showRepair) return null;
  return (
    <OrderCommandSection
      eyebrow="Tuesday"
      title="Repair notes"
      action={<OrderCommandPill label={notes.trim() ? "Notes present" : "Needs detail"} tone={notes.trim() ? "teal" : "warn"} />}
    >
      <textarea
        value={notes}
        onChange={(event) => onChange((state) => ({ ...state, repairNotes: event.target.value.trim() ? event.target.value : null }))}
        placeholder="What repair is needed, what decision is pending, and what should happen next?"
        rows={4}
        style={{ width: "100%", resize: "vertical", border: `1px solid ${DT.border}`, borderRadius: 9, padding: "9px 10px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg, lineHeight: 1.35 }}
      />
    </OrderCommandSection>
  );
}

function OrderOverviewOverlay({
  order,
  planTasks,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onWorkflowTaskDoneToggle,
  onRemoveTaskLink,
  onClose,
  onWorkflowChange,
}: {
  order: UiOrder;
  planTasks: OrderJourneyTask[];
  onPlanTaskEdit: (task: BoardPlanTask) => void;
  onPlanTaskDoneToggle: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onWorkflowTaskDoneToggle: (done: boolean, origin?: DelightOrigin) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
  onClose: () => void;
  onWorkflowChange: (workflow: OrderWorkflowState | null) => void;
}) {
  const isNarrow = useIsNarrow(760);
  const health = HEALTH_META[orderHealth(order)];
  const mode = deliveryMode(order);
  const freightBookBy = addWorkingDays(order.shipDate, -mode.workingDays);
  const { workflow, workflowStatus, updateWorkflow } = useOrderWorkflow(order, onWorkflowChange);
  const progress = orderProgressPct(order);
  const openJobTasks = workflow.tasks.filter((task) => !task.done);
  const doneJobTasks = workflow.tasks.length - openJobTasks.length;
  const openPlanTasks = planTasks.filter((task) => !task.done).length;
  const donePlanTasks = planTasks.length - openPlanTasks;
  const openTaskCount = openJobTasks.length + openPlanTasks;
  const doneTaskCount = doneJobTasks + donePlanTasks;
  const totalTaskCount = workflow.tasks.length + planTasks.length;
  const qcDone = dispatchQcItems(order).filter((label) => workflow.qc[label]?.done).length;
  const qcTotal = dispatchQcItems(order).length;
  const collection = collectionSummary(workflow);
  const invoiceExpectation = invoiceExpectationForOrder(order);
  const invoiceNumber = workflow.xeroInvoiceNumber || order.xeroInvoiceNumber || null;
  const invoiceHasXeroLink = Boolean(order.xero);
  const invoiceHasNumber = Boolean(invoiceNumber);
  const invoiceTone = !invoiceExpectation.requiresInvoice ? "neutral" : invoiceHasXeroLink ? "teal" : invoiceHasNumber ? "warn" : "danger";
  const invoiceLabel = !invoiceExpectation.requiresInvoice ? invoiceExpectation.label : invoiceHasXeroLink ? "Linked" : invoiceHasNumber ? "Number saved" : "Needed";
  const productionStatus = order.rawMondayStatus || order.status || "Not set";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${order.customer} order overview`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 180,
        background: "rgba(25,23,20,0.58)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "center",
        alignItems: isNarrow ? "stretch" : "flex-start",
        padding: isNarrow ? 0 : "24px 18px",
        overflowY: "auto",
        animation: "orderRailIn 220ms ease both",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: isNarrow ? "100%" : "min(1240px, calc(100vw - 44px))",
          minHeight: isNarrow ? "100vh" : undefined,
          maxHeight: isNarrow ? undefined : "calc(100vh - 48px)",
          overflowY: "auto",
          borderRadius: isNarrow ? 0 : 16,
          border: isNarrow ? "none" : `1px solid rgba(0,0,0,0.10)`,
          background: "rgba(247,246,242,0.98)",
          boxShadow: "0 28px 70px rgba(20,20,18,0.30)",
        }}
        data-order-command-center="desktop-order-command-center"
      >
        <style>{`
          [data-order-command-center="desktop-order-command-center"] input:focus,
          [data-order-command-center="desktop-order-command-center"] select:focus,
          [data-order-command-center="desktop-order-command-center"] textarea:focus,
          [data-order-command-center="desktop-order-command-center"] button:focus-visible {
            outline: 2px solid rgba(12,124,122,0.24);
            outline-offset: 2px;
          }
        `}</style>
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${DT.border}`, padding: isNarrow ? "14px 14px 12px" : "18px 22px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontFamily: DT.serif, fontSize: isNarrow ? 27 : 34, lineHeight: 1.02, color: DT.textPrimary }}>{order.customer}</h2>
                <OrderCommandPill label={orderItemLabel(order)} />
                <OrderCommandPill label={health.label} tone={orderHealth(order) === "blocked" ? "danger" : orderHealth(order) === "watch" ? "warn" : "good"} />
                <OrderCommandPill label={`Xero: ${invoiceLabel}`} tone={invoiceTone} />
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontFamily: DT.sans, fontSize: 12, fontWeight: 850, color: DT.textMuted }}>
                <span>Due {formatShortDate(order.shipDate)}</span>
                <span>{dueLabel(order)}</span>
                <span>{formatCurrencyShort(order.value)}</span>
                <span>Order record + Tuesday workflow</span>
                {workflowStatus && <span>{workflowStatus}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: "0 0 auto", border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "8px 12px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 5, background: "rgba(0,0,0,0.045)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: DT.teal, transition: "width 450ms ease" }} />
            </div>
            <span style={{ fontFamily: DT.sans, fontSize: 11, fontWeight: 900, color: DT.textMuted, minWidth: 34, textAlign: "right" }}>{progress}%</span>
          </div>
        </div>
        <div style={{ padding: isNarrow ? 14 : 18, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))", gap: 9 }}>
            <OrderCommandMetric label="Production status" value={productionStatus} detail={orderHealthReason(order)} tone={orderHealth(order) === "blocked" ? "danger" : orderHealth(order) === "watch" ? "warn" : "teal"} />
            <OrderCommandMetric label="Tasks" value={`${openTaskCount} open`} detail={`${doneTaskCount} done · ${totalTaskCount} total`} tone={openTaskCount ? "teal" : "neutral"} />
            <OrderCommandMetric label="QC" value={`${qcDone}/${qcTotal}`} detail="Dispatch checklist" tone={qcDone === qcTotal ? "good" : "warn"} />
            <OrderCommandMetric label="Dispatch" value={collection.label} detail={workflow.collection.by || mode.label} tone={collection.tone} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 1.03fr) minmax(420px, 0.97fr)", gap: isNarrow ? 12 : 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <WorkshopSpec order={order} packLabel={mode.label} packDetail={mode.detail} freightBookBy={freightBookBy} freightWorkingDays={mode.workingDays} xeroUrl={order.xero} xeroInvoiceNumber={invoiceNumber} onInvoiceNumberChange={(nextInvoiceNumber) => updateWorkflow((state) => ({ ...state, xeroInvoiceNumber: nextInvoiceNumber }))} prominent />
              <RepairNotesPanel order={order} workflow={workflow} onChange={updateWorkflow} />
              <OrderCommandSection eyebrow="Order record" title="Production flow">
                <OrderStepTimeline order={order} />
              </OrderCommandSection>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <OrderTasksPanel key={order.id} order={order} workflow={workflow} planTasks={planTasks} onWorkflowChange={updateWorkflow} onPlanTaskEdit={onPlanTaskEdit} onPlanTaskDoneToggle={onPlanTaskDoneToggle} onWorkflowTaskDoneToggle={onWorkflowTaskDoneToggle} onRemoveTaskLink={onRemoveTaskLink} />
              <CollectionControl workflow={workflow} status={workflowStatus} onChange={updateWorkflow} />
              <QcChecklist order={order} workflow={workflow} onChange={updateWorkflow} />
              <OrderPhotoTray orderId={order.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderStepTimeline({ order }: { order: UiOrder }) {
  const steps = stepsForOrder(order);
  const repair = order.rawMondayTopPanel === "Repair";
  if (steps.length === 0) {
    return <div style={{ fontFamily: DT.sans, fontSize: 12, color: DT.textMuted }}>No production steps available for this item yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((step, index) => {
        const done = index < order.currentStep;
        const active = index === order.currentStep;
        const isRepair = repair && active;
        const fill = isRepair ? "#d97706" : DT.teal;
        const taskLabel = suggestedJobTaskLabelForStep(step, order);
        const showTaskLabel = active && taskLabel && taskLabel.toLocaleLowerCase() !== step.label.toLocaleLowerCase();
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
              {index > 0 && <div style={{ width: 2, flex: "1 1 0", minHeight: 4, background: done || active ? fill : "rgba(0,0,0,0.06)" }} />}
              {index === 0 && <div style={{ flex: "1 1 0" }} />}
              {step.wait ? (
                <div style={{ width: 14, height: 14, borderRadius: 3, background: done ? `${fill}18` : active ? "rgba(200,169,110,0.12)" : "rgba(0,0,0,0.03)", border: `1.5px dashed ${done ? fill : active ? DT.gold : "rgba(0,0,0,0.10)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 7 }}>{done ? "✓" : ""}</span>
                </div>
              ) : (
                <div style={{ width: done ? 10 : active ? 14 : 10, height: done ? 10 : active ? 14 : 10, borderRadius: "50%", background: done ? fill : active ? fill : "transparent", border: done || active ? `2px solid ${fill}` : "2px solid rgba(0,0,0,0.08)", boxShadow: active ? `0 0 0 3px ${fill}18` : "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {done && <span style={{ color: "#fff", fontSize: 7, lineHeight: 1 }}>✓</span>}
                </div>
              )}
              {index < steps.length - 1 && <div style={{ width: 2, flex: "1 1 0", minHeight: 4, background: done ? fill : "rgba(0,0,0,0.06)" }} />}
              {index === steps.length - 1 && <div style={{ flex: "1 1 0" }} />}
            </div>
            <div style={{ padding: "4px 0", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontFamily: DT.sans, fontWeight: active ? 800 : done ? 650 : 500, color: active ? fill : done ? DT.textSecondary : DT.textFaint, textDecoration: done && !active ? "line-through" : "none", textDecorationColor: done ? "rgba(0,0,0,0.12)" : "transparent" }}>
                  {step.label}
                </span>
                {showTaskLabel && <span style={{ border: "1px solid rgba(12,124,122,0.16)", background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "2px 6px", fontSize: 9, fontFamily: DT.sans, fontWeight: 850 }}>Task: {taskLabel}</span>}
                {step.who && !done && <span style={{ fontSize: 9, color: DT.textFaint, fontFamily: DT.sans, fontWeight: 500 }}>{step.who}</span>}
                {step.wait && !done && <span style={{ fontSize: 9, color: DT.gold, fontFamily: DT.sans, fontWeight: 650, fontStyle: "italic" }}>{step.waitLabel}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0, border: "1px solid rgba(0,0,0,0.045)", background: "rgba(255,255,255,0.74)", borderRadius: 7, padding: "6px 7px" }}>
      <div style={{ fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", color: DT.textFaint }}>{label}</div>
      <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textPrimary, lineHeight: 1.22, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

function CollectionControl({
  workflow,
  status,
  onChange,
}: {
  workflow: OrderWorkflowState;
  status: string;
  onChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
}) {
  const collection = workflow.collection;
  const hasBooking = Boolean(collection.bookedDay || collection.bookedTime || collection.by);
  const bookingLabel = [
    collection.bookedDay ? formatShortDate(collection.bookedDay) : null,
    collection.bookedTime || null,
    collection.by || null,
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", borderRadius: 12, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Tuesday</div>
          <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 15, color: DT.textPrimary, fontWeight: 950 }}>Collection / dispatch</div>
        </div>
        {status && <span style={{ fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, fontWeight: 850 }}>{status}</span>}
      </div>
      <label style={{ marginTop: 7, display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 7, alignItems: "start", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, fontWeight: 850 }}>
        <input
          type="checkbox"
          checked={collection.status === "booked" || collection.status === "collected"}
          onChange={(event) => {
            const checked = event.target.checked;
            onChange((state) => ({
              ...state,
              collection: {
                ...state.collection,
                status: checked ? "booked" : "open",
                collectedAt: checked ? state.collection.collectedAt : null,
              },
            }));
          }}
        />
        <span>
          Booked{hasBooking ? ` · ${bookingLabel}` : ""}
        </span>
      </label>
      <label style={{ marginTop: 5, display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 7, alignItems: "start", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, fontWeight: 850 }}>
        <input
          type="checkbox"
          checked={collection.status === "collected"}
          onChange={(event) => {
            const checked = event.target.checked;
            onChange((state) => ({
              ...state,
              collection: {
                ...state.collection,
                status: checked ? "collected" : state.collection.bookedDay ? "booked" : "open",
                collectedAt: checked ? new Date().toISOString() : null,
              },
            }));
          }}
        />
        Collected / gone
      </label>
      <details open={!hasBooking} style={{ marginTop: 6 }}>
        <summary style={{ listStyle: "none", cursor: "pointer", fontFamily: DT.sans, fontSize: 10, color: DT.teal, fontWeight: 900 }}>{hasBooking ? "Edit booking" : "Add booking details"}</summary>
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 74px", gap: 6 }}>
          <input
            type="date"
            value={collection.bookedDay}
            onChange={(event) => onChange((state) => ({ ...state, collection: { ...state.collection, bookedDay: event.target.value, status: state.collection.status === "collected" ? "collected" : event.target.value ? "booked" : "open" } }))}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
          />
          <input
            type="time"
            value={collection.bookedTime}
            onChange={(event) => onChange((state) => ({ ...state, collection: { ...state.collection, bookedTime: event.target.value } }))}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
          />
        </div>
        <select
          value={collection.by}
          onChange={(event) => onChange((state) => ({ ...state, collection: { ...state.collection, by: event.target.value as Carrier, status: state.collection.status === "collected" ? "collected" : "booked" } }))}
          style={{ marginTop: 6, width: "100%", border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
        >
          <option value="">Booked by...</option>
          <option value="Pinpoint">Pinpoint</option>
          <option value="Mainfreight">Mainfreight</option>
          <option value="Customer">Customer</option>
        </select>
      </details>
      {collection.collectedAt && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted }}>Marked collected {formatCompletedAt(collection.collectedAt)}</div>}
    </div>
  );
}

function planTaskPlacementLabel(task: Pick<OrderJourneyTask, "placement" | "assignedViaTuesday">) {
  if (task.placement?.mode === "start") return "Placed at start";
  if (task.placement?.mode === "end") return "Placed at end";
  if (task.placement?.mode === "before") return "Placed before another task";
  if (task.placement?.mode === "after") return "Placed after another task";
  if (task.assignedViaTuesday) return "Tuesday link";
  return "";
}

function OrderTasksPanel({
  order,
  workflow,
  planTasks,
  onWorkflowChange,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onWorkflowTaskDoneToggle,
  onRemoveTaskLink,
}: {
  order: UiOrder;
  workflow: OrderWorkflowState;
  planTasks: OrderJourneyTask[];
  onWorkflowChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
  onPlanTaskEdit: (task: BoardPlanTask) => void;
  onPlanTaskDoneToggle: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onWorkflowTaskDoneToggle?: (done: boolean, origin?: DelightOrigin) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const taskOptions = jobTaskOptionsForOrder(order);
  const defaultDraftAction = defaultJobTaskActionForOrder(order, taskOptions);
  const productionTaskOptions = taskOptions.filter((option) => option.group === "production");
  const supportTaskOptions = taskOptions.filter((option) => option.group === "support");
  const activeProductionStep = currentProductionStepForOrder(order);
  const [draftAction, setDraftAction] = useState<string>(defaultDraftAction);
  const [draftCustom, setDraftCustom] = useState("");
  const [draftOwner, setDraftOwner] = useState<WorkshopPerson>("Nick");
  const [draftDate, setDraftDate] = useState(today);
  const selectedDraftAction = taskOptions.some((option) => option.label === draftAction) ? draftAction : defaultDraftAction;
  const draftTitle = selectedDraftAction === "Custom" ? draftCustom.trim() : selectedDraftAction;
  const orderedWorkflowTasks = [...workflow.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.scheduledDate || "").localeCompare(b.scheduledDate || "");
  });
  const orderedPlanTasks = [...planTasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.sortKey.localeCompare(b.sortKey);
  });
  const openCount = workflow.tasks.filter((task) => !task.done).length + planTasks.filter((task) => !task.done).length;
  const doneCount = workflow.tasks.length + planTasks.length - openCount;
  const totalCount = workflow.tasks.length + planTasks.length;

  function updateWorkflowTask(id: string, patch: Partial<WorkflowTask>) {
    onWorkflowChange((state) => ({
      ...state,
      tasks: state.tasks.map((task) => task.id === id ? { ...task, ...patch } : task),
    }));
  }

  function deleteWorkflowTask(id: string) {
    onWorkflowChange((state) => ({
      ...state,
      tasks: state.tasks.filter((task) => task.id !== id),
    }));
  }

  function addWorkflowTask() {
    if (!draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate) return;
    onWorkflowChange((state) => ({
      ...state,
      tasks: [
        ...state.tasks,
        {
          id: `task-${Date.now()}`,
          title: draftTitle,
          owner: draftOwner,
          scheduledDate: draftDate,
          done: false,
          completedAt: null,
          completedBy: "",
          notes: "",
        },
      ],
    }));
    setDraftCustom("");
  }

  function taskCardStyle(done: boolean): CSSProperties {
    return {
      display: "grid",
      gridTemplateColumns: "18px minmax(0, 1fr)",
      gap: 8,
      border: `1px solid ${done ? DONE_TASK_VISUAL.border : DT.border}`,
      background: done ? DONE_TASK_VISUAL.bg : DT.cardBg,
      borderRadius: 10,
      padding: "8px 9px",
      boxShadow: done ? DONE_TASK_VISUAL.shadow : "none",
    };
  }

  function taskMetaStyle(done: boolean): CSSProperties {
    return {
      fontFamily: DT.sans,
      fontSize: 10,
      color: done ? DONE_TASK_VISUAL.text : DT.textMuted,
      fontWeight: 750,
      lineHeight: 1.32,
    };
  }

  return (
    <div style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", borderRadius: 12, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Tuesday</div>
          <div title="Tick the checkbox to mark this task done" style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 16, color: DT.textPrimary, fontWeight: 950 }}>Tasks</div>
          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750, lineHeight: 1.35 }}>
            Current step: {activeProductionStep?.label ?? order.rawMondayStatus ?? "Not set"} · suggested next: {defaultDraftAction}
          </div>
        </div>
        <OrderCommandPill label={`${openCount} open · ${doneCount} done`} tone={openCount ? "teal" : "neutral"} />
      </div>

      <div style={{ marginTop: 10, border: `1px solid ${DT.border}`, background: "rgba(247,249,248,0.82)", borderRadius: 10, padding: 9 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 88px", gap: 7 }}>
          <select
            value={selectedDraftAction}
            onChange={(event) => setDraftAction(event.target.value)}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg }}
          >
            {productionTaskOptions.length > 0 && (
              <optgroup label="Production flow">
                {productionTaskOptions.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
              </optgroup>
            )}
            <optgroup label="Support">
              {supportTaskOptions.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
            </optgroup>
          </select>
          <select
            value={draftOwner}
            onChange={(event) => setDraftOwner(event.target.value as WorkshopPerson)}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg }}
          >
            <option value="Nick">Nick</option>
            <option value="Dylan">Dylan</option>
          </select>
        </div>
        <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: selectedDraftAction === "Custom" ? "minmax(0, 1fr) 130px auto" : "minmax(0, 1fr) auto", gap: 7, alignItems: "center" }}>
          {selectedDraftAction === "Custom" && (
            <input
              value={draftCustom}
              onChange={(event) => setDraftCustom(event.target.value)}
              placeholder="Write task"
              style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg }}
            />
          )}
          <input
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg }}
          />
          <button
            type="button"
            onClick={addWorkflowTask}
            disabled={!draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate}
            title="Add task to job"
            style={{ whiteSpace: "nowrap", border: `1px solid rgba(12,124,122,0.18)`, background: !draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate ? "rgba(0,0,0,0.035)" : DT.tealSoft, color: !draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate ? DT.textFaint : DT.teal, borderRadius: 999, padding: "7px 10px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: !draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate ? "not-allowed" : "pointer" }}
          >
            Add task to job
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
        {totalCount === 0 && <div style={{ fontFamily: DT.sans, fontSize: 12, color: DT.textMuted, lineHeight: 1.35 }}>No tasks saved for this order yet.</div>}
        {orderedWorkflowTasks.map((task) => {
          const done = Boolean(task.done);
          return (
            <div key={`workflow-${task.id}`} data-order-workflow-task-card="order-workflow-task-card" style={taskCardStyle(done)}>
              <input
                type="checkbox"
                checked={done}
                onChange={(event) => {
                  const checked = event.target.checked;
                  if (checked) {
                    const checkboxRect = event.currentTarget.getBoundingClientRect();
                    const cardElement = event.currentTarget.closest("[data-order-workflow-task-card]") as HTMLElement | null;
                    onWorkflowTaskDoneToggle?.(checked, { x: checkboxRect.left + checkboxRect.width / 2, y: checkboxRect.top + checkboxRect.height / 2, cardRect: cardElement?.getBoundingClientRect() });
                  }
                  updateWorkflowTask(task.id, {
                    done: checked,
                    completedAt: checked ? new Date().toISOString() : null,
                    completedBy: checked ? (task.completedBy || task.owner) : "",
                  });
                }}
                style={{ marginTop: 7 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 7, alignItems: "center" }}>
                  <input
                    aria-label="Edit job task"
                    value={task.title}
                    onChange={(event) => updateWorkflowTask(task.id, { title: event.target.value })}
                    style={{ width: "100%", border: `1px solid ${done ? DONE_TASK_VISUAL.border : DT.border}`, background: done ? "rgba(255,255,255,0.50)" : DT.cardBg, borderRadius: 7, padding: "5px 6px", fontFamily: DT.sans, fontSize: 12, fontWeight: 900, color: done ? DONE_TASK_VISUAL.title : DT.textPrimary, textDecoration: done ? "line-through" : "none", outline: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this task from this order?")) deleteWorkflowTask(task.id);
                    }}
                    aria-label="Delete job task"
                    style={{ border: "1px solid rgba(146,42,35,0.16)", background: "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
                <div style={{ marginTop: 5, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.border : "rgba(12,124,122,0.16)"}`, background: done ? "rgba(255,255,255,0.45)" : DT.tealSoft, color: done ? DONE_TASK_VISUAL.text : DT.teal, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>Added</span>
                  <PersonSelect value={task.owner} onChange={(value) => updateWorkflowTask(task.id, { owner: value })} />
                  <input
                    type="date"
                    value={task.scheduledDate || ""}
                    onChange={(event) => updateWorkflowTask(task.id, { scheduledDate: event.target.value })}
                    style={{ border: `1px solid ${DT.border}`, borderRadius: 7, padding: "4px 5px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
                  />
                  {task.done && <PersonSelect value={task.completedBy} onChange={(value) => updateWorkflowTask(task.id, { completedBy: value })} />}
                  {task.completedAt && <span style={taskMetaStyle(done)}>Done {formatCompletedAt(task.completedAt)}</span>}
                </div>
                <input
                  value={task.notes}
                  onChange={(event) => updateWorkflowTask(task.id, { notes: event.target.value })}
                  placeholder="Task notes"
                  style={{ marginTop: 5, width: "100%", border: `1px solid ${DT.border}`, borderRadius: 7, padding: "5px 6px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
                />
              </div>
            </div>
          );
        })}
        {orderedPlanTasks.map((task) => {
          const done = Boolean(task.done);
          const placementLabel = planTaskPlacementLabel(task);
          return (
            <div key={`plan-${task.id}`} data-order-plan-task-card="order-plan-task-card" style={taskCardStyle(done)}>
              <input
                type="checkbox"
                checked={done}
                onChange={(event) => {
                  const checked = event.target.checked;
                  const checkboxRect = event.currentTarget.getBoundingClientRect();
                  const cardElement = event.currentTarget.closest("[data-order-plan-task-card]") as HTMLElement | null;
                  onPlanTaskDoneToggle(task, checked, { x: checkboxRect.left + checkboxRect.width / 2, y: checkboxRect.top + checkboxRect.height / 2, cardRect: cardElement?.getBoundingClientRect() });
                }}
                style={{ marginTop: 7 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 7, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: DT.sans, fontSize: 13, fontWeight: 950, color: done ? DONE_TASK_VISUAL.title : DT.textPrimary, lineHeight: 1.22, textDecoration: done ? "line-through" : "none", overflowWrap: "anywhere" }}>{task.text}</div>
                    <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.border : "rgba(12,124,122,0.16)"}`, background: done ? "rgba(255,255,255,0.45)" : DT.tealSoft, color: done ? DONE_TASK_VISUAL.text : DT.teal, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>Schedule</span>
                      {placementLabel && <span style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.border : "rgba(12,124,122,0.16)"}`, background: done ? "rgba(255,255,255,0.45)" : "rgba(12,124,122,0.08)", color: done ? DONE_TASK_VISUAL.text : DT.teal, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{placementLabel}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={(event) => onPlanTaskDoneToggle(task, !done, { x: event.clientX, y: event.clientY })}
                      style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.buttonBorder : "rgba(12,124,122,0.20)"}`, background: done ? DONE_TASK_VISUAL.buttonBg : DT.tealSoft, color: done ? DONE_TASK_VISUAL.title : DT.teal, borderRadius: 999, padding: "6px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}
                    >
                      {done ? "Undo" : "Done"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onPlanTaskEdit(task)}
                      style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "6px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}
                    >
                      Edit
                    </button>
                    {task.assignedViaTuesday && (
                      <button
                        type="button"
                        onClick={() => onRemoveTaskLink(task)}
                        style={{ border: "1px solid rgba(146,42,35,0.16)", background: "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "6px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 5, ...taskMetaStyle(done) }}>{task.dateLabel} · {DAY_LABELS[task.day]} · {PERSON_LABELS[task.person]} · {task.rowName}</div>
                {task.notes && <div style={{ marginTop: 3, ...taskMetaStyle(done) }}>{task.notes}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonSelect({ value, onChange }: { value: WorkshopPerson; onChange: (value: WorkshopPerson) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as WorkshopPerson)}
      style={{ border: `1px solid ${DT.border}`, borderRadius: 7, padding: "4px 5px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
    >
      <option value="">By</option>
      <option value="Nick">Nick</option>
      <option value="Dylan">Dylan</option>
      <option value="Guido">Guido</option>
      <option value="Other">Other</option>
    </select>
  );
}

function QcChecklist({
  order,
  workflow,
  onChange,
}: {
  order: UiOrder;
  workflow: OrderWorkflowState;
  onChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
}) {
  const items = dispatchQcItems(order);
  function toggle(label: string, checked: boolean) {
    onChange((state) => ({
      ...state,
      qc: {
        ...state.qc,
        [label]: {
          done: checked,
          completedAt: checked ? new Date().toISOString() : null,
          completedBy: checked ? (state.qc[label]?.completedBy || "") : "",
        },
      },
    }));
  }
  return (
    <div style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", borderRadius: 12, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Tuesday</div>
          <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 15, color: DT.textPrimary, fontWeight: 950 }}>QC</div>
        </div>
        <OrderCommandPill label={`${items.filter((label) => workflow.qc[label]?.done).length}/${items.length}`} tone={items.every((label) => workflow.qc[label]?.done) ? "good" : "warn"} />
      </div>
      <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
        {items.map((label) => {
          const item = workflow.qc[label] ?? { done: false, completedAt: null, completedBy: "" as WorkshopPerson };
          return (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 6, alignItems: "start", borderTop: "1px solid rgba(0,0,0,0.045)", paddingTop: 5 }}>
              <input type="checkbox" checked={item.done} onChange={(event) => toggle(label, event.target.checked)} style={{ marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 11, color: item.done ? DT.textMuted : DT.textPrimary, fontWeight: 800, lineHeight: 1.25 }}>{label}</div>
                {item.done && (
                  <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                    <PersonSelect
                      value={item.completedBy}
                      onChange={(value) => onChange((state) => ({ ...state, qc: { ...state.qc, [label]: { ...item, completedBy: value } } }))}
                    />
                    <span style={{ fontFamily: DT.sans, fontSize: 9, color: DT.textMuted }}>{formatCompletedAt(item.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


type XeroProofInvoice = {
  invoiceNumber: string | null;
  contact: string | null;
  status: string | null;
  dueDate: string | null;
  total: number | null;
  amountDue: number | null;
  amountPaid: number | null;
  xeroUrl: string | null;
  lineItems?: Array<{ description: string; quantity?: number | null; unitAmount?: number | null; lineAmount?: number | null }>;
};

type XeroProofState = {
  loading: boolean;
  invoice: XeroProofInvoice | null;
  error: string;
  notFound: boolean;
};

function xeroPaymentLabel(invoice: XeroProofInvoice | null, loading: boolean, error: string, notFound: boolean, invoiceNumber: string | null | undefined, hasXeroUrl: boolean, invoiceExpected: boolean) {
  if (!invoiceExpected && !invoiceNumber && !hasXeroUrl) return "No invoice expected";
  if (!invoiceNumber && !hasXeroUrl) return "Invoice needed";
  if (loading) return "Checking Xero";
  if (error) return "Xero error";
  if ((invoice?.status || "").toUpperCase() === "PAID" || invoice?.amountDue === 0) return "Paid";
  if ((invoice?.status || "").toUpperCase() === "DRAFT") return "Draft";
  if (invoice) return "Awaiting payment";
  if (notFound && hasXeroUrl) return "Xero link saved";
  if (notFound && invoiceNumber) return "Invoice saved - Xero link missing";
  if (hasXeroUrl) return "Xero link saved";
  if (invoiceNumber) return "Invoice number saved";
  return "Awaiting payment";
}

function xeroPaymentTone(label: string) {
  if (label === "Paid") return { bg: "rgba(64,128,72,0.10)", border: "rgba(64,128,72,0.22)", color: "#408048" };
  if (label === "Xero link saved") return { bg: "rgba(12,124,122,0.09)", border: "rgba(12,124,122,0.18)", color: DT.teal };
  if (label === "Awaiting payment" || label === "Draft" || label === "Invoice number saved" || label === "Invoice saved - Xero link missing") return { bg: "rgba(178,97,36,0.09)", border: "rgba(178,97,36,0.20)", color: "#b26124" };
  if (label === "Xero error" || label === "Invoice needed") return { bg: "rgba(146,42,35,0.08)", border: "rgba(146,42,35,0.18)", color: "#922a23" };
  return { bg: "rgba(110,138,106,0.10)", border: "rgba(110,138,106,0.20)", color: DT.sage };
}

function parseXeroWorkshopSpec(invoice: XeroProofInvoice | null) {
  const text = (invoice?.lineItems || []).map((line) => line.description || "").filter(Boolean).join("\n\n");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dimensionLine = lines.find((line) => /\d{3,5}\s*[x×]\s*\d{2,5}/i.test(line));
  const finishLine = lines.find((line) => line !== dimensionLine && /(finish|coat|oil|stain|wash|t[oō]tara|rimu|beech|oak|ash|walnut|macrocarpa|clear)/i.test(line));
  const deliveredIndex = lines.findIndex((line) => /delivered\s+to|delivery\s+to|deliver\s+to/i.test(line));
  const delivery = deliveredIndex >= 0 ? lines.slice(deliveredIndex + 1, deliveredIndex + 5).join(", ") : "";
  return {
    dimensions: dimensionLine || "",
    finish: finishLine || "",
    delivery,
  };
}

function formatXeroMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function formatXeroQuantity(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatOrderQuantity(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return "Quantity missing";
  const quantity = formatXeroQuantity(value);
  return `${quantity} ${value === 1 ? "item" : "items"}`;
}

function parseXeroLineItem(description: string) {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dimensionLines = lines.filter((line) => /\d{2,5}\s*[x×]\s*\d{2,5}/i.test(line));
  const colourLine = lines.find((line) => /colo[u]?r|finish|stain|wash|clear|black|natural|oil/i.test(line));
  const itemLine = lines.find((line) => !dimensionLines.includes(line) && line !== colourLine && !/^delivered to:?$/i.test(line) && !/^additions?:/i.test(line)) || lines[0] || "Invoice item";
  const colour = colourLine ? colourLine.replace(/^colo[u]?r\s*:\s*/i, "") : "-";
  const notes = lines.filter((line) => line !== itemLine && !dimensionLines.includes(line) && line !== colourLine);
  return { item: itemLine, dimensions: dimensionLines.join(", ") || "-", colour, notes };
}

function WorkshopSpec({
  order,
  packLabel,
  packDetail,
  freightBookBy,
  freightWorkingDays,
  xeroUrl,
  xeroInvoiceNumber,
  onInvoiceNumberChange,
  prominent = false,
}: {
  order: UiOrder;
  packLabel: string;
  packDetail: string;
  freightBookBy: Date | null;
  freightWorkingDays: number;
  xeroUrl?: string | null;
  xeroInvoiceNumber?: string | null;
  onInvoiceNumberChange?: (invoiceNumber: string | null) => void;
  prominent?: boolean;
}) {
  const [showInvoiceDetails, setShowInvoiceDetails] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState(xeroInvoiceNumber ?? "");
  const [xeroProof, setXeroProof] = useState<XeroProofState>({ loading: false, invoice: null, error: "", notFound: false });
  const invoiceExpectation = invoiceExpectationForOrder(order);
  const hasInvoiceReference = Boolean(xeroInvoiceNumber || xeroUrl);
  const invoiceDetailsAvailable = invoiceExpectation.requiresInvoice || hasInvoiceReference;

  useEffect(() => {
    setInvoiceDraft(xeroInvoiceNumber ?? "");
  }, [xeroInvoiceNumber]);

  useEffect(() => {
    let cancelled = false;
    async function loadXeroInvoice() {
      if (!xeroInvoiceNumber || !showInvoiceDetails) {
        setXeroProof({ loading: false, invoice: null, error: "", notFound: false });
        return;
      }
      setXeroProof({ loading: true, invoice: null, error: "", notFound: false });
      try {
        const response = await fetch(`/api/xero/proof?invoiceNumber=${encodeURIComponent(xeroInvoiceNumber)}&includeLineItems=1`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as { ok?: boolean; invoiceCount?: number; invoices?: XeroProofInvoice[]; error?: string } | null;
        if (!response.ok || !data?.ok) throw new Error(data?.error || "Xero lookup failed");
        const invoice = data.invoices?.[0] ?? null;
        if (!cancelled) setXeroProof({ loading: false, invoice, error: "", notFound: !invoice });
      } catch (error) {
        if (!cancelled) setXeroProof({ loading: false, invoice: null, error: error instanceof Error ? error.message : "Xero lookup failed", notFound: false });
      }
    }
    void loadXeroInvoice();
    return () => {
      cancelled = true;
    };
  }, [showInvoiceDetails, xeroInvoiceNumber]);

  function saveInvoiceDraft() {
    onInvoiceNumberChange?.(invoiceDraft.trim() ? invoiceDraft.trim().toUpperCase() : null);
  }

  const parsedXeroSpec = parseXeroWorkshopSpec(xeroProof.invoice);
  const xeroSourceUrl = xeroProof.invoice?.xeroUrl || xeroUrl;
  const paymentLabel = invoiceDetailsAvailable ? xeroPaymentLabel(xeroProof.invoice, xeroProof.loading, xeroProof.error, xeroProof.notFound, xeroInvoiceNumber, Boolean(xeroSourceUrl), invoiceExpectation.requiresInvoice) : invoiceExpectation.label;
  const paymentTone = xeroPaymentTone(paymentLabel);
  const lineItems = xeroProof.invoice?.lineItems?.filter((line) => line.description?.trim()) ?? [];
  const orderFacts = [
    { label: "Item", value: order.rawMondayItem || order.product },
    { label: "Top / panel", value: order.rawMondayTopPanel || "Not set" },
    { label: "Legs / base", value: order.rawMondayLegs || "Not set" },
  ];
  const logistics = [
    { label: "Pack", value: `${packLabel} - ${packDetail}` },
    { label: "Book freight", value: `${formatLongDate(freightBookBy)} - ${freightWorkingDays} workday${freightWorkingDays === 1 ? "" : "s"} before due` },
    { label: "Delivery", value: parsedXeroSpec.delivery || order.deliveryLocation || order.freightRef || "No delivery detail captured yet" },
  ];

  return (
    <div style={{ marginTop: prominent ? 0 : 8, border: `1px solid ${DT.border}`, background: prominent ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.66)", borderRadius: prominent ? 12 : 9, padding: prominent ? 13 : "8px 9px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Order details</div>
          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750 }}>{invoiceExpectation.requiresInvoice ? "Customer orders use exact Xero invoice items when available." : invoiceExpectation.detail}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {xeroInvoiceNumber && (
            <button
              type="button"
              onClick={() => setShowInvoiceDetails((current) => !current)}
              style={{ border: "1px solid rgba(110,138,106,0.22)", background: showInvoiceDetails ? "rgba(110,138,106,0.14)" : "rgba(255,255,255,0.68)", color: DT.sage, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
            >
              {showInvoiceDetails ? "Hide invoice details" : "View invoice details"}
            </button>
          )}
          {xeroSourceUrl && (
            <a href={xeroSourceUrl} target="_blank" rel="noreferrer" style={{ border: "1px solid rgba(12,124,122,0.18)", background: "rgba(255,255,255,0.74)", color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textDecoration: "none" }}>
              Open Xero
            </a>
          )}
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ border: `1px solid ${paymentTone.border}`, background: paymentTone.bg, color: paymentTone.color, borderRadius: 999, padding: "4px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>
          Xero: {paymentLabel}
        </span>
        {xeroInvoiceNumber && <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>From {xeroInvoiceNumber}</span>}
        {xeroProof.invoice?.dueDate && <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>Invoice due {formatShortDate(xeroProof.invoice.dueDate)}</span>}
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: prominent ? "repeat(auto-fit, minmax(130px, 1fr))" : "1fr 1fr", gap: 7 }}>
        {orderFacts.map((detail) => <MiniFact key={detail.label} label={detail.label} value={detail.value} />)}
      </div>
      {order.notes && <div style={{ marginTop: 7, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.58)", borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 10, lineHeight: 1.35, color: DT.textMuted }}>{order.notes}</div>}
      {onInvoiceNumberChange && invoiceExpectation.requiresInvoice && (
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: prominent ? "minmax(0, 1fr) auto" : "1fr", gap: 6, alignItems: "center" }}>
          <input
            value={invoiceDraft}
            onChange={(event) => setInvoiceDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveInvoiceDraft();
              }
            }}
            placeholder="Xero invoice number, e.g. INV-1123"
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
          />
          <button
            type="button"
            onClick={saveInvoiceDraft}
            disabled={(invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "")}
            style={{ border: `1px solid rgba(110,138,106,0.24)`, background: (invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "") ? "rgba(0,0,0,0.035)" : "rgba(110,138,106,0.13)", color: (invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "") ? DT.textFaint : DT.sage, borderRadius: 999, padding: "7px 10px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: (invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "") ? "not-allowed" : "pointer" }}
          >
            Save invoice number
          </button>
        </div>
      )}
      {showInvoiceDetails && xeroInvoiceNumber && (
        <div style={{ marginTop: 10, border: `1px solid rgba(110,138,106,0.20)`, borderRadius: 10, background: "rgba(255,255,255,0.72)", overflow: "hidden" }}>
          <div style={{ padding: "8px 9px", display: "grid", gridTemplateColumns: prominent ? "repeat(auto-fit, minmax(118px, 1fr))" : "1fr 1fr", gap: 6, borderBottom: `1px solid ${DT.border}` }}>
            <MiniFact label="Invoice" value={xeroProof.invoice?.invoiceNumber || xeroInvoiceNumber} />
            <MiniFact label="Contact" value={xeroProof.invoice?.contact || "Checking Xero"} />
            <MiniFact label="Status" value={xeroProof.invoice?.status || paymentLabel} />
            <MiniFact label="Total" value={formatXeroMoney(xeroProof.invoice?.total)} />
            <MiniFact label="Paid" value={formatXeroMoney(xeroProof.invoice?.amountPaid)} />
            <MiniFact label="Owing" value={formatXeroMoney(xeroProof.invoice?.amountDue)} />
          </div>
          <div style={{ padding: "8px 9px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Invoice items</div>
              <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 800, color: DT.textMuted }}>{lineItems.length} line item{lineItems.length === 1 ? "" : "s"}</div>
            </div>
            <div style={{ marginTop: 6, display: "grid", gap: 6, maxHeight: prominent ? 310 : 200, overflowY: "auto", paddingRight: 3 }}>
              {xeroProof.loading && <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted }}>Loading invoice details...</div>}
              {!xeroProof.loading && lineItems.map((line, index) => { const parsed = parseXeroLineItem(line.description); return (
                <div key={`${index}-${line.description.slice(0, 24)}`} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, borderRadius: 8, padding: "7px 8px", display: "grid", gridTemplateColumns: prominent ? "minmax(0, 1fr) 58px 72px 82px" : "1fr", gap: prominent ? 8 : 5, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: DT.sans, fontSize: 12, lineHeight: 1.22, color: DT.textPrimary, fontWeight: 950, overflowWrap: "anywhere" }}>{parsed.item}</div>
                    <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: prominent ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: 5 }}>
                      <MiniFact label="Dimensions" value={parsed.dimensions} />
                      <MiniFact label="Colour" value={parsed.colour} />
                    </div>
                    {parsed.notes.length > 0 && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, lineHeight: 1.35, color: DT.textMuted }}>{parsed.notes.join(" · ")}</div>}
                    <details style={{ marginTop: 5 }}>
                      <summary style={{ listStyle: "none", cursor: "pointer", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, color: DT.textMuted }}>Exact invoice text</summary>
                      <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, lineHeight: 1.35, color: DT.textMuted, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{line.description}</div>
                    </details>
                  </div>
                  <MiniFact label="Qty" value={formatXeroQuantity(line.quantity)} />
                  <MiniFact label="Unit" value={formatXeroMoney(line.unitAmount)} />
                  <MiniFact label="Line" value={formatXeroMoney(line.lineAmount)} />
                </div>
              ); })}
              {!xeroProof.loading && lineItems.length === 0 && <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted }}>No line item text returned from Xero yet.</div>}
            </div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: prominent ? "repeat(auto-fit, minmax(170px, 1fr))" : "1fr", gap: prominent ? 8 : 0 }}>
        {logistics.map((detail) => (
          <div key={detail.label} style={{ borderTop: prominent ? "none" : `1px solid ${DT.border}`, border: prominent ? `1px solid ${DT.border}` : undefined, background: prominent ? "rgba(255,255,255,0.62)" : undefined, borderRadius: prominent ? 9 : undefined, padding: prominent ? "8px 9px" : "5px 0" }}>
            <div style={{ fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", color: DT.textFaint }}>{detail.label}</div>
            <div style={{ marginTop: prominent ? 3 : 0, fontFamily: DT.sans, fontSize: prominent ? 12 : 11, fontWeight: 850, color: DT.textPrimary, lineHeight: 1.28 }}>{detail.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 7, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, lineHeight: 1.3 }}>
        {!invoiceExpectation.requiresInvoice && !xeroInvoiceNumber ? invoiceExpectation.detail : xeroProof.invoice ? "Tuesday is reading these details directly from Xero. Use Open Xero only when you need the original invoice screen." : xeroInvoiceNumber ? "Invoice number is saved. Use View invoice details to check whether Tuesday can pull the full Xero invoice." : "Add the Xero invoice number to unlock exact invoice items here."}
      </div>
      {xeroProof.error && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: "#922a23", lineHeight: 1.3 }}>{xeroProof.error}</div>}
    </div>
  );
}
function OrderPhotoTray({ orderId }: { orderId: number }) {
  const [requested, setRequested] = useState(true);
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [status, setStatus] = useState<string>("Loading photos...");
  const [disabledReason, setDisabledReason] = useState<string>("");

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    fetch(`/api/production/order-photos?orderId=${orderId}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Photo store unavailable")))
      .then((data: { photos?: OrderPhoto[]; disabledReason?: string }) => {
        if (!cancelled) {
          setPhotos(data.photos ?? []);
          setDisabledReason(data.disabledReason ?? "");
          setStatus("");
        }
      })
      .catch((err) => {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Photo store unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, requested]);


  async function deletePhoto(photo: OrderPhoto) {
    setStatus("Deleting photo...");
    const params = new URLSearchParams({ orderId: String(orderId), pathname: photo.pathname });
    const response = await fetch(`/api/production/order-photos?${params.toString()}`, { method: "DELETE" });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(data?.error || "Delete failed");
    setPhotos((current) => current.filter((item) => item.pathname !== photo.pathname));
    setStatus("Photo deleted");
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append("orderId", String(orderId));
    form.append("file", file);
    setStatus("Uploading photo...");
    const response = await fetch("/api/production/order-photos", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    setPhotos((current) => [data.photo as OrderPhoto, ...current]);
    setStatus("Photo uploaded");
  }

  return (
    <div style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", borderRadius: 12, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Evidence</div>
          <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 15, color: DT.textPrimary, fontWeight: 950 }}>Order photos</div>
        </div>
        {!requested ? (
          <button
            type="button"
            onClick={() => {
              setStatus("Loading photos...");
              setRequested(true);
            }}
            style={{ border: `1px solid rgba(12,124,122,0.18)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
          >
            Load photos
          </button>
        ) : (
          <label style={{ border: `1px solid rgba(12,124,122,0.18)`, background: disabledReason ? "rgba(0,0,0,0.035)" : DT.tealSoft, color: disabledReason ? DT.textFaint : DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: disabledReason ? "not-allowed" : "pointer" }}>
            Upload
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={Boolean(disabledReason)}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.currentTarget.value = "";
                Promise.all(files.map(uploadPhoto)).catch((err) => setStatus(err instanceof Error ? err.message : "Upload failed"));
              }}
              style={{ display: "none" }}
            />
          </label>
        )}
      </div>
      {(status || disabledReason || !requested) && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted }}>{status || disabledReason || "Photos load only when needed."}</div>}
      {requested && (
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5 }}>
          {photos.map((photo) => (
            <div key={photo.pathname} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", border: `1px solid ${DT.border}`, background: DT.cardBg }}>
              <a href={photo.url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Order upload" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </a>
              <button
                type="button"
                onClick={() => deletePhoto(photo).catch((err) => setStatus(err instanceof Error ? err.message : "Delete failed"))}
                style={{ position: "absolute", right: 4, top: 4, border: "1px solid rgba(0,0,0,0.10)", background: "rgba(255,253,249,0.92)", color: DT.textMuted, borderRadius: 999, width: 20, height: 20, fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer", lineHeight: "18px" }}
                aria-label="Delete photo"
                title="Delete photo"
              >
                x
              </button>
            </div>
          ))}
          {photos.length === 0 && <div style={{ gridColumn: "1 / -1", fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.3 }}>No photos yet.</div>}
        </div>
      )}
    </div>
  );
}

function hasDayAssignments(row: PlanRow): boolean {
  return DAYS.some((d) => PEOPLE.some((p) => row.dayTasks[d][p]));
}

function isArchiveWeek(title: string): boolean {
  return title.toLowerCase().includes("done") || title.toLowerCase().includes("dust");
}


type FeedbackLabel = "Useful" | "Check" | "Add detail" | "Workshop input" | "Decision needed" | "Better wording";
const FEEDBACK_LABELS: FeedbackLabel[] = ["Useful", "Check", "Add detail", "Workshop input", "Decision needed", "Better wording"];

function feedbackStorageKey(scope: string, id: string | number) {
  return `tuesday:feedback:${scope}:${id}`;
}

function useIsNarrow(breakpoint = 760) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < breakpoint);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);
  return isNarrow;
}

function FeedbackButtons({ scope, id }: { scope: string; id: string | number }) {
  const key = feedbackStorageKey(scope, id);
  const [selected, setSelected] = useState<FeedbackLabel[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]") as FeedbackLabel[];
    } catch {
      return [];
    }
  });
  function toggle(label: FeedbackLabel) {
    const next = selected.includes(label) ? selected.filter((x) => x !== label) : [...selected, label];
    setSelected(next);
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(next));
  }
  return (
    <details style={{ maxWidth: "100%" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", color: DT.textMuted, fontSize: 10, fontFamily: DT.sans, fontWeight: 850 }}>
        Local feedback{selected.length ? ` · ${selected.length}` : ""}
      </summary>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }} aria-label="Local Production Plan feedback">
        {FEEDBACK_LABELS.map((label) => {
          const active = selected.includes(label);
          return (
            <button key={label} type="button" onClick={() => toggle(label)} style={{ border: `1px solid ${active ? "rgba(79,95,168,0.30)" : "rgba(0,0,0,0.07)"}`, background: active ? DT.tealSoft : DT.cardBg, color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontFamily: DT.sans, fontWeight: 800, cursor: "pointer" }}>
              {active ? "✓ " : ""}{label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function displayWeekTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  const match = trimmed.match(/^([A-Za-z]+)\s*[-–]?\s*(.+)$/);
  if (!match || !/\d/.test(match[2])) return trimmed;
  const month = match[1];
  let range = match[2]
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
    .replace(/^[-–]\s*/, "")
    .replace(/\s*[-–]\s*/g, "–")
    .trim();
  const days = range.match(/^(\d+)–(\d+)$/);
  if (days) {
    const start = Number(days[1]);
    const end = Number(days[2]);
    if (end - start === 3) {
      const mi = monthIndex(month);
      if (mi >= 0) {
        const friday = new Date(new Date().getFullYear(), mi, start + 4);
        const fridayMonth = friday.toLocaleString("en-NZ", { month: "long" });
        range = fridayMonth === month ? `${start}–${friday.getDate()}` : `${start}–${fridayMonth} ${friday.getDate()}`;
      }
    }
  }
  return `${month} ${range}`;
}

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function nzWorkshopNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

function planningVisibleStart(now = new Date()) {
  const nzNow = nzWorkshopNow(now);
  const start = weekStart(nzNow);
  const day = nzNow.getDay();
  const afterFridayCutoff = day === 5 && nzNow.getHours() >= 18;
  const weekend = day === 0 || day === 6;
  if (afterFridayCutoff || weekend) start.setDate(start.getDate() + 7);
  return start;
}

function monthIndex(name: string) {
  const key = name.toLowerCase().slice(0, 3);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key);
}

function weekRangeFromTitle(title: string, now = new Date()) {
  const normalized = displayWeekTitle(title).replace(/\u2013/g, "-");
  const match = normalized.trim().match(/^([A-Za-z]+)\s+(\d+)(?:\D+(?:([A-Za-z]+)\s+)?(\d+))?/);
  if (!match) return null;
  const month = monthIndex(match[1]);
  if (month < 0) return null;
  const year = nzWorkshopNow(now).getFullYear();
  const startDay = Number(match[2]);
  const endMonth = match[3] ? monthIndex(match[3]) : month;
  let endMonthIndex = endMonth >= 0 ? endMonth : month;
  const endDay = Number(match[4] ?? startDay + 4);
  if (!match[3] && endDay < startDay) endMonthIndex = month === 11 ? 0 : month + 1;
  const endYear = month === 11 && endMonthIndex === 0 ? year + 1 : year;
  const start = new Date(year, month, startDay);
  const end = new Date(endYear, endMonthIndex, endDay);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

type PlanWeek = { id: string; title: string; rows: PlanRow[] };
type BoardPlanTask = DraggablePlanTask & { weekId: string; sortOrder?: number };
type OrderJourneyTask = BoardPlanTask & {
  orderId: number | null;
  orderName: string;
  weekTitle: string;
  dateLabel: string;
  sortKey: string;
  connectionState: OrderConnectionState;
  notes: string | null;
  assignedViaTuesday?: boolean;
  placement?: PlanTaskPlacement;
};
type OrderJourneyRow = {
  id: string;
  order: UiOrder | null;
  name: string;
  dueLabel: string | null;
  statusLabel: string | null;
  health: OrderHealthLevel | "internal" | "unlinked";
  tasks: OrderJourneyTask[];
};
type BoardDropTarget = { weekId: string; day: DayKey; person: Person; overTaskId?: string };
type BoardDropPreview = { weekId: string; day: DayKey; person: Person; overId?: string; insertAfter?: boolean };
type OrderConnectionState = "connected" | "possible" | "needs-order" | "internal";
function isoDateFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatPlanningWeekTitle(start: Date) {
  const end = addDays(start, 4);
  const startMonth = start.toLocaleDateString("en-NZ", { month: "long" });
  const endMonth = end.toLocaleDateString("en-NZ", { month: "long" });
  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}`
    : `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}`;
}

function planningWeekId(start: Date) {
  return `planning-${isoDateFromDate(start)}`;
}

function planningWeekStartKey(week: PlanWeek, now = new Date()) {
  const start = weekRangeFromTitle(week.title, now)?.start;
  return start ? isoDateFromDate(start) : null;
}

function suggestedDateOptionForWeekDay(week: PlanWeek, day: DayKey): SuggestedDateOption | null {
  const range = weekRangeFromTitle(week.title);
  if (!range) return null;
  const date = new Date(range.start);
  date.setDate(range.start.getDate() + DAYS.indexOf(day));
  return {
    dateIso: isoDateFromDate(date),
    dateLabel: date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" }),
    day,
    weekId: week.id,
    weekTitle: displayWeekTitle(week.title),
  };
}

function suggestedStepFallsInWeek(step: SuggestedOrderPlanStep, week: PlanWeek) {
  const range = weekRangeFromTitle(week.title);
  if (!range) return false;
  const date = new Date(`${step.dateIso}T12:00:00`);
  return range.start.getTime() <= date.getTime() && date.getTime() <= range.end.getTime();
}

function weekStartTime(week: PlanWeek, now = new Date()): number {
  return weekRangeFromTitle(week.title, now)?.start.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function weekEndTime(week: PlanWeek, now = new Date()): number {
  return weekRangeFromTitle(week.title, now)?.end.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function splitPlanWeeks(weeks: PlanWeek[], now = new Date()) {
  const visibleStart = planningVisibleStart(now);
  const sorted = [...weeks].sort((a, b) => weekStartTime(a, now) - weekStartTime(b, now));
  const previous = sorted.filter((week) => weekEndTime(week, now) < visibleStart.getTime()).reverse();
  const realWeeksByStart = new Map<string, PlanWeek>();
  for (const week of sorted) {
    const key = planningWeekStartKey(week, now);
    if (key && weekEndTime(week, now) >= visibleStart.getTime()) realWeeksByStart.set(key, week);
  }
  const currentAndUpcoming = Array.from({ length: 6 }, (_, index) => {
    const start = addDays(visibleStart, index * 7);
    const key = isoDateFromDate(start);
    return realWeeksByStart.get(key) ?? { id: planningWeekId(start), title: formatPlanningWeekTitle(start), rows: [] };
  });
  return { currentAndUpcoming, previous };
}

function planTaskFingerprint(value: string) {
  const normalized = normalizeOrderText(value).slice(0, 80);
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function planTaskLinkKey(task: Pick<DraggablePlanTask, "rowId" | "text">) {
  return `plan-task:${task.rowId}:${planTaskFingerprint(task.text)}`;
}

function orderConnectionLabel(task: DraggablePlanTask, planTaskLinks: PlanTaskLinks, resolvedOrderId: number | null = null) {
  const assignedOrderId = assignedOrderIdForTask(task, planTaskLinks);
  const hasConfirmedOrder = Boolean(assignedOrderId || task.linkedOrderIds.length > 0);
  const looksInternal = /sample rack|shop|internal|maintenance|clean|tidy|tool|bench/i.test(`${task.text} ${task.rowName}`);
  if (hasConfirmedOrder) {
    return { state: "connected" as OrderConnectionState, label: "Order linked", detail: "Customer order attached" };
  }
  if (resolvedOrderId) {
    return { state: "possible" as OrderConnectionState, label: "Possible match", detail: "Confirm customer/order" };
  }
  if (looksInternal) {
    return { state: "internal" as OrderConnectionState, label: "No customer / internal", detail: "Workshop task" };
  }
  return { state: "needs-order" as OrderConnectionState, label: "Needs order", detail: "Connect order" };
}

function orderConnectionStyle(state: OrderConnectionState, selected = false) {
  if (state === "connected") return { color: selected ? "#8a5d08" : DT.teal, bg: selected ? "rgba(255,246,199,0.96)" : DT.tealSoft, border: selected ? "rgba(190,137,24,0.34)" : "rgba(12,124,122,0.14)" };
  if (state === "possible") return { color: "#8a5d08", bg: "rgba(255,246,199,0.68)", border: "rgba(190,137,24,0.36)" };
  if (state === "internal") return { color: DT.sage, bg: "rgba(110,138,106,0.10)", border: "rgba(110,138,106,0.20)" };
  return { color: "#9a6a14", bg: "rgba(200,169,110,0.14)", border: "rgba(200,169,110,0.38)" };
}

const DONE_TASK_VISUAL = {
  bg: "linear-gradient(135deg, rgba(232,232,228,0.98), rgba(203,202,196,0.92))",
  border: "rgba(105,104,99,0.44)",
  stripe: "#77756f",
  text: "#6f6d67",
  title: "#585651",
  buttonBg: "rgba(120,118,112,0.13)",
  buttonBorder: "rgba(105,104,99,0.28)",
  shadow: "inset 0 0 0 1px rgba(255,255,255,0.34), 0 1px 2px rgba(0,0,0,0.012)",
};

function sourceTasksForWeek(rows: PlanRow[]): DraggablePlanTask[] {
  return rows.flatMap((row) =>
    DAYS.flatMap((day) =>
      PEOPLE.flatMap((person) => {
        const text = row.dayTasks[day][person];
        const taskKey = text ? planTaskLinkKey({ rowId: row.id, text }) : "";
        return text
          ? [{
              id: `${row.id}:${day}:${person}`,
              taskKey,
              rowId: row.id,
              rowName: row.name,
              rowNotes: row.notes,
              day,
              person,
              text,
              linkedOrderIds: row.linkedOrders.map((linked) => Number(linked.mondayItemId)).filter((id) => Number.isFinite(id)),
              linkedOrders: row.linkedOrders,
              estimatedHours: 1,
            }]
          : [];
      })
    )
  );
}

function applyPlanTaskEdits(tasks: BoardPlanTask[], taskEdits: PlanTaskEdits): BoardPlanTask[] {
  return tasks.map((task) => {
    const edit = taskEdits[stablePlanTaskKey(task)] ?? taskEdits[task.id];
    if (!edit) return task;
    return {
      ...task,
      text: edit.text ?? task.text,
      rowName: edit.rowName ?? task.rowName,
      weekId: edit.weekId ?? task.weekId,
      day: edit.day ?? task.day,
      person: edit.person ?? task.person,
      estimatedHours: edit.estimatedHours ?? task.estimatedHours,
      sortOrder: edit.sortOrder ?? task.sortOrder,
      done: edit.done ?? task.done,
    };
  });
}

function sourceTasksForBoardWeeks(weeks: PlanWeek[], taskEdits: PlanTaskEdits = {}): BoardPlanTask[] {
  const sourceTasks = weeks.flatMap((week) => sourceTasksForWeek(week.rows).map((task) => ({ ...task, weekId: week.id })));
  return applyPlanTaskEdits(sourceTasks.map((task, index) => ({ ...task, sortOrder: index })), taskEdits);
}

function orderJourneyTaskSortKey(task: BoardPlanTask, weekTitle: string) {
  const rangeStart = weekRangeFromTitle(weekTitle)?.start.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [rangeStart, DAYS.indexOf(task.day), PEOPLE.indexOf(task.person), task.rowName, task.id].join(":");
}

function buildOrderJourneyRows({
  tasks,
  orders,
  planTaskLinks,
  resolveOrderId,
  weekTitleForTask,
}: {
  tasks: BoardPlanTask[];
  orders: UiOrder[];
  planTaskLinks: PlanTaskLinks;
  resolveOrderId: (task: BoardPlanTask) => number | null;
  weekTitleForTask: (task: BoardPlanTask) => string;
}): OrderJourneyRow[] {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const rows = new Map<string, OrderJourneyRow>();

  for (const task of tasks) {
    const orderId = resolveOrderId(task);
    const order = orderId ? ordersById.get(orderId) ?? null : null;
    const connection = orderConnectionLabel(task, planTaskLinks, orderId);
    const internal = connection.state === "internal";
    const id = order ? `order:${order.id}` : `${internal ? "internal" : "unlinked"}:${normalizeOrderText(task.rowName) || task.rowId}`;
    const weekTitle = weekTitleForTask(task);
    const row = rows.get(id) ?? {
      id,
      order,
      name: order?.customer ?? taskCustomerDisplayName(task),
      dueLabel: order ? `${formatShortDate(order.shipDate)} · ${dueLabel(order)}` : null,
      statusLabel: order ? `${orderItemLabel(order)} · ${orderStatusLabel(order)}` : connection.label,
      health: order ? orderHealth(order) : internal ? "internal" : "unlinked",
      tasks: [],
    };
    row.tasks.push({
      ...task,
      orderId,
      orderName: row.name,
      weekTitle: displayWeekTitle(weekTitle),
      dateLabel: `${displayWeekTitle(weekTitle)} · ${DAY_LABELS[task.day]}`,
      sortKey: orderJourneyTaskSortKey(task, weekTitle),
      connectionState: connection.state,
      notes: task.rowNotes,
      assignedViaTuesday: Boolean(orderId && assignedOrderIdForTask(task, planTaskLinks) === orderId && !task.linkedOrderIds.includes(orderId)),
      placement: placementForTask(task, planTaskLinks),
    });
    rows.set(id, row);
  }

  const healthOrder: Record<OrderJourneyRow["health"], number> = { blocked: 0, watch: 1, onTrack: 2, unlinked: 3, internal: 4 };
  return Array.from(rows.values())
    .map((row) => ({ ...row, tasks: [...row.tasks].sort((a, b) => a.sortKey.localeCompare(b.sortKey)) }))
    .sort((a, b) => {
      const dueA = a.order?.shipDate ? new Date(a.order.shipDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.order?.shipDate ? new Date(b.order.shipDate).getTime() : Number.MAX_SAFE_INTEGER;
      return (healthOrder[a.health] - healthOrder[b.health]) || (dueA - dueB) || a.name.localeCompare(b.name);
    });
}

function boardPlanLaneId(weekId: string, day: DayKey, person: Person) {
  return `${weekId}::${day}:${person}`;
}

function parseBoardPlanLane(value: string): { weekId: string; day: DayKey; person: Person } | null {
  const [weekId, lane] = value.split("::");
  if (!weekId || !lane) return null;
  const parsedLane = parsePlanLane(lane);
  return parsedLane ? { weekId, ...parsedLane } : null;
}

function boardDropTargetFromOverId(current: BoardPlanTask[], overId: string): BoardDropTarget | null {
  const lane = parseBoardPlanLane(overId);
  if (lane) return lane;
  const overTask = current.find((task) => task.id === overId);
  return overTask ? { weekId: overTask.weekId, day: overTask.day, person: overTask.person, overTaskId: overTask.id } : null;
}

function boardPlanLayoutsEqual(left: BoardPlanTask[], right: BoardPlanTask[]) {
  if (left.length !== right.length) return false;
  return left.every((task, index) => {
    const other = right[index];
    return other?.id === task.id && other.weekId === task.weekId && other.day === task.day && other.person === task.person && other.text === task.text && other.rowName === task.rowName && cleanTaskEstimatedHours(other.estimatedHours) === cleanTaskEstimatedHours(task.estimatedHours) && Number(other.sortOrder ?? 0) === Number(task.sortOrder ?? 0);
  });
}

function boardTaskSortOrder(task: BoardPlanTask) {
  return Number.isFinite(task.sortOrder) ? Number(task.sortOrder) : 0;
}

function sortBoardTasksForLane(left: BoardPlanTask, right: BoardPlanTask) {
  return boardTaskSortOrder(left) - boardTaskSortOrder(right) || left.id.localeCompare(right.id);
}

function reorderBoardPlanTask(
  current: BoardPlanTask[],
  taskId: string,
  weekId: string,
  day: DayKey,
  person: Person,
  overTaskId?: string,
  insertAfter = false
) {
  const moving = current.find((task) => task.id === taskId);
  if (!moving) return current;
  const withoutMoving = current.filter((task) => task.id !== taskId);
  const nextTask = { ...moving, weekId, day, person };
  let insertAt = withoutMoving.length;
  if (overTaskId && overTaskId !== taskId) {
    const overIndex = withoutMoving.findIndex((task) => task.id === overTaskId);
    if (overIndex >= 0) insertAt = overIndex + (insertAfter ? 1 : 0);
  } else {
    const laneIndexes = withoutMoving
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => task.weekId === weekId && task.day === day && task.person === person);
    insertAt = laneIndexes.length > 0 ? laneIndexes[laneIndexes.length - 1].index + 1 : withoutMoving.length;
  }
  const next = [...withoutMoving];
  next.splice(insertAt, 0, nextTask);
  return boardPlanLayoutsEqual(current, next) ? current : next;
}

function withMovedTaskSortOrder(tasks: BoardPlanTask[], taskId: string) {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving) return tasks;
  const lane = tasks
    .filter((task) => task.weekId === moving.weekId && task.day === moving.day && task.person === moving.person)
    .sort((left, right) => tasks.indexOf(left) - tasks.indexOf(right));
  const laneIndex = lane.findIndex((task) => task.id === taskId);
  const previous = lane[laneIndex - 1];
  const next = lane[laneIndex + 1];
  const sortOrder = previous && next
    ? (boardTaskSortOrder(previous) + boardTaskSortOrder(next)) / 2
    : previous
      ? boardTaskSortOrder(previous) + 1
      : next
        ? boardTaskSortOrder(next) - 1
        : boardTaskSortOrder(moving);
  return tasks.map((task) => task.id === taskId ? { ...task, sortOrder } : task);
}

function saveDraftTasks(_weekId: string, _tasks: DraggablePlanTask[]) {
  // Drag/drop is live-backed through Supabase task edits; browser-local board drafts would make two screens disagree.
}

function loadDraftTasks(_weekId: string, sourceTasks: BoardPlanTask[]) {
  return sourceTasks;
}

function LinkedOrderPill({ row, onOpenOrder }: { row: PlanRow; onOpenOrder?: (orderId: number) => void }) {
  if (row.linkedOrders.length === 0) return null;
  const linked = row.appLinkedOrder;
  if (linked && onOpenOrder) {
    return (
      <button
        type="button"
        onClick={() => onOpenOrder(Number(linked.mondayItemId))}
        title={`Open ${linked.name} in the Production Plan order overview`}
        style={{
          fontSize: 10,
          color: DT.teal,
          background: DT.tealSoft,
          border: "1px solid rgba(12,124,122,0.16)",
          borderRadius: 4,
          padding: "2px 6px",
          fontFamily: DT.sans,
          fontWeight: 850,
          cursor: "pointer",
        }}
      >
        Open job: {linked.name}
      </button>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        color: DT.textMuted,
        background: "rgba(0,0,0,0.03)",
        border: "1px solid rgba(0,0,0,0.04)",
        borderRadius: 4,
        padding: "2px 6px",
        fontFamily: DT.sans,
        fontStyle: "italic",
        lineHeight: 1.25,
        whiteSpace: "normal",
      }}
      title={row.linkedOrders.map((l) => `${l.name} (${l.boardName})`).join("\n")}
    >
      Linked: {row.linkedOrders.map((l) => l.name).join(" · ")}
    </span>
  );
}
function DayPills({ row }: { row: PlanRow }) {
  if (!hasDayAssignments(row)) {
    return (
      <span style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans, fontStyle: "italic" }}>
        no day assignments
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {DAYS.flatMap((day) =>
        PEOPLE.map((person) => {
          const text = row.dayTasks[day][person];
          if (!text) return null;
          const isToday = text.toLowerCase() === "today";
          return (
            <span
              key={`${day}-${person}`}
              style={{
                fontSize: 10,
                fontFamily: DT.sans,
                background: DT.cardBg,
                border: `1px solid ${DT.border}`,
                borderRadius: 4,
                padding: "2px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontStyle: isToday ? "italic" : "normal",
                color: isToday ? DT.textFaint : DT.textSecondary,
              }}
            >
              <span style={{ fontWeight: 700, color: DT.textFaint, fontSize: 9 }}>
                {DAY_LABELS[day]} {PERSON_SHORT[person]}
              </span>
              <span>{text}</span>
            </span>
          );
        })
      )}
    </div>
  );
}

function NewOrderHalo({
  order,
  suggestions,
  dateOptions,
  open,
  approved,
  onStepChange,
  onApprove,
  onClose,
  capacityByLane,
}: {
  order: NewOrderPlanCandidate | null;
  suggestions: SuggestedOrderPlanStep[];
  dateOptions: SuggestedDateOption[];
  open: boolean;
  approved: boolean;
  onStepChange: (id: string, patch: Partial<Pick<SuggestedOrderPlanStep, "title" | "detail" | "day" | "person" | "estimatedHours" | "dateIso" | "dateLabel">>) => void;
  onApprove: () => void;
  onClose: () => void;
  capacityByLane: CapacityByLane;
}) {
  const isNarrow = useIsNarrow();
  if (!order) return null;
  const detailCards = [
    ["Customer", order.customer],
    ["Item", order.rawMondayItem ?? order.product],
    ["Quantity", formatOrderQuantity(order.quantity)],
    ["Date ordered", formatOrderedDate(order.orderedDate)],
    ["Due date", order.shipDate ? formatOrderedDate(order.shipDate) : "No date yet"],
    ["Value", order.value ? `$${Math.round(order.value).toLocaleString("en-NZ")}` : "Value missing"],
    ["Status", order.rawMondayStatus ?? order.status],
    ["Hours", `${suggestions.reduce((sum, step) => sum + Number(step.estimatedHours || 0), 0)}h draft`],
  ];
  return (
    <>
      {open && (
        <section style={{ borderWidth: "1px 1px 1px 5px", borderStyle: "solid", borderColor: `${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.color}`, borderRadius: 12, background: REVIEW_GLOW.bg, boxShadow: REVIEW_GLOW.shadow, padding: 12 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: REVIEW_GLOW.color, fontFamily: DT.sans }}>Suggested task list</div>
                <h3 style={{ margin: "3px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 18, letterSpacing: "-0.03em" }}>{order.customer}</h3>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <Chip label={order.rawMondayStatus ?? order.status} tone="amber" />
                  <Chip label={order.rawMondayItem ?? order.product} tone="teal" />
                  <Chip label={approved ? "Approved plan" : "Suggested plan"} tone={approved ? "amber" : "grey"} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={onApprove}
                  style={{ border: `1px solid ${REVIEW_GLOW.borderStrong}`, background: REVIEW_GLOW.color, color: "white", borderRadius: 999, padding: "8px 13px", fontFamily: DT.sans, fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 8px 18px rgba(190,137,24,0.16)" }}
                >
                  Approve tasks to month view
                </button>
                <button
                  type="button"
                  aria-label="Close full task list"
                  onClick={onClose}
                  style={{ width: 35, height: 35, border: `1px solid ${REVIEW_GLOW.borderStrong}`, background: "rgba(255,255,255,0.82)", color: REVIEW_GLOW.color, borderRadius: 999, fontFamily: DT.sans, fontSize: 18, fontWeight: 950, cursor: "pointer", lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "repeat(2, minmax(0, 1fr))" : "repeat(8, minmax(0, 1fr))", gap: 6 }}>
              {detailCards.map(([label, value]) => (
                <div key={label} style={{ padding: "7px 8px", borderRadius: 9, border: `1px solid ${REVIEW_GLOW.border}`, background: "rgba(255,255,255,0.58)" }}>
                  <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: DT.textFaint }}>{label}</div>
                  <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.35, color: DT.textPrimary, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
              {order.xero && (
                <a href={order.xero} target="_blank" rel="noreferrer" style={{ padding: "7px 8px", borderRadius: 9, border: `1px solid ${REVIEW_GLOW.border}`, background: "rgba(255,255,255,0.62)", color: DT.teal, textDecoration: "none", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center" }}>
                  Xero invoice
                </a>
              )}
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: REVIEW_GLOW.color }}>Editable task suggestions</div>
              <div style={{ display: "grid", gap: 6, marginTop: 7 }}>
                {suggestions.map((step, index) => (
                  <div key={step.id} style={{ display: "grid", gridTemplateColumns: isNarrow ? "24px minmax(0, 1fr)" : "24px minmax(180px, 1.5fr) minmax(104px, 0.7fr) minmax(110px, 0.7fr) 70px minmax(140px, 0.9fr)", gap: 6, alignItems: "center", padding: 7, borderRadius: 9, borderWidth: "1px 1px 1px 5px", borderStyle: "solid", borderColor: `${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.color}`, background: REVIEW_GLOW.bgSoft, boxShadow: "0 5px 16px rgba(190,137,24,0.08)" }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.70)", color: newOrderPalette.clayAccentDark, fontSize: 10, fontWeight: 900 }}>{index + 1}</div>
                    <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "subgrid", gridColumn: isNarrow ? undefined : "2 / -1", gap: 7, alignItems: "center" }}>
                      <input
                        aria-label={`Step ${index + 1} title`}
                        value={step.title}
                        onChange={(event) => onStepChange(step.id, { title: event.target.value })}
                      style={{ width: "100%", minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", color: DT.textPrimary, fontSize: 12, fontWeight: 850, fontFamily: DT.sans, background: "rgba(255,255,255,0.82)" }}
                      />
                        <select aria-label={`Step ${index + 1} date`} value={step.dateIso} onChange={(event) => {
                          const option = dateOptions.find((current) => current.dateIso === event.target.value);
                          if (option) onStepChange(step.id, { day: option.day, dateIso: option.dateIso, dateLabel: option.dateLabel });
                        }} style={{ minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", fontSize: 11, color: DT.textMuted, background: "rgba(255,255,255,0.82)" }}>
                          {dateOptions.map((option) => <option key={option.dateIso} value={option.dateIso}>{option.dateLabel} · {option.weekTitle}</option>)}
                        </select>
                        <select aria-label={`Step ${index + 1} owner`} value={step.person} onChange={(event) => onStepChange(step.id, { person: event.target.value as Person })} style={{ minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", fontSize: 11, color: DT.textMuted, background: "rgba(255,255,255,0.82)" }}>
                          {PEOPLE.map((person) => <option key={person} value={person}>{PERSON_LABELS[person]}</option>)}
                        </select>
                        <input
                          aria-label={`Step ${index + 1} estimated hours`}
                          type="number"
                          min="0"
                          step="0.5"
                          value={step.estimatedHours}
                          onChange={(event) => onStepChange(step.id, { estimatedHours: Number(event.target.value) })}
                        style={{ minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", fontSize: 11, color: DT.textMuted, background: "rgba(255,255,255,0.82)" }}
                        />
                      {(() => {
                        const capacity = capacityByLane[dateCapacityKey(step.dateIso, step.person)];
                        if (!capacity) return null;
                        const style = CAPACITY_STYLES[capacity.status];
                        return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, border: `1px solid ${style.border}`, background: style.bg, borderRadius: 8, padding: "6px 7px", fontSize: 10, color: style.color, fontWeight: 850, minWidth: 0 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.dateLabel} {PERSON_LABELS[step.person]}</span>
                          <span style={{ whiteSpace: "nowrap" }}>{style.label} · {capacity.label}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function PlanRowCard({ row, onOpenOrder }: { row: PlanRow; onOpenOrder?: (orderId: number) => void }) {
  return (
    <div
      style={{
        background: DT.cardBg,
        border: `1px solid ${DT.border}`,
        borderRadius: DT.radius,
        padding: "11px 14px",
        boxShadow: DT.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: DT.textPrimary,
            fontFamily: DT.sans,
          }}
        >
          {row.name}
        </span>
        <LinkedOrderPill row={row} onOpenOrder={onOpenOrder} />
      </div>
      <DayPills row={row} />
      {row.notes && (
        <p
          style={{
            fontSize: 12,
            color: DT.textSecondary,
            lineHeight: 1.5,
            margin: 0,
            fontFamily: DT.sans,
            padding: "6px 10px",
            background: "rgba(0,0,0,0.015)",
            borderRadius: 6,
          }}
        >
          {row.notes}
        </p>
      )}
      <div style={{ paddingTop: 7, borderTop: `1px solid ${DT.border}`, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans }}>Plan row · check the order details before changing production truth</span>
        <FeedbackButtons scope="plan" id={row.id} />
      </div>
    </div>
  );
}

function WeekSection({
  title,
  rows,
  defaultOpen,
}: {
  title: string;
  rows: PlanRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ marginBottom: 18 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "7px 0",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: DT.textPrimary,
            fontFamily: DT.serif,
            letterSpacing: "-0.01em",
          }}
        >
          {displayWeekTitle(title)}
        </span>
        <span
          style={{
            fontSize: 10,
            color: DT.textFaint,
            fontFamily: DT.sans,
            fontWeight: 500,
          }}
        >
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.04)" }} />
        <span
          style={{
            fontSize: 12,
            color: DT.textFaint,
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))",
            gap: 9,
          }}
        >
          {rows.map((r) => (
            <PlanRowCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function WeekView({ rows, weekTitle }: { rows: PlanRow[]; weekTitle: string }) {
  const weekGrid = useMemo(() => derivePlanWeek(rows), [rows]);
  const anyTasks = DAYS.some((d) =>
    PEOPLE.some((p) => weekGrid[d][p].length > 0)
  );

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: DT.textFaint,
          fontFamily: DT.sans,
          marginBottom: 10,
        }}
      >
        Week for {displayWeekTitle(weekTitle)} · {rows.length} row{rows.length === 1 ? "" : "s"} ·
        tasks derived from day-columns (empty day/workshop lanes are hidden only when completely empty)
      </div>
      {!anyTasks && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: DT.textFaint,
            fontFamily: DT.sans,
            fontSize: 13,
          }}
        >
          No day-column assignments for this week.
        </div>
      )}
      {anyTasks && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 1fr",
            gap: 3,
          }}
        >
          <div />
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: DT.textFaint,
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: DT.sans,
              padding: "4px 0",
            }}
          >
            {PERSON_LABELS.nick}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: DT.textFaint,
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: DT.sans,
              padding: "4px 0",
            }}
          >
            {PERSON_LABELS.dylan}
          </div>
          {DAYS.map((day) => (
            <WeekRow key={day} day={day} weekGrid={weekGrid} />
          ))}
        </div>
      )}
    </div>
  );
}
void WeekSection;
void WeekView;

function WeekRow({
  day,
  weekGrid,
}: {
  day: DayKey;
  weekGrid: ReturnType<typeof derivePlanWeek>;
}) {
  return (
    <>
      <div style={{ paddingTop: 6 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: DT.textMuted,
            fontFamily: DT.sans,
          }}
        >
          {DAY_LABELS[day]}
        </div>
      </div>
      {PEOPLE.map((person) => (
        <div
          key={person}
          style={{
            background: DT.cardBg,
            borderRadius: 6,
            border: `1px solid ${DT.border}`,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minHeight: 28,
          }}
        >
          {weekGrid[day][person].map((t, i) => {
            const isToday = t.text.toLowerCase() === "today";
            return (
              <div
                key={`${t.sourceRowId}-${i}`}
                style={{
                  display: "block",
                  padding: "4px 6px",
                  borderRadius: 4,
                  background: "rgba(12,124,122,0.05)",
                  border: `1px solid ${DT.border}`,
                  textDecoration: "none",
                  color: DT.textPrimary,
                  fontFamily: DT.sans,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    fontStyle: isToday ? "italic" : "normal",
                    color: isToday ? DT.textFaint : DT.textPrimary,
                  }}
                >
                  {t.text}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: DT.textFaint,
                    marginTop: 1,
                  }}
                >
                  {t.sourceRowName}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}



function suggestedStepDragId(id: string) {
  return `suggested-step:${id}`;
}

function suggestedStepIdFromDragId(id: string) {
  return id.startsWith("suggested-step:") ? id.slice("suggested-step:".length) : null;
}

function parsePlanLane(value: string): { day: DayKey; person: Person } | null {
  const [day, person] = value.split(":");
  if ((DAYS as readonly string[]).includes(day) && (PEOPLE as readonly string[]).includes(person)) {
    return { day: day as DayKey, person: person as Person };
  }
  return null;
}

function shouldInsertAfterOver(event: Pick<DragOverEvent, "active" | "over">) {
  const overRect = event.over?.rect;
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  if (!overRect || !activeRect) return false;
  return activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2;
}

function PlanTaskDragCard({ task }: { task: DraggablePlanTask }) {
  const personVisual = PERSON_VISUALS[task.person];
  return (
    <div style={{ width: 220, maxWidth: "min(260px, 70vw)", pointerEvents: "none", borderWidth: "1px 1px 1px 6px", borderStyle: "solid", borderColor: `${personVisual.taskBorder} ${personVisual.taskBorder} ${personVisual.taskBorder} ${personVisual.stripe}`, background: personVisual.taskBg, borderRadius: 8, padding: "7px 8px", boxShadow: "0 14px 34px rgba(34,32,26,0.20)", fontFamily: DT.sans }}>
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: DT.textPrimary, lineHeight: 1.18, overflowWrap: "anywhere" }}>{task.text}</div>
          <div style={{ marginTop: 3, fontSize: 10, fontWeight: 750, color: DT.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.rowName}</div>
        </div>
        <span style={{ flex: "0 0 auto", border: "1px solid rgba(110,138,106,0.22)", background: "rgba(110,138,106,0.09)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontSize: 9, fontWeight: 950 }}>1h</span>
      </div>
    </div>
  );
}

function SortablePlanTaskCard({
  task,
  selectedOrder,
  planTaskLinks,
  planTaskLinksLoaded = true,
  resolveTaskOrderId,
  onTaskSelect,
  onTaskOpen,
  onTaskEdit,
  onTaskDoneToggle,
  isNextTask = false,
}: {
  task: DraggablePlanTask;
  selectedOrder?: UiOrder | null;
  planTaskLinks: PlanTaskLinks;
  planTaskLinksLoaded?: boolean;
  resolveTaskOrderId?: (task: DraggablePlanTask) => number | null;
  onTaskSelect?: (task: DraggablePlanTask) => void;
  onTaskOpen?: (task: DraggablePlanTask) => void;
  onTaskEdit?: (task: DraggablePlanTask) => void;
  onTaskDoneToggle?: (task: DraggablePlanTask, done: boolean, origin?: DelightOrigin) => void;
  isNextTask?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "plan-task" },
  });
  const resolvedOrderId = resolveTaskOrderId?.(task) ?? null;
  const effectiveOrderIds = resolvedOrderId ? [resolvedOrderId] : effectiveTaskOrderIds(task, planTaskLinks);
  const isSelectedOrderTask = selectedOrder ? effectiveOrderIds.includes(selectedOrder.id) || planTaskMatchesOrder(task, selectedOrder) : false;
  const isUnlinkedTask = effectiveOrderIds.length === 0;
  const personVisual = PERSON_VISUALS[task.person];
  const orderConnection = planTaskLinksLoaded
    ? orderConnectionLabel(task, planTaskLinks, resolvedOrderId)
    : { state: "connected" as OrderConnectionState, label: "Checking", detail: "Checking order link" };
  const orderConnectionVisual = orderConnectionStyle(orderConnection.state, isSelectedOrderTask);
  const taskBackground = task.done
    ? DONE_TASK_VISUAL.bg
    : isSelectedOrderTask
    ? "linear-gradient(135deg, rgba(255,246,199,0.98), rgba(255,255,255,0.94) 54%, rgba(12,124,122,0.12))"
    : isNextTask && !isUnlinkedTask
      ? "linear-gradient(135deg, rgba(255,253,249,0.98), rgba(110,138,106,0.12))"
      : isUnlinkedTask
        ? "linear-gradient(135deg, rgba(255,255,255,0.90), rgba(232,230,224,0.52))"
        : personVisual.taskBg;
  const taskBorder = task.done
    ? DONE_TASK_VISUAL.border
    : isSelectedOrderTask
    ? "rgba(190,137,24,0.92)"
    : isNextTask && !isUnlinkedTask
      ? "rgba(110,138,106,0.30)"
      : isUnlinkedTask
        ? "rgba(125,122,115,0.24)"
        : personVisual.taskBorder;
  const taskStripe = task.done ? DONE_TASK_VISUAL.stripe : isUnlinkedTask ? personVisual.stripeMuted : personVisual.stripe;
  const displayTaskText = friendlyWorkshopTaskText(task.text);
  const displayCustomerName = taskCustomerDisplayName(task);
  const orderConnectionNeedsAttention = orderConnection.state === "needs-order" || orderConnection.state === "possible";
  const taskShadow = isDragging
    ? "0 0 0 2px rgba(110,138,106,0.12)"
    : task.done
      ? DONE_TASK_VISUAL.shadow
      : isSelectedOrderTask
      ? "0 0 0 3px rgba(211,154,35,0.28), 0 0 0 7px rgba(12,124,122,0.08), 0 8px 20px rgba(80,57,20,0.16)"
      : isNextTask && !isUnlinkedTask
        ? "0 2px 8px rgba(110,138,106,0.08)"
        : "0 1px 2px rgba(0,0,0,0.025)";
  return (
    <div
      ref={setNodeRef}
      data-plan-task-id={task.id}
      data-qa-plan-task={task.id}
      role="button"
      tabIndex={0}
      onClick={() => onTaskEdit?.(task) ?? onTaskSelect?.(task)}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onTaskOpen?.(task);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onTaskSelect?.(task);
        }
      }}
      title={isUnlinkedTask ? "Needs order link before this task can start" : "Click to edit task, or drag to move it"}
      style={{
        display: "block",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        textDecoration: "none",
        color: task.done ? DONE_TASK_VISUAL.text : isUnlinkedTask ? "#4f4b46" : DT.textPrimary,
        background: taskBackground,
        borderStyle: task.done || isUnlinkedTask ? "dashed" : "solid",
        borderTopWidth: isSelectedOrderTask ? 2 : 1,
        borderRightWidth: isSelectedOrderTask ? 2 : 1,
        borderBottomWidth: isSelectedOrderTask ? 2 : 1,
        borderLeftWidth: isSelectedOrderTask ? 7 : 5,
        borderTopColor: taskBorder,
        borderRightColor: taskBorder,
        borderBottomColor: taskBorder,
        borderLeftColor: taskStripe,
        borderRadius: 10,
        minHeight: isSelectedOrderTask ? 96 : 88,
        padding: isSelectedOrderTask ? "9px 9px" : isNextTask ? "8px 8px" : "7px 8px",
        cursor: "default",
        opacity: isDragging ? 0.28 : 1,
        boxShadow: taskShadow,
        outline: "none",
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "transform 180ms ease, opacity 120ms ease, box-shadow 120ms ease",
        touchAction: "manipulation",
      }}
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        data-task-card-main="task-card-main"
        data-task-card-clean-layout="true"
        style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 7, minHeight: "100%", minWidth: 0, cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start", gap: 7, minWidth: 0 }}>
          <div style={{ minWidth: 0, display: "grid", gap: 3 }}>
            <div data-task-card-meta="task-card-meta" style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flexWrap: "wrap" }}>
              {!isSelectedOrderTask && isNextTask && !isUnlinkedTask && (
                <span style={{ display: "inline-flex", border: "1px solid rgba(110,138,106,0.22)", background: "rgba(110,138,106,0.10)", color: DT.sage, borderRadius: 999, padding: "1px 6px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950, whiteSpace: "nowrap" }}>Start here</span>
              )}
              {orderConnectionNeedsAttention && (
                <span title={orderConnection.detail} style={{ flex: "1 1 86px", minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", color: orderConnectionVisual.color, background: orderConnectionVisual.bg, border: `1px solid ${orderConnectionVisual.border}`, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950, whiteSpace: "nowrap", textAlign: "center" }}>{orderConnection.label}</span>
              )}
            </div>
            <div data-customer-left-label="customer-left-label" style={{ fontSize: isSelectedOrderTask ? 11 : 10, color: task.done ? DONE_TASK_VISUAL.text : isUnlinkedTask ? "#8d8880" : DT.textPrimary, fontFamily: DT.sans, fontWeight: 980, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayCustomerName}</div>
          </div>
          <span style={{ flex: "0 0 auto", border: "1px solid rgba(110,138,106,0.20)", background: "rgba(110,138,106,0.08)", color: DT.sage, borderRadius: 999, padding: "3px 7px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1, whiteSpace: "nowrap" }}>{formatTaskHours(task.estimatedHours)}</span>
        </div>
        <div data-task-card-title="task-card-title" style={{ alignSelf: "center", fontSize: isSelectedOrderTask ? 13.5 : isNextTask ? 12.5 : 12, fontFamily: DT.sans, fontWeight: isSelectedOrderTask ? 980 : isUnlinkedTask ? 820 : 930, lineHeight: 1.18, overflowWrap: "break-word", wordBreak: "normal", color: task.done ? DONE_TASK_VISUAL.title : undefined, textDecoration: task.done ? "line-through" : "none", textDecorationColor: task.done ? "rgba(111,107,99,0.68)" : undefined, opacity: task.done ? 0.72 : 1 }}>{displayTaskText}</div>
        <div data-task-card-actions="task-card-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 5, minWidth: 0, flexWrap: "nowrap" }}>
          <button
            type="button"
            data-task-card-done-button="task-card-done-button"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const cardElement = event.currentTarget.closest("[data-plan-task-id]") as HTMLElement | null;
              onTaskDoneToggle?.(task, !task.done, { x: event.clientX, y: event.clientY, cardRect: cardElement?.getBoundingClientRect() });
            }}
            style={{ flex: "0 0 auto", border: `1px solid ${task.done ? DONE_TASK_VISUAL.buttonBorder : DT.border}`, background: task.done ? DONE_TASK_VISUAL.buttonBg : "rgba(255,255,255,0.82)", color: task.done ? DONE_TASK_VISUAL.title : DT.textMuted, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap", lineHeight: 1.2 }}
          >
            {task.done ? "↩ Undo" : "✓ Done"}
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onTaskEdit?.(task);
            }}
            style={{ flex: "0 0 auto", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", color: DT.textMuted, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", lineHeight: 1.2 }}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}


function WorkshopTaskEditor({
  task,
  orders,
  dateOptions,
  planTaskLinks,
  onSave,
  onConnectOrder,
  onRemoveOrder,
  onOpenOrder,
  onClose,
}: {
  task: BoardPlanTask;
  orders: UiOrder[];
  dateOptions: SuggestedDateOption[];
  planTaskLinks: PlanTaskLinks;
  onSave: (task: BoardPlanTask) => void;
  onConnectOrder: (task: BoardPlanTask, orderId: number) => void;
  onRemoveOrder: (task: BoardPlanTask) => void;
  onOpenOrder: (orderId: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BoardPlanTask>({ ...task, estimatedHours: cleanTaskEstimatedHours(task.estimatedHours) });
  const connectedOrderId = assignedOrderIdForTask(task, planTaskLinks) ?? task.linkedOrderIds[0] ?? "";
  const [orderId, setOrderId] = useState<string>(connectedOrderId ? String(connectedOrderId) : "");
  const connection = orderConnectionLabel(task, planTaskLinks, connectedOrderId ? Number(connectedOrderId) : null);
  const activeConnection = orderId ? { state: "connected" as OrderConnectionState, label: "Order linked", detail: "Customer order attached" } : connection;
  const connectionVisual = orderConnectionStyle(activeConnection.state);
  const selectedOrder = orderId ? orders.find((order) => order.id === Number(orderId)) ?? null : null;
  const selectedDateOption = dateOptions.find((option) => option.weekId === draft.weekId && option.day === draft.day) ?? null;
  const selectedDateLabel = selectedDateOption ? `${selectedDateOption.dateLabel} · ${selectedDateOption.weekTitle}` : `${DAY_LABELS[draft.day]} · date not in visible six weeks`;
  const isCustomTask = !TABLE_TASK_STAGE_SUGGESTIONS.includes(draft.text as (typeof TABLE_TASK_STAGE_SUGGESTIONS)[number]);
  const hours = cleanTaskEstimatedHours(draft.estimatedHours);
  const isInternalDraft = /internal workshop/i.test(draft.rowName);
  const editorChecks = [
    !orderId && !isInternalDraft ? "No order selected" : null,
    !selectedDateOption ? "Date outside visible plan" : null,
    hours === 0 ? "Hours is zero" : null,
    isCustomTask ? "Custom task wording" : null,
  ].filter((item): item is string => Boolean(item));
  const dateOptionGroups = useMemo(() => {
    const groups: Array<{ weekTitle: string; options: SuggestedDateOption[] }> = [];
    for (const option of dateOptions) {
      const last = groups[groups.length - 1];
      if (last?.weekTitle === option.weekTitle) {
        last.options.push(option);
      } else {
        groups.push({ weekTitle: option.weekTitle, options: [option] });
      }
    }
    return groups;
  }, [dateOptions]);

  function chooseDate(option: SuggestedDateOption) {
    setDraft((current) => ({ ...current, weekId: option.weekId, day: option.day }));
  }

  function saveTask() {
    onSave({ ...draft, text: draft.text.trim() || task.text, rowName: draft.rowName.trim() || task.rowName, estimatedHours: cleanTaskEstimatedHours(draft.estimatedHours) });
    if (orderId) onConnectOrder(task, Number(orderId));
    onClose();
  }
  function openSelectedOrderDetails() {
    if (!orderId) return;
    onClose();
    onOpenOrder(Number(orderId));
  }
  function markInternal() {
    const next = { ...draft, rowName: draft.rowName.trim() || "Internal workshop" };
    setDraft(next);
    onSave(next);
    onRemoveOrder(task);
    onClose();
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Edit workshop task" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 240, display: "grid", placeItems: "center", background: "rgba(25,23,20,0.58)", padding: 24, backdropFilter: "blur(5px)" }}>
      <div data-workshop-task-editor="desktop-landscape-task-editor" onClick={(event) => event.stopPropagation()} style={{ width: "min(980px, calc(100vw - 48px))", maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column", borderWidth: "1px 1px 1px 6px", borderStyle: "solid", borderColor: `${DT.border} ${DT.border} ${DT.border} ${DT.teal}`, borderRadius: 16, background: "rgba(255,255,255,0.98)", boxShadow: "0 28px 70px rgba(20,26,24,0.24)", overflow: "hidden" }}>
        <div style={{ flex: "0 0 auto", padding: "17px 20px 14px", borderBottom: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.94)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.teal }}>Edit workshop task</div>
              <h3 style={{ margin: "4px 0 0", fontFamily: DT.serif, fontSize: 29, lineHeight: 1.02, color: DT.textPrimary, overflowWrap: "anywhere" }}>{draft.text.trim() || task.text}</h3>
              <div style={{ marginTop: 6, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, fontWeight: 850 }}>
                <span>{draft.rowName.trim() || "Customer / order"}</span>
                <span aria-hidden="true">/</span>
                <span>{selectedDateLabel}</span>
                <span aria-hidden="true">/</span>
                <span>{PERSON_LABELS[draft.person]}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ flex: "0 0 auto", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", borderRadius: 999, padding: "7px 11px", cursor: "pointer", color: DT.textMuted, fontWeight: 900 }}>Close</button>
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(340px, 0.95fr)", gap: 16, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
              <section style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, fontWeight: 900 }}>
                  What to do
                  <select
                    aria-label="Stage suggestion"
                    value={TABLE_TASK_STAGE_SUGGESTIONS.includes(draft.text as (typeof TABLE_TASK_STAGE_SUGGESTIONS)[number]) ? draft.text : STAGE_CUSTOM_VALUE}
                    onChange={(event) => {
                      if (event.target.value === STAGE_CUSTOM_VALUE) return;
                      setDraft((current) => ({ ...current, text: event.target.value }));
                    }}
                    style={{ border: `1px solid ${DT.border}`, borderRadius: 10, padding: "10px 11px", fontSize: 14, color: DT.textPrimary, background: DT.cardBg, fontWeight: 850 }}
                  >
                    <option value="" disabled>Choose standard table stage...</option>
                    {TABLE_TASK_STAGE_SUGGESTIONS.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                    <option value={STAGE_CUSTOM_VALUE}>Custom task...</option>
                  </select>
                  {isCustomTask && (
                    <input aria-label="Custom task" value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} placeholder="Describe custom task" style={{ border: `1px solid ${DT.border}`, borderRadius: 10, padding: "10px 11px", fontSize: 14, color: DT.textPrimary, background: "rgba(255,255,255,0.94)" }} />
                  )}
                </label>

                <label style={{ display: "grid", gap: 5, fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, fontWeight: 900 }}>
                  Customer / order label
                  <input value={draft.rowName} onChange={(event) => setDraft((current) => ({ ...current, rowName: event.target.value }))} style={{ border: `1px solid ${DT.border}`, borderRadius: 10, padding: "10px 11px", fontSize: 14, color: DT.textPrimary, background: "rgba(255,255,255,0.94)", fontWeight: 850 }} />
                </label>

                <label style={{ display: "grid", gap: 5, fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, fontWeight: 900 }}>
                  Hours allocated
                  <input
                    aria-label="Hours allocated"
                    type="number"
                    min="0"
                    step="0.5"
                    value={hours}
                    onChange={(event) => setDraft((current) => ({ ...current, estimatedHours: cleanTaskEstimatedHours(event.target.value) }))}
                    style={{ border: `1px solid ${hours === 0 ? "rgba(153,27,27,0.24)" : DT.border}`, borderRadius: 10, padding: "10px 11px", fontSize: 14, color: DT.textPrimary, background: "rgba(255,255,255,0.94)", fontWeight: 850 }}
                  />
                </label>
              </section>

              <section style={{ border: `1px solid ${DT.border}`, borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.82)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Order connection</div>
                  <span style={{ color: connectionVisual.color, background: connectionVisual.bg, border: `1px solid ${connectionVisual.border}`, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{activeConnection.label}</span>
                </div>
                <select value={orderId} onChange={(event) => setOrderId(event.target.value)} style={{ marginTop: 9, width: "100%", border: `1px solid ${DT.border}`, borderRadius: 10, padding: "10px 11px", color: DT.textPrimary, background: DT.cardBg, fontSize: 14 }}>
                  <option value="">Choose customer/order...</option>
                  {orders.map((order) => <option key={order.id} value={order.id}>{order.customer}</option>)}
                </select>
                {selectedOrder && (
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <MiniFact label="Due" value={formatShortDate(selectedOrder.shipDate)} />
                    <MiniFact label="Status" value={orderStatusLabel(selectedOrder)} />
                  </div>
                )}
                <div style={{ marginTop: 9, display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => orderId && onConnectOrder(task, Number(orderId))} disabled={!orderId} style={{ border: `1px solid rgba(12,124,122,0.20)`, background: orderId ? DT.tealSoft : "rgba(0,0,0,0.035)", color: orderId ? DT.teal : DT.textFaint, borderRadius: 999, padding: "7px 10px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: orderId ? "pointer" : "not-allowed" }}>Connect order</button>
                  <button type="button" onClick={openSelectedOrderDetails} disabled={!orderId} title={selectedOrder ? `Open ${selectedOrder.customer} full order details` : "Choose an order first"} style={{ border: `1px solid ${orderId ? "rgba(12,124,122,0.20)" : DT.border}`, background: orderId ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.035)", color: orderId ? DT.teal : DT.textFaint, borderRadius: 999, padding: "7px 10px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: orderId ? "pointer" : "not-allowed" }}>Open full order details</button>
                  <button type="button" onClick={markInternal} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.84)", color: DT.textMuted, borderRadius: 999, padding: "7px 10px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}>No customer / internal</button>
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
              <section style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Date</div>
                    <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, fontWeight: 900 }}>{selectedDateLabel}</div>
                  </div>
                  <span style={{ border: "1px solid rgba(12,124,122,0.18)", background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>6 weeks</span>
                </div>
                <div data-workshop-date-list="six-week-date-options" style={{ marginTop: 10, maxHeight: 274, overflowY: "auto", paddingRight: 4, display: "grid", gap: 9 }}>
                  {dateOptionGroups.map((group) => (
                    <div key={group.weekTitle}>
                      <div style={{ marginBottom: 5, fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>{group.weekTitle}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 5 }}>
                        {group.options.map((option) => {
                          const active = option.weekId === draft.weekId && option.day === draft.day;
                          return (
                            <button
                              type="button"
                              key={`${option.weekId}:${option.day}`}
                              data-workshop-date-option={option.dateIso}
                              onClick={() => chooseDate(option)}
                              style={{ minHeight: 48, border: `1px solid ${active ? "rgba(12,124,122,0.34)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.82)", color: active ? DT.teal : DT.textPrimary, borderRadius: 9, padding: "7px 5px", cursor: "pointer", boxShadow: active ? "inset 0 0 0 1px rgba(12,124,122,0.16)" : undefined, textAlign: "center" }}
                            >
                              <span style={{ display: "block", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, lineHeight: 1.15 }}>{option.dateLabel.split(", ")[0]}</span>
                              <span style={{ display: "block", marginTop: 2, fontFamily: DT.sans, fontSize: 9, fontWeight: 850, color: active ? DT.teal : DT.textMuted, lineHeight: 1.15 }}>{option.dateLabel.split(", ")[1] ?? ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Person</div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {PEOPLE.map((person) => {
                    const active = draft.person === person;
                    return (
                      <button
                        type="button"
                        key={person}
                        onClick={() => setDraft((current) => ({ ...current, person }))}
                        style={{ border: `1px solid ${active ? "rgba(12,124,122,0.30)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.82)", color: active ? DT.teal : DT.textMuted, borderRadius: 10, padding: "10px 11px", fontFamily: DT.sans, fontSize: 13, fontWeight: 950, cursor: "pointer" }}
                      >
                        {PERSON_LABELS[person]}
                      </button>
                    );
                  })}
                </div>
              </section>

              {editorChecks.length > 0 && (
                <section style={{ border: "1px solid rgba(154,106,20,0.20)", background: "rgba(255,250,235,0.76)", borderRadius: 12, padding: 11 }}>
                  <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a5d08" }}>Review before saving</div>
                  <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {editorChecks.map((check) => <span key={check} style={{ border: "1px solid rgba(154,106,20,0.18)", background: "rgba(255,255,255,0.68)", color: "#8a5d08", borderRadius: 999, padding: "4px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 900 }}>{check}</span>)}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "13px 18px", borderTop: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.96)" }}>
          <span style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750 }}>Saves this card in Tuesday only. It does not change the source order record.</span>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "9px 14px", fontWeight: 900, cursor: "pointer" }}>Cancel</button>
            <button type="button" title="Saves this card in Tuesday only" onClick={saveTask} style={{ border: `1px solid rgba(12,124,122,0.24)`, background: DT.teal, color: "#fff", borderRadius: 999, padding: "9px 14px", fontWeight: 950, cursor: "pointer", boxShadow: "0 8px 18px rgba(12,124,122,0.14)" }}>Save task edits</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function SortableSuggestedStepCard({
  step,
  approved,
  customer,
  onMove,
  onSelect,
  onOpen,
}: {
  step: SuggestedOrderPlanStep;
  approved: boolean;
  customer?: string;
  onMove?: (id: string, day: DayKey, person: Person, dateIso: string, dateLabel: string, overStepId?: string, insertAfter?: boolean) => void;
  onSelect?: () => void;
  onOpen?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragEnd(event: DragEvent<HTMLDivElement>) {
    setIsDragging(false);
    if (approved) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const targetStep = hit?.closest("[data-suggested-step-id]") as HTMLElement | null;
    const target = hit?.closest("[data-plan-lane-day]") as HTMLElement | null;
    const day = target?.dataset.planLaneDay as DayKey | undefined;
    const person = target?.dataset.planLanePerson as Person | undefined;
    const dateIso = target?.dataset.planLaneDateIso;
    const dateLabel = target?.dataset.planLaneDateLabel;
    if (!day || !person || !dateIso || !dateLabel) return;
    const overStepId = targetStep?.dataset.suggestedStepId;
    const rect = targetStep?.getBoundingClientRect();
    const insertAfter = rect ? event.clientY > rect.top + rect.height / 2 : true;
    onMove?.(step.id, day, person, dateIso, dateLabel, overStepId, insertAfter);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!approved}
      data-suggested-step-id={step.id}
      onClick={() => onSelect?.()}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      onDragStart={(event) => {
        if (approved) return;
        setIsDragging(true);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", suggestedStepDragId(step.id));
      }}
      onDragEnd={handleDragEnd}
      title="Click to review this order, double-click to open it, or drag to plan it"
      style={{
        display: "block",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        textDecoration: "none",
        color: DT.textPrimary,
        background: REVIEW_GLOW.bg,
        borderWidth: "1px 1px 1px 5px",
        borderStyle: "solid",
        borderColor: `${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.borderStrong} ${REVIEW_GLOW.color}`,
        borderRadius: 8,
        padding: "6px 7px",
        boxShadow: REVIEW_GLOW.shadow,
        cursor: approved ? "pointer" : isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.28 : 1,
        outline: "none",
        transition: "opacity 120ms ease, box-shadow 120ms ease, transform 120ms ease",
        touchAction: "none",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start", minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, marginBottom: 2 }}>
            <span style={{ flex: "0 0 auto", fontSize: 8, color: REVIEW_GLOW.color, fontFamily: DT.sans, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.04em" }}>{approved ? "Approved draft" : "Draft"}</span>
            <span style={{ minWidth: 0, fontSize: 9, color: DT.textFaint, fontFamily: DT.sans, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{step.dateLabel}</span>
          </div>
          <div style={{ fontSize: 12, fontFamily: DT.sans, fontWeight: 920, lineHeight: 1.18, overflowWrap: "anywhere" }}>{step.title}</div>
          <div style={{ marginTop: 3, fontSize: 10, color: DT.textMuted, fontFamily: DT.sans, fontWeight: 750, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer ?? step.noWriteLabel}</div>
        </div>
        <span style={{ flex: "0 0 auto", border: "1px solid rgba(110,138,106,0.20)", background: "rgba(110,138,106,0.08)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1 }}>{Number(step.estimatedHours || 1)}h</span>
      </div>
    </div>
  );
}

function DroppablePlanLane({
  id,
  day,
  person,
  dateIso,
  dateLabel,
  items,
  isTodayColumn,
  isDropTarget,
  capacity,
  children,
}: {
  id: string;
  day: DayKey;
  person: Person;
  dateIso?: string;
  dateLabel?: string;
  items: string[];
  isTodayColumn: boolean;
  isDropTarget: boolean;
  capacity: LaneCapacitySummary;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id, data: { type: "plan-lane", day, person, dateIso, dateLabel } });
  const personVisual = PERSON_VISUALS[person];
  const capacityStyle = CAPACITY_STYLES[capacity.status];
  const capacityText = capacity.status === "ok" ? capacity.label : `${capacityStyle.label} · ${capacity.label}`;
  return (
    <div
      ref={setNodeRef}
      data-plan-lane-day={day}
      data-qa-plan-lane={id}
      data-plan-lane-person={person}
      data-plan-lane-date-iso={dateIso}
      data-plan-lane-date-label={dateLabel}
      onDragOver={(event) => event.preventDefault()}
      style={{ minHeight: 54, minWidth: 0, overflow: "hidden", padding: 5, borderRadius: 9, borderWidth: "1px 1px 1px 3px", borderStyle: "dashed dashed dashed solid", borderColor: (isDropTarget ? "rgba(110,138,106,0.62)" : personVisual.laneBorder) + " " + (isDropTarget ? "rgba(110,138,106,0.62)" : personVisual.laneBorder) + " " + (isDropTarget ? "rgba(110,138,106,0.62)" : personVisual.laneBorder) + " " + personVisual.stripe, background: isDropTarget ? "rgba(110,138,106,0.085)" : "linear-gradient(135deg, " + personVisual.laneBg + ", " + (isTodayColumn ? "rgba(255,255,255,0.54)" : "rgba(255,255,255,0.38)") + ")", transition: "background 160ms ease, border-color 160ms ease, box-shadow 160ms ease", boxShadow: isTodayColumn ? "inset 0 0 0 1px " + personVisual.taskSoft : undefined }}
    >
      <div style={{ marginBottom: 5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, color: personVisual.text, fontFamily: DT.sans, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: personVisual.stripe, boxShadow: "0 0 0 3px " + personVisual.taskSoft, flex: "0 0 auto" }} />{PERSON_LABELS[person]}</span>
        <span title={capacity.detail} style={{ border: `1px solid ${capacityStyle.border}`, background: capacityStyle.bg, color: capacityStyle.color, borderRadius: 999, padding: "2px 5px", fontSize: 8, fontFamily: DT.sans, fontWeight: 950, lineHeight: 1, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {capacityText}
        </span>
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>{children}</div>
      </SortableContext>
    </div>
  );
}

function MonthWeekSection({
  week,
  tasks = [],
  suggestedSteps = [],
  approvedSuggestions = false,
  selectedOrder = null,
  appTasks = [],
  planTaskLinks = {},
  planTaskLinksLoaded = true,
  resolveTaskOrderId,
  activeTaskId = null,
  activeSuggestedStepId = null,
  dropPreview = null,
  isDraftChanged = false,
  showDraftControls = false,
  onResetDraftLayout,
  onTaskSelect,
  onTaskOpen,
  onTaskEdit,
  onTaskDoneToggle,
  onAppTaskSelect,
  onAppTaskOpen,
  onSuggestedStepMove,
  onSuggestedStepSelect,
  onSuggestedStepOpen,
  suggestedStepCustomer,
  personFilter = "all",
  weekHeaderControl,
  forcePlanningLanes = false,
}: {
  week: PlanWeek;
  tasks?: BoardPlanTask[];
  suggestedSteps?: SuggestedOrderPlanStep[];
  approvedSuggestions?: boolean;
  selectedOrder?: UiOrder | null;
  appTasks?: AppPlanTask[];
  planTaskLinks?: PlanTaskLinks;
  planTaskLinksLoaded?: boolean;
  resolveTaskOrderId?: (task: DraggablePlanTask) => number | null;
  activeTaskId?: string | null;
  activeSuggestedStepId?: string | null;
  dropPreview?: BoardDropPreview | null;
  isDraftChanged?: boolean;
  showDraftControls?: boolean;
  onResetDraftLayout?: () => void;
  onTaskSelect?: (task: DraggablePlanTask) => void;
  onTaskOpen?: (task: DraggablePlanTask) => void;
  onTaskEdit?: (task: BoardPlanTask) => void;
  onTaskDoneToggle?: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onAppTaskSelect?: (task: AppPlanTask) => void;
  onAppTaskOpen?: (task: AppPlanTask) => void;
  onSuggestedStepMove?: (id: string, day: DayKey, person: Person, dateIso?: string, dateLabel?: string, overStepId?: string, insertAfter?: boolean) => void;
  onSuggestedStepSelect?: () => void;
  onSuggestedStepOpen?: () => void;
  suggestedStepCustomer?: string;
  personFilter?: PersonFilter;
  weekHeaderControl?: ReactNode;
  forcePlanningLanes?: boolean;
}) {
  const weekAppTasks = useMemo(() => appTasks.filter((task) => appTaskFallsInWeek(task, week)), [appTasks, week]);
  const isNarrow = useIsNarrow();
  const visiblePeople = personFilter === "all" ? PEOPLE : [personFilter];
  const visibleDays = DAYS;
  const todayKey = currentDayKey();
  const weekRange = weekRangeFromTitle(week.title);
  const now = new Date();
  const visibleStart = planningVisibleStart(now);
  const isCurrentWeek = Boolean(weekRange && weekRange.start.getTime() === visibleStart.getTime());
  const hasVisibleTasks = tasks.length > 0 || weekAppTasks.length > 0 || suggestedSteps.length > 0;
  const showPlanningLanes = forcePlanningLanes || hasVisibleTasks;

  return (
    <section data-current-week-prominent-border={isCurrentWeek ? "current-week-prominent-border" : undefined} style={{ background: DT.cardBg, border: `${isCurrentWeek ? 3 : 1}px solid ${isCurrentWeek ? "rgba(12,124,122,0.58)" : DT.border}`, borderRadius: DT.radius, boxShadow: isCurrentWeek ? "0 0 0 4px rgba(12,124,122,0.10), 0 8px 28px rgba(34,32,26,0.09)" : DT.shadow, overflow: "hidden", minWidth: 0 }}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${DT.border}`, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", background: weekHeaderControl ? "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(110,138,106,0.055))" : undefined }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 20, lineHeight: 1 }}>{displayWeekTitle(week.title)}</h2>
            {isCurrentWeek && <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.teal }}>Current week</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 520px" }}>
            {weekHeaderControl}
            {showDraftControls && isDraftChanged && <Chip label="Move saving..." tone="amber" />}
            {showDraftControls && isDraftChanged && (
              <button
                type="button"
                onClick={onResetDraftLayout}
                style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "5px 9px", fontSize: 10, fontFamily: DT.sans, fontWeight: 800, cursor: "pointer" }}
              >
                Revert
              </button>
            )}
            {!hasVisibleTasks && <Chip label="No day assignments" tone="grey" />}
          </div>
        </div>
        <div style={{ display: isNarrow ? "flex" : "grid", gridTemplateColumns: isNarrow ? undefined : `repeat(${visibleDays.length}, minmax(0, 1fr))`, overflowX: isNarrow ? "auto" : "hidden", WebkitOverflowScrolling: isNarrow ? "touch" : undefined, minWidth: 0 }}>
          {visibleDays.map((day) => {
            const isTodayColumn = isCurrentWeek && todayKey === day;
            const dateOption = suggestedDateOptionForWeekDay(week, day);
            return (
              <div key={day} style={{ flex: isNarrow ? "0 0 250px" : undefined, minWidth: 0, minHeight: showPlanningLanes ? 146 : 42, padding: 8, borderLeft: day === "monday" || isNarrow ? "none" : `1px solid ${DT.border}`, borderRight: isNarrow ? `1px solid ${DT.border}` : undefined, background: isTodayColumn ? "linear-gradient(180deg, rgba(12,124,122,0.08), rgba(255,255,255,0))" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, marginBottom: showPlanningLanes ? 7 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: isTodayColumn ? DT.teal : DT.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: DT.sans }}>{DAY_LABELS[day]}</span>
                  {isTodayColumn && <span style={{ border: "1px solid rgba(12,124,122,0.22)", background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "2px 5px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950 }}>Today</span>}
                </div>
                {showPlanningLanes && (
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    {visiblePeople.map((person) => {
                      const laneTasks = tasks.filter((task) => task.weekId === week.id && task.day === day && task.person === person).sort(sortBoardTasksForLane);
                      const laneAppTasks = weekAppTasks.filter((task) => task.day === day && task.person === person);
                      const laneOpenAppTasks = laneAppTasks.filter((task) => !task.done);
                      const laneSuggestions = suggestedSteps.filter((step) => step.day === day && step.person === person);
                      const laneDraftHours = laneSuggestions.reduce((sum, step) => sum + Number(step.estimatedHours || 0), 0);
                      const capacity = summarizeLaneCapacity({ existingTaskCount: laneTasks.length, draftHours: laneDraftHours + laneOpenAppTasks.length });
                      const laneId = boardPlanLaneId(week.id, day, person);
                      const isDropTarget = Boolean((activeTaskId || activeSuggestedStepId) && dropPreview?.weekId === week.id && dropPreview.day === day && dropPreview.person === person);
                      const showDropSlot = (itemId?: string, insertAfter = false) => Boolean(isDropTarget && dropPreview?.overId === itemId && Boolean(dropPreview?.insertAfter) === insertAfter);
                      const dropSlot = <div aria-hidden="true" style={{ height: 7, borderRadius: 999, background: "rgba(110,138,106,0.42)", boxShadow: "0 0 0 3px rgba(110,138,106,0.10)", margin: "1px 2px" }} />;
                      return (
                        <DroppablePlanLane
                          key={laneId}
                          id={laneId}
                          day={day}
                          person={person}
                          dateIso={dateOption?.dateIso}
                          dateLabel={dateOption?.dateLabel}
                          items={laneTasks.map((task) => task.id)}
                          isTodayColumn={isTodayColumn}
                          isDropTarget={isDropTarget}
                          capacity={capacity}
                        >
                          {laneTasks.map((task, laneIndex) => (
                            <div key={task.id} style={{ display: "contents" }}>
                              {showDropSlot(task.id, false) && dropSlot}
                              <SortablePlanTaskCard
                                task={task}
                                selectedOrder={selectedOrder}
                                planTaskLinks={planTaskLinks}
                                planTaskLinksLoaded={planTaskLinksLoaded}
                                resolveTaskOrderId={resolveTaskOrderId}
                                onTaskSelect={onTaskSelect}
                                onTaskOpen={onTaskOpen}
                                onTaskEdit={(item) => onTaskEdit?.(item as BoardPlanTask)}
                                onTaskDoneToggle={(item, done, origin) => onTaskDoneToggle?.(item as BoardPlanTask, done, origin)}
                                isNextTask={laneIndex === 0}
                              />
                              {showDropSlot(task.id, true) && dropSlot}
                            </div>
                          ))}
                          {isDropTarget && !dropPreview?.overId && dropSlot}
                          {laneAppTasks.map((task) => (
                            <div
                              key={`app-${task.id}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => onAppTaskSelect?.(task)}
                              onDoubleClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onAppTaskOpen?.(task);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onAppTaskSelect?.(task);
                                }
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                maxWidth: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                                overflow: "hidden",
                                color: task.done ? DONE_TASK_VISUAL.text : DT.textPrimary,
                                background: task.done ? DONE_TASK_VISUAL.bg : "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,255,255,0.94) 54%, rgba(12,124,122,0.08))",
                                borderWidth: "2px 2px 2px 7px",
                                borderStyle: task.done ? "dashed" : "solid",
                                borderColor: task.done ? `${DONE_TASK_VISUAL.border} ${DONE_TASK_VISUAL.border} ${DONE_TASK_VISUAL.border} ${DONE_TASK_VISUAL.stripe}` : "rgba(190,137,24,0.86) rgba(190,137,24,0.86) rgba(190,137,24,0.86) " + PERSON_VISUALS[person].stripe,
                                borderRadius: 8,
                                padding: "8px 8px",
                                cursor: onAppTaskSelect ? "pointer" : "default",
                                opacity: 1,
                                boxShadow: task.done ? DONE_TASK_VISUAL.shadow : "0 0 0 3px rgba(211,154,35,0.24), 0 0 0 7px rgba(12,124,122,0.08), 0 8px 20px rgba(80,57,20,0.14)",
                                outline: "none",
                              }}
                            >
                              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start", minWidth: 0 }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12.5, fontFamily: DT.sans, fontWeight: 980, lineHeight: 1.2, overflowWrap: "anywhere", color: task.done ? DONE_TASK_VISUAL.title : undefined, textDecoration: task.done ? "line-through" : "none", textDecorationColor: task.done ? "rgba(111,107,99,0.68)" : undefined }}>{task.title}</div>
                                  {selectedOrder && <div style={{ marginTop: 3, fontSize: 9, color: task.done ? DONE_TASK_VISUAL.text : DT.textMuted, fontFamily: DT.sans, lineHeight: 1.28, overflowWrap: "anywhere", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedOrder.customer}</div>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "0 0 auto" }}>
                                  <span style={{ border: "1px solid rgba(110,138,106,0.20)", background: "rgba(110,138,106,0.08)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1 }}>{formatTaskHours(1)}</span>
                                  <span style={{ color: task.done ? DONE_TASK_VISUAL.title : DT.teal, background: task.done ? DONE_TASK_VISUAL.buttonBg : DT.tealSoft, border: `1px solid ${task.done ? DONE_TASK_VISUAL.buttonBorder : "rgba(12,124,122,0.14)"}`, borderRadius: 999, padding: "1px 5px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950, whiteSpace: "nowrap" }}>{task.done ? "Done" : "Job"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {laneSuggestions.map((step) => {
                            const dragId = suggestedStepDragId(step.id);
                            return (
                              <div key={step.id} style={{ display: "contents" }}>
                                {showDropSlot(dragId, false) && dropSlot}
                                <SortableSuggestedStepCard
                                  step={step}
                                  approved={approvedSuggestions}
                                  customer={suggestedStepCustomer ?? selectedOrder?.customer}
                                  onMove={(id, targetDay, targetPerson, dateIso, dateLabel, overStepId, insertAfter) => onSuggestedStepMove?.(id, targetDay, targetPerson, dateIso, dateLabel, overStepId, insertAfter)}
                                  onSelect={onSuggestedStepSelect}
                                  onOpen={onSuggestedStepOpen}
                                />
                                {showDropSlot(dragId, true) && dropSlot}
                              </div>
                            );
                          })}
                          {laneTasks.length === 0 && laneAppTasks.length === 0 && laneSuggestions.length === 0 && (
                            <div style={{ padding: "6px 4px", borderRadius: 6, color: "rgba(124,116,107,0.54)", fontSize: 9, fontFamily: DT.sans, fontStyle: "italic", textAlign: "center" }}>Drop task</div>
                          )}
                        </DroppablePlanLane>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </section>
  );
}


function MonthView({
  weeks,
  newOrder,
  orders,
  delightEnabled,
  railFilter,
  onRailFilterChange,
  qaFixtureMode = false,
  initialPlanTaskLinkState,
  initialPlanTaskLinksStorage = "blob",
  initialPlanTaskLinksDisabledReason,
}: {
  weeks: PlanWeek[];
  newOrder: NewOrderPlanCandidate | null;
  orders: UiOrder[];
  delightEnabled?: boolean;
  railFilter: RailFilter;
  onRailFilterChange: (filter: RailFilter) => void;
  qaFixtureMode?: boolean;
  initialPlanTaskLinkState?: PlanTaskLinkStatePayload;
  initialPlanTaskLinksStorage?: PlanTaskLinksStorage;
  initialPlanTaskLinksDisabledReason?: string;
}) {
  return (
    <MonthViewState
      key={newOrder?.id ?? "none"}
      weeks={weeks}
      newOrder={newOrder}
      ordersForHealth={orders}
      delightEnabled={delightEnabled}
      railFilter={railFilter}
      onRailFilterChange={onRailFilterChange}
      qaFixtureMode={qaFixtureMode}
      initialPlanTaskLinkState={initialPlanTaskLinkState}
      initialPlanTaskLinksStorage={initialPlanTaskLinksStorage}
      initialPlanTaskLinksDisabledReason={initialPlanTaskLinksDisabledReason}
    />
  );
}

function WorkshopFocusBar({
  personFilter,
  onPersonFilterChange,
  todayCounts,
  historyControl,
}: {
  personFilter: PersonFilter;
  onPersonFilterChange: (filter: PersonFilter) => void;
  todayCounts: Record<Person, number>;
  historyControl?: ReactNode;
}) {
  const options: Array<{ id: PersonFilter; label: string; sublabel: string }> = [
    { id: "all", label: "All", sublabel: `${todayCounts.nick + todayCounts.dylan} tasks today` },
    { id: "nick", label: "Nick", sublabel: `${todayCounts.nick} tasks today` },
    { id: "dylan", label: "Dylan", sublabel: `${todayCounts.dylan} tasks today` },
  ];
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
      {options.map((option) => {
        const active = personFilter === option.id;
        return (
          <button
            type="button"
            key={option.id}
            onClick={() => onPersonFilterChange(option.id)}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, border: `1px solid ${active ? "rgba(12,124,122,0.34)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.72)", color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: "6px 10px", fontFamily: DT.sans, cursor: "pointer", minWidth: 112, textAlign: "center", whiteSpace: "nowrap" }}
          >
            <span style={{ fontSize: 11, fontWeight: 950, lineHeight: 1 }}>{option.label}</span>
            <span style={{ fontSize: 9, fontWeight: 850, lineHeight: 1, color: active ? DT.teal : DT.textFaint }}>{option.sublabel}</span>
          </button>
        );
      })}
      {historyControl}
    </div>
  );
}

function ProductionPlanModeToggle({ mode, onModeChange }: { mode: ProductionPlanMode; onModeChange: (mode: ProductionPlanMode) => void }) {
  const options: Array<{ id: ProductionPlanMode; label: string; hint: string }> = [
    { id: "schedule", label: "Schedule", hint: "Day / person capacity" },
    { id: "orderRows", label: "Orders", hint: "Order task view" },
  ];
  return (
    <div aria-label="Production plan view" style={{ display: "flex", gap: 4, padding: 3, border: `1px solid ${DT.border}`, borderRadius: 999, background: "rgba(255,255,255,0.76)", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
      {options.map((option) => {
        const active = mode === option.id;
        return (
          <button key={option.id} type="button" onClick={() => onModeChange(option.id)} title={option.hint} style={{ border: 0, borderRadius: 999, padding: "7px 10px", background: active ? DT.headerBg : "transparent", color: active ? "#fff" : DT.textMuted, fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function OrderJourneyView({
  rows,
  selectedOrder,
  onTaskEdit,
  onTaskSelect,
  onTaskOpen,
  onOrderOpen,
  onTaskDoneToggle,
}: {
  rows: OrderJourneyRow[];
  selectedOrder: UiOrder | null;
  onTaskEdit: (task: OrderJourneyTask) => void;
  onTaskSelect: (task: OrderJourneyTask) => void;
  onTaskOpen: (task: OrderJourneyTask) => void;
  onOrderOpen: (orderId: number) => void;
  onTaskDoneToggle: (task: OrderJourneyTask, done: boolean, origin?: DelightOrigin) => void;
}) {
  const isNarrow = useIsNarrow(880);
  const activeRows = rows.filter((row) => row.health !== "internal" && row.health !== "unlinked");
  const needsRows = rows.filter((row) => row.health === "internal" || row.health === "unlinked");
  const renderRow = (row: OrderJourneyRow) => {
    const selected = Boolean(row.order && selectedOrder?.id === row.order.id);
    const healthMeta = row.health === "internal"
      ? { label: "Internal", color: DT.sage, bg: "rgba(110,138,106,0.10)", border: "rgba(110,138,106,0.22)" }
      : row.health === "unlinked"
        ? { label: "Needs order", color: "#9a6a14", bg: "rgba(200,169,110,0.14)", border: "rgba(200,169,110,0.34)" }
        : HEALTH_META[row.health];
    const rowStyle = {
      borderWidth: "1px 1px 1px 4px",
      borderStyle: "solid",
      borderColor: `${selected ? "rgba(12,124,122,0.20)" : DT.border} ${selected ? "rgba(12,124,122,0.20)" : DT.border} ${selected ? "rgba(12,124,122,0.20)" : DT.border} ${healthMeta.color}`,
      background: selected ? "rgba(12,124,122,0.04)" : "rgba(255,255,255,0.86)",
      boxShadow: selected ? "0 8px 22px rgba(12,124,122,0.08)" : DT.shadow,
      borderRadius: DT.radius,
      overflow: "hidden",
    };
    return (
      <article key={row.id} style={rowStyle}>
        <div data-order-row-week-grid="order-row-week-grid" style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "220px repeat(5, minmax(104px, 1fr))", gap: 0 }}>
          <div style={{ padding: 12, borderRight: isNarrow ? "none" : `1px solid ${DT.border}`, borderBottom: isNarrow ? `1px solid ${DT.border}` : "none", background: "rgba(255,253,249,0.72)" }}>
            <div style={{ fontFamily: DT.serif, fontSize: 17, lineHeight: 1.08, color: DT.textPrimary, fontWeight: 750 }}>{row.name}</div>
            <div style={{ marginTop: 7, display: "flex", gap: 5, flexWrap: "wrap" }}>
              <span style={{ border: `1px solid ${healthMeta.border}`, background: healthMeta.bg, color: healthMeta.color, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontFamily: DT.sans, fontWeight: 950 }}>{healthMeta.label}</span>
              {row.dueLabel && <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", color: DT.textMuted, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontFamily: DT.sans, fontWeight: 850 }}>{row.dueLabel}</span>}
            </div>
            {row.statusLabel && <div style={{ marginTop: 7, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 800 }}>{row.statusLabel}</div>}
            {row.order && (
              <button type="button" onClick={() => onOrderOpen(row.order!.id)} style={{ marginTop: 9, border: `1px solid ${DT.border}`, background: DT.headerBg, color: "#fff", borderRadius: 999, padding: "6px 9px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>
                Open order
              </button>
            )}
          </div>
          {DAYS.map((day) => {
            const dayTasks = row.tasks.filter((task) => task.day === day);
            return (
              <div key={`${row.id}:${day}`} style={{ minHeight: isNarrow ? 0 : 104, padding: 8, borderLeft: isNarrow ? "none" : `1px solid ${DT.border}`, borderTop: isNarrow ? `1px solid ${DT.border}` : "none", background: dayTasks.length ? "rgba(255,255,255,0.50)" : "rgba(232,230,224,0.18)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: dayTasks.length ? 6 : 0 }}>
                  <span style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, color: DT.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>{DAY_LABELS[day]}</span>
                  {dayTasks.length > 1 && <span style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, color: DT.textMuted }}>{dayTasks.length}</span>}
                </div>
                {dayTasks.length === 0 ? (
                  <div data-empty-order-day-cell="empty-order-day-cell" style={{ minHeight: isNarrow ? 12 : 52, border: `1px dashed rgba(0,0,0,0.045)`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(124,116,107,0.48)", fontFamily: DT.sans, fontSize: 9, fontWeight: 850 }}>
                    No task
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {dayTasks.map((task) => {
                      const personVisual = PERSON_VISUALS[task.person];
                      const connection = orderConnectionStyle(task.connectionState, selected);
                      const taskDone = Boolean(task.done);
                      const orderRowTaskBorder = taskDone ? DONE_TASK_VISUAL.border : personVisual.taskBorder;
                      const orderRowTaskStripe = taskDone ? DONE_TASK_VISUAL.stripe : personVisual.stripe;
                      const orderRowTaskBg = taskDone ? DONE_TASK_VISUAL.bg : personVisual.taskBg;
                      return (
                        <div key={task.id} data-order-row-task-id={task.id} style={{ borderWidth: "1px 1px 1px 4px", borderStyle: taskDone ? "dashed" : "solid", borderColor: `${orderRowTaskBorder} ${orderRowTaskBorder} ${orderRowTaskBorder} ${orderRowTaskStripe}`, borderRadius: 10, background: orderRowTaskBg, boxShadow: taskDone ? DONE_TASK_VISUAL.shadow : undefined, padding: 8, minHeight: 76 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                            <span style={{ color: taskDone ? DONE_TASK_VISUAL.text : personVisual.text, fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{PERSON_LABELS[task.person]}</span>
                            <span style={{ color: taskDone ? DONE_TASK_VISUAL.text : DT.textMuted, fontFamily: DT.sans, fontSize: 9, fontWeight: 900 }}>{formatTaskHours(task.estimatedHours)}</span>
                          </div>
                          <button type="button" onClick={() => onTaskSelect(task)} style={{ marginTop: 5, padding: 0, border: 0, background: "transparent", color: taskDone ? DONE_TASK_VISUAL.title : DT.textPrimary, textAlign: "left", fontFamily: DT.sans, fontSize: 12, lineHeight: 1.18, fontWeight: 950, cursor: "pointer", textDecoration: taskDone ? "line-through" : "none", textDecorationColor: taskDone ? "rgba(111,107,99,0.68)" : undefined, opacity: taskDone ? 0.74 : 1 }}>{friendlyWorkshopTaskText(task.text)}</button>
                          <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                            {task.connectionState !== "connected" && task.connectionState !== "internal" && <span style={{ border: `1px solid ${connection.border}`, background: connection.bg, color: connection.color, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950 }}>{task.connectionState === "needs-order" ? "Needs link" : "Confirm"}</span>}
                            <button
                              type="button"
                              data-order-row-done-button="order-row-done-button"
                              onPointerDown={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              onTouchStart={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const cardElement = event.currentTarget.closest("[data-order-row-task-id]") as HTMLElement | null;
                                onTaskDoneToggle(task, !task.done, { x: event.clientX, y: event.clientY, cardRect: cardElement?.getBoundingClientRect() });
                              }}
                              style={{ border: `1px solid ${task.done ? DONE_TASK_VISUAL.buttonBorder : DT.border}`, background: task.done ? DONE_TASK_VISUAL.buttonBg : "rgba(255,255,255,0.72)", color: task.done ? DONE_TASK_VISUAL.title : DT.textMuted, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, cursor: "pointer", lineHeight: 1.2 }}
                            >
                              {task.done ? "↩ Undo" : "✓ Done"}
                            </button>
                            <button type="button" onClick={() => onTaskEdit(task)} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", color: DT.textMuted, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, cursor: "pointer", lineHeight: 1.2 }}>Edit task</button>
                            <button type="button" onClick={() => onTaskOpen(task)} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", color: DT.teal, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, cursor: "pointer", lineHeight: 1.2 }}>Details</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </article>
    );
  };

  if (rows.length === 0) {
    return <section style={{ border: `1px solid ${DT.border}`, borderRadius: DT.radius, background: DT.cardBg, padding: 22, fontFamily: DT.sans, color: DT.textMuted }}>No active order tasks in this window.</section>;
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {activeRows.map(renderRow)}
      {needsRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ padding: "4px 2px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, color: DT.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Needs order / internal</div>
          {needsRows.map(renderRow)}
        </div>
      )}
    </section>
  );
}

function TuesdayPlanStateLoading({ isNarrow }: { isNarrow: boolean }) {
  const rail = (
    <aside
      data-tuesday-state-loading="orders"
      aria-label="Loading Tuesday order state"
      style={{
        alignSelf: "start",
        width: isNarrow ? "100%" : 318,
        minWidth: isNarrow ? undefined : 318,
        border: `1px solid ${DT.border}`,
        borderRadius: DT.radius,
        background: "rgba(255,255,255,0.84)",
        boxShadow: DT.shadow,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${DT.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans }}>Orders</div>
        <div style={{ marginTop: 2, fontFamily: DT.serif, fontSize: 18, color: DT.textPrimary, lineHeight: 1 }}>Loading Tuesday state</div>
      </div>
      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} style={{ height: 52, borderRadius: 10, border: `1px solid ${DT.border}`, background: "linear-gradient(90deg, rgba(245,243,238,0.72), rgba(255,255,255,0.92), rgba(245,243,238,0.72))" }} />
        ))}
      </div>
    </aside>
  );
  const board = (
    <section
      data-tuesday-state-loading="board"
      style={{
        minHeight: 360,
        border: `1px solid ${DT.border}`,
        borderRadius: DT.radius,
        background: "rgba(255,255,255,0.82)",
        boxShadow: DT.shadow,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 10,
        color: DT.textMuted,
        fontFamily: DT.sans,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Production Plan</div>
      <div style={{ fontFamily: DT.serif, fontSize: 24, lineHeight: 1.05, color: DT.textPrimary }}>Loading Tuesday schedule state</div>
      <div style={{ maxWidth: 520, fontSize: 12, lineHeight: 1.45, fontWeight: 800 }}>Checking saved order status, completed-order overrides, task edits, and row order before showing the board.</div>
    </section>
  );
  if (isNarrow) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{board}{rail}</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "318px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
      {rail}
      {board}
    </div>
  );
}


function MonthViewState({
  weeks,
  newOrder,
  ordersForHealth,
  delightEnabled = false,
  railFilter,
  onRailFilterChange,
  qaFixtureMode = false,
  initialPlanTaskLinkState,
  initialPlanTaskLinksStorage = "blob",
  initialPlanTaskLinksDisabledReason,
}: {
  weeks: PlanWeek[];
  newOrder: NewOrderPlanCandidate | null;
  ordersForHealth: UiOrder[];
  delightEnabled?: boolean;
  railFilter: RailFilter;
  onRailFilterChange: (filter: RailFilter) => void;
  qaFixtureMode?: boolean;
  initialPlanTaskLinkState?: PlanTaskLinkStatePayload;
  initialPlanTaskLinksStorage?: PlanTaskLinksStorage;
  initialPlanTaskLinksDisabledReason?: string;
}) {
  const { currentAndUpcoming, previous } = useMemo(() => splitPlanWeeks(weeks), [weeks]);
  const visibleProductionWeeks = useMemo(() => currentAndUpcoming.slice(0, 6), [currentAndUpcoming]);
  const [planTaskEdits, setPlanTaskEdits] = useState<PlanTaskEdits>(() => initialPlanTaskLinkState?.taskEdits ?? {});
  const sourceBoardTasks = useMemo(() => sourceTasksForBoardWeeks(visibleProductionWeeks, planTaskEdits), [visibleProductionWeeks, planTaskEdits]);
  const [personFilter, setPersonFilter] = useState<PersonFilter>("all");
  const [planViewMode, setPlanViewMode] = useState<ProductionPlanMode>("schedule");
  const [delightBurst, setDelightBurst] = useState<{ id: number; origin: DelightOrigin } | null>(null);
  const [boardTasks, setBoardTasks] = useState<BoardPlanTask[]>(sourceBoardTasks);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<BoardDropPreview | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const baseSuggestedSteps = useMemo(() => buildSuggestedPlanForOrder(newOrder), [newOrder]);
  const [editableSteps, setEditableSteps] = useState<SuggestedOrderPlanStep[]>(baseSuggestedSteps);
  const [showTasksInMonth, setShowTasksInMonth] = useState(false);
  const [approvedSteps, setApprovedSteps] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<OrderWorkflowState | null>(null);
  const [selectedAssignmentTask, setSelectedAssignmentTask] = useState<AssignablePlanTask | null>(null);
  const [editingTask, setEditingTask] = useState<BoardPlanTask | null>(null);
  const [planTaskLinks, setPlanTaskLinks] = useState<PlanTaskLinks>(() => initialPlanTaskLinkState?.links ?? {});
  const [planTaskLinksLoaded, setPlanTaskLinksLoaded] = useState(Boolean(initialPlanTaskLinkState) || qaFixtureMode);
  const [planTaskLinksStorage, setPlanTaskLinksStorage] = useState<PlanTaskLinksStorage>(initialPlanTaskLinksStorage);
  const [orderRowOrders, setOrderRowOrders] = useState<PlanRowOrders>(() => initialPlanTaskLinkState?.orderRowOrders ?? {});
  const [orderOverrides, setOrderOverrides] = useState<OrderOverrides>(() => initialPlanTaskLinkState?.orderOverrides ?? {});
  const planTaskLinksRealtimeRef = useRef<RealtimeChannel | null>(null);
  const planTaskLinksUpdatedAtRef = useRef<string | null>(initialPlanTaskLinkState?.updatedAt ?? null);
  const [assignmentStatus, setAssignmentStatus] = useState(initialPlanTaskLinksDisabledReason ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const undoBoardLayoutsRef = useRef<BoardPlanTask[][]>([]);
  const dragStartBoardTasksRef = useRef<BoardPlanTask[] | null>(null);
  const lastBoardPreviewRef = useRef<string | null>(null);
  const isRailNarrow = useIsNarrow(1040);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const selectedOrder = useMemo(
    () => ordersForHealth.find((order) => order.id === selectedOrderId) ?? null,
    [ordersForHealth, selectedOrderId]
  );
  const openOrder = useMemo(
    () => ordersForHealth.find((order) => order.id === openOrderId) ?? null,
    [ordersForHealth, openOrderId]
  );
  const selectedAppTasks = useMemo(() => workflowTasksForPlan(selectedWorkflow), [selectedWorkflow]);
  const activeTask = activeTaskId ? boardTasks.find((task) => task.id === activeTaskId) ?? null : null;
  const weekTitleById = useMemo(() => new Map(visibleProductionWeeks.map((week) => [week.id, displayWeekTitle(week.title)])), [visibleProductionWeeks]);
  const isDraftChanged = !boardPlanLayoutsEqual(sourceBoardTasks, boardTasks);
  const keepOverlayWorkflow = useCallback((workflow: OrderWorkflowState | null) => {
    if (workflow) setSelectedWorkflow(workflow);
  }, []);
  const closeOrderOverview = useCallback(() => {
    setOpenOrderId(null);
  }, []);
  const todayCounts = useMemo<Record<Person, number>>(() => {
    const today = currentDayKey();
    if (!today) return { nick: 0, dylan: 0 };
    const now = new Date();
    const currentWeek = visibleProductionWeeks.find((week) => {
      const range = weekRangeFromTitle(week.title);
      return range ? range.start.getTime() <= now.getTime() && now.getTime() <= range.end.getTime() : false;
    });
    if (!currentWeek) return { nick: 0, dylan: 0 };
    const tasks = sourceTasksForWeek(currentWeek.rows);
    return {
      nick: tasks.filter((task) => task.day === today && task.person === "nick").length,
      dylan: tasks.filter((task) => task.day === today && task.person === "dylan").length,
    };
  }, [visibleProductionWeeks]);

  useEffect(() => {
    setBoardTasks(loadDraftTasks("six-week-board", sourceBoardTasks));
    undoBoardLayoutsRef.current = [];
    dragStartBoardTasksRef.current = null;
    lastBoardPreviewRef.current = null;
    setActiveTaskId(null);
    setDropPreview(null);
  }, [sourceBoardTasks]);

  const delightBurstTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (delightBurstTimeoutRef.current) {
        window.clearTimeout(delightBurstTimeoutRef.current);
      }
    };
  }, []);

  function triggerDelightBurst(origin?: DelightOrigin) {
    if (!delightEnabled) return;
    const burstId = Date.now();
    if (delightBurstTimeoutRef.current) {
      window.clearTimeout(delightBurstTimeoutRef.current);
    }
    setDelightBurst({ id: burstId, origin: origin ?? { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight * 0.34) } });
    delightBurstTimeoutRef.current = window.setTimeout(() => {
      setDelightBurst((current) => current?.id === burstId ? null : current);
      delightBurstTimeoutRef.current = null;
    }, 3100);
  }

  function taskEditForBoardTask(nextTask: BoardPlanTask): PlanTaskEditValue {
    return {
      text: nextTask.text,
      rowName: nextTask.rowName,
      weekId: nextTask.weekId,
      day: nextTask.day,
      person: nextTask.person,
      estimatedHours: nextTask.estimatedHours,
      sortOrder: nextTask.sortOrder,
      internal: /internal workshop/i.test(nextTask.rowName),
      done: nextTask.done,
    };
  }

  function updateBoardTaskFromEditor(nextTask: BoardPlanTask, keepEditorOpen = true) {
    const taskKey = stablePlanTaskKey(nextTask);
    const taskEdit = taskEditForBoardTask(nextTask);
    setBoardTasks((current) => {
      const next = current.map((task) => task.id === nextTask.id ? nextTask : task);
      saveDraftTasks("six-week-board", next);
      return next;
    });
    startTransition(() => {
      setPlanTaskEdits((current) => ({
        ...current,
        [taskKey]: taskEdit,
      }));
    });
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: taskKey,
        legacyTaskId: nextTask.id,
        taskEdit,
      }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((data) => Promise.reject(new Error(data.error ?? "Task edit save failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        if (data.state?.orderOverrides) setOrderOverrides(data.state.orderOverrides);
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus("Task saved in Tuesday");
      })
      .catch((err) => setAssignmentStatus(err instanceof Error ? err.message : "Task edit save failed"));
    if (keepEditorOpen) setEditingTask(nextTask);
  }

  function toggleBoardTaskDone(task: BoardPlanTask, done: boolean, origin?: DelightOrigin) {
    if (done) triggerDelightBurst(origin);
    updateBoardTaskFromEditor({ ...task, done }, false);
  }

  function handleWorkflowTaskDoneToggle(done: boolean, origin?: DelightOrigin) {
    if (done) triggerDelightBurst(origin);
  }

  function persistBoardTaskMove(nextTask: BoardPlanTask, originalLayout: BoardPlanTask[]) {
    const taskKey = stablePlanTaskKey(nextTask);
    const taskEdit = taskEditForBoardTask(nextTask);
    setAssignmentStatus("Saving move...");
    startTransition(() => {
      setPlanTaskEdits((current) => ({
        ...current,
        [taskKey]: taskEdit,
      }));
    });
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: taskKey,
        legacyTaskId: nextTask.id,
        taskEdit,
      }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((data) => Promise.reject(new Error(data.error ?? "Move save failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        if (data.state?.orderOverrides) setOrderOverrides(data.state.orderOverrides);
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus("Move saved");
      })
      .catch((err) => {
        setBoardTasks(originalLayout);
        setAssignmentStatus(err instanceof Error ? err.message : "Move save failed");
      });
  }

  const resolveOrderIdForPlanTask = useCallback((task: DraggablePlanTask) => {
    const assignedId = assignedOrderIdForTask(task, planTaskLinks);
    if (assignedId && ordersForHealth.some((order) => order.id === assignedId)) return assignedId;
    const linkedId = task.linkedOrderIds.find((id) => ordersForHealth.some((order) => order.id === id));
    if (linkedId) return linkedId;
    const scored = ordersForHealth
      .map((order) => ({ order, score: orderNameMatchScore(order, task.rowName, ...task.linkedOrders.map((linked) => linked.name)) }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score || ((orderDaysUntil(a.order.shipDate) ?? 999) - (orderDaysUntil(b.order.shipDate) ?? 999)));
    return scored[0]?.order.id ?? null;
  }, [ordersForHealth, planTaskLinks]);

  const orderJourneyRows = useMemo(() => buildOrderJourneyRows({
    tasks: boardTasks,
    orders: ordersForHealth,
    planTaskLinks,
    resolveOrderId: resolveOrderIdForPlanTask,
    weekTitleForTask: (task) => weekTitleById.get(task.weekId) ?? task.weekId,
  }), [boardTasks, ordersForHealth, planTaskLinks, resolveOrderIdForPlanTask, weekTitleById]);
  const openOrderTasks = useMemo(() => {
    if (!openOrder) return [];
    return orderJourneyRows.find((row) => row.order?.id === openOrder.id)?.tasks ?? [];
  }, [openOrder, orderJourneyRows]);
  const selectedOrderTasks = useMemo(() => {
    if (!selectedOrder) return [];
    return orderJourneyRows.find((row) => row.order?.id === selectedOrder.id)?.tasks ?? [];
  }, [selectedOrder, orderJourneyRows]);

  function selectOrder(id: number) {
    setSelectedAssignmentTask(null);
    setSelectedWorkflow(null);
    setSelectedOrderId(id);
  }

  function openOrderOverview(id: number) {
    setSelectedAssignmentTask(null);
    setSelectedOrderId(id);
    setOpenOrderId(id);
  }

  const applyPlanTaskLinkState = useCallback((state?: PlanTaskLinkStatePayload) => {
    setPlanTaskLinks(state?.links ?? {});
    setPlanTaskEdits(state?.taskEdits ?? {});
    setOrderRowOrders(state?.orderRowOrders ?? {});
    setOrderOverrides(state?.orderOverrides ?? {});
    setPlanTaskLinksLoaded(true);
    if (state?.updatedAt) planTaskLinksUpdatedAtRef.current = state.updatedAt;
  }, []);

  const loadPlanTaskLinkState = useCallback((statusMessage = "", options: { showStatusIfUnchanged?: boolean } = {}) => {
    if (qaFixtureMode) {
      setPlanTaskLinksLoaded(true);
      if (statusMessage || options.showStatusIfUnchanged) setAssignmentStatus(statusMessage || "QA fixture only");
      return;
    }
    fetch("/api/production/plan-task-links", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Task links unavailable")))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage; disabledReason?: string }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        const updatedAt = data.state?.updatedAt ?? null;
        const isInitialLoad = !planTaskLinksLoaded;
        const changedSinceLastLoad = Boolean(updatedAt && updatedAt !== planTaskLinksUpdatedAtRef.current);
        if (isInitialLoad || changedSinceLastLoad || !updatedAt) {
          startTransition(() => applyPlanTaskLinkState(data.state));
          if (data.disabledReason || statusMessage) setAssignmentStatus(data.disabledReason ?? statusMessage);
          return;
        }
        if (data.disabledReason || options.showStatusIfUnchanged) setAssignmentStatus(data.disabledReason ?? statusMessage);
      })
      .catch((err) => {
        setPlanTaskLinksLoaded(true);
        setAssignmentStatus(err instanceof Error ? err.message : "Task links unavailable");
      });
  }, [applyPlanTaskLinkState, planTaskLinksLoaded, qaFixtureMode]);

  const handlePlanTaskLinksRealtimeChange = useCallback(() => {
    loadPlanTaskLinkState("Updated from another screen", { showStatusIfUnchanged: true });
  }, [loadPlanTaskLinkState]);

  const planTaskLinksRealtime = useRealtimeRefresh({
    channelName: "production-plan-task-links:current",
    table: "production_order_workflows",
    filter: "order_id=eq.0",
    refreshOnChange: false,
    enabled: planTaskLinksStorage === "supabase",
    onChange: handlePlanTaskLinksRealtimeChange,
  });

  const broadcastPlanTaskLinkChange = useCallback((updatedAt?: string) => {
    if (planTaskLinksStorage === "supabase") return;
    void planTaskLinksRealtimeRef.current?.send({
      type: "broadcast",
      event: PLAN_TASK_LINKS_REALTIME_EVENT,
      payload: { updatedAt: updatedAt ?? new Date().toISOString() },
    });
  }, [planTaskLinksStorage]);

  useEffect(() => {
    loadPlanTaskLinkState();
  }, [loadPlanTaskLinkState]);

  useEffect(() => {
    const refreshOpenBoard = () => loadPlanTaskLinkState();
    const intervalId = window.setInterval(refreshOpenBoard, 30000);
    window.addEventListener("focus", refreshOpenBoard);
    document.addEventListener("visibilitychange", refreshOpenBoard);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOpenBoard);
      document.removeEventListener("visibilitychange", refreshOpenBoard);
    };
  }, [loadPlanTaskLinkState]);

  useEffect(() => {
    if (planTaskLinksStorage !== "blob") return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase.ok) return;
    const channel = supabase.client
      .channel(PLAN_TASK_LINKS_REALTIME_CHANNEL)
      .on("broadcast", { event: PLAN_TASK_LINKS_REALTIME_EVENT }, () => {
        loadPlanTaskLinkState("Updated from another screen", { showStatusIfUnchanged: true });
      })
      .subscribe();
    planTaskLinksRealtimeRef.current = channel;
    return () => {
      if (planTaskLinksRealtimeRef.current === channel) planTaskLinksRealtimeRef.current = null;
      void supabase.client.removeChannel(channel);
    };
  }, [loadPlanTaskLinkState, planTaskLinksStorage]);

  useEffect(() => {
    setSelectedAssignmentTask(null);
    setSelectedWorkflow(null);
    setSelectedOrderId(null);
  }, [railFilter]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOrderId(null);
      setSelectedAssignmentTask(null);
      setShowNewOrder(false);
      if (activeTaskId) handleBoardDragCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !isTyping && undoBoardLayoutsRef.current.length > 0) {
        event.preventDefault();
        const [previous, ...rest] = undoBoardLayoutsRef.current;
        undoBoardLayoutsRef.current = rest;
        setBoardTasks(previous);
        saveDraftTasks("six-week-board", previous);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectOrderForPlanTask(task: AssignablePlanTask) {
    const orderId = resolveOrderIdForPlanTask(task);
    if (orderId) {
      if (selectedOrderId === orderId) {
        setSelectedAssignmentTask(null);
        setSelectedWorkflow(null);
        setSelectedOrderId(null);
        return;
      }
      selectOrder(orderId);
      return;
    }
    setSelectedWorkflow(null);
    setSelectedOrderId(null);
    setSelectedAssignmentTask(task);
  }

  function openOrderForPlanTask(task: AssignablePlanTask) {
    const orderId = resolveOrderIdForPlanTask(task);
    if (orderId) {
      openOrderOverview(orderId);
      return;
    }
    selectOrderForPlanTask(task);
  }

  function selectNewOrderReview() {
    if (!newOrder) return;
    if (selectedOrderId === newOrder.id) {
      setSelectedAssignmentTask(null);
      setSelectedWorkflow(null);
      setSelectedOrderId(null);
      return;
    }
    selectOrder(newOrder.id);
  }

  function openNewOrderOverview() {
    if (!newOrder) return;
    openOrderOverview(newOrder.id);
  }

  function clearBoardDragState() {
    dragStartBoardTasksRef.current = null;
    lastBoardPreviewRef.current = null;
    setActiveTaskId(null);
    setDropPreview(null);
  }

  function handleBoardDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    if (suggestedStepIdFromDragId(activeId)) return;
    const task = boardTasks.find((current) => current.id === activeId);
    if (!task) return;
    dragStartBoardTasksRef.current = boardTasks;
    lastBoardPreviewRef.current = null;
    setActiveTaskId(activeId);
    setDropPreview({ weekId: task.weekId, day: task.day, person: task.person, insertAfter: true });
  }

  function boardDropTargetFromOverIdWithSuggestions(overId: string) {
    const target = boardDropTargetFromOverId(boardTasks, overId);
    if (target) return { ...target, overId: target.overTaskId, overSuggestedId: undefined as string | undefined };
    const suggestedId = suggestedStepIdFromDragId(overId);
    const step = suggestedId ? editableSteps.find((item) => item.id === suggestedId) : null;
    const week = step ? visibleProductionWeeks.find((candidate) => suggestedStepFallsInWeek(step, candidate)) : null;
    return step && week ? { weekId: week.id, day: step.day, person: step.person, overId, overTaskId: undefined as string | undefined, overSuggestedId: step.id } : null;
  }

  function previewBoardTaskMove(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || !activeTaskId) return;
    const target = boardDropTargetFromOverIdWithSuggestions(overId);
    if (!target) return;
    const insertAfter = target.overId ? shouldInsertAfterOver(event) : true;
    const previewKey = [activeId, target.weekId, target.day, target.person, target.overId ?? "lane", insertAfter ? "after" : "before"].join(":");
    if (lastBoardPreviewRef.current === previewKey) return;
    lastBoardPreviewRef.current = previewKey;
    setDropPreview({ weekId: target.weekId, day: target.day, person: target.person, overId: target.overId, insertAfter });
  }

  function handleBoardDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const original = dragStartBoardTasksRef.current;
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || !original) {
      if (original) setBoardTasks(original);
      clearBoardDragState();
      return;
    }
    const target = boardDropTargetFromOverIdWithSuggestions(overId);
    const finalLayout = target
      ? withMovedTaskSortOrder(
          reorderBoardPlanTask(boardTasks, activeId, target.weekId, target.day, target.person, target.overTaskId, target.overTaskId ? shouldInsertAfterOver(event) : true),
          activeId
        )
      : boardTasks;
    if (!boardPlanLayoutsEqual(original, finalLayout)) {
      const movedTask = finalLayout.find((task) => task.id === activeId);
      undoBoardLayoutsRef.current = [original, ...undoBoardLayoutsRef.current].slice(0, 12);
      setBoardTasks(finalLayout);
      if (movedTask) persistBoardTaskMove(movedTask, original);
    }
    clearBoardDragState();
  }

  function handleBoardDragCancel() {
    if (dragStartBoardTasksRef.current) setBoardTasks(dragStartBoardTasksRef.current);
    clearBoardDragState();
  }

  function resetBoardDraftLayout() {
    undoBoardLayoutsRef.current = [boardTasks, ...undoBoardLayoutsRef.current].slice(0, 12);
    setBoardTasks(sourceBoardTasks);
    saveDraftTasks("six-week-board", sourceBoardTasks);
  }

  function selectOrderForAppTask(task: AppPlanTask) {
    if (selectedOrderId === task.orderId) {
      setSelectedAssignmentTask(null);
      setSelectedWorkflow(null);
      setSelectedOrderId(null);
      return;
    }
    selectOrder(task.orderId);
  }

  function assignPlanTaskToOrder(task: AssignablePlanTask, orderId: number, placement?: PlanTaskPlacement) {
    const taskKey = stablePlanTaskKey(task);
    const linkValue = linkValueForPlanTaskSave(orderId, placement);
    setPlanTaskLinks((current) => ({ ...current, [taskKey]: linkValue }));
    setAssignmentStatus("Saving link...");
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: taskKey, legacyTaskId: task.id, orderId, placement }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Save failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        if (data.state?.orderOverrides) setOrderOverrides(data.state.orderOverrides);
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus("Order linked");
        selectOrder(orderId);
      })
      .catch((err) => {
        setAssignmentStatus(err instanceof Error ? err.message : "Save failed");
        setPlanTaskLinks((current) => {
          const next = { ...current };
          delete next[taskKey];
          return next;
        });
      });
  }

  function removePlanTaskLink(task: AssignablePlanTask) {
    const taskKey = stablePlanTaskKey(task);
    setPlanTaskLinks((current) => {
      const next = { ...current };
      delete next[taskKey];
      delete next[task.id];
      return next;
    });
    setAssignmentStatus("Removing link...");
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: taskKey, legacyTaskId: task.id, orderId: null }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Save failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        if (data.state?.orderOverrides) setOrderOverrides(data.state.orderOverrides);
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus("Order connection removed");
      })
      .catch((err) => setAssignmentStatus(err instanceof Error ? err.message : "Save failed"));
  }

  const suggestedDateOptions = useMemo(
    () => visibleProductionWeeks.flatMap((week) => DAYS.flatMap((day) => {
      const option = suggestedDateOptionForWeekDay(week, day);
      return option ? [option] : [];
    })),
    [visibleProductionWeeks]
  );

  function updateSuggestedStep(id: string, patch: Partial<Pick<SuggestedOrderPlanStep, "title" | "detail" | "day" | "person" | "estimatedHours" | "dateIso" | "dateLabel">>) {
    setEditableSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
    setApprovedSteps(false);
  }

  function moveSuggestedStep(id: string, day: DayKey, person: Person, dateIso?: string, dateLabel?: string, overStepId?: string, insertAfter = true) {
    setEditableSteps((current) => {
      const moving = current.find((step) => step.id === id);
      if (!moving) return current;
      const next = current.filter((step) => step.id !== id);
      const fallbackDate = suggestedDateOptions.find((option) => option.day === day);
      const moved = {
        ...moving,
        day,
        person,
        dateIso: dateIso ?? fallbackDate?.dateIso ?? moving.dateIso,
        dateLabel: dateLabel ?? fallbackDate?.dateLabel ?? moving.dateLabel,
      };
      let insertAt = next.length;
      if (overStepId && overStepId !== id) {
        const overIndex = next.findIndex((step) => step.id === overStepId);
        if (overIndex >= 0) insertAt = overIndex + (insertAfter ? 1 : 0);
      }
      next.splice(insertAt, 0, moved);
      return next;
    });
    setApprovedSteps(false);
    setShowTasksInMonth(true);
  }

  function toggleNewOrderPanel() {
    setShowNewOrder((current) => {
      const next = !current;
      if (next) setShowTasksInMonth(true);
      return next;
    });
  }

  function hideNewOrderPanel() {
    setShowNewOrder(false);
  }

  function approveNewOrderTasks() {
    setShowTasksInMonth(true);
    setApprovedSteps(true);
    setShowNewOrder(false);
  }

  function toggleNewOrderTasksInSchedule() {
    if (showTasksInMonth || approvedSteps) {
      setShowTasksInMonth(false);
      setApprovedSteps(false);
      return;
    }
    setShowTasksInMonth(true);
  }

  const capacityByLane = useMemo<CapacityByLane>(() => {
    const summaries: CapacityByLane = {};
    for (const week of visibleProductionWeeks) {
      const existingTasks = boardTasks.filter((task) => task.weekId === week.id);
      for (const day of DAYS) {
        const option = suggestedDateOptionForWeekDay(week, day);
        if (!option) continue;
        for (const person of PEOPLE) {
          const existingTaskCount = existingTasks.filter((task) => task.day === day && task.person === person).length;
          const draftHours = editableSteps
            .filter((step) => step.dateIso === option.dateIso && step.person === person)
            .reduce((sum, step) => sum + Number(step.estimatedHours || 0), 0);
          summaries[dateCapacityKey(option.dateIso, person)] = summarizeLaneCapacity({ existingTaskCount, draftHours });
          summaries[laneCapacityKey(day, person)] = summaries[dateCapacityKey(option.dateIso, person)];
        }
      }
    }
    return summaries;
  }, [visibleProductionWeeks, editableSteps, boardTasks]);

  const historyControl = previous.length > 0 ? (
    <button
      type="button"
      onClick={() => setShowHistory((current) => !current)}
      style={{ border: `1px solid ${showHistory ? "rgba(110,138,106,0.26)" : DT.border}`, background: showHistory ? "rgba(110,138,106,0.10)" : "rgba(255,255,255,0.68)", color: showHistory ? DT.sage : DT.textMuted, borderRadius: 999, padding: "6px 9px", fontSize: 10, fontFamily: DT.sans, fontWeight: 900, cursor: "pointer" }}
    >
      {showHistory ? "Hide past weeks" : `Show past weeks · ${previous.length}`}
    </button>
  ) : null;

  const liveSyncWarning = planTaskLinksStorage === "supabase" && (planTaskLinksRealtime.status === "error" || planTaskLinksRealtime.status === "disabled") ? (
    <span
      title={planTaskLinksRealtime.message || "Live updates are not connected"}
      style={{ border: "1px solid rgba(154,106,20,0.30)", background: "rgba(255,246,199,0.80)", color: "#8a5d08", borderRadius: 999, padding: "6px 9px", fontSize: 10, fontFamily: DT.sans, fontWeight: 950 }}
    >
      Live updates paused
    </span>
  ) : null;

  const workshopHeaderControl = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
      <ProductionPlanModeToggle mode={planViewMode} onModeChange={setPlanViewMode} />
      {liveSyncWarning}
      <WorkshopFocusBar personFilter={personFilter} onPersonFilterChange={setPersonFilter} todayCounts={todayCounts} historyControl={historyControl} />
    </div>
  );

  const newOrderPanel = showNewOrder ? (
    <NewOrderHalo
      order={newOrder}
      suggestions={editableSteps}
      dateOptions={suggestedDateOptions}
      open={showNewOrder}
      approved={approvedSteps}
      onStepChange={updateSuggestedStep}
      onApprove={approveNewOrderTasks}
      onClose={hideNewOrderPanel}
      capacityByLane={capacityByLane}
    />
  ) : null;

  const railNewOrderCard = (
    <NewOrderRailCard
      order={newOrder}
      showingInMonth={showTasksInMonth || approvedSteps}
      approved={approvedSteps}
      onOpen={toggleNewOrderPanel}
      onOpenOrder={() => {
        if (newOrder) openOrderOverview(newOrder.id);
      }}
      onToggleMonthTasks={toggleNewOrderTasksInSchedule}
      onApprove={approveNewOrderTasks}
      fullListOpen={showNewOrder}
    />
  );

  const weekSections = visibleProductionWeeks.map((week, index) => (
    <MonthWeekSection
      key={week.id}
      week={week}
      tasks={boardTasks}
      suggestedSteps={(showTasksInMonth || approvedSteps) ? editableSteps.filter((step) => suggestedStepFallsInWeek(step, week)) : []}
      approvedSuggestions={approvedSteps}
      selectedOrder={selectedOrder}
      appTasks={selectedAppTasks}
      planTaskLinks={planTaskLinks}
      planTaskLinksLoaded={planTaskLinksLoaded}
      activeTaskId={activeTaskId}
      dropPreview={dropPreview}
      isDraftChanged={isDraftChanged}
      showDraftControls={index === 0}
      onResetDraftLayout={resetBoardDraftLayout}
      personFilter={personFilter}
      resolveTaskOrderId={resolveOrderIdForPlanTask}
      onTaskSelect={(task) => selectOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
      onTaskOpen={(task) => openOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
      onTaskEdit={setEditingTask}
      onTaskDoneToggle={toggleBoardTaskDone}
      onAppTaskSelect={selectOrderForAppTask}
      onAppTaskOpen={(task) => openOrderOverview(task.orderId)}
      onSuggestedStepMove={moveSuggestedStep}
      onSuggestedStepSelect={selectNewOrderReview}
      onSuggestedStepOpen={openNewOrderOverview}
      suggestedStepCustomer={newOrder?.customer}
      weekHeaderControl={undefined}
      forcePlanningLanes
    />
  ));

  const historySections = showHistory ? (
    <section style={{ border: "1px solid " + DT.border, borderRadius: DT.radius, background: "rgba(255,253,249,0.72)", boxShadow: DT.shadow, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ padding: "2px 4px 0", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Previous weeks</div>
      {previous.map((week) => (
        <MonthWeekSection
          key={week.id}
          week={week}
          tasks={sourceTasksForBoardWeeks([week])}
          selectedOrder={selectedOrder}
          appTasks={selectedAppTasks}
          planTaskLinks={planTaskLinks}
          planTaskLinksLoaded={planTaskLinksLoaded}
          personFilter={personFilter}
          resolveTaskOrderId={resolveOrderIdForPlanTask}
          onTaskSelect={(task) => selectOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
          onTaskOpen={(task) => openOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
          onTaskEdit={setEditingTask}
          onTaskDoneToggle={toggleBoardTaskDone}
          onAppTaskSelect={selectOrderForAppTask}
          onAppTaskOpen={(task) => openOrderOverview(task.orderId)}
        />
      ))}
    </section>
  ) : null;

  const planningBoard = (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleBoardDragStart}
      onDragOver={previewBoardTaskMove}
      onDragEnd={handleBoardDragEnd}
      onDragCancel={handleBoardDragCancel}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {workshopHeaderControl}
        {planViewMode === "schedule" ? (
          <>
            {newOrderPanel}
            {weekSections}
            {historySections}
          </>
        ) : (
          <OrderJourneyView
            rows={orderJourneyRows}
            selectedOrder={selectedOrder}
            onTaskEdit={setEditingTask}
            onTaskSelect={(task) => selectOrderForPlanTask({ ...task, weekTitle: task.weekTitle })}
            onTaskOpen={(task) => openOrderForPlanTask({ ...task, weekTitle: task.weekTitle })}
            onOrderOpen={openOrderOverview}
            onTaskDoneToggle={toggleBoardTaskDone}
          />
        )}
        {editingTask && (
          <WorkshopTaskEditor
            key={editingTask.id}
            task={editingTask}
            orders={ordersForHealth}
            dateOptions={suggestedDateOptions}
            planTaskLinks={planTaskLinks}
            onSave={updateBoardTaskFromEditor}
            onConnectOrder={(task, orderId) => assignPlanTaskToOrder({ ...task, weekTitle: "Production Plan" }, orderId)}
            onRemoveOrder={(task) => removePlanTaskLink({ ...task, weekTitle: "Production Plan" })}
            onOpenOrder={openOrderOverview}
            onClose={() => setEditingTask(null)}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <PlanTaskDragCard task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );

  const orderRail = (
    <OrderRail
      orders={ordersForHealth}
      selectedOrder={selectedOrder}
      selectedOrderTasks={selectedOrderTasks}
      assignmentTask={selectedAssignmentTask}
      assignmentStatus={assignmentStatus}
      onAssignTask={assignPlanTaskToOrder}
      onRemoveTaskLink={removePlanTaskLink}
      onPlanTaskEdit={setEditingTask}
      onPlanTaskDoneToggle={toggleBoardTaskDone}
      canRemoveAssignmentLink={selectedAssignmentTask ? Boolean(assignedOrderIdForTask(selectedAssignmentTask, planTaskLinks)) : false}
      newOrderCard={railNewOrderCard}
      onWorkflowChange={setSelectedWorkflow}
      onSelect={selectOrder}
      onOpenOrder={openOrderOverview}
      onClear={() => {
        setSelectedAssignmentTask(null);
        setSelectedWorkflow(null);
        setSelectedOrderId(null);
      }}
      filter={railFilter}
      onFilterChange={onRailFilterChange}
      isNarrow={isRailNarrow}
      tasksForOrder={(order) => planTasksForOrder(weeks, order, planTaskLinks)}
    />
  );

  if (!planTaskLinksLoaded) {
    return <TuesdayPlanStateLoading isNarrow={isRailNarrow} />;
  }

  if (isRailNarrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {planningBoard}
        {delightEnabled && delightBurst ? <DelightDoneBurst key={delightBurst.id} origin={delightBurst.origin} /> : null}
        {orderRail}
        {openOrder && <OrderOverviewOverlay key={`overlay-${openOrder.id}`} order={openOrder} planTasks={openOrderTasks} onPlanTaskEdit={setEditingTask} onPlanTaskDoneToggle={toggleBoardTaskDone} onWorkflowTaskDoneToggle={handleWorkflowTaskDoneToggle} onRemoveTaskLink={removePlanTaskLink} onClose={closeOrderOverview} onWorkflowChange={keepOverlayWorkflow} />}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 318px",
        gap: 14,
        alignItems: "start",
      }}
    >
      {planningBoard}
      {delightEnabled && delightBurst ? <DelightDoneBurst key={delightBurst.id} origin={delightBurst.origin} /> : null}
      {orderRail}
      {openOrder && <OrderOverviewOverlay key={`overlay-${openOrder.id}`} order={openOrder} planTasks={openOrderTasks} onPlanTaskEdit={setEditingTask} onPlanTaskDoneToggle={toggleBoardTaskDone} onWorkflowTaskDoneToggle={handleWorkflowTaskDoneToggle} onRemoveTaskLink={removePlanTaskLink} onClose={closeOrderOverview} onWorkflowChange={keepOverlayWorkflow} />}
    </div>
  );
}

export type PlanClientProps = {
  rows: PlanRow[];
  orders: UiOrder[];
  syncedAt: string;
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
  delightEnabled?: boolean;
  qaFixtureMode?: boolean;
  initialPlanTaskLinkState?: PlanTaskLinkStatePayload;
  initialPlanTaskLinksStorage?: PlanTaskLinksStorage;
  initialPlanTaskLinksDisabledReason?: string;
};

export default function PlanClient({
  rows,
  orders,
  syncedAt,
  source,
  mondayError,
  delightEnabled = false,
  qaFixtureMode = false,
  initialPlanTaskLinkState,
  initialPlanTaskLinksStorage = "blob",
  initialPlanTaskLinksDisabledReason,
}: PlanClientProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [railFilter, setRailFilter] = useState<RailFilter>("all");
  useEffect(() => {
    const id = window.setTimeout(() => setHasMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const weeks = useMemo(() => groupPlanRowsByWeek(rows), [rows]);
  const activeWeeks = weeks.filter((w) => !isArchiveWeek(w.title));
  const plannedOrderIds = useMemo(
    () => new Set(rows.flatMap((row) => row.appLinkedOrder ? [Number(row.appLinkedOrder.mondayItemId)] : [])),
    [rows]
  );
  const plannedNames = useMemo(() => new Set(rows.map((row) => row.name)), [rows]);
  const newOrder = useMemo(() => selectNewOrderForPlanning(orders, plannedOrderIds, plannedNames), [orders, plannedOrderIds, plannedNames]);

  return (
    <MissionControlShell
      section="plan"
      pageTitle="Production Plan"
      syncedAt={syncedAt}
      source={source}
      mondayError={mondayError}
      pageTitleAccessory={hasMounted ? <OrderHealthStrip orders={orders} activeFilter={railFilter} onFilterChange={setRailFilter} /> : undefined}
      maxWidth={1500}
    >
        {qaFixtureMode && (
          <div
            data-qa-plan-fixture="true"
            style={{
              marginBottom: 12,
              border: "1px solid rgba(190,137,24,0.26)",
              background: "rgba(255,246,199,0.72)",
              color: "#8a5d08",
              borderRadius: 12,
              padding: "10px 12px",
              fontFamily: DT.sans,
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            QA fixture mode: local browser-test data only. No Monday, Supabase, Xero, or customer records are used.
          </div>
        )}
        {rows.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              fontSize: 13,
              color: DT.textFaint,
              fontFamily: DT.sans,
            }}
          >
            No Production Plan rows. {mondayError && `(${mondayError})`}
          </div>
        ) : (
          <MonthView
            weeks={activeWeeks}
            newOrder={newOrder}
            orders={orders}
            delightEnabled={delightEnabled}
            railFilter={railFilter}
            onRailFilterChange={setRailFilter}
            qaFixtureMode={qaFixtureMode}
            initialPlanTaskLinkState={initialPlanTaskLinkState}
            initialPlanTaskLinksStorage={initialPlanTaskLinksStorage}
            initialPlanTaskLinksDisabledReason={initialPlanTaskLinksDisabledReason}
          />
        )}
        {delightEnabled && <DelightUnicorn />}
    </MissionControlShell>
  );
}
