'use client';

import { startTransition, type CSSProperties, type DragEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  pointerWithin,
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT } from "@/components/mission-control-ui";
import type { OrderCostingContext, OrderCostingMatch } from "@/lib/costings/fetch-order-costing-context";
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
  buildDiningTableProcessPlan,
  maxIsoDate as maxIsoDateFromRules,
  WORKSHOP_PROCESS_RULES,
  type WorkshopProcessTask,
} from "@/lib/production/workshop-process-rules";
import {
  type DraggablePlanTask,
} from "@/lib/production/plan-drag";
import { invoiceExpectationForOrder } from "@/lib/production/invoice-expectation.js";
import {
  TABLE_STEPS as ORDER_TABLE_STEPS,
  PANEL_STEPS as ORDER_PANEL_STEPS,
  type ProductionStep,
} from "@/lib/production/order-display";
import {
  DEFAULT_PROCESS_TEMPLATE_PREVIEWS,
  type ProcessTemplateIssueLevel,
  type ProcessTemplatePreview,
} from "@/lib/production/process-templates";
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

const TUESDAY_THEME = {
  page: "#f6f3ed",
  surface: "#fffdf9",
  surfaceClean: "#ffffff",
  surfaceSoft: "#f7f5ef",
  line: "#e8e2d7",
  lineStrong: "#d7cdbd",
  ink: "#28231f",
  muted: "#746f66",
  quiet: "#9b948a",
  teal: "#0d7c78",
  tealSoft: "#e7f3f2",
  tealLine: "#bfdedb",
  sage: "#5f7f5f",
  sageSoft: "#edf4ed",
  amber: "#9a6715",
  amberSoft: "#fff5df",
  amberLine: "#ead7a7",
  clay: "#9a3b2f",
  claySoft: "#f8e9e6",
  clayLine: "#e7bbb4",
  done: "#ededeb",
  shadow: "0 18px 45px rgba(37, 30, 20, 0.10)",
  shadowSoft: "0 10px 28px rgba(37, 30, 20, 0.08)",
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
  "Sand and first stain coat",
  "Second stain coat",
  "First clear coat",
  "Final clear coat",
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
  "Sand and first stain coat",
  "Second stain coat",
  "First clear coat",
  "Final clear coat",
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
function numberedJobTaskOptionLabel(label: string, fallbackIndex?: number) {
  const canonicalIndex = (JOB_TASK_PRESETS as readonly string[]).indexOf(label);
  const index = canonicalIndex >= 0 ? canonicalIndex : fallbackIndex;
  return typeof index === "number" && index >= 0 ? `${index + 1}. ${label}` : label;
}
type Step = ProductionStep;
type JobTaskOption = { label: string; group: "production" | "support"; stepKey?: string };
const STEPS_BY_KEY: Record<NonNullable<UiOrder["stepsKey"]>, Step[]> = {
  TABLE_STEPS: ORDER_TABLE_STEPS,
  PANEL_STEPS: ORDER_PANEL_STEPS,
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
type OrderDocument = {
  id: string;
  kind: "xero_invoice_pdf" | "customer_attachment" | "drawing" | "screenshot" | "other";
  label: string;
  filename: string;
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
  sourceSystem: string;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
  customerVisible: boolean;
  sentToCustomerAt: string | null;
  openUrl: string;
};
type OrderCustomerMirrorTimelineEntry = {
  date: string | null;
  title: string;
  detail: string;
  source: string;
  confidence?: "low" | "medium" | "high";
};
type OrderCustomerMirror = {
  orderId: string;
  customerKnownSummary: string;
  approvedPaidForSummary: string | null;
  leadTimePromise: string | null;
  currentCustomerKnownSpec: string | null;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
  firstContactAt: string | null;
  timeline: OrderCustomerMirrorTimelineEntry[];
  quirksIssues: string[];
  communicationStyleTags: string[];
  communicationStyleSummary: string | null;
  confidence: "low" | "medium" | "high";
  sourceMetadata: Record<string, unknown>;
  updatedAt: string | null;
};
type OrderCustomerMirrorApiResponse = {
  ok?: boolean;
  mirror?: OrderCustomerMirror | null;
  documents?: OrderDocument[];
  disabledReason?: string;
  error?: string;
};
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
  orderId: number | null;
  orderUuid?: string;
  title: string;
  detail?: string | null;
  customer?: string | null;
  owner?: WorkshopPerson | OrderIntakeOwner;
  scheduledDate: string;
  day: DayKey;
  person: Person;
  done: boolean;
  estimatedHours?: number;
  source?: "workflow" | "intake";
};
type AppTaskPatch = { done?: boolean; scheduledDate?: string; day?: DayKey; person?: Person; estimatedHours?: number };
type OrderIntakeReviewState = "awaiting_payment" | "paid_needs_review" | "needs_review" | "approved";
type OrderIntakeOwner = "Nick" | "Dylan" | "Guido" | "Other";
type OrderIntakeTaskDraft = {
  id: string;
  title: string;
  detail: string;
  owner: OrderIntakeOwner;
  person: Person;
  scheduledDate: string;
  day: DayKey;
  estimatedHours: number;
  sortOrder: number;
};
type OrderIntakeLineItem = { description: string; quantity: number | null; unitAmount: number | null; lineAmount: number | null };
type OrderIntakePaymentEvidence = { id: string; sourceSystem: string; paymentDate: string | null; amount: number; payerName: string | null; reference: string | null; matchStatus: string; matchConfidence: number | null; matchReasons: string[] };
type OrderIntakeFinancialDocument = { id: string; role: string; invoiceNumber: string | null; invoiceUrl: string | null; status: string | null; issuedAt: string | null; dueAt: string | null; total: number | null; amountPaid: number | null; amountDue: number | null };
type OrderPaymentLifecycle = {
  orderId: string;
  primaryInvoiceNumber: string | null;
  depositInvoiceNumber: string | null;
  depositTotal: number | null;
  depositPaidAt: string | null;
  depositAmountDue: number | null;
  balanceInvoiceNumber: string | null;
  balanceTotal: number | null;
  balanceDueAt: string | null;
  balanceSentAt: string | null;
  balancePaidAt: string | null;
  balanceAmountDue: number | null;
  balanceCustomerTouchEventId: string | null;
  paymentStage: string;
  paymentStageLabel: string;
  paymentNextAction: string | null;
};
type OrderIntakeApprovedTask = {
  id: string;
  orderId: string;
  title: string;
  detail: string | null;
  owner: OrderIntakeOwner;
  person: Person;
  scheduledDate: string;
  day: DayKey;
  estimatedHours: number;
  status: "planned" | "done" | "deleted";
  completedAt: string | null;
  completedBy: string | null;
};
type OrderIntakeItem = {
  orderId: string;
  reviewId: string;
  customerName: string;
  orderStatus: string;
  paidOnDate: string | null;
  productSummary: string | null;
  itemCategory: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceDate: string | null;
  invoiceDueDate: string | null;
  xeroUrl: string | null;
  total: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  paymentLifecycle: OrderPaymentLifecycle | null;
  reviewState: OrderIntakeReviewState;
  stateLabel: string;
  stateDetail: string;
  sourceSummary: Record<string, unknown>;
  financialDocuments: OrderIntakeFinancialDocument[];
  lineItems: OrderIntakeLineItem[];
  payments: OrderIntakePaymentEvidence[];
  suggestedTasks: OrderIntakeTaskDraft[];
  draftTasks: OrderIntakeTaskDraft[];
  approvedTasks: OrderIntakeApprovedTask[];
  approvedAt: string | null;
  lastReconciledAt: string | null;
};
type OrderIntakeApiResponse = { ok?: boolean; items?: OrderIntakeItem[]; error?: string };
type OrderWorkflowApiResponse = { state?: OrderWorkflowState; states?: Record<string, OrderWorkflowState>; disabledReason?: string; error?: string };
type PlanTaskLinks = Record<string, PlanTaskLinkValue>;
type PlanTaskEditValue = { text?: string; rowName?: string; weekId?: string; day?: DayKey; person?: Person; estimatedHours?: number; sortOrder?: number; internal?: boolean; done?: boolean; updatedAt?: string };
type PlanTaskEdits = Record<string, PlanTaskEditValue>;
type PlanRowOrders = Record<string, string[]>;
type OrderOverrideValue = { status: "completed"; reason?: string; note?: string; updatedAt?: string; updatedBy?: string };
type OrderOverrides = Record<string, OrderOverrideValue>;
type PlanTaskLinkStatePayload = { links?: PlanTaskLinks; taskEdits?: PlanTaskEdits; orderRowOrders?: PlanRowOrders; orderOverrides?: OrderOverrides; updatedAt?: string };
type AssignablePlanTask = DraggablePlanTask & { weekTitle: string };
type CompletedTuesdayItem = { id: string; kind: "order" | "intake" | "unknown"; label: string; detail: string; reason?: string; note?: string; updatedAt?: string };
type ProductionPlanMode = "schedule" | "orderRows";
type PersonFilter = "all" | Person;
type OrderDayFilter = "allWeek" | "today" | DayKey;
type RailFilter = "all" | "onTrack" | "watch" | "blocked" | "thisWeek" | "nextWeek" | "materials" | "noDate" | "costing";
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

function dateOnlyAtNoon(date: string | null | undefined) {
  if (!date) return null;
  const datePart = date.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? new Date(`${datePart}T12:00:00`) : new Date(date);
}

function orderDueThisWeek(order: UiOrder) {
  const due = dateOnlyAtNoon(order.shipDate);
  if (!due) return false;
  const { thisMon, nextMon } = weekBoundaries();
  return due >= thisMon && due < nextMon;
}

function orderDueNextWeek(order: UiOrder) {
  const due = dateOnlyAtNoon(order.shipDate);
  if (!due) return false;
  const { nextMon, twoMon } = weekBoundaries();
  return due >= nextMon && due < twoMon;
}

function orderDaysUntil(date: string | null) {
  const due = dateOnlyAtNoon(date);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function orderProgressPct(order: UiOrder, stepIndex = order.currentStep, qcFraction = 0, openTaskCount?: number, releaseComplete?: boolean) {
  const stepCount = stepsForOrder(order).length;
  if (!stepCount) return 0;
  const steps = stepsForOrder(order);
  const qcIndex = steps.findIndex((step) => step.key === "qc");
  const clampedQcFraction = Math.max(0, Math.min(qcFraction, 1));
  const adjustedStepIndex = qcIndex > 0 && stepIndex >= qcIndex - 1
    ? Math.max(stepIndex, qcIndex - 1 + clampedQcFraction)
    : stepIndex;
  let pct = Math.min(100, Math.round((adjustedStepIndex / Math.max(1, stepCount - 1)) * 100));
  if (typeof openTaskCount === "number" && openTaskCount > 0) pct = Math.min(pct, 94);
  if (qcIndex >= 0 && stepIndex >= qcIndex && clampedQcFraction < 1) pct = Math.min(pct, 90);
  if (releaseComplete === false && pct >= 96) pct = 95;
  if (releaseComplete && (!openTaskCount || openTaskCount <= 0) && clampedQcFraction >= 1) pct = Math.max(pct, 100);
  return pct;
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
    case "bottom-prep":
      return "Bottom prep";
    case "bottom-coat":
      return "Bottom coat";
    case "sand-top":
      return "Sand top";
    case "cut":
      return order.stepsKey === "PANEL_STEPS" ? "Cut / prep" : "Cut / machine / prep";
    case "sand":
    case "coat1":
      return "Sand and coat";
    case "coat2":
      return "Second coat";
    case "coat3":
      return "3rd coat (clear final)";
    case "cure":
      return "Curing";
    case "qc":
      return "QC + photos";
    case "assemble":
      return "Assemble / box";
    case "wrap":
      return "Pack / wrap";
    case "balance":
      return "Balance invoice";
    case "freight":
      return "Book freight / delivery";
    case "paid-release":
      return "Confirm paid before release";
    case "customer-update":
      return "Customer update";
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

function productionStepForOrder(order: UiOrder, stepIndex = order.currentStep) {
  const steps = stepsForOrder(order);
  if (steps.length === 0) return null;
  return steps[Math.max(0, Math.min(stepIndex, steps.length - 1))] ?? null;
}

function normalizedProductionTaskTitle(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function taskTitleMatchesProductionLabel(title: string, label: string | null) {
  if (!label) return false;
  const task = normalizedProductionTaskTitle(title);
  const target = normalizedProductionTaskTitle(label);
  return Boolean(task && target && (task === target || task.includes(target) || target.includes(task)));
}

function productionStepTaskTitles(step: Step, order: UiOrder) {
  const aliases: Record<string, string[]> = {
    matWait: ["Supplier/material wait", "Westimber lamination wait", "Materials ordered"],
    "bottom-prep": ["Stress cuts", "Stress cuts & L-channels", "Bottom: stress cuts + inserts"],
    "bottom-coat": ["Bottom coat"],
    "sand-top": ["Sand top", "Sand and 1st coat"],
    coat1: ["Sand and coat", "Sand and 1st coat"],
    coat3: ["3rd coat (clear final)", "Final coat"],
    freight: ["Book freight / delivery", "Book freight"],
    "paid-release": ["Confirm paid before release"],
    "customer-update": ["Customer update"],
  };
  return [
    productionTaskLabelForStep(step, order),
    suggestedJobTaskLabelForStep(step, order),
    ...(aliases[step.key] ?? []),
  ].filter(Boolean) as string[];
}

function taskMatchesProductionStep(title: string, step: Step, order: UiOrder) {
  return productionStepTaskTitles(step, order).some((label) => taskTitleMatchesProductionLabel(title, label));
}

function derivedProductionStepIndex(order: UiOrder, workflowTasks: WorkflowTask[] = [], planTasks: OrderJourneyTask[] = []) {
  const steps = stepsForOrder(order);
  if (steps.length === 0) return order.currentStep;
  const completedTitles = [
    ...workflowTasks.filter((task) => task.done).map((task) => task.title),
    ...planTasks.filter((task) => task.done).map((task) => task.text),
  ];
  let highestCompletedStep = -1;
  steps.forEach((step, index) => {
    if (completedTitles.some((title) => taskMatchesProductionStep(title, step, order))) {
      highestCompletedStep = Math.max(highestCompletedStep, index);
    }
  });
  return Math.max(order.currentStep, Math.min(steps.length - 1, highestCompletedStep + 1));
}

function defaultJobTaskActionForOrder(order: UiOrder, options: JobTaskOption[], stepIndex = order.currentStep) {
  if (order.rawMondayTopPanel === "Repair" && options.some((option) => option.label === "Repair")) return "Repair";
  const activeStep = productionStepForOrder(order, stepIndex);
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

function orderTrustSignal(order: UiOrder, tasks: Array<{ done?: boolean; scheduledDate?: string | null; appTask?: AppPlanTask }> = []) {
  const today = new Date().toISOString().slice(0, 10);
  const staleTask = tasks.find((task) => {
    const scheduledDate = task.scheduledDate || task.appTask?.scheduledDate || null;
    const done = Boolean(task.done || task.appTask?.done);
    return !done && scheduledDate && scheduledDate < today;
  });
  if (staleTask) {
    return {
      label: WORKSHOP_PROCESS_RULES.trust.staleTaskLabel,
      detail: "Past dated task needs Nick/Guido confirmation, not an automatic overdue assumption.",
      tone: "warn" as SignalTone,
      source: "Last checked: Tuesday schedule + Monday task dates",
    };
  }
  if (!order.rawMondayStatus) {
    return {
      label: WORKSHOP_PROCESS_RULES.trust.unknownStageLabel,
      detail: "No reliable physical stage found from current sources.",
      tone: "danger" as SignalTone,
      source: "Last checked: Monday source missing stage",
    };
  }
  if (order.rawMondayStatus === "Materials Ordered") {
    return {
      label: WORKSHOP_PROCESS_RULES.trust.supplierProofMissingLabel,
      detail: "Supplier/material proof is not clear enough to trust the affected material step.",
      tone: "danger" as SignalTone,
      source: "Last checked: Monday orders/production plan",
    };
  }
  if (order.rawMondayStatus === "In production" && !order.rawMondayTopPanel && !order.stepNote) {
    return {
      label: WORKSHOP_PROCESS_RULES.trust.unknownStageLabel,
      detail: "Production is active but the physical stage is not specific enough.",
      tone: "danger" as SignalTone,
      source: "Last checked: Monday orders/production plan",
    };
  }
  if (order.paymentStage === "ready_for_balance" || order.paymentStage === "awaiting_balance_payment") {
    return {
      label: WORKSHOP_PROCESS_RULES.trust.readyForDispatchAdminLabel,
      detail: order.paymentNextAction || "Guido admin needed before release.",
      tone: "warn" as SignalTone,
      source: "Last checked: Supabase payment lifecycle",
    };
  }
  if (order.rawMondayStatus === "To Process") {
    return {
      label: "Order Loaded needed",
      detail: "Guido should confirm invoice/spec/payment/due promise/suppliers/delivery before workshop trust.",
      tone: "warn" as SignalTone,
      source: "Last checked: Monday orders/production plan",
    };
  }
  return {
    label: WORKSHOP_PROCESS_RULES.trust.readyForWorkshopLabel,
    detail: "No trust blocker found in current sources.",
    tone: "good" as SignalTone,
    source: "Last checked: Monday + Tuesday current feed",
  };
}

function costingIsFullyApproved(costing: OrderCostingMatch | undefined) {
  return costing?.status === "verified_attached";
}

function costingHasVerifiedSource(costing: OrderCostingMatch | undefined) {
  return costing?.status === "verified_attached" || costing?.status === "verified_needs_review";
}

function OrderHealthStrip({
  orders,
  orderCostings,
  activeFilter,
  onFilterChange,
}: {
  orders: UiOrder[];
  orderCostings?: OrderCostingContext;
  activeFilter: RailFilter;
  onFilterChange: (filter: RailFilter) => void;
}) {
  const isNarrow = useIsNarrow(760);
  const active = orders.filter((order) => !isCompleteOrder(order));
  const { thisMon, nextMon, twoMon } = weekBoundaries();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueThis = active.filter((order) => {
    const due = dateOnlyAtNoon(order.shipDate);
    return Boolean(due && due >= thisMon && due < nextMon);
  }).length;
  const dueNext = active.filter((order) => {
    const due = dateOnlyAtNoon(order.shipDate);
    return Boolean(due && due >= nextMon && due < twoMon);
  }).length;
  const overdue = active.filter((order) => {
    const due = dateOnlyAtNoon(order.shipDate);
    return Boolean(due && due < today);
  }).length;
  const blocked = active.filter((order) => orderHealth(order) === "blocked").length;
  const watch = active.filter((order) => orderHealth(order) === "watch").length;
  const onTrack = active.filter((order) => orderHealth(order) === "onTrack").length;
  const needsCosting = active.filter((order) => !costingIsFullyApproved(orderCostings?.matches[order.id])).length;
  const allCards: Array<{ label: string; mobileLabel: string; value: number; color: string; filter: RailFilter }> = [
    { label: "Active Orders", mobileLabel: "Active", value: active.length, color: DT.textPrimary, filter: "all" },
    { label: "On Track", mobileLabel: "Track", value: onTrack, color: "#15803d", filter: "onTrack" },
    { label: "Watch", mobileLabel: "Watch", value: watch, color: "#b45309", filter: "watch" },
    { label: "Blocked", mobileLabel: "Blocked", value: blocked || overdue, color: blocked || overdue ? "#991b1b" : "#15803d", filter: "blocked" },
    { label: "Needs Costing", mobileLabel: "Cost", value: needsCosting, color: needsCosting ? "#b45309" : "#15803d", filter: "costing" },
    { label: "Due This Week", mobileLabel: "This week", value: dueThis, color: DT.textPrimary, filter: "thisWeek" },
    { label: "Due Next Week", mobileLabel: "Next", value: dueNext, color: DT.textPrimary, filter: "nextWeek" },
  ];
  const cards = isNarrow ? allCards.filter((card) => ["all", "watch", "blocked", "thisWeek"].includes(card.filter)) : allCards;
  return (
    <div data-mobile-health-strip="one-row-health" style={{ display: "flex", alignItems: "stretch", justifyContent: isNarrow ? "flex-start" : "flex-end", gap: isNarrow ? 4 : 6, flexWrap: isNarrow ? "nowrap" : "wrap", overflowX: isNarrow ? "auto" : "visible", paddingBottom: 0, width: "100%" }}>
      {cards.map((card) => {
        const selected = activeFilter === card.filter;
        return (
        <button
          type="button"
          key={card.label}
          aria-pressed={selected}
          onClick={() => onFilterChange(selected ? "all" : card.filter)}
          style={{ flex: isNarrow ? "0 0 auto" : "1 1 88px", minWidth: isNarrow ? 72 : 0, minHeight: isNarrow ? 30 : undefined, padding: isNarrow ? "5px 8px" : "7px 9px", background: selected ? DT.tealSoft : "rgba(255,255,255,0.72)", borderRadius: 999, border: `1px solid ${selected ? "rgba(12,124,122,0.28)" : DT.border}`, boxShadow: selected ? "0 0 0 2px rgba(12,124,122,0.06)" : "0 1px 4px rgba(0,0,0,0.025)", cursor: "pointer", textAlign: "center", overflow: "hidden", touchAction: "manipulation", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: isNarrow ? 4 : 0, flexDirection: isNarrow ? "row" : "column" }}
        >
          <span style={{ fontSize: isNarrow ? 9.5 : 8, fontWeight: 900, textTransform: isNarrow ? "none" : "uppercase", letterSpacing: isNarrow ? 0 : "0.06em", color: selected ? DT.teal : DT.textFaint, fontFamily: DT.sans, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip" }}>{isNarrow ? card.mobileLabel : card.label}</span>
          <span style={{ fontSize: isNarrow ? 11 : 18, fontWeight: 900, color: card.color, fontFamily: isNarrow ? DT.sans : DT.serif, marginTop: isNarrow ? 0 : 1, lineHeight: 1 }}>{card.value}</span>
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

function formatTaskDateLabel(date: string | null | undefined) {
  if (!date) return "No date";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
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

function paymentStageTone(stage: string | null | undefined): "neutral" | "good" | "warn" | "danger" | "teal" {
  if (stage === "balance_paid") return "good";
  if (stage === "awaiting_balance_payment" || stage === "balance_authorised" || stage === "deposit_due" || stage === "ready_for_balance") return "warn";
  if (stage === "manual_review") return "danger";
  if (stage === "in_production") return "teal";
  return "neutral";
}

type SignalTone = "neutral" | "good" | "warn" | "danger" | "teal";

const SIGNAL_STYLES: Record<SignalTone, { color: string; bg: string; border: string }> = {
  neutral: { color: DT.textMuted, bg: "rgba(255,255,255,0.70)", border: DT.border },
  good: { color: "#15803d", bg: "rgba(21,128,61,0.08)", border: "rgba(21,128,61,0.22)" },
  warn: { color: "#9a5b12", bg: "rgba(250,204,21,0.13)", border: "rgba(154,91,18,0.22)" },
  danger: { color: "#991b1b", bg: "rgba(153,27,27,0.07)", border: "rgba(153,27,27,0.20)" },
  teal: { color: DT.teal, bg: DT.tealSoft, border: "rgba(12,124,122,0.22)" },
};

function signalStyle(tone: SignalTone) {
  return SIGNAL_STYLES[tone] ?? SIGNAL_STYLES.neutral;
}

function InfoDot({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: 999, border: `1px solid ${open ? "rgba(12,124,122,0.28)" : DT.border}`, background: open ? DT.tealSoft : "rgba(255,255,255,0.78)", color: open ? DT.teal : DT.textMuted, fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer", padding: 0 }}
      >
        i
      </button>
      {open && (
        <span role="tooltip" style={{ position: "absolute", top: 22, right: 0, zIndex: 200, width: 240, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.98)", borderRadius: 10, boxShadow: "0 12px 30px rgba(37,30,20,0.16)", padding: 9, fontFamily: DT.sans, fontSize: 10.5, lineHeight: 1.35, fontWeight: 800, color: DT.textMuted, textAlign: "left" }}>
          {title}
        </span>
      )}
    </span>
  );
}

function paymentStageBadge(order: UiOrder) {
  if (!order.paymentStageLabel) return null;
  if (order.paymentStage === "awaiting_balance_payment" && order.balanceAmountDue != null) {
    return `${order.paymentStageLabel} · ${formatXeroMoney(order.balanceAmountDue)}`;
  }
  if (order.paymentStage === "balance_paid" && order.balanceInvoiceNumber) return `Balance paid · ${order.balanceInvoiceNumber}`;
  if (order.paymentStage === "ready_for_balance") return "Ready for balance invoice";
  return order.paymentStageLabel;
}

function intakePaymentStageBadge(lifecycle: OrderPaymentLifecycle | null) {
  if (!lifecycle) return null;
  if (lifecycle.paymentStage === "awaiting_balance_payment" && lifecycle.balanceAmountDue != null) {
    return `${lifecycle.paymentStageLabel} · ${formatXeroMoney(lifecycle.balanceAmountDue)}`;
  }
  if (lifecycle.paymentStage === "balance_paid" && lifecycle.balanceInvoiceNumber) return `Balance paid · ${lifecycle.balanceInvoiceNumber}`;
  return lifecycle.paymentStageLabel;
}

function recordString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function recordNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const match = value.match(/\d+(?:\.\d+)?/);
      if (match) return Number(match[0]);
    }
  }
  return null;
}

function isoDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

function addCalendarWeeks(dateIso: string, weeks: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + Math.round(weeks * 7));
  return date.toISOString().slice(0, 10);
}

function dayDiff(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return null;
  const start = new Date(`${startIso}T12:00:00`).getTime();
  const end = new Date(`${endIso}T12:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 864e5);
}

function matchedPaymentDateForIntake(item: OrderIntakeItem, invoiceNumber: string | null | undefined, amount: number | null | undefined) {
  const invoiceText = normalizeOrderText(invoiceNumber);
  return item.payments
    .filter((payment) => payment.matchStatus === "matched" && Number(payment.matchConfidence ?? 0) >= 0.98)
    .find((payment) => {
      if (invoiceText && normalizeOrderText(payment.reference).includes(invoiceText)) return true;
      return typeof amount === "number" && Math.abs(Number(payment.amount) - amount) < 0.02;
    })?.paymentDate || null;
}

function expectedReadyInfoForIntake(item: OrderIntakeItem) {
  const explicitDate = recordString(item.sourceSummary, ["customer_ready_date", "expected_ready_date", "promised_ready_date", "ready_date", "due_date"]);
  if (explicitDate) {
    return {
      date: explicitDate,
      label: "Due date",
      source: recordString(item.sourceSummary, ["customer_ready_source", "expected_ready_source", "promised_ready_source", "due_date_source"]) || "Explicit customer-ready date",
    };
  }

  const docs = item.financialDocuments || [];
  const depositDoc = docs.find((doc) => normalizeOrderText(doc.role) === "deposit") || docs.find((doc) => normalizeOrderText(doc.invoiceNumber) === normalizeOrderText(item.invoiceNumber)) || docs[0] || null;
  const balanceDoc = docs.find((doc) => normalizeOrderText(doc.role) === "balance") || null;
  const depositInvoiceDate = isoDateOnly(depositDoc?.issuedAt || item.invoiceDate);
  const balanceDueDate = isoDateOnly(balanceDoc?.dueAt || item.paymentLifecycle?.balanceDueAt);
  const explicitWeeks = recordNumber(item.sourceSummary, ["promised_weeks", "lead_time_weeks", "estimated_weeks", "production_weeks", "weeks_promised"]);
  const inferredWeeks = explicitWeeks || (() => {
    const days = dayDiff(depositInvoiceDate, balanceDueDate);
    return days ? Math.max(1, Math.round(days / 7)) : null;
  })();
  const standardWeeks = !inferredWeeks && normalizeOrderText(item.itemCategory).includes("table") ? 6 : null;
  const weeks = inferredWeeks || standardWeeks;
  if (!weeks || !depositInvoiceDate) {
    return {
      date: balanceDueDate || item.invoiceDueDate,
      label: balanceDueDate || item.invoiceDueDate ? "Estimated due date" : "Due date needed",
      source: balanceDueDate ? "Using balance invoice due date until promised weeks are captured." : "Needs promised lead time from invoice/email.",
    };
  }

  const depositPaidAt = isoDateOnly(item.paymentLifecycle?.depositPaidAt)
    || isoDateOnly(item.paidOnDate)
    || isoDateOnly(matchedPaymentDateForIntake(item, depositDoc?.invoiceNumber, depositDoc?.total));
  const anchorDate = depositPaidAt || depositInvoiceDate;
  return {
    date: addCalendarWeeks(anchorDate, weeks),
    label: depositPaidAt ? "Due date" : "Estimated due date",
    source: depositPaidAt
      ? `${weeks} weeks from deposit paid date (${formatShortDate(depositPaidAt)}).`
      : `${weeks} weeks from deposit invoice date; will recalculate from deposit payment date once paid.`,
  };
}

function intakeReviewTone(item: OrderIntakeItem, canApprove: boolean): SignalTone {
  if (item.reviewState === "approved") return "good";
  if (canApprove) return "teal";
  if (item.reviewState === "needs_review") return "danger";
  if (item.paymentLifecycle?.paymentStage === "manual_review") return "danger";
  return "warn";
}

type PaymentTimelineRow = { label: string; invoice: string; invoiceUrl: string | null; invoiceDate: string; dueDate: string; paidDate: string; amount: string; status: string; tone: SignalTone };

function paymentTimelineRows(item: OrderIntakeItem, paymentTruthLabel: string): PaymentTimelineRow[] {
  const lifecycle = item.paymentLifecycle;
  const docs = item.financialDocuments || [];
  const byInvoice = (invoice: string | null | undefined) => docs.find((doc) => normalizeOrderText(doc.invoiceNumber) === normalizeOrderText(invoice)) || null;
  const byRole = (role: string) => docs.find((doc) => normalizeOrderText(doc.role) === normalizeOrderText(role)) || null;
  const paidFromEvidence = (invoice: string | null | undefined) => {
    const match = item.payments
      .filter((payment) => payment.matchStatus === "matched" && Number(payment.matchConfidence ?? 0) >= 0.98)
      .find((payment) => !invoice || normalizeOrderText(payment.reference).includes(normalizeOrderText(invoice)));
    return match?.paymentDate || null;
  };
  const bankVisibleFromEvidence = (invoice: string | null | undefined) => {
    const invoiceText = normalizeOrderText(invoice);
    const match = item.payments
      .filter(isPendingAkahuPayment)
      .find((payment) => !invoiceText || normalizeOrderText(payment.reference).includes(invoiceText));
    return match?.paymentDate || null;
  };
  const isBankVisiblePaid = (invoice: string | null | undefined) => Boolean(bankVisibleFromEvidence(invoice));
  const rowFromDocument = (label: string, document: OrderIntakeFinancialDocument | null, paidAt: string | null | undefined, fallbackDue: string | null | undefined, fallbackAmountDue: number | null | undefined): PaymentTimelineRow => {
    const bankVisibleDate = bankVisibleFromEvidence(document?.invoiceNumber);
    const paidDate = paidAt || paidFromEvidence(document?.invoiceNumber) || bankVisibleDate || null;
    const amountDue = document?.amountDue ?? fallbackAmountDue ?? null;
    const bankVisiblePaid = Boolean(bankVisibleDate);
    const paid = Boolean(paidDate || bankVisiblePaid || (amountDue != null && amountDue <= 0.01));
    return {
      label,
      invoice: document?.invoiceNumber || `No ${label.toLowerCase()} invoice`,
      invoiceUrl: document?.invoiceUrl || null,
      invoiceDate: formatShortDate(document?.issuedAt || null),
      dueDate: formatShortDate(document?.dueAt || fallbackDue || null),
      paidDate: paidDate ? formatShortDate(paidDate) : paid ? "Paid" : "Awaiting payment",
      amount: document?.total != null ? formatXeroMoney(document.total) : amountDue != null ? formatXeroMoney(amountDue) : "",
      status: bankVisiblePaid ? WORKSHOP_PROCESS_RULES.trust.bankVisiblePaidLabel : paid ? "Paid" : amountDue != null && amountDue > 0.01 ? `Awaiting ${formatXeroMoney(amountDue)}` : "Awaiting payment",
      tone: paid ? "good" : document ? "warn" : "neutral",
    };
  };
  if (lifecycle) {
    const depositDoc = byInvoice(lifecycle.depositInvoiceNumber) || byRole("deposit") || byRole("primary");
    const balanceDoc = byInvoice(lifecycle.balanceInvoiceNumber) || byRole("balance");
    return [
      rowFromDocument("Deposit", depositDoc, lifecycle.depositPaidAt, null, lifecycle.depositAmountDue),
      rowFromDocument("Balance", balanceDoc, lifecycle.balancePaidAt, lifecycle.balanceDueAt, lifecycle.balanceAmountDue),
    ];
  }
  const depositDoc = byRole("deposit");
  const balanceDoc = byRole("balance");
  if (depositDoc || balanceDoc) {
    return [
      rowFromDocument("Deposit", depositDoc || byInvoice(item.invoiceNumber) || docs[0] || null, item.paidOnDate, null, depositDoc?.amountDue),
      rowFromDocument("Balance", balanceDoc, null, balanceDoc?.dueAt, balanceDoc?.amountDue),
    ];
  }
  const document = byInvoice(item.invoiceNumber) || docs[0] || null;
  return [{
    label: "Invoice",
    invoice: document?.invoiceNumber || item.invoiceNumber || "No invoice",
    invoiceUrl: document?.invoiceUrl || item.xeroUrl,
    invoiceDate: formatShortDate(document?.issuedAt || item.invoiceDate),
    dueDate: formatShortDate(document?.dueAt || item.invoiceDueDate),
    paidDate: item.paidOnDate ? formatShortDate(item.paidOnDate) : paymentTruthLabel,
    amount: formatXeroMoney(document?.total ?? item.total),
    status: paymentTruthLabel,
    tone: item.paidOnDate || item.payments.some(isPendingAkahuPayment) || isBankVisiblePaid(item.invoiceNumber) ? "good" : "neutral",
  }];
}

function nextOrderPrompt(order: UiOrder) {
  if (order.paymentNextAction && (order.paymentStage === "awaiting_balance_payment" || order.paymentStage === "balance_authorised" || order.paymentStage === "ready_for_balance" || order.paymentStage === "balance_paid")) return order.paymentNextAction;
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

function intakeItemMatchesNewOrder(item: OrderIntakeItem, order: NewOrderPlanCandidate | null) {
  if (!order) return false;
  const invoice = normalizeOrderText(order.xeroInvoiceNumber);
  const intakeInvoice = normalizeOrderText(item.invoiceNumber);
  if (invoice || intakeInvoice) return Boolean(invoice && intakeInvoice && invoice === intakeInvoice);

  const customer = normalizeOrderText(order.customer);
  const intakeCustomer = normalizeOrderText(item.customerName);
  if (!customer || !intakeCustomer) return false;
  const customerMatches = customer.includes(intakeCustomer) || intakeCustomer.includes(customer);
  if (!customerMatches) return false;

  const orderProduct = normalizeOrderText([order.product, order.rawMondayItem, order.notes].filter(Boolean).join(" "));
  const intakeProduct = normalizeOrderText([item.productSummary, item.itemCategory].filter(Boolean).join(" "));
  return !orderProduct || !intakeProduct || orderProduct.includes(intakeProduct) || intakeProduct.includes(orderProduct);
}

function findOrderForIntakeItem(item: OrderIntakeItem, orders: UiOrder[]) {
  const intakeInvoice = normalizeOrderText(item.invoiceNumber);
  if (intakeInvoice) {
    const byInvoice = orders.find((order) => normalizeOrderText(order.xeroInvoiceNumber) === intakeInvoice);
    if (byInvoice) return byInvoice;
  }

  return orders.find((order) => intakeItemMatchesNewOrder(item, order)) ?? null;
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

function orderHasExactCustomerLabel(order: UiOrder, ...candidates: Array<string | null | undefined>) {
  const customer = normalizeOrderText(order.customer);
  if (!customer) return false;
  return candidates.some((candidate) => normalizeOrderText(candidate) === customer);
}

function exactOrderForPlanTask(task: Pick<DraggablePlanTask, "rowName" | "linkedOrders">, orders: UiOrder[]) {
  const matches = orders.filter((order) => orderHasExactCustomerLabel(order, task.rowName, ...task.linkedOrders.map((linked) => linked.name)));
  return matches.length === 1 ? matches[0] : null;
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
  if (owner === "Guido") return "nick";
  return null;
}

function appTaskCountsTowardWorkshopCapacity(task: AppPlanTask) {
  return task.owner !== "Guido" && task.owner !== "Other";
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

function shiftIsoByWorkingDays(value: string, direction: -1 | 1) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  do {
    date.setDate(date.getDate() + direction);
  } while (![1, 2, 3, 4, 5].includes(date.getDay()));
  return date.toISOString().slice(0, 10);
}

function workflowTasksForPlan(workflow: OrderWorkflowState | null, order: UiOrder | null = null): AppPlanTask[] {
  if (!workflow) return [];
  return workflow.tasks.flatMap((task) => {
    const person = workflowOwnerToPerson(task.owner);
    const day = dateToDayKey(task.scheduledDate);
    if (!person || !day || !task.title.trim()) return [];
    return [{
      id: `workflow-${workflow.orderId}-${task.id}`,
      orderId: workflow.orderId,
      title: task.title,
      detail: task.notes || null,
      customer: order?.customer ?? null,
      owner: task.owner,
      scheduledDate: task.scheduledDate,
      day,
      person,
      done: task.done,
      estimatedHours: 1,
      source: "workflow" as const,
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
  orderCostings,
  selectedOrder,
  selectedOrderTasks,
  assignmentTask,
  assignmentStatus,
  onAssignTask,
  onRemoveTaskLink,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onWorkflowTaskDoneToggle,
  onWorkflowChange,
  onSelect,
  onOpenOrder,
  onMarkOrderComplete,
  completedItems,
  onRestoreCompletedOrder,
  onClear,
  filter,
  onFilterChange,
  isNarrow,
  canRemoveAssignmentLink,
  newOrderCard,
  tasksForOrder,
}: {
  orders: UiOrder[];
  orderCostings?: OrderCostingContext;
  selectedOrder: UiOrder | null;
  selectedOrderTasks: OrderJourneyTask[];
  assignmentTask: AssignablePlanTask | null;
  assignmentStatus: string;
  onAssignTask: (task: AssignablePlanTask, orderId: number, placement?: PlanTaskPlacement) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
  onPlanTaskEdit: (task: BoardPlanTask) => void;
  onPlanTaskDoneToggle: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onWorkflowTaskDoneToggle?: (done: boolean, origin?: DelightOrigin) => void;
  onWorkflowChange: (workflow: OrderWorkflowState | null) => void;
  onSelect: (id: number) => void;
  onOpenOrder: (id: number) => void;
  onMarkOrderComplete: (order: UiOrder) => void;
  completedItems: CompletedTuesdayItem[];
  onRestoreCompletedOrder: (item: CompletedTuesdayItem) => void;
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
      if (filter === "costing" && costingIsFullyApproved(orderCostings?.matches[order.id])) return false;
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
  }, [activeOrders, filter, orderCostings?.matches, query, sort]);
  const filterOptions: Array<{ id: RailFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "blocked", label: "Blocked" },
    { id: "thisWeek", label: "This week" },
    { id: "materials", label: "Materials" },
    { id: "costing", label: "Costing" },
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
      <div style={{ position: "relative", padding: "12px 12px 10px", borderBottom: `1px solid ${DT.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans }}>Orders</div>
          <div style={{ marginTop: 2, fontFamily: DT.serif, fontSize: 18, color: DT.textPrimary, lineHeight: 1 }}>{assignmentTask ? "Assign task" : selectedOrder ? "Job command" : `${filteredOrders.length} active`}</div>
        </div>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
          <CompletedTuesdayOrdersCard items={completedItems} onRestore={onRestoreCompletedOrder} />
          {(selectedOrder || assignmentTask) && (
	            <button
	              type="button"
	              onClick={onClear}
	              aria-label="Back to orders list"
	              style={{ border: `1px solid rgba(12,124,122,0.22)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "9px 14px", fontSize: 12, fontFamily: DT.sans, fontWeight: 950, cursor: "pointer", boxShadow: "0 4px 12px rgba(12,124,122,0.08)" }}
	            >
	              ← Back
	            </button>
          )}
        </div>
      </div>
      {assignmentTask ? (
        <TaskAssignmentPanel key={`assign-${assignmentTask.id}`} task={assignmentTask} orders={activeOrders} status={assignmentStatus} onAssign={onAssignTask} onRemove={onRemoveTaskLink} canRemoveLink={canRemoveAssignmentLink} tasksForOrder={tasksForOrder} />
      ) : selectedOrder ? (
        <OrderRailDetail
          key={`detail-${selectedOrder.id}`}
          order={selectedOrder}
          costing={orderCostings?.matches[selectedOrder.id]}
          planTasks={selectedOrderTasks}
          onWorkflowChange={onWorkflowChange}
          onOpen={() => onOpenOrder(selectedOrder.id)}
          onMarkComplete={onMarkOrderComplete}
          onPlanTaskEdit={onPlanTaskEdit}
          onPlanTaskDoneToggle={onPlanTaskDoneToggle}
          onWorkflowTaskDoneToggle={onWorkflowTaskDoneToggle}
          onRemoveTaskLink={onRemoveTaskLink}
        />
      ) : (
        <div key="list" style={{ maxHeight: undefined, overflowY: "visible", padding: 10, animation: "orderRailIn 1000ms ease both" }}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr auto", gap: 6 }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders"
              style={{ width: "100%", minHeight: isNarrow ? 40 : undefined, boxSizing: "border-box", border: `1px solid ${DT.border}`, borderRadius: 9, padding: "8px 9px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg, outline: "none" }}
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as RailSort)}
              aria-label="Sort orders"
              style={{ width: isNarrow ? "100%" : 112, minHeight: isNarrow ? 40 : undefined, border: `1px solid ${DT.border}`, borderRadius: 9, padding: "8px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textMuted, background: DT.cardBg, outline: "none" }}
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
                  style={{ flex: "1 1 0", minWidth: 0, minHeight: isNarrow ? 40 : undefined, border: `1px solid ${active ? "rgba(12,124,122,0.32)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.72)", color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: isNarrow ? "8px 5px" : "5px 5px", fontFamily: DT.sans, fontSize: isNarrow ? 9.5 : 9, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", textAlign: "center", touchAction: "manipulation" }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, overflowX: "visible", WebkitOverflowScrolling: "touch" }}>
            {filteredOrders.map((order) => (
              <OrderRailItem key={order.id} order={order} costing={orderCostings?.matches[order.id]} onSelect={onSelect} isNarrow={isNarrow} />
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

function costingTone(costing: OrderCostingMatch | undefined) {
  if (costing?.status === "verified_attached") return { color: DT.sage, bg: "rgba(110,138,106,0.10)", border: "rgba(110,138,106,0.24)" };
  if (costing?.status === "verified_needs_review") return { color: "#9a5b12", bg: "rgba(154,91,18,0.08)", border: "rgba(154,91,18,0.22)" };
  if (costing?.status === "costings_unavailable") return { color: "#922a23", bg: "rgba(146,42,35,0.07)", border: "rgba(146,42,35,0.18)" };
  return { color: "#9a5b12", bg: "rgba(154,91,18,0.08)", border: "rgba(154,91,18,0.22)" };
}

function formatCostingMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Cost not shown";
  return `$${Math.round(value).toLocaleString("en-NZ")} ex GST`;
}

function formatCostingPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Margin not shown";
  return `${value.toLocaleString("en-NZ", { maximumFractionDigits: 1 })}% margin`;
}

function OrderCostingPill({ costing }: { costing?: OrderCostingMatch }) {
  const tone = costingTone(costing);
  const label = costing?.label || "Needs costing match";
  return (
    <span title={costing?.detail || "No source-verified costing relation is attached to this order."} style={{ display: "inline-flex", maxWidth: "100%", border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {label}
    </span>
  );
}

function OrderCostingPanel({ costing }: { costing?: OrderCostingMatch }) {
  const tone = costingTone(costing);
  const status = costing?.status || "needs_match";
  const hasVerifiedSource = costingHasVerifiedSource(costing);
  const pillLabel = status === "verified_attached" ? "Approved" : status === "verified_needs_review" ? "Verified source" : "No match";
  const pillTone = status === "verified_attached" ? "good" : status === "costings_unavailable" ? "danger" : "warn";
  return (
    <OrderCommandSection
      eyebrow="Costing"
      title={costing?.label || "Needs costing match"}
      action={<OrderCommandPill label={pillLabel} tone={pillTone} />}
    >
      <div style={{ border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 10, padding: "9px 10px", fontFamily: DT.sans, color: tone.color }}>
        <div style={{ fontSize: 12, lineHeight: 1.35, fontWeight: 900 }}>{costing?.detail || "No source-verified product costing is explicitly attached to this order."}</div>
        <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.35, fontWeight: 850 }}>
          {hasVerifiedSource
            ? `${formatCostingMoney(costing?.totalCostExGst)} · ${formatCostingPercent(costing?.grossMarginPercent)} · ${status === "verified_attached" ? "Approved for quote use" : "Needs approval before quote use"} · Matched by ${costing?.matchedBy || "verified source"}`
            : "Needed relation: exact product code, Xero invoice/reference, or approved order-to-costing link."}
        </div>
      </div>
      {costing?.sourceLabel && (
        <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <OrderCommandPill label={`Source: ${costing.sourceLabel}`} tone="neutral" />
          {costing.sourceUrl && (
            <a href={costing.sourceUrl} target="_blank" rel="noreferrer" style={{ border: `1px solid rgba(12,124,122,0.18)`, background: "rgba(255,255,255,0.74)", color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textDecoration: "none" }}>
              Open proof
            </a>
          )}
        </div>
      )}
    </OrderCommandSection>
  );
}

function OrderRailItem({ order, costing, onSelect, isNarrow }: { order: UiOrder; costing?: OrderCostingMatch; onSelect: (id: number) => void; isNarrow: boolean }) {
  const healthLevel = orderHealth(order);
  const health = HEALTH_META[healthLevel];
  const trust = orderTrustSignal(order);
  const trustStyle = signalStyle(trust.tone);
  const reason = orderHealthReason(order);
  const showReason = healthLevel !== "onTrack" && !(reason === "No due date" && !order.shipDate);
  return (
    <button
      type="button"
      onClick={() => onSelect(order.id)}
      style={{
        flex: undefined,
        width: "100%",
        minWidth: 0,
        minHeight: isNarrow ? 82 : undefined,
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
          <div style={{ fontFamily: DT.sans, fontSize: 13, fontWeight: 900, color: DT.textPrimary, lineHeight: 1.18, whiteSpace: "normal", overflowWrap: "anywhere" }}>{order.customer}</div>
          <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750, lineHeight: 1.2, whiteSpace: "normal", overflowWrap: "anywhere" }}>{orderItemLabel(order)} · {orderStatusLabel(order)}</div>
          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", maxWidth: "100%", border: `1px solid ${trustStyle.border}`, background: trustStyle.bg, color: trustStyle.color, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trust.label}</span>
            <OrderCostingPill costing={costing} />
          </div>
          {showReason && <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: health.color, fontWeight: 850, lineHeight: 1.25, whiteSpace: "normal", overflowWrap: "anywhere" }}>{reason}</div>}
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
    minHeight: 40,
    padding: "8px 8px",
    fontFamily: DT.sans,
    fontSize: 10,
    fontWeight: 950,
    cursor: "pointer",
    touchAction: "manipulation",
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
      style={{ marginBottom: 8, minHeight: 96, borderWidth: "1px 1px 1px 5px", borderStyle: "solid", borderColor: `${reviewActive ? newOrderPalette.clayBorderStrong : newOrderPalette.clayBorder} ${reviewActive ? newOrderPalette.clayBorderStrong : newOrderPalette.clayBorder} ${reviewActive ? newOrderPalette.clayBorderStrong : newOrderPalette.clayBorder} ${newOrderPalette.clayStripe}`, background: newOrderPalette.clayPanel, borderRadius: 10, padding: "9px 10px", boxShadow: reviewActive ? "0 8px 18px rgba(85,113,95,0.10)" : "0 1px 4px rgba(154,82,49,0.06)", cursor: "pointer", outline: "none" }}
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
        style={{ marginTop: 6, width: "100%", minHeight: 40, border: `1px solid ${newOrderPalette.clayBorderStrong}`, background: approved ? "rgba(255,255,255,0.68)" : newOrderPalette.clayAccent, color: approved ? activeAccent : "#fff", borderRadius: 999, padding: "8px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer", boxShadow: reviewActive && !approved ? "0 8px 18px rgba(85,113,95,0.12)" : undefined, touchAction: "manipulation" }}
      >
        {approved ? "Draft approved" : "Approve draft plan"}
      </button>
    </div>
  );
}


const INTAKE_STATE_META: Record<OrderIntakeReviewState, { color: string; bg: string; border: string }> = {
  awaiting_payment: { color: DT.textMuted, bg: "rgba(232,230,224,0.42)", border: "rgba(0,0,0,0.08)" },
  paid_needs_review: { color: DT.teal, bg: "rgba(12,124,122,0.08)", border: "rgba(12,124,122,0.22)" },
  needs_review: { color: "#9a5b12", bg: "rgba(154,91,18,0.08)", border: "rgba(154,91,18,0.24)" },
  approved: { color: "#15803d", bg: "rgba(21,128,61,0.08)", border: "rgba(21,128,61,0.22)" },
};

function intakeOwnerToPerson(owner: OrderIntakeOwner): Person {
  return owner === "Dylan" ? "dylan" : "nick";
}

function normalizedTaskTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function maxIsoDate(...values: Array<string | null | undefined>) {
  return maxIsoDateFromRules(...values);
}

function intakePlanningText(item: OrderIntakeItem) {
  return [item.itemCategory, item.productSummary, ...item.lineItems.map((line) => line.description)].join("\n").toLowerCase();
}

function intakeOwnerFromProcess(owner: WorkshopProcessTask["owner"]): OrderIntakeOwner {
  return owner === "Nick" || owner === "Dylan" || owner === "Guido" ? owner : "Other";
}

function processTaskToIntakeDraft(item: OrderIntakeItem, task: WorkshopProcessTask, existing: OrderIntakeTaskDraft | undefined, index: number): OrderIntakeTaskDraft {
  const owner = intakeOwnerFromProcess(task.owner);
  const scheduledDate = maxIsoDate(existing?.scheduledDate, task.scheduledDate) || task.scheduledDate;
  return {
    id: existing?.id || task.key || `${item.orderId}:process:${index + 1}`,
    title: task.title,
    detail: task.detail,
    owner,
    person: intakeOwnerToPerson(owner),
    scheduledDate,
    day: dateToDayKey(scheduledDate) ?? existing?.day ?? "monday",
    estimatedHours: task.estimatedHours,
    sortOrder: (index + 1) * 10,
  };
}

function isStandardTableIntakeItem(item: OrderIntakeItem) {
  const text = intakePlanningText(item);
  return /\bdining\s+table\b|\btable\b|base|steel|leg/.test(text);
}

function normalizeStandardTableIntakeTasks(item: OrderIntakeItem, rawTasks: OrderIntakeTaskDraft[]) {
  if (!isStandardTableIntakeItem(item) || rawTasks.length === 0) return rawTasks;
  const existingByTitle = new Map(rawTasks.map((task) => [normalizedTaskTitle(task.title), task]));
  const startIso = rawTasks[0]?.scheduledDate ?? new Date().toISOString().slice(0, 10);
  const processTasks = buildDiningTableProcessPlan({ orderId: item.orderId, text: intakePlanningText(item), startIso });
  return processTasks.map((task, index) => processTaskToIntakeDraft(item, task, existingByTitle.get(normalizedTaskTitle(task.title)), index));
}

function numberedTaskRowOptionLabel(title: string, optionIndex: number, selectedTitle: string, taskIndex: number) {
  return title === selectedTitle ? `${taskIndex + 1}. ${title}` : numberedJobTaskOptionLabel(title, optionIndex);
}

function intakeStateSort(state: OrderIntakeReviewState) {
  if (state === "paid_needs_review") return 0;
  if (state === "needs_review") return 1;
  if (state === "awaiting_payment") return 2;
  return 3;
}

const COMPLETION_REASONS = [
  "Customer collected",
  "Supplier direct collection",
  "Cancelled",
  "Duplicate",
  "No workshop action",
  "Other",
] as const;

type CompletionReason = (typeof COMPLETION_REASONS)[number];
type CompletionDecision = { reason: CompletionReason; note?: string };
type TuesdayCompletionRequest =
  | { type: "order"; order: UiOrder }
  | { type: "intake"; item: OrderIntakeItem }
  | { type: "restore"; item: CompletedTuesdayItem };

function completionRequestKey(request: TuesdayCompletionRequest) {
  if (request.type === "order") return `${request.type}:${request.order.id}`;
  if (request.type === "intake") return `${request.type}:${request.item.orderId}`;
  return `${request.type}:${request.item.id}`;
}

function OrderIntakeRailCard({
  items,
  status,
  busy,
  onRefresh,
  onOpen,
}: {
  items: OrderIntakeItem[];
  status: string;
  busy: boolean;
  onRefresh: () => void;
  onOpen: (orderId: string) => void;
}) {
  const sorted = [...items].sort((a, b) => intakeStateSort(a.reviewState) - intakeStateSort(b.reviewState) || a.customerName.localeCompare(b.customerName));
  const pendingItems = sorted.filter((item) => item.reviewState !== "approved");
  const approvedCount = sorted.length - pendingItems.length;
  const actionableCount = pendingItems.length;
  return (
    <section style={{ marginBottom: 10, border: `1px solid ${DT.border}`, borderRadius: 12, background: "rgba(255,255,255,0.88)", boxShadow: DT.shadow, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, color: DT.teal, letterSpacing: "0.08em", textTransform: "uppercase" }}>Pending new orders</div>
          <div style={{ marginTop: 2, fontFamily: DT.serif, fontSize: 19, lineHeight: 1.05, color: DT.textPrimary }}>{actionableCount}</div>
        </div>
        <button type="button" onClick={onRefresh} disabled={busy} style={{ minWidth: 64, minHeight: 40, border: `1px solid rgba(12,124,122,0.20)`, background: busy ? "rgba(232,230,224,0.42)" : DT.tealSoft, color: busy ? DT.textMuted : DT.teal, borderRadius: 999, padding: "8px 10px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: busy ? "wait" : "pointer", touchAction: "manipulation" }}>
          {busy ? "Checking" : "Refresh"}
        </button>
      </div>
      {status && <div style={{ marginTop: 7, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, lineHeight: 1.3 }}>{status}</div>}
      <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 7 }}>
        {pendingItems.length === 0 ? (
          <div style={{ border: `1px dashed ${DT.border}`, borderRadius: 10, padding: "9px 8px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 800 }}>No pending intake orders loaded.</div>
        ) : pendingItems.slice(0, 7).map((item) => {
          const meta = INTAKE_STATE_META[item.reviewState];
          const lifecycleLabel = intakePaymentStageBadge(item.paymentLifecycle);
          return (
            <button key={item.orderId} type="button" onClick={() => onOpen(item.orderId)} style={{ textAlign: "left", borderWidth: "1px 1px 1px 4px", borderStyle: "solid", borderColor: `${meta.border} ${meta.border} ${meta.border} ${meta.color}`, background: "rgba(255,255,255,0.82)", borderRadius: 10, padding: "8px 9px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.025)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: DT.sans, fontSize: 12, fontWeight: 950, color: DT.textPrimary, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.customerName}</div>
                  <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.invoiceNumber || "No invoice"} · {formatXeroMoney(item.total)}</div>
                  {lifecycleLabel && <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 9.5, fontWeight: 900, color: paymentStageTone(item.paymentLifecycle?.paymentStage) === "warn" ? "#9a5b12" : DT.teal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lifecycleLabel}</div>}
                </div>
                <span style={{ flex: "0 0 auto", border: `1px solid ${meta.border}`, background: meta.bg, color: meta.color, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 8.5, fontWeight: 950, whiteSpace: "nowrap" }}>{item.stateLabel}</span>
              </div>
            </button>
          );
        })}
        {approvedCount > 0 && <div style={{ fontFamily: DT.sans, fontSize: 9.5, color: DT.textMuted, fontWeight: 850, textAlign: "center" }}>{approvedCount} approved intake order{approvedCount === 1 ? "" : "s"} already on the schedule</div>}
      </div>
    </section>
  );
}

function CompletedTuesdayOrdersCard({
  items,
  onRestore,
}: {
  items: CompletedTuesdayItem[];
  onRestore: (item: CompletedTuesdayItem) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={{ position: "relative", flex: "0 0 auto" }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{ minHeight: 40, border: `1px solid ${open ? "rgba(12,124,122,0.24)" : DT.border}`, background: open ? DT.tealSoft : "rgba(255,255,255,0.78)", color: open ? DT.teal : DT.textMuted, borderRadius: 999, padding: "6px 10px", fontFamily: DT.sans, fontSize: 9.5, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap", touchAction: "manipulation" }}
        aria-expanded={open}
      >
        Completed {items.length}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 90, width: 292, maxWidth: "calc(100vw - 28px)", border: `1px solid ${DT.border}`, borderRadius: 12, background: "rgba(255,255,255,0.98)", boxShadow: "0 18px 44px rgba(37,30,20,0.18)", padding: 8 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, color: DT.textFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Completed in Tuesday</div>
          <div style={{ marginTop: 2, marginBottom: 7, fontFamily: DT.sans, fontSize: 10, fontWeight: 800, color: DT.textMuted }}>Restore if this was marked complete by mistake.</div>
          <div style={{ display: "grid", gap: 6, maxHeight: 230, overflowY: "auto", paddingRight: 2 }}>
          {items.map((item) => (
            <div key={item.id} title={item.note || item.detail} style={{ border: `1px solid ${DT.border}`, borderRadius: 10, background: "rgba(251,250,247,0.82)", padding: 8, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 11, lineHeight: 1.15, fontWeight: 950, color: DT.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 9.5, lineHeight: 1.2, fontWeight: 800, color: DT.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.reason ? `${item.reason} · ${item.detail}` : item.detail}</div>
              </div>
              <button type="button" onClick={() => onRestore(item)} style={{ border: `1px solid rgba(12,124,122,0.20)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 9.5, fontWeight: 950, cursor: "pointer" }}>Restore</button>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TuesdayCompletionDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: TuesdayCompletionRequest;
  onCancel: () => void;
  onConfirm: (decision: CompletionDecision | null) => void;
}) {
  const [reason, setReason] = useState<CompletionReason>(COMPLETION_REASONS[0]);
  const [note, setNote] = useState("");
  const isRestore = request.type === "restore";
  const label = request.type === "order" ? request.order.customer : request.type === "intake" ? request.item.customerName : request.item.label;
  const detail = request.type === "order"
    ? "This hides the order from active Tuesday views only. Monday and Xero stay unchanged."
    : request.type === "intake"
      ? "This hides the intake order and its Tuesday schedule suggestions only. Xero and the source invoice stay unchanged."
      : "This removes the Tuesday completion override only. Monday, Xero, and saved invoices stay unchanged.";

  function confirm() {
    if (isRestore) {
      onConfirm(null);
      return;
    }
    const trimmedNote = note.trim().slice(0, 180);
    onConfirm({ reason, note: trimmedNote || undefined });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={isRestore ? `Restore ${label}` : `Mark ${label} complete in Tuesday`} style={{ position: "fixed", inset: 0, zIndex: 260, display: "grid", placeItems: "center", background: "rgba(26,22,17,0.38)", padding: 16 }}>
      <div style={{ width: "min(520px, 100%)", border: `1px solid ${isRestore ? "rgba(12,124,122,0.22)" : "rgba(146,42,35,0.18)"}`, background: DT.cardBg, borderRadius: 18, boxShadow: "0 24px 64px rgba(37,30,20,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${DT.border}` }}>
          <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, letterSpacing: "0.10em", textTransform: "uppercase", color: isRestore ? DT.teal : "#922a23" }}>{isRestore ? "Restore order" : "Complete in Tuesday"}</div>
          <h3 style={{ margin: "4px 0 0", fontFamily: DT.serif, fontSize: 31, lineHeight: 1.02, color: DT.textPrimary, fontWeight: 900, overflowWrap: "anywhere" }}>{label}</h3>
          <div style={{ marginTop: 8, fontFamily: DT.sans, fontSize: 12, lineHeight: 1.45, color: DT.textMuted, fontWeight: 800 }}>{detail}</div>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 10 }}>
          {!isRestore && (
            <>
              <label style={{ display: "grid", gap: 5 }}>
                <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: DT.textFaint }}>Reason</span>
                <select value={reason} onChange={(event) => setReason(event.target.value as CompletionReason)} style={{ width: "100%", border: `1px solid ${DT.border}`, background: DT.cardBg, borderRadius: 10, padding: "10px 11px", fontFamily: DT.sans, fontSize: 13, color: DT.textPrimary, fontWeight: 850 }}>
                  {COMPLETION_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 5 }}>
                <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: DT.textFaint }}>Note</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Optional context for why this was completed" style={{ width: "100%", resize: "vertical", border: `1px solid ${DT.border}`, background: DT.cardBg, borderRadius: 10, padding: "10px 11px", fontFamily: DT.sans, fontSize: 13, lineHeight: 1.35, color: DT.textPrimary, fontWeight: 750 }} />
              </label>
            </>
          )}
          {isRestore && <div style={{ border: `1px solid rgba(12,124,122,0.18)`, background: DT.tealSoft, borderRadius: 12, padding: "10px 11px", fontFamily: DT.sans, fontSize: 12, lineHeight: 1.45, color: DT.teal, fontWeight: 850 }}>Use this when an order was hidden from Tuesday by mistake and should come back into the active boards.</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={onCancel} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "10px 14px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer" }}>Cancel</button>
            <button type="button" onClick={confirm} style={{ border: `1px solid ${isRestore ? "rgba(12,124,122,0.22)" : "rgba(146,42,35,0.18)"}`, background: isRestore ? DT.teal : "rgba(146,42,35,0.08)", color: isRestore ? "#fff" : "#922a23", borderRadius: 999, padding: "10px 14px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer" }}>{isRestore ? "Restore to active" : "Mark complete"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntakeTaskDraftRow({
  task,
  index,
  isNarrow,
  dateOptions,
  onPatch,
  onChooseOwner,
  onChooseDate,
  onDelete,
}: {
  task: OrderIntakeTaskDraft;
  index: number;
  isNarrow: boolean;
  dateOptions: SuggestedDateOption[];
  onPatch: (id: string, patch: Partial<OrderIntakeTaskDraft>) => void;
  onChooseOwner: (id: string, owner: OrderIntakeOwner) => void;
  onChooseDate: (id: string, dateIso: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "intake-task" },
  });
  const dateKnown = dateOptions.some((option) => option.dateIso === task.scheduledDate);
  const taskTitleOptions = Array.from(new Set([...JOB_TASK_PRESETS, task.title].filter(Boolean))) as string[];
  return (
    <div
      ref={setNodeRef}
      title={task.detail || task.title}
      style={{ border: `1px solid ${isDragging ? "rgba(12,124,122,0.30)" : DT.border}`, borderRadius: 9, background: isDragging ? "rgba(237,248,247,0.94)" : "rgba(251,250,247,0.82)", padding: 5, minWidth: 0, transform: CSS.Transform.toString(transform), transition, boxShadow: isDragging ? "0 12px 24px rgba(37,30,20,0.12)" : undefined, opacity: isDragging ? 0.82 : 1 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "28px 34px minmax(0, 1fr) 74px" : "28px 42px minmax(220px, 1fr) 92px 128px 54px 62px", gap: 5, alignItems: "center" }}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag task ${index + 1}`}
          style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", color: DT.textMuted, borderRadius: 8, padding: "6px 0", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "grab", touchAction: "none" }}
        >
          =
        </button>
        <span style={{ border: `1px solid rgba(12,124,122,0.16)`, background: "rgba(237,248,247,0.78)", color: DT.teal, borderRadius: 999, padding: "3px 0", fontFamily: DT.sans, fontSize: 9.5, fontWeight: 950, textAlign: "center" }}>{index + 1}</span>
        <select value={task.title} onChange={(event) => onPatch(task.id, { title: event.target.value })} aria-label={`Task ${index + 1} title`} style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: DT.sans, fontSize: 12, fontWeight: 900, color: DT.textPrimary, background: "#fff" }}>
          {taskTitleOptions.map((title, optionIndex) => <option key={`${task.id}:${title}`} value={title}>{numberedTaskRowOptionLabel(title, optionIndex, task.title, index)}</option>)}
        </select>
        <select value={task.owner} onChange={(event) => onChooseOwner(task.id, event.target.value as OrderIntakeOwner)} aria-label={`Task ${index + 1} owner`} style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textPrimary, background: "#fff" }}>
          {(["Nick", "Dylan", "Guido"] as OrderIntakeOwner[]).map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select>
        <select value={task.scheduledDate} onChange={(event) => onChooseDate(task.id, event.target.value)} aria-label={`Task ${index + 1} date`} style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textPrimary, background: "#fff" }}>
          {!dateKnown && <option value={task.scheduledDate}>{task.scheduledDate}</option>}
          {dateOptions.map((option) => <option key={`${task.id}:${option.dateIso}`} value={option.dateIso}>{option.dateLabel}</option>)}
        </select>
        <input type="number" min={0} step={0.5} value={task.estimatedHours} onChange={(event) => onPatch(task.id, { estimatedHours: Math.max(0, Number(event.target.value || 0)) })} aria-label={`Task ${index + 1} hours`} style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textPrimary, background: "#fff" }} />
        <button type="button" onClick={() => onDelete(task.id)} style={{ border: "1px solid rgba(153,27,27,0.18)", background: "rgba(153,27,27,0.06)", color: "#991b1b", borderRadius: 999, padding: "5px 7px", fontFamily: DT.sans, fontSize: 9.5, fontWeight: 950, cursor: "pointer" }}>Delete</button>
      </div>
    </div>
  );
}

function OrderIntakeReviewModal({
  item,
  dateOptions,
  busy,
  onClose,
  onMarkComplete,
  onSave,
  onApprove,
}: {
  item: OrderIntakeItem;
  dateOptions: SuggestedDateOption[];
  busy: boolean;
  onClose: () => void;
  onMarkComplete: () => void;
  onSave: (tasks: OrderIntakeTaskDraft[]) => Promise<void>;
  onApprove: (tasks: OrderIntakeTaskDraft[]) => Promise<void>;
}) {
  const [tasks, setTasks] = useState<OrderIntakeTaskDraft[]>(() => normalizeStandardTableIntakeTasks(item, item.draftTasks.length ? item.draftTasks : item.suggestedTasks));
  const [modalStatus, setModalStatus] = useState("");
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const isNarrow = useIsNarrow(860);
  const taskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const canApprove = item.reviewState === "paid_needs_review" || item.reviewState === "approved";
  const pendingPayments = item.payments.filter(isPendingAkahuPayment);
  const exactAkahuPayments = item.payments.filter((payment) => payment.matchStatus === "matched" && Number(payment.matchConfidence ?? 0) >= 0.98);
  const xeroAmountDue = typeof item.amountDue === "number" ? item.amountDue : 0;
  const paymentTruthLabel = exactAkahuPayments.length > 0
    ? xeroAmountDue > 0.01
      ? `Akahu matched; Xero still shows ${formatXeroMoney(xeroAmountDue)} due`
      : "Akahu matched"
    : pendingPayments.length > 0
      ? WORKSHOP_PROCESS_RULES.trust.bankVisiblePaidLabel
      : item.paidOnDate ? formatShortDate(item.paidOnDate) : "Not confirmed by Akahu";
  const primaryLineItem = item.lineItems[0] ?? null;
  const primaryOrderDetails = primaryLineItem ? parseIntakeInvoiceLine(primaryLineItem.description) : null;
  const expectedReady = expectedReadyInfoForIntake(item);
  const expectedReadyDate = expectedReady.date;
  const dueDisplay = formatShortDate(expectedReadyDate);
  const paymentLifecycleLabel = intakePaymentStageBadge(item.paymentLifecycle);
  const paymentRows = paymentTimelineRows(item, paymentTruthLabel);
  const reviewTone = intakeReviewTone(item, canApprove);
  const reviewSignal = signalStyle(reviewTone);
  const headerStatusLabel = paymentLifecycleLabel || item.stateLabel;
  const totalDraftHours = tasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);
  const approvalChecks = [
    { label: "Ready", value: dueDisplay, tone: expectedReadyDate ? "good" : "warn" },
    { label: "Tasks", value: `${tasks.length} steps`, tone: tasks.length > 0 ? "good" : "warn" },
    { label: "Hours", value: `${totalDraftHours}h`, tone: totalDraftHours > 0 ? "good" : "warn" },
  ];

  function patchTask(id: string, patch: Partial<OrderIntakeTaskDraft>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  }

  function chooseTaskDate(id: string, dateIso: string) {
    const option = dateOptions.find((candidate) => candidate.dateIso === dateIso);
    const day = option?.day ?? dateToDayKey(dateIso) ?? "monday";
    patchTask(id, { scheduledDate: dateIso, day });
  }

  function chooseOwner(id: string, owner: OrderIntakeOwner) {
    patchTask(id, { owner, person: intakeOwnerToPerson(owner) });
  }

  function addTask() {
    const firstOption = dateOptions[0];
    const dateIso = firstOption?.dateIso ?? new Date().toISOString().slice(0, 10);
    setTasks((current) => [...current, {
      id: `manual-${Date.now()}`,
      title: "Material + spec check",
      detail: "",
      owner: "Nick",
      person: "nick",
      scheduledDate: dateIso,
      day: firstOption?.day ?? dateToDayKey(dateIso) ?? "monday",
      estimatedHours: 1,
      sortOrder: (current.length + 1) * 10,
    }]);
  }

  function moveAllTasksByWorkingDay(direction: -1 | 1) {
    setTasks((current) => current.map((task) => {
      const currentIndex = dateOptions.findIndex((option) => option.dateIso === task.scheduledDate);
      const nextOption = currentIndex >= 0 ? dateOptions[currentIndex + direction] : null;
      const scheduledDate = nextOption?.dateIso ?? shiftIsoByWorkingDays(task.scheduledDate, direction);
      return { ...task, scheduledDate, day: nextOption?.day ?? dateToDayKey(scheduledDate) ?? task.day };
    }));
  }

  function deleteTask(id: string) {
    setTasks((current) => current.filter((candidate) => candidate.id !== id).map((task, index) => ({ ...task, sortOrder: (index + 1) * 10 })));
  }

  function handleIntakeTaskDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    setTasks((current) => {
      const from = current.findIndex((task) => task.id === activeId);
      const to = current.findIndex((task) => task.id === overId);
      if (from < 0 || to < 0) return current;
      return arrayMove(current, from, to).map((task, index) => ({ ...task, sortOrder: (index + 1) * 10 }));
    });
  }

  async function saveDraft() {
    setModalStatus("Saving draft...");
    try {
      await onSave(tasks);
      setModalStatus("Draft saved");
    } catch (error) {
      setModalStatus(error instanceof Error ? error.message : "Draft save failed");
    }
  }

  async function approveDraft() {
    if (!canApprove || !approvalConfirmed) {
      setModalStatus("Check the plan before adding these tasks to the schedule.");
      return;
    }
    setModalStatus("Adding tasks to schedule...");
    try {
      await onApprove(tasks);
      setModalStatus("Added to schedule");
    } catch (error) {
      setModalStatus(error instanceof Error ? error.message : "Approval failed");
    }
  }

  return (
	    <div role="dialog" aria-modal="true" aria-label="Pending new order review" style={{ position: "fixed", top: isNarrow ? 0 : 64, right: 0, bottom: 0, left: 0, zIndex: 160, background: "rgba(20,19,16,0.42)", display: "flex", alignItems: isNarrow ? "stretch" : "flex-start", justifyContent: "center", padding: isNarrow ? 0 : "10px 18px 14px", overflow: "hidden" }}>
	      <section style={{ width: isNarrow ? "100vw" : "min(1480px, calc(100vw - 36px))", height: isNarrow ? "100vh" : "calc(100vh - 88px)", maxHeight: isNarrow ? "100vh" : "calc(100vh - 88px)", overflow: "hidden", display: "flex", flexDirection: "column", border: isNarrow ? "none" : `1px solid ${DT.border}`, borderRadius: isNarrow ? 0 : 16, background: "#fbfaf7", boxShadow: "0 24px 70px rgba(0,0,0,0.26)" }}>
	        <header style={{ flex: "0 0 auto", background: "rgba(251,250,247,0.98)", borderBottom: `1px solid ${DT.border}`, padding: isNarrow ? "10px 12px" : "10px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: isNarrow ? 8 : 14 }}>
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
	              <h2 style={{ margin: 0, fontFamily: DT.serif, fontSize: isNarrow ? 22 : 28, lineHeight: 1.0, color: DT.textPrimary, overflowWrap: "anywhere" }}>{item.customerName}</h2>
              <span title={item.stateDetail} style={{ border: `1px solid ${reviewSignal.border}`, background: reviewSignal.bg, color: reviewSignal.color, borderRadius: 999, padding: "5px 10px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950 }}>{headerStatusLabel}</span>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontFamily: DT.sans }}>
              {[["Order", primaryOrderDetails?.title || item.itemCategory || "Order"], ["Ready", dueDisplay], ["Value", formatXeroMoney(item.total)]].map(([label, value]) => (
                <div key={label} style={{ display: "inline-flex", gap: 5, alignItems: "baseline", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.82)", borderRadius: 999, padding: "4px 8px", maxWidth: "100%" }}>
                  <span style={{ fontSize: 8.5, fontWeight: 950, letterSpacing: "0.06em", textTransform: "uppercase", color: DT.textFaint, whiteSpace: "nowrap" }}>{label}</span>
                  <span style={{ fontSize: 11.5, lineHeight: 1.1, fontWeight: 950, color: DT.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isNarrow ? 160 : 260 }}>{value}</span>
                </div>
              ))}
              <span style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 850, whiteSpace: "nowrap" }}>{item.invoiceNumber || "No invoice number"} · {item.itemCategory || "Order"}</span>
            </div>
          </div>
          <div style={{ flex: "0 0 auto", display: "flex", gap: 7, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
	            <button type="button" onClick={onMarkComplete} disabled={busy} title="Move this pending order out of active Tuesday review if it has already been handled elsewhere." style={{ border: "1px solid rgba(153,27,27,0.18)", background: "rgba(153,27,27,0.06)", color: "#991b1b", borderRadius: 999, padding: "7px 11px", fontFamily: DT.sans, fontSize: 10.5, fontWeight: 950, cursor: busy ? "wait" : "pointer" }}>Complete / hide</button>
	            <button type="button" onClick={onClose} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", color: DT.textMuted, borderRadius: 999, padding: "7px 12px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}>Close</button>
	          </div>
	        </header>
	        <div style={{ flex: "1 1 auto", minHeight: 0, padding: isNarrow ? 8 : 10, display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(240px, 0.78fr) minmax(240px, 0.78fr) minmax(0, 1.62fr)", gap: isNarrow ? 8 : 12, overflowY: isNarrow ? "auto" : "hidden", overflowX: "hidden", alignItems: "start" }}>
	          {isNarrow && (
	            <nav aria-label="Order review sections" style={{ position: "sticky", top: 0, zIndex: 2, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, padding: "0 0 2px", background: "rgba(251,250,247,0.94)", backdropFilter: "blur(10px)" }}>
	              {[
	                ["Details", "#intake-order-details"],
	                ["Payments", "#intake-payments"],
	                ["Plan", "#intake-plan"],
	              ].map(([label, href]) => <a key={label} href={href} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.84)", color: DT.textMuted, borderRadius: 999, padding: "7px 6px", textAlign: "center", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textDecoration: "none" }}>{label}</a>)}
	            </nav>
	          )}
	          <aside id="intake-order-details" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, minHeight: isNarrow ? undefined : 0, overflowY: isNarrow ? "visible" : "auto", paddingRight: isNarrow ? 0 : 2 }}>
            <section style={{ border: `1px solid rgba(12,124,122,0.20)`, borderRadius: 10, background: "rgba(237,248,247,0.72)", padding: 8 }}>
              <div style={{ fontFamily: DT.sans, fontSize: 10, color: DT.teal, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>Order details</div>
	              <div style={{ marginTop: 6, display: "grid", gap: 5 }}>
	                {item.lineItems.length === 0 ? (
	                  <div style={{ fontFamily: DT.sans, fontSize: 12, color: DT.textMuted, fontWeight: 850 }}>No Xero line items stored yet.</div>
	                ) : item.lineItems.map((line, index) => (
	                  <InvoiceSpecCard key={`${line.description}:${index}`} line={line} primary={index === 0} compact={!isNarrow && index > 0} />
	                ))}
	              </div>
            </section>
          </aside>

	          <aside id="intake-payments" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, minHeight: isNarrow ? undefined : 0, overflowY: isNarrow ? "visible" : "auto", paddingRight: isNarrow ? 0 : 2 }}>
            <section style={{ border: `1px solid ${expectedReadyDate ? "rgba(12,124,122,0.20)" : "rgba(154,91,18,0.22)"}`, borderRadius: 10, background: expectedReadyDate ? "rgba(237,248,247,0.70)" : "rgba(250,204,21,0.10)", padding: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 10, color: expectedReadyDate ? DT.teal : "#9a5b12", fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>{expectedReady.label}</div>
                <InfoDot title="Customer-ready date. Before deposit payment, Tuesday estimates this from the deposit invoice date plus the promised lead time. Once deposit payment is confirmed, it recalculates from the deposit paid date." />
              </div>
              <div style={{ marginTop: 5, fontFamily: DT.serif, fontSize: 22, lineHeight: 1, color: DT.textPrimary, fontWeight: 650 }}>{dueDisplay}</div>
              <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 850 }}>{expectedReady.source}</div>
            </section>
            <section style={{ border: `1px solid ${DT.border}`, borderRadius: 10, background: "rgba(255,255,255,0.78)", padding: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textFaint, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>Payments</div>
                <InfoDot title="Deposit and balance invoice status from Xero/Supabase payment evidence. Yellow means money is still waiting or settling; green means paid." />
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                {paymentRows.map((payment) => {
                  const tone = signalStyle(payment.tone);
                  return (
                    <div key={payment.label} style={{ border: `1px solid ${tone.border}`, borderRadius: 9, background: tone.bg, padding: 8, display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em" }}>{payment.label}</span>
                        <span style={{ fontFamily: DT.sans, fontSize: 10, color: tone.color, fontWeight: 950, textAlign: "right" }}>{payment.status}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        {payment.invoiceUrl ? (
                          <a href={payment.invoiceUrl} target="_blank" rel="noreferrer" style={{ minWidth: 0, fontFamily: DT.sans, fontSize: 11, color: DT.teal, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payment.invoice}</a>
                        ) : (
                          <span style={{ minWidth: 0, fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payment.invoice}</span>
                        )}
                        {payment.amount && <span style={{ flex: "0 0 auto", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 900 }}>{payment.amount}</span>}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontFamily: DT.sans, fontSize: 9.5, lineHeight: 1.15 }}>
                        <span><strong style={{ color: DT.textFaint }}>Invoice</strong><br />{payment.invoiceDate}</span>
                        <span><strong style={{ color: DT.textFaint }}>Due</strong><br />{payment.dueDate}</span>
                        <span><strong style={{ color: DT.textFaint }}>Paid</strong><br />{payment.paidDate}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section style={{ border: `1px solid ${DT.border}`, borderRadius: 10, background: "rgba(255,255,255,0.78)", padding: 8 }}>
              <div style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textFaint, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>Invoice facts</div>
              <div style={{ marginTop: 5, display: "grid", gap: 4 }}>
                {[['Status', item.invoiceStatus || 'Unknown'], ['Invoice date', formatShortDate(item.invoiceDate)], ['Xero due', formatShortDate(item.invoiceDueDate)]].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: DT.sans, fontSize: 10 }}>
                    <span style={{ color: DT.textMuted, fontWeight: 850 }}>{label}</span>
                    <span style={{ color: DT.textPrimary, fontWeight: 950, textAlign: "right" }}>{value}</span>
                  </div>
                ))}
              </div>
              {item.xeroUrl && <a href={item.xeroUrl} target="_blank" rel="noreferrer" style={{ marginTop: 7, display: "inline-flex", border: `1px solid rgba(12,124,122,0.20)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 9.5, fontWeight: 950, textDecoration: "none" }}>Open Xero</a>}
            </section>
          </aside>

	          <section id="intake-plan" style={{ border: `1px solid ${DT.border}`, borderRadius: 12, background: "rgba(255,255,255,0.84)", padding: 10, minWidth: 0, minHeight: isNarrow ? undefined : 0, alignSelf: "stretch", display: "flex", flexDirection: "column", overflow: isNarrow ? "visible" : "hidden" }}>
	            <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", alignItems: isNarrow ? "stretch" : "flex-start", justifyContent: "space-between", gap: isNarrow ? 8 : 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textFaint, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>Production plan</div>
                <div style={{ marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontFamily: DT.sans, fontSize: 20, lineHeight: 1.1, color: DT.textPrimary, fontWeight: 950 }}>Suggested production plan</h3>
                  <span style={{ border: `1px solid rgba(12,124,122,0.18)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "3px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>{tasks.length} steps · {totalDraftHours}h</span>
                  <InfoDot title="Review stages, owners, dates, and hours before approving them into the live schedule." />
                </div>
              </div>
	              <div style={{ flex: "0 0 auto", display: "flex", gap: 6, alignItems: "center", justifyContent: isNarrow ? "stretch" : "flex-end", flexWrap: "wrap" }}>
	                <button type="button" onClick={() => moveAllTasksByWorkingDay(-1)} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", color: DT.textMuted, borderRadius: 999, padding: "7px 9px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>-1 workday</button>
	                <button type="button" onClick={() => moveAllTasksByWorkingDay(1)} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", color: DT.textMuted, borderRadius: 999, padding: "7px 9px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>+1 workday</button>
	                <button type="button" onClick={addTask} style={{ border: `1px solid rgba(12,124,122,0.20)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "7px 9px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Add task</button>
              </div>
            </div>
            <div style={{ marginTop: 8, border: `1px solid ${reviewSignal.border}`, background: reviewSignal.bg, borderRadius: 10, padding: "7px 9px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontFamily: DT.sans, fontSize: 12, color: reviewSignal.color, fontWeight: 950 }}>{canApprove ? "Ready to approve" : headerStatusLabel}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {approvalChecks.map((check) => {
                    const tone = signalStyle(check.tone === "good" ? "teal" : "warn");
                    return <span key={check.label} style={{ border: `1px solid ${tone.border}`, background: "rgba(255,255,255,0.72)", color: tone.color, borderRadius: 999, padding: "3px 7px", fontFamily: DT.sans, fontSize: 9.5, fontWeight: 950 }}>{check.label}: {check.value}</span>;
                  })}
                </div>
              </div>
            </div>
	            <div style={{ marginTop: 8, minHeight: isNarrow ? undefined : 0, overflowY: isNarrow ? "visible" : "auto", paddingRight: isNarrow ? 0 : 3 }}>
              <DndContext id="order-intake-task-draft" sensors={taskSensors} collisionDetection={closestCorners} onDragEnd={handleIntakeTaskDragEnd}>
                <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: "grid", gap: 5 }}>
                    {tasks.map((task, index) => (
                      <IntakeTaskDraftRow
                        key={task.id}
                        task={task}
                        index={index}
                        isNarrow={isNarrow}
                        dateOptions={dateOptions}
                        onPatch={patchTask}
                        onChooseOwner={chooseOwner}
                        onChooseDate={chooseTaskDate}
                        onDelete={deleteTask}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
	            <footer style={{ flex: "0 0 auto", position: isNarrow ? "sticky" : undefined, bottom: isNarrow ? 0 : undefined, zIndex: isNarrow ? 2 : undefined, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.92)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", backdropFilter: isNarrow ? "blur(10px)" : undefined }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                {modalStatus && <div style={{ fontFamily: DT.sans, fontSize: 11, color: canApprove ? DT.textMuted : "#9a5b12", fontWeight: 850 }}>{modalStatus}</div>}
                {canApprove && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: DT.sans, fontSize: 10.5, color: DT.textMuted, fontWeight: 900 }}>
                    <input type="checkbox" checked={approvalConfirmed} onChange={(event) => setApprovalConfirmed(event.target.checked)} />
                    Plan checked and ready
                  </label>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={saveDraft} disabled={busy} style={{ border: `1px solid rgba(12,124,122,0.20)`, background: "rgba(255,255,255,0.86)", color: DT.teal, borderRadius: 999, padding: "8px 12px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: busy ? "wait" : "pointer" }}>Save draft</button>
                <button type="button" onClick={approveDraft} disabled={busy || !canApprove || !approvalConfirmed} style={{ border: `1px solid ${canApprove && approvalConfirmed ? "rgba(12,124,122,0.28)" : DT.border}`, background: canApprove && approvalConfirmed ? DT.teal : "rgba(232,230,224,0.55)", color: canApprove && approvalConfirmed ? "#fff" : DT.textMuted, borderRadius: 999, padding: "8px 13px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: busy ? "wait" : canApprove && approvalConfirmed ? "pointer" : "not-allowed" }}>Add to schedule</button>
              </div>
            </footer>
          </section>
        </div>
      </section>
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
  costing,
  planTasks,
  onWorkflowChange,
  onOpen,
  onMarkComplete,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onWorkflowTaskDoneToggle,
  onRemoveTaskLink,
}: {
  order: UiOrder;
  costing?: OrderCostingMatch;
  planTasks: OrderJourneyTask[];
  onWorkflowChange: (workflow: OrderWorkflowState | null) => void;
  onOpen: () => void;
  onMarkComplete: (order: UiOrder) => void;
  onPlanTaskEdit: (task: BoardPlanTask) => void;
  onPlanTaskDoneToggle: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onWorkflowTaskDoneToggle?: (done: boolean, origin?: DelightOrigin) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
}) {
  const health = HEALTH_META[orderHealth(order)];
  const paymentLabel = paymentStageBadge(order);
  const { workflow, workflowStatus, updateWorkflow } = useOrderWorkflow(order, onWorkflowChange);
  const today = new Date().toISOString().slice(0, 10);
  const taskOptions = jobTaskOptionsForOrder(order);
  const productionStepIndex = derivedProductionStepIndex(order, workflow.tasks, planTasks);
  const defaultDraftAction = defaultJobTaskActionForOrder(order, taskOptions, productionStepIndex);
  const productionTaskOptions = taskOptions.filter((option) => option.group === "production");
  const supportTaskOptions = taskOptions.filter((option) => option.group === "support");
  const activeProductionStep = productionStepForOrder(order, productionStepIndex);
  const [draftAction, setDraftAction] = useState<string>(defaultDraftAction);
  const lastAutoDraftAction = useRef(defaultDraftAction);
  const [draftCustom, setDraftCustom] = useState("");
  const [draftOwner, setDraftOwner] = useState<WorkshopPerson>("Nick");
  const [draftDate, setDraftDate] = useState(today);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);
  const selectedDraftAction = taskOptions.some((option) => option.label === draftAction) ? draftAction : defaultDraftAction;
  const draftTitle = selectedDraftAction === "Custom" ? draftCustom.trim() : selectedDraftAction;
  const orderedWorkflowTasks = [...workflow.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.scheduledDate || "").localeCompare(b.scheduledDate || "");
  });
  const openJobTasks = orderedWorkflowTasks.filter((task) => !task.done);
  const doneJobTasks = orderedWorkflowTasks.filter((task) => task.done);
  const donePlanTasks = planTasks.filter((task) => task.done);
  const trust = orderTrustSignal(order, planTasks);
  const trustStyle = signalStyle(trust.tone);
  const visibleWorkflowTasks = orderedWorkflowTasks.slice(0, 6);
  const openPlanTasks = planTasks.filter((task) => !task.done).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const nextJobTask = openJobTasks[0] ?? null;
  const nextPlanTask = openPlanTasks[0] ?? planTasks[0] ?? null;
  const visibleScheduleTasks = [...planTasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.sortKey.localeCompare(b.sortKey);
  }).slice(0, 4);
  const qcItems = dispatchQcItems(order);
  const qcDone = qcItems.filter((label) => workflow.qc[label]?.done).length;
  const dispatch = collectionSummary(workflow);

  useEffect(() => {
    setDraftAction((current) => {
      if (current === lastAutoDraftAction.current) return defaultDraftAction;
      return current;
    });
    lastAutoDraftAction.current = defaultDraftAction;
  }, [defaultDraftAction]);

  function updateWorkflowTask(id: string, patch: Partial<WorkflowTask>) {
    updateWorkflow((state) => ({
      ...state,
      tasks: state.tasks.map((task) => task.id === id ? { ...task, ...patch } : task),
    }));
  }

  function deleteWorkflowTask(id: string) {
    updateWorkflow((state) => ({
      ...state,
      tasks: state.tasks.filter((task) => task.id !== id),
    }));
    setPendingDeleteTaskId(null);
  }

  function addWorkflowTask() {
    if (!draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate) return;
    updateWorkflow((state) => ({
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
    if (selectedDraftAction === "Custom") setDraftCustom("");
  }

  function compactInputStyle(done = false): CSSProperties {
    return {
      minWidth: 0,
      width: "100%",
      boxSizing: "border-box",
      border: `1px solid ${done ? DONE_TASK_VISUAL.border : DT.border}`,
      background: done ? "rgba(255,255,255,0.52)" : DT.cardBg,
      borderRadius: 8,
      padding: "6px 7px",
      fontFamily: DT.sans,
      fontSize: 11,
      color: done ? DONE_TASK_VISUAL.title : DT.textPrimary,
      outline: "none",
    };
  }

  function compactSelectStyle(): CSSProperties {
    return {
      minWidth: 0,
      width: "100%",
      boxSizing: "border-box",
      border: `1px solid ${DT.border}`,
      background: DT.cardBg,
      borderRadius: 8,
      padding: "6px 7px",
      fontFamily: DT.sans,
      fontSize: 11,
      color: DT.textPrimary,
      outline: "none",
    };
  }

  function compactTaskCardStyle(done: boolean): CSSProperties {
    return {
      border: `1px solid ${done ? DONE_TASK_VISUAL.border : DT.border}`,
      background: done ? DONE_TASK_VISUAL.bg : DT.cardBg,
      borderRadius: 10,
      padding: 8,
      boxShadow: done ? DONE_TASK_VISUAL.shadow : "none",
    };
  }

	  const addDisabled = !draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate;
	  const nextActionLabel = nextJobTask?.title ?? nextPlanTask?.text ?? nextOrderPrompt(order);
	  const paymentDisplay = paymentLabel || "Payment not tracked";
	  const costingDisplay = costing?.label || "Costing not linked";

	  return (
	    <div data-order-rail-compact-detail="true" style={{ padding: 10, animation: "orderRailIn 1000ms ease both" }}>
	      <div style={{ border: "1px solid " + DT.border, background: "rgba(255,255,255,0.86)", borderRadius: 10, padding: 10, boxShadow: DT.shadow }}>
	        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
	          <h3 style={{ margin: 0, fontFamily: DT.serif, fontSize: 19, lineHeight: 1.04, color: DT.textPrimary }}>{order.customer}</h3>
          <div style={{ flex: "0 0 auto", display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {paymentLabel && <span style={{ border: `1px solid ${paymentStageTone(order.paymentStage) === "warn" ? "rgba(154,91,18,0.24)" : "rgba(12,124,122,0.20)"}`, background: paymentStageTone(order.paymentStage) === "warn" ? "rgba(154,91,18,0.08)" : DT.tealSoft, color: paymentStageTone(order.paymentStage) === "warn" ? "#9a5b12" : DT.teal, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{paymentLabel}</span>}
            <span title={`${trust.detail} ${trust.source}`} style={{ border: `1px solid ${trustStyle.border}`, background: trustStyle.bg, color: trustStyle.color, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{trust.label}</span>
            <span style={{ border: `1px solid ${health.border}`, background: DT.cardBg, color: health.color, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{health.label}</span>
          </div>
        </div>
	        <div style={{ marginTop: 8, border: `1px solid ${openJobTasks.length + openPlanTasks.length ? "rgba(12,124,122,0.20)" : DT.border}`, background: openJobTasks.length + openPlanTasks.length ? DT.tealSoft : "rgba(255,255,255,0.72)", borderRadius: 10, padding: "8px 9px" }}>
	          <div style={{ fontFamily: DT.sans, fontSize: 8.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: openJobTasks.length + openPlanTasks.length ? DT.teal : DT.textFaint }}>Next action</div>
	          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 14, lineHeight: 1.18, color: DT.textPrimary, fontWeight: 950, overflowWrap: "anywhere" }}>{nextActionLabel}</div>
	          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 850 }}>{nextJobTask?.owner || (nextPlanTask ? PERSON_LABELS[nextPlanTask.person] : "No owner set")} · {activeProductionStep?.label ?? order.rawMondayStatus ?? "Stage not set"}</div>
	        </div>
	        <div style={{ marginTop: 7, fontFamily: DT.sans, fontSize: 9.5, color: trustStyle.color, fontWeight: 850, lineHeight: 1.25 }}>{trust.detail} · {trust.source}</div>
	        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
	          <MiniFact label="Due" value={`${formatShortDate(order.shipDate)} · ${dueLabel(order)}`} />
	          <MiniFact label="Item" value={orderItemLabel(order)} />
	          <MiniFact label="Tasks" value={`${openJobTasks.length + openPlanTasks.length} open · ${doneJobTasks.length + donePlanTasks.length} done`} />
	          <MiniFact label="QC / dispatch" value={`${qcDone}/${qcItems.length} · ${dispatch.label}`} />
	          <MiniFact label="Payment" value={paymentDisplay} />
	          <MiniFact label="Costing" value={costingDisplay} />
	        </div>
	        <div aria-label="Order actions" style={{ marginTop: 12, display: "grid", gap: 6 }}>
	          <button
	            type="button"
	            onClick={onOpen}
	            style={{ display: "block", width: "100%", border: `1px solid rgba(12,124,122,0.28)`, background: DT.teal, color: "#fff", borderRadius: 999, padding: "12px 14px", fontFamily: DT.sans, fontSize: 13, fontWeight: 950, cursor: "pointer", boxShadow: "0 10px 22px rgba(12,124,122,0.16)" }}
	          >
		            Open full order details
	          </button>
	          <button
	            type="button"
	            onClick={() => onMarkComplete(order)}
	            title="Hide this order from active Tuesday views without changing Monday"
	            style={{ display: "block", width: "100%", border: "1px solid rgba(146,42,35,0.16)", background: "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "7px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}
	          >
	            Mark complete in Tuesday
	          </button>
	        </div>
        {workflowStatus && <div style={{ marginTop: 6, textAlign: "center", fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, fontWeight: 850 }}>{workflowStatus}</div>}
      </div>

      <div style={{ marginTop: 8 }}>
        <OrderCostingPanel costing={costing} />
      </div>

      <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.80)", borderRadius: 10, padding: "9px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Tuesday</div>
            <div title="Tick the checkbox to mark this task done" style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 13, color: DT.textPrimary, fontWeight: 950 }}>Job tasks</div>
          </div>
          <span style={{ color: DT.teal, fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>{workflow.tasks.length}</span>
        </div>
        <div style={{ marginTop: 7, border: `1px solid ${DT.border}`, background: "rgba(247,249,248,0.82)", borderRadius: 10, padding: 8 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 900, marginBottom: 6 }}>Quick add order task</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 76px", gap: 6 }}>
            <select value={selectedDraftAction} onChange={(event) => setDraftAction(event.target.value)} style={compactSelectStyle()}>
              {productionTaskOptions.length > 0 && (
                <optgroup label="Production path">
                  {productionTaskOptions.map((option, optionIndex) => <option key={option.label} value={option.label}>{numberedJobTaskOptionLabel(option.label, optionIndex)}</option>)}
                </optgroup>
              )}
              <optgroup label="Support">
                {supportTaskOptions.map((option, optionIndex) => <option key={option.label} value={option.label}>{numberedJobTaskOptionLabel(option.label, productionTaskOptions.length + optionIndex)}</option>)}
              </optgroup>
            </select>
            <select value={draftOwner} onChange={(event) => setDraftOwner(event.target.value as WorkshopPerson)} style={compactSelectStyle()}>
              <option value="Nick">Nick</option>
              <option value="Dylan">Dylan</option>
              <option value="Guido">Guido</option>
            </select>
          </div>
          <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: selectedDraftAction === "Custom" ? "minmax(0,1fr) 108px" : "1fr", gap: 6 }}>
            {selectedDraftAction === "Custom" && <input value={draftCustom} onChange={(event) => setDraftCustom(event.target.value)} placeholder="Write task" style={compactInputStyle()} />}
            <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} style={compactInputStyle()} />
          </div>
          <button
            type="button"
            onClick={addWorkflowTask}
            disabled={addDisabled}
            title="Add task to job"
            style={{ marginTop: 7, width: "100%", border: `1px solid ${addDisabled ? DT.border : "rgba(12,124,122,0.18)"}`, background: addDisabled ? "rgba(0,0,0,0.035)" : DT.tealSoft, color: addDisabled ? DT.textFaint : DT.teal, borderRadius: 999, padding: "7px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: addDisabled ? "not-allowed" : "pointer" }}
          >
            Add task to job
          </button>
        </div>
        <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
          {visibleWorkflowTasks.length === 0 ? (
            <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>No job tasks saved for this order yet.</div>
          ) : visibleWorkflowTasks.map((task) => {
            const done = Boolean(task.done);
            const deleteArmed = pendingDeleteTaskId === task.id;
            return (
              <div key={task.id} data-order-workflow-task-card="order-workflow-task-card" style={compactTaskCardStyle(done)}>
                <div style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 7, alignItems: "start" }}>
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
                    <input
                      aria-label="Edit job task"
                      value={task.title}
                      onChange={(event) => updateWorkflowTask(task.id, { title: event.target.value })}
                      style={{ ...compactInputStyle(done), fontWeight: 900, textDecoration: done ? "line-through" : "none" }}
                    />
                    <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      <PersonSelect value={task.owner} onChange={(value) => updateWorkflowTask(task.id, { owner: value })} workshopOnly />
                      <input type="date" value={task.scheduledDate || ""} onChange={(event) => updateWorkflowTask(task.id, { scheduledDate: event.target.value })} style={compactInputStyle(done)} />
                    </div>
                    <input value={task.notes} onChange={(event) => updateWorkflowTask(task.id, { notes: event.target.value })} placeholder="Task notes" style={{ ...compactInputStyle(done), marginTop: 5, color: done ? DONE_TASK_VISUAL.text : DT.textMuted }} />
                    <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: DT.sans, fontSize: 9, color: done ? DONE_TASK_VISUAL.text : DT.textMuted, fontWeight: 850 }}>{done && task.completedAt ? `Done ${formatCompletedAt(task.completedAt)}` : task.scheduledDate ? formatLongDate(new Date(`${task.scheduledDate}T12:00:00`)) : "No date"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (deleteArmed) {
                            deleteWorkflowTask(task.id);
                            return;
                          }
                          setPendingDeleteTaskId(task.id);
                        }}
                        aria-label="Delete job task"
                        style={{ border: "1px solid rgba(146,42,35,0.16)", background: deleteArmed ? "rgba(146,42,35,0.12)" : "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
                      >
                        {deleteArmed ? "Delete now" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {workflow.tasks.length > visibleWorkflowTasks.length && <button type="button" onClick={onOpen} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "6px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Full order details for all job tasks</button>}
        </div>
      </div>

      <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", borderRadius: 10, padding: "9px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Week schedule</div>
            <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 13, color: DT.textPrimary, fontWeight: 950 }}>Tasks on board</div>
          </div>
          <span style={{ color: DT.teal, fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>{planTasks.length}</span>
        </div>
        <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
          {visibleScheduleTasks.length === 0 ? (
            <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>No scheduled tasks found yet.</div>
          ) : visibleScheduleTasks.map((task) => {
            const done = Boolean(task.done);
            return (
              <div key={task.id} style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.border : DT.border}`, background: done ? DONE_TASK_VISUAL.bg : DT.cardBg, borderRadius: 9, padding: "7px 8px" }}>
                <div style={{ fontFamily: DT.sans, fontSize: 11, color: done ? DONE_TASK_VISUAL.title : DT.textPrimary, fontWeight: 900, lineHeight: 1.2, textDecoration: done ? "line-through" : "none" }}>{task.text}</div>
                <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 9, color: done ? DONE_TASK_VISUAL.text : DT.textMuted, lineHeight: 1.25 }}>{task.dateLabel} · {PERSON_LABELS[task.person]}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button type="button" onClick={(event) => onPlanTaskDoneToggle(task, !done, { x: event.clientX, y: event.clientY })} style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.buttonBorder : "rgba(12,124,122,0.18)"}`, background: done ? DONE_TASK_VISUAL.buttonBg : DT.tealSoft, color: done ? DONE_TASK_VISUAL.title : DT.teal, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>{done ? "Undo" : "Done"}</button>
                  <button type="button" onClick={() => onPlanTaskEdit(task)} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Edit</button>
                  {task.assignedViaTuesday && <button type="button" onClick={() => onRemoveTaskLink(task)} style={{ border: "1px solid rgba(146,42,35,0.16)", background: "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Unlink</button>}
                </div>
              </div>
            );
          })}
          {planTasks.length > visibleScheduleTasks.length && <button type="button" onClick={onOpen} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "6px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Full order details for all board tasks</button>}
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
    neutral: { color: TUESDAY_THEME.muted, bg: TUESDAY_THEME.surfaceClean, border: TUESDAY_THEME.line },
    good: { color: TUESDAY_THEME.sage, bg: TUESDAY_THEME.sageSoft, border: "#ccddcc" },
    warn: { color: TUESDAY_THEME.amber, bg: TUESDAY_THEME.amberSoft, border: TUESDAY_THEME.amberLine },
    danger: { color: TUESDAY_THEME.clay, bg: TUESDAY_THEME.claySoft, border: TUESDAY_THEME.clayLine },
    teal: { color: TUESDAY_THEME.teal, bg: TUESDAY_THEME.tealSoft, border: TUESDAY_THEME.tealLine },
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
  compact = false,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "good" | "warn" | "danger" | "teal";
  compact?: boolean;
}) {
  const color = tone === "good" ? TUESDAY_THEME.sage : tone === "warn" ? TUESDAY_THEME.amber : tone === "danger" ? TUESDAY_THEME.clay : tone === "teal" ? TUESDAY_THEME.teal : TUESDAY_THEME.ink;
  return (
    <div style={{ minWidth: 0, border: `1px solid ${DT.border}`, background: TUESDAY_THEME.surfaceClean, borderRadius: 10, padding: "14px 15px", boxShadow: "0 6px 18px rgba(37,30,20,0.035)" }}>
      <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: TUESDAY_THEME.quiet }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: compact ? 16 : 20, lineHeight: 1.12, fontWeight: 950, color, overflowWrap: "anywhere" }}>{value}</div>
      {detail && <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 12, lineHeight: 1.3, color: TUESDAY_THEME.muted }}>{detail}</div>}
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
    <section data-order-command-section={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} style={{ border: `1px solid ${DT.border}`, background: TUESDAY_THEME.surfaceClean, borderRadius: 12, padding: 15, boxShadow: "0 6px 18px rgba(37,30,20,0.035)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: TUESDAY_THEME.quiet }}>{eyebrow}</div>}
          <div style={{ marginTop: eyebrow ? 2 : 0, fontFamily: DT.sans, fontSize: 17, lineHeight: 1.18, color: TUESDAY_THEME.ink, fontWeight: 950 }}>{title}</div>
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

function useOrderCustomerMirror(order: UiOrder) {
  const [mirror, setMirror] = useState<OrderCustomerMirror | null>(null);
  const [documents, setDocuments] = useState<OrderDocument[]>([]);
  const [status, setStatus] = useState("Loading customer mirror...");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ mondayOrderId: String(order.id) });
    if (order.xeroInvoiceNumber) params.set("invoiceNumber", order.xeroInvoiceNumber);
    fetch(`/api/production/order-customer-mirror?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as OrderCustomerMirrorApiResponse;
        if (!response.ok || data.ok === false) throw new Error(data.error || "Customer mirror unavailable");
        if (!cancelled) {
          setMirror(data.mirror ?? null);
          setDocuments(data.documents ?? []);
          setStatus(data.disabledReason || "");
        }
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Customer mirror unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [order.id, order.xeroInvoiceNumber]);

  return { mirror, documents, status };
}

function documentKindLabel(kind: OrderDocument["kind"]) {
  if (kind === "xero_invoice_pdf") return "Invoice";
  if (kind === "drawing") return "Drawing";
  if (kind === "screenshot") return "Image";
  if (kind === "customer_attachment") return "Attachment";
  return "Document";
}

function formatBytes(value: number | null) {
  if (!value || value < 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function CustomerMirrorPanel({ order }: { order: UiOrder }) {
  const { mirror, documents, status } = useOrderCustomerMirror(order);
  const hasMirror = Boolean(mirror);
  const visibleTimeline = mirror?.timeline.slice(0, 4) ?? [];
  const sourceLabel = order.xeroInvoiceNumber ? `Xero email · ${order.xeroInvoiceNumber}` : "Customer source";
  const confidenceTone = mirror?.confidence === "high" ? "good" : mirror?.confidence === "low" ? "warn" : "teal";
  return (
    <OrderCommandSection
      eyebrow="Customer"
      title="Customer mirror"
      action={<OrderCommandPill label={hasMirror ? `${documents.length} docs` : "No mirror"} tone={hasMirror ? confidenceTone : "warn"} />}
    >
      {!hasMirror && (
        <div style={{ border: "1px solid rgba(154,91,18,0.18)", background: "rgba(250,204,21,0.10)", color: "#9a5b12", borderRadius: 10, padding: "8px 9px", fontFamily: DT.sans, fontSize: 11, lineHeight: 1.35, fontWeight: 850 }}>
          {status || "No customer mirror has been backfilled for this order yet."}
        </div>
      )}
      {hasMirror && mirror && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ border: "1px solid rgba(12,124,122,0.18)", background: "rgba(237,248,247,0.48)", borderRadius: 10, padding: "9px 10px" }}>
            <div style={{ fontFamily: DT.sans, fontSize: 12, lineHeight: 1.35, color: DT.textPrimary, fontWeight: 900 }}>{mirror.customerKnownSummary}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
              {mirror.leadTimePromise && <OrderCommandPill label={mirror.leadTimePromise} tone="warn" />}
              <OrderCommandPill label={`Source: ${sourceLabel}`} tone="neutral" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
            {mirror.approvedPaidForSummary && <MiniFact label="Approved / paid for" value={mirror.approvedPaidForSummary} />}
            {mirror.currentCustomerKnownSpec && <MiniFact label="Customer-known spec" value={mirror.currentCustomerKnownSpec} />}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {documents.map((document) => (
              <a
                key={document.id}
                href={document.openUrl}
                target="_blank"
                rel="noreferrer"
                title={`${document.filename}${document.sha256 ? ` · sha256 ${document.sha256}` : ""}`}
                style={{ maxWidth: "100%", border: "1px solid rgba(12,124,122,0.18)", background: "rgba(255,255,255,0.82)", color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {documentKindLabel(document.kind)} · {document.label}{document.byteSize ? ` · ${formatBytes(document.byteSize)}` : ""}
              </a>
            ))}
            {documents.length === 0 && <span style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 850 }}>No documents uploaded yet.</span>}
          </div>
          <details>
            <summary style={{ listStyle: "none", cursor: "pointer", fontFamily: DT.sans, fontSize: 10, color: DT.teal, fontWeight: 950 }}>Timeline, profile, sources</summary>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {visibleTimeline.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  {visibleTimeline.map((entry, index) => (
                    <div key={`${entry.title}:${index}`} style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", borderRadius: 9, padding: "7px 8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, fontWeight: 950 }}>{entry.title}</span>
                        <span style={{ fontFamily: DT.sans, fontSize: 9, color: DT.textFaint, fontWeight: 850 }}>{formatShortDate(entry.date)}</span>
                      </div>
                      <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10.5, color: DT.textMuted, lineHeight: 1.3, fontWeight: 800 }}>{entry.detail}</div>
                      <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 9, color: DT.textFaint, fontWeight: 850 }}>{entry.source}</div>
                    </div>
                  ))}
                </div>
              )}
              {(mirror.communicationStyleSummary || mirror.communicationStyleTags.length > 0 || mirror.quirksIssues.length > 0) && (
                <div style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", borderRadius: 9, padding: "7px 8px" }}>
                  {mirror.communicationStyleSummary && <div style={{ fontFamily: DT.sans, fontSize: 10.5, color: DT.textMuted, lineHeight: 1.35, fontWeight: 850 }}>{mirror.communicationStyleSummary}</div>}
                  {mirror.communicationStyleTags.length > 0 && <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>{mirror.communicationStyleTags.map((tag) => <OrderCommandPill key={tag} label={tag} tone="neutral" />)}</div>}
                  {mirror.quirksIssues.length > 0 && <div style={{ marginTop: 6, fontFamily: DT.sans, fontSize: 10, color: "#9a5b12", lineHeight: 1.3, fontWeight: 850 }}>{mirror.quirksIssues.join(" · ")}</div>}
                </div>
              )}
              <div style={{ fontFamily: DT.sans, fontSize: 9.5, color: DT.textFaint, lineHeight: 1.3, fontWeight: 800 }}>
                Confidence: {mirror.confidence}. Updated {formatCompletedAt(mirror.updatedAt)}. Claims should trace to Gmail, Xero, order events, or manual source metadata.
              </div>
            </div>
          </details>
        </div>
      )}
    </OrderCommandSection>
  );
}

function OrderOverviewOverlay({
  order,
  planTasks,
  onMarkComplete,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onWorkflowTaskDoneToggle,
  onRemoveTaskLink,
  onClose,
  onWorkflowChange,
}: {
  order: UiOrder;
  planTasks: OrderJourneyTask[];
  onMarkComplete: (order: UiOrder) => void;
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
  const productionStepIndex = derivedProductionStepIndex(order, workflow.tasks, planTasks);
	  const activeProductionStep = productionStepForOrder(order, productionStepIndex);
	  const qcItems = dispatchQcItems(order);
	  const qcDone = qcItems.filter((label) => workflow.qc[label]?.done).length;
	  const qcTotal = qcItems.length;
	  const openJobTasks = workflow.tasks.filter((task) => !task.done);
	  const doneJobTasks = workflow.tasks.length - openJobTasks.length;
	  const openPlanTasks = planTasks.filter((task) => !task.done).length;
	  const donePlanTasks = planTasks.length - openPlanTasks;
	  const openTaskCount = openJobTasks.length + openPlanTasks;
  const doneTaskCount = doneJobTasks + donePlanTasks;
  const totalTaskCount = workflow.tasks.length + planTasks.length;
  const nextJobTask = openJobTasks[0] ?? null;
  const orderedPlanTasks = [...planTasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.sortKey.localeCompare(b.sortKey);
  });
  const nextPlanTask = orderedPlanTasks.find((task) => !task.done) ?? null;
  const nextAction = nextJobTask?.title ?? nextPlanTask?.text ?? nextOrderPrompt(order);
  const nextOwner = nextJobTask?.owner || (nextPlanTask ? PERSON_LABELS[nextPlanTask.person] : "");
  const collection = collectionSummary(workflow);
  const invoiceExpectation = invoiceExpectationForOrder(order);
  const invoiceNumber = workflow.xeroInvoiceNumber || order.xeroInvoiceNumber || null;
  const invoiceHasXeroLink = Boolean(order.xero);
  const invoiceHasNumber = Boolean(invoiceNumber);
  const invoiceTone = !invoiceExpectation.requiresInvoice ? "neutral" : invoiceHasXeroLink ? "teal" : invoiceHasNumber ? "warn" : "danger";
	  const invoiceLabel = !invoiceExpectation.requiresInvoice ? invoiceExpectation.label : invoiceHasXeroLink ? "Linked" : invoiceHasNumber ? "Number saved" : "Needed";
	  const paymentLabel = paymentStageBadge(order);
	  const paymentDetail = order.paymentNextAction || (paymentLabel ? "Payment info is synced for reference." : "No payment task is currently tracked on this order.");
	  const productionStatus = order.rawMondayStatus || order.status || "Not set";
	  const completeInTuesday = workflow.collection.status === "collected" || (qcTotal > 0 && qcDone === qcTotal && isCompleteOrder(order));
	  const progress = orderProgressPct(order, productionStepIndex, qcTotal > 0 ? qcDone / qcTotal : 1, openTaskCount, completeInTuesday);

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
        zIndex: 1300,
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
          border: isNarrow ? "none" : `1px solid ${TUESDAY_THEME.lineStrong}`,
          background: TUESDAY_THEME.surfaceSoft,
          boxShadow: TUESDAY_THEME.shadow,
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
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: "rgba(255,253,249,0.96)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${TUESDAY_THEME.line}`, padding: isNarrow ? "12px 14px 11px" : "16px 24px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontFamily: DT.serif, fontSize: isNarrow ? 28 : 34, lineHeight: 1, color: TUESDAY_THEME.ink, fontWeight: 500 }}>{order.customer}</h2>
                <OrderCommandPill label={orderItemLabel(order)} />
                <OrderCommandPill label={health.label} tone={orderHealth(order) === "blocked" ? "danger" : orderHealth(order) === "watch" ? "warn" : "good"} />
                {completeInTuesday && <OrderCommandPill label="Complete in Tuesday" tone="good" />}
                <OrderCommandPill label={`Source: ${invoiceLabel}`} tone={invoiceTone} />
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontFamily: DT.sans, fontSize: 12, fontWeight: 850, color: DT.textMuted }}>
                <span>Due {formatShortDate(order.shipDate)}</span>
                <span>{dueLabel(order)}</span>
                <span>{formatCurrencyShort(order.value)}</span>
                <span>Next: {nextAction}</span>
                {nextOwner && <span>Owner: {nextOwner}</span>}
                {workflowStatus && <span>{workflowStatus}</span>}
              </div>
            </div>
            <div style={{ flex: "0 0 auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  if (!completeInTuesday) onMarkComplete(order);
                }}
                disabled={completeInTuesday}
	                title="Move this order to the completed Tuesday list without changing Monday"
	                style={{ border: `1px solid ${DT.border}`, background: completeInTuesday ? "rgba(110,138,106,0.10)" : "rgba(255,255,255,0.74)", color: completeInTuesday ? DT.sage : DT.textMuted, borderRadius: 999, padding: "8px 11px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: completeInTuesday ? "default" : "pointer" }}
	              >
	                {completeInTuesday ? "Complete in Tuesday" : "Mark complete"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "8px 12px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 5, background: "rgba(40,35,31,0.07)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: TUESDAY_THEME.teal, transition: "width 450ms ease" }} />
            </div>
            <span style={{ fontFamily: DT.sans, fontSize: 11, fontWeight: 900, color: DT.textMuted, minWidth: 34, textAlign: "right" }}>{progress}%</span>
          </div>
        </div>
        <div style={{ padding: isNarrow ? 14 : 22, display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr 1fr" : "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <OrderCommandMetric label="Stage" value={activeProductionStep?.label ?? productionStatus} detail={orderHealthReason(order)} tone={orderHealth(order) === "blocked" ? "danger" : orderHealth(order) === "watch" ? "warn" : "teal"} />
            <OrderCommandMetric label="Next task" value={nextAction} detail={nextOwner ? `Owner: ${nextOwner}` : "No owner set"} tone={openTaskCount ? "teal" : "neutral"} compact />
            <OrderCommandMetric label="Tasks" value={`${openTaskCount} open`} detail={`${doneTaskCount} done · ${totalTaskCount} total`} tone={openTaskCount ? "teal" : "neutral"} />
            <OrderCommandMetric label="Dispatch" value={collection.label} detail={workflow.collection.by || mode.label} tone={collection.tone} />
            <OrderCommandMetric label="QC" value={`${qcDone}/${qcTotal}`} detail="Final check before leaving" tone={qcDone === qcTotal ? "good" : "warn"} />
	            <OrderCommandMetric label="Payment" value={paymentLabel || "Payment not tracked"} detail={paymentDetail} tone={paymentStageTone(order.paymentStage)} compact />
	          </div>

	          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(330px, 0.9fr) minmax(0, 1.7fr)", gap: isNarrow ? 12 : 14, alignItems: "start" }}>
	            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
	              <WorkshopSpec key={`${order.id}:${invoiceNumber ?? ""}`} order={order} packLabel={mode.label} packDetail={mode.detail} freightBookBy={freightBookBy} freightWorkingDays={mode.workingDays} xeroUrl={order.xero} xeroInvoiceNumber={invoiceNumber} onInvoiceNumberChange={(nextInvoiceNumber) => updateWorkflow((state) => ({ ...state, xeroInvoiceNumber: nextInvoiceNumber }))} prominent afterSpec={<QcChecklist order={order} workflow={workflow} onChange={updateWorkflow} compact includePhotos />} />
	              <CollectionControl workflow={workflow} status={workflowStatus} onChange={updateWorkflow} />
	              <CustomerMirrorPanel order={order} />
	              <RepairNotesPanel order={order} workflow={workflow} onChange={updateWorkflow} />
	            </div>

	            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
	              <OrderTasksPanel key={order.id} order={order} workflow={workflow} planTasks={planTasks} productionStepIndex={productionStepIndex} onWorkflowChange={updateWorkflow} onPlanTaskEdit={onPlanTaskEdit} onPlanTaskDoneToggle={onPlanTaskDoneToggle} onWorkflowTaskDoneToggle={onWorkflowTaskDoneToggle} onRemoveTaskLink={onRemoveTaskLink} />
	            </div>
	          </div>
        </div>
      </div>
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
    <div style={{ border: `1px solid ${DT.border}`, background: TUESDAY_THEME.surfaceClean, borderRadius: 12, padding: 15, boxShadow: "0 6px 18px rgba(37,30,20,0.035)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: TUESDAY_THEME.quiet }}>Dispatch</div>
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
  productionStepIndex = order.currentStep,
  onWorkflowChange,
  onPlanTaskEdit,
  onPlanTaskDoneToggle,
  onWorkflowTaskDoneToggle,
  onRemoveTaskLink,
}: {
  order: UiOrder;
  workflow: OrderWorkflowState;
  planTasks: OrderJourneyTask[];
  productionStepIndex?: number;
  onWorkflowChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
  onPlanTaskEdit: (task: BoardPlanTask) => void;
  onPlanTaskDoneToggle: (task: BoardPlanTask, done: boolean, origin?: DelightOrigin) => void;
  onWorkflowTaskDoneToggle?: (done: boolean, origin?: DelightOrigin) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const taskOptions = jobTaskOptionsForOrder(order);
  const defaultDraftAction = defaultJobTaskActionForOrder(order, taskOptions, productionStepIndex);
  const productionTaskOptions = taskOptions.filter((option) => option.group === "production");
  const supportTaskOptions = taskOptions.filter((option) => option.group === "support");
  const activeProductionStep = productionStepForOrder(order, productionStepIndex);
  const [draftAction, setDraftAction] = useState<string>(defaultDraftAction);
  const lastAutoDraftAction = useRef(defaultDraftAction);
  const [draftCustom, setDraftCustom] = useState("");
  const [draftOwner, setDraftOwner] = useState<WorkshopPerson>("Nick");
  const [draftDate, setDraftDate] = useState(today);
  const [editingWorkflowTaskId, setEditingWorkflowTaskId] = useState<string | null>(null);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);
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
	  const productionSteps = stepsForOrder(order);
	  type UnifiedPathTask = {
	    key: string;
	    kind: "workflow" | "plan";
	    title: string;
	    done: boolean;
	    meta: string;
	    notes?: string | null;
	    workflowTask?: WorkflowTask;
	    planTask?: OrderJourneyTask;
	  };
	  const unifiedPathTasks: UnifiedPathTask[] = [
	    ...orderedWorkflowTasks.map((task) => ({
	      key: `workflow-${task.id}`,
	      kind: "workflow" as const,
	      title: task.title,
	      done: Boolean(task.done),
	      meta: `${task.owner || "No owner"} · ${task.scheduledDate ? formatLongDate(new Date(`${task.scheduledDate}T12:00:00`)) : "No date"}${task.completedAt ? ` · Done ${formatCompletedAt(task.completedAt)}` : ""}`,
	      notes: task.notes,
	      workflowTask: task,
	    })),
	    ...orderedPlanTasks.map((task) => ({
	      key: `plan-${task.id}`,
	      kind: "plan" as const,
	      title: task.text,
	      done: Boolean(task.done),
	      meta: `${task.dateLabel} · ${PERSON_LABELS[task.person]} · ${task.rowName}`,
	      notes: task.notes,
	      planTask: task,
	    })),
	  ];
	  const usedTaskKeys = new Set<string>();
	  const pathRows = productionSteps.map((step, index) => {
	    const rowTasks = unifiedPathTasks.filter((task) => !usedTaskKeys.has(task.key) && taskMatchesProductionStep(task.title, step, order));
	    rowTasks.forEach((task) => usedTaskKeys.add(task.key));
	    return { step, index, rowTasks };
	  });
	  const supportTasks = unifiedPathTasks.filter((task) => !usedTaskKeys.has(task.key));

  useEffect(() => {
    setDraftAction((current) => {
      if (current === lastAutoDraftAction.current) return defaultDraftAction;
      return current;
    });
    lastAutoDraftAction.current = defaultDraftAction;
  }, [defaultDraftAction]);

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
    setPendingDeleteTaskId(null);
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

	  function renderUnifiedTask(task: UnifiedPathTask) {
	    const done = Boolean(task.done);
	    if (task.kind === "workflow" && task.workflowTask) {
	      const workflowTask = task.workflowTask;
	      const editing = editingWorkflowTaskId === workflowTask.id;
	      const deleteArmed = pendingDeleteTaskId === workflowTask.id;
	      return (
	        <div key={task.key} data-order-workflow-task-card="order-workflow-task-card" style={{ ...taskCardStyle(done), padding: "7px 8px", boxShadow: done ? DONE_TASK_VISUAL.shadow : "none" }}>
	          <input
	            type="checkbox"
	            checked={done}
	            aria-label={`Mark ${workflowTask.title} ${done ? "not done" : "done"}`}
	            onChange={(event) => {
	              const checked = event.target.checked;
	              if (checked) {
	                const checkboxRect = event.currentTarget.getBoundingClientRect();
	                const cardElement = event.currentTarget.closest("[data-order-workflow-task-card]") as HTMLElement | null;
	                onWorkflowTaskDoneToggle?.(checked, { x: checkboxRect.left + checkboxRect.width / 2, y: checkboxRect.top + checkboxRect.height / 2, cardRect: cardElement?.getBoundingClientRect() });
	              }
	              updateWorkflowTask(workflowTask.id, {
	                done: checked,
	                completedAt: checked ? new Date().toISOString() : null,
	                completedBy: checked ? (workflowTask.completedBy || workflowTask.owner) : "",
	              });
	            }}
	            style={{ marginTop: 5 }}
	          />
	          <div style={{ minWidth: 0 }}>
	            {editing ? (
	              <>
	                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 7, alignItems: "center" }}>
	                  <input
	                    aria-label="Edit job task"
	                    value={workflowTask.title}
	                    onChange={(event) => updateWorkflowTask(workflowTask.id, { title: event.target.value })}
	                    style={{ width: "100%", border: `1px solid ${done ? DONE_TASK_VISUAL.border : DT.border}`, background: done ? "rgba(255,255,255,0.50)" : DT.cardBg, borderRadius: 7, padding: "5px 6px", fontFamily: DT.sans, fontSize: 12, fontWeight: 900, color: done ? DONE_TASK_VISUAL.title : DT.textPrimary, textDecoration: done ? "line-through" : "none", outline: "none" }}
	                  />
	                  <button
	                    type="button"
	                    onClick={() => {
	                      if (deleteArmed) {
	                        deleteWorkflowTask(workflowTask.id);
	                        return;
	                      }
	                      setPendingDeleteTaskId(workflowTask.id);
	                    }}
	                    aria-label="Delete job task"
	                    style={{ border: "1px solid rgba(146,42,35,0.16)", background: deleteArmed ? "rgba(146,42,35,0.12)" : "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
	                  >
	                    {deleteArmed ? "Delete now" : "Delete"}
	                  </button>
	                </div>
	                <div style={{ marginTop: 5, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
	                  <OrderCommandPill label="Tuesday task" tone={done ? "good" : "teal"} />
	                  <PersonSelect value={workflowTask.owner} onChange={(value) => updateWorkflowTask(workflowTask.id, { owner: value })} workshopOnly />
	                  <input
	                    type="date"
	                    value={workflowTask.scheduledDate || ""}
	                    onChange={(event) => updateWorkflowTask(workflowTask.id, { scheduledDate: event.target.value })}
	                    style={{ border: `1px solid ${DT.border}`, borderRadius: 7, padding: "4px 5px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
	                  />
	                  {workflowTask.done && <PersonSelect value={workflowTask.completedBy} onChange={(value) => updateWorkflowTask(workflowTask.id, { completedBy: value })} />}
	                </div>
	                <input
	                  value={workflowTask.notes}
	                  onChange={(event) => updateWorkflowTask(workflowTask.id, { notes: event.target.value })}
	                  placeholder="Task notes"
	                  style={{ marginTop: 5, width: "100%", border: `1px solid ${DT.border}`, borderRadius: 7, padding: "5px 6px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
	                />
	                <button type="button" onClick={() => setEditingWorkflowTaskId(null)} style={{ marginTop: 6, border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Done editing</button>
	              </>
	            ) : (
	              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
	                <div style={{ minWidth: 0 }}>
	                  <div style={{ fontFamily: DT.sans, fontSize: 12.5, fontWeight: 950, color: done ? DONE_TASK_VISUAL.title : DT.textPrimary, lineHeight: 1.2, textDecoration: done ? "line-through" : "none", overflowWrap: "anywhere" }}>{workflowTask.title}</div>
	                  <div style={{ marginTop: 3, ...taskMetaStyle(done) }}>{task.meta}</div>
	                  {workflowTask.notes && <div style={{ marginTop: 3, ...taskMetaStyle(done) }}>{workflowTask.notes}</div>}
	                </div>
	                <button type="button" onClick={() => setEditingWorkflowTaskId(workflowTask.id)} style={{ flex: "0 0 auto", border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Edit</button>
	              </div>
	            )}
	          </div>
	        </div>
	      );
	    }
	    const planTask = task.planTask;
	    if (!planTask) return null;
	    const placementLabel = planTaskPlacementLabel(planTask);
	    return (
	      <div key={task.key} data-order-plan-task-card="order-plan-task-card" style={{ ...taskCardStyle(done), padding: "7px 8px" }}>
	        <input
	          type="checkbox"
	          checked={done}
	          aria-label={`Mark ${planTask.text} ${done ? "not done" : "done"}`}
	          onChange={(event) => {
	            const checked = event.target.checked;
	            const checkboxRect = event.currentTarget.getBoundingClientRect();
	            const cardElement = event.currentTarget.closest("[data-order-plan-task-card]") as HTMLElement | null;
	            onPlanTaskDoneToggle(planTask, checked, { x: checkboxRect.left + checkboxRect.width / 2, y: checkboxRect.top + checkboxRect.height / 2, cardRect: cardElement?.getBoundingClientRect() });
	          }}
	          style={{ marginTop: 5 }}
	        />
	        <div style={{ minWidth: 0 }}>
	          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 7, alignItems: "start" }}>
	            <div style={{ minWidth: 0 }}>
	              <div style={{ fontFamily: DT.sans, fontSize: 12.5, fontWeight: 950, color: done ? DONE_TASK_VISUAL.title : DT.textPrimary, lineHeight: 1.2, textDecoration: done ? "line-through" : "none", overflowWrap: "anywhere" }}>{planTask.text}</div>
	              <div style={{ marginTop: 3, ...taskMetaStyle(done) }}>{task.meta}</div>
	              {planTask.notes && <div style={{ marginTop: 3, ...taskMetaStyle(done) }}>{planTask.notes}</div>}
	              <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>
	                <OrderCommandPill label="Schedule" tone={done ? "good" : "teal"} />
	                {placementLabel && <OrderCommandPill label={placementLabel} tone="neutral" />}
	              </div>
	            </div>
	            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
	              <button type="button" onClick={(event) => onPlanTaskDoneToggle(planTask, !done, { x: event.clientX, y: event.clientY })} style={{ border: `1px solid ${done ? DONE_TASK_VISUAL.buttonBorder : "rgba(12,124,122,0.20)"}`, background: done ? DONE_TASK_VISUAL.buttonBg : DT.tealSoft, color: done ? DONE_TASK_VISUAL.title : DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>{done ? "Undo" : "Done"}</button>
	              <button type="button" onClick={() => onPlanTaskEdit(planTask)} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Edit</button>
	              {planTask.assignedViaTuesday && <button type="button" onClick={() => onRemoveTaskLink(planTask)} style={{ border: "1px solid rgba(146,42,35,0.16)", background: "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}>Unlink</button>}
	            </div>
	          </div>
	        </div>
	      </div>
	    );
	  }

	  return (
    <div style={{ border: `1px solid ${DT.border}`, background: TUESDAY_THEME.surfaceClean, borderRadius: 12, padding: 15, boxShadow: "0 6px 18px rgba(37,30,20,0.035)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: TUESDAY_THEME.quiet }}>Production path</div>
          <div title="Tick the checkbox to mark this task done" style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 16, color: DT.textPrimary, fontWeight: 950 }}>Scheduled tasks</div>
          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750, lineHeight: 1.35 }}>
            Current stage: {activeProductionStep?.label ?? order.rawMondayStatus ?? "Not set"} · next task: {defaultDraftAction}
          </div>
        </div>
        <OrderCommandPill label={`${openCount} open · ${doneCount} done`} tone={openCount ? "teal" : "neutral"} />
      </div>

      <div style={{ marginTop: 10, border: `1px solid ${DT.border}`, background: TUESDAY_THEME.surfaceSoft, borderRadius: 10, padding: 10 }}>
        <div style={{ fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 900, marginBottom: 7 }}>Add next task</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 88px", gap: 7 }}>
          <select
            value={selectedDraftAction}
            onChange={(event) => setDraftAction(event.target.value)}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg }}
          >
            {productionTaskOptions.length > 0 && (
              <optgroup label="Production path">
                {productionTaskOptions.map((option, optionIndex) => <option key={option.label} value={option.label}>{numberedJobTaskOptionLabel(option.label, optionIndex)}</option>)}
              </optgroup>
            )}
            <optgroup label="Support">
              {supportTaskOptions.map((option, optionIndex) => <option key={option.label} value={option.label}>{numberedJobTaskOptionLabel(option.label, productionTaskOptions.length + optionIndex)}</option>)}
            </optgroup>
          </select>
          <select
            value={draftOwner}
            onChange={(event) => setDraftOwner(event.target.value as WorkshopPerson)}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg }}
          >
            <option value="Nick">Nick</option>
            <option value="Dylan">Dylan</option>
            <option value="Guido">Guido</option>
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
	        {productionSteps.length === 0 && totalCount === 0 && <div style={{ fontFamily: DT.sans, fontSize: 12, color: DT.textMuted, lineHeight: 1.35 }}>No tasks saved for this order yet.</div>}
	        {pathRows.map(({ step, index, rowTasks }) => {
	          const done = index < productionStepIndex;
	          const active = index === productionStepIndex;
	          const fill = active ? DT.teal : done ? DT.sage : DT.textFaint;
	          const suggested = suggestedJobTaskLabelForStep(step, order);
	          const waitActive = step.wait && active;
	          return (
	            <div key={step.key} style={{ border: `1px solid ${active ? "rgba(12,124,122,0.24)" : waitActive ? TUESDAY_THEME.amberLine : DT.border}`, background: active ? "rgba(237,248,247,0.70)" : waitActive ? TUESDAY_THEME.amberSoft : "rgba(255,255,255,0.74)", borderRadius: 11, padding: "8px 9px", display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", gap: 9, alignItems: "start" }}>
	              <div style={{ width: 28, height: 28, borderRadius: step.wait ? 8 : 999, border: `1px ${step.wait ? "dashed" : "solid"} ${active ? fill : done ? "rgba(95,127,95,0.35)" : DT.border}`, background: done ? "rgba(95,127,95,0.12)" : active ? "rgba(12,124,122,0.10)" : "rgba(255,255,255,0.76)", color: fill, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>
	                {done ? "✓" : index + 1}
	              </div>
	              <div style={{ minWidth: 0 }}>
	                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
	                  <div style={{ minWidth: 0 }}>
	                    <div style={{ fontFamily: DT.sans, fontSize: 13.5, lineHeight: 1.2, color: active ? DT.teal : done ? DT.textSecondary : DT.textPrimary, fontWeight: 950, textDecoration: done && !active ? "line-through" : "none", overflowWrap: "anywhere" }}>{step.label}</div>
	                    <div style={{ marginTop: 2, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
	                      {suggested && <span style={{ fontFamily: DT.sans, fontSize: 9.5, color: DT.textMuted, fontWeight: 850 }}>{suggested}</span>}
	                      {step.wait && <OrderCommandPill label={step.waitLabel || "Wait"} tone="warn" />}
	                      {active && <OrderCommandPill label="Current" tone="teal" />}
	                    </div>
	                  </div>
	                  {rowTasks.length === 0 && suggested && (
	                    <button
	                      type="button"
	                      onClick={() => {
	                        if (taskOptions.some((option) => option.label === suggested)) {
	                          setDraftAction(suggested);
	                          return;
	                        }
	                        setDraftAction("Custom");
	                        setDraftCustom(suggested);
	                      }}
	                      style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.74)", color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
	                    >
	                      Plan this
	                    </button>
	                  )}
	                </div>
	                <div style={{ marginTop: rowTasks.length ? 7 : 5, display: "grid", gap: 6 }}>
	                  {rowTasks.length ? rowTasks.map((task) => renderUnifiedTask(task)) : (
	                    <div style={{ border: `1px dashed ${DT.border}`, background: "rgba(255,255,255,0.52)", borderRadius: 9, padding: "6px 7px", fontFamily: DT.sans, fontSize: 10.5, color: DT.textMuted, fontWeight: 850 }}>No scheduled task on this step yet.</div>
	                  )}
	                </div>
	              </div>
	            </div>
	          );
	        })}
	        {supportTasks.length > 0 && (
	          <div style={{ border: `1px solid ${DT.border}`, background: "rgba(247,245,239,0.76)", borderRadius: 11, padding: "8px 9px" }}>
	            <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Support / off-path tasks</div>
	            <div style={{ marginTop: 7, display: "grid", gap: 6 }}>{supportTasks.map((task) => renderUnifiedTask(task))}</div>
	          </div>
	        )}
	      </div>
    </div>
  );
}

function PersonSelect({ value, onChange, workshopOnly = false }: { value: WorkshopPerson; onChange: (value: WorkshopPerson) => void; workshopOnly?: boolean }) {
  const selectValue = workshopOnly && value !== "Dylan" && value !== "Guido" ? "Nick" : value;
  return (
    <select
      value={selectValue}
      onChange={(event) => onChange(event.target.value as WorkshopPerson)}
      style={{ border: `1px solid ${DT.border}`, borderRadius: 7, padding: "4px 5px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
    >
      {!workshopOnly && <option value="">By</option>}
      <option value="Nick">Nick</option>
      <option value="Dylan">Dylan</option>
      <option value="Guido">Guido</option>
      {!workshopOnly && <option value="Other">Other</option>}
    </select>
  );
}

function QcChecklist({
  order,
  workflow,
  onChange,
  compact = false,
  includePhotos = false,
}: {
  order: UiOrder;
  workflow: OrderWorkflowState;
  onChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
  compact?: boolean;
  includePhotos?: boolean;
}) {
  const items = dispatchQcItems(order);
  const doneCount = items.filter((label) => workflow.qc[label]?.done).length;
  const complete = items.length > 0 && doneCount === items.length;
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
  function markFinalPhotosUploaded() {
    if (!items.includes("Final photos uploaded")) return;
    toggle("Final photos uploaded", true);
  }
  return (
    <div style={{ border: compact ? `1px solid ${complete ? "rgba(64,128,72,0.18)" : "rgba(154,91,18,0.18)"}` : `1px solid ${DT.border}`, background: compact ? (complete ? "rgba(64,128,72,0.06)" : "rgba(250,204,21,0.10)") : TUESDAY_THEME.surfaceClean, borderRadius: compact ? 10 : 12, padding: compact ? 8 : 12, boxShadow: compact ? "none" : "0 6px 18px rgba(37,30,20,0.035)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: DT.teal }}>QC</div>
          {!compact && <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 13, color: DT.textMuted, fontWeight: 800 }}>Final checks before release</div>}
        </div>
        <OrderCommandPill label={`${doneCount}/${items.length}`} tone={complete ? "good" : "warn"} />
      </div>
      <div style={{ marginTop: compact ? 6 : 9, display: "grid", gap: compact ? 4 : 6 }}>
        {items.map((label) => {
          const item = workflow.qc[label] ?? { done: false, completedAt: null, completedBy: "" as WorkshopPerson };
          const done = Boolean(item.done);
          return (
            <div key={label} style={{ border: `1px solid ${done ? "rgba(64,128,72,0.18)" : DT.border}`, background: done ? "rgba(64,128,72,0.07)" : "rgba(255,255,255,0.70)", borderRadius: compact ? 8 : 10, padding: compact ? "5px 6px" : "7px 8px", display: "grid", gap: compact ? 3 : 5 }}>
              <button
                type="button"
                onClick={() => toggle(label, !done)}
                aria-pressed={done}
                style={{ width: "100%", border: "none", background: "transparent", padding: 0, display: "grid", gridTemplateColumns: compact ? "18px minmax(0, 1fr) auto" : "22px minmax(0, 1fr) auto", gap: compact ? 5 : 7, alignItems: "center", textAlign: "left", cursor: "pointer" }}
              >
                <span style={{ width: compact ? 17 : 20, height: compact ? 17 : 20, borderRadius: 999, border: `1px solid ${done ? "rgba(64,128,72,0.30)" : DT.border}`, background: done ? "rgba(64,128,72,0.14)" : "rgba(255,255,255,0.88)", color: done ? "#408048" : DT.textFaint, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: DT.sans, fontSize: compact ? 10 : 12, fontWeight: 950 }}>{done ? "✓" : ""}</span>
                <span style={{ minWidth: 0, fontFamily: DT.sans, fontSize: compact ? 10.5 : 11.5, color: done ? DT.textSecondary : DT.textPrimary, fontWeight: 900, lineHeight: 1.15, overflowWrap: "anywhere" }}>{label}</span>
                <span style={{ border: `1px solid ${done ? "rgba(64,128,72,0.18)" : DT.border}`, background: done ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.025)", color: done ? "#408048" : DT.textMuted, borderRadius: 999, padding: compact ? "1px 5px" : "2px 6px", fontFamily: DT.sans, fontSize: compact ? 8.5 : 9, fontWeight: 950 }}>{done ? "Done" : "Open"}</span>
              </button>
              {done && !compact && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", paddingLeft: 29 }}>
                  <PersonSelect
                    value={item.completedBy}
                    onChange={(value) => onChange((state) => ({ ...state, qc: { ...state.qc, [label]: { ...item, completedBy: value } } }))}
                  />
                  <span style={{ fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, fontWeight: 800 }}>{formatCompletedAt(item.completedAt)}</span>
                </div>
              )}
            </div>
          );
        })}
        {includePhotos && <OrderPhotoTray orderId={order.id} embedded onPhotoUploaded={markFinalPhotosUploaded} />}
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

type XeroProofReadiness = { configured?: boolean; reason?: string; envNames?: string[] };
type XeroProofState = {
  loading: boolean;
  invoice: XeroProofInvoice | null;
  error: string;
  notFound: boolean;
  readiness: XeroProofReadiness | null;
};

function xeroPaymentLabel(invoice: XeroProofInvoice | null, loading: boolean, error: string, notFound: boolean, invoiceNumber: string | null | undefined, hasXeroUrl: boolean, invoiceExpected: boolean) {
  if (!invoiceExpected && !invoiceNumber && !hasXeroUrl) return "No invoice expected";
  if (!invoiceNumber && !hasXeroUrl) return "Invoice needed";
  if (loading) return "Checking Xero";
  if (error) return "Xero unavailable";
  if ((invoice?.status || "").toUpperCase() === "PAID" || invoice?.amountDue === 0) return "Paid";
  if ((invoice?.status || "").toUpperCase() === "DRAFT") return "Draft";
  if (invoice) return "Awaiting payment";
  if (notFound && hasXeroUrl) return "Xero link saved";
  if (notFound && invoiceNumber) return "Invoice saved - Xero link missing";
  if (hasXeroUrl) return "Xero link saved";
  if (invoiceNumber) return "Invoice saved - not verified";
  return "Awaiting payment";
}

function xeroPaymentTone(label: string) {
  if (label === "Paid") return { bg: "rgba(64,128,72,0.10)", border: "rgba(64,128,72,0.22)", color: "#408048" };
  if (label === "Xero link saved") return { bg: "rgba(12,124,122,0.09)", border: "rgba(12,124,122,0.18)", color: DT.teal };
  if (label === "Awaiting payment" || label === "Draft" || label === "Invoice saved - not verified" || label === "Invoice saved - Xero link missing") return { bg: "rgba(178,97,36,0.09)", border: "rgba(178,97,36,0.20)", color: "#b26124" };
  if (label === "Xero unavailable" || label === "Invoice needed") return { bg: "rgba(146,42,35,0.08)", border: "rgba(146,42,35,0.18)", color: "#922a23" };
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

type ParsedIntakeInvoiceLine = { title: string; facts: Array<{ label: string; value: string }>; notes: string[] };

function cleanInvoiceText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeInvoiceLineTitle(value: string) {
  const clean = cleanInvoiceText(value).replace(/^custom\s+/i, "");
  if (/dining\s+table/i.test(clean)) return "Dining Table";
  if (/local\s+delivery/i.test(clean)) return "Local Delivery";
  if (/ecobeans|bean\s*bag/i.test(clean)) return "EcoBeans bean bag fill";
  return clean || "Invoice item";
}

function normalizeInvoiceFactLabel(label: string) {
  const clean = cleanInvoiceText(label).replace(/\/$/, "");
  if (/^shape$/i.test(clean)) return "Shape";
  if (/^dimensions?$/i.test(clean)) return "Dimensions";
  if (/^timber$/i.test(clean)) return "Timber";
  if (/^colo(u)?r\s*\/?\s*finish$/i.test(clean) || /^colo(u)?r$/i.test(clean) || /^finish$/i.test(clean)) return "Colour";
  if (/^base$/i.test(clean) || /^base\s*style$/i.test(clean)) return "Base";
  if (/^top\s*\/\s*panel$/i.test(clean)) return "Top / panel";
  if (/^legs\s*\/\s*base$/i.test(clean)) return "Legs / base";
  if (/^extras?$/i.test(clean) || /^notes?$/i.test(clean)) return "Notes";
  if (/^delivered\s+to$/i.test(clean) || /^delivery\s+to$/i.test(clean) || /^deliver\s+to$/i.test(clean)) return "Delivered to";
  if (/^location$/i.test(clean)) return "Location";
  if (/^address$/i.test(clean)) return "Address";
  if (/^(phone|mobile|contact)$/i.test(clean)) return "Phone";
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Detail";
}

function normalizeShapeValue(value: string) {
  const clean = cleanInvoiceText(value);
  const normalized = clean.toLowerCase();
  const knownShapes = [
    ["danish oval", "Danish oval"],
    ["classic oval", "Classic oval"],
    ["rectangle", "Rectangle"],
    ["square", "Square"],
    ["round", "Round"],
    ["pebble", "Pebble"],
    ["pill", "Pill"],
  ] as const;
  return knownShapes.find(([match]) => normalized.includes(match))?.[1] ?? clean;
}

function normalizeDimensionValue(value: string) {
  const clean = cleanInvoiceText(value).replace(/×/g, "x");
  const threeDimensional = clean.match(/\b(\d{2,5})\s*x\s*(\d{2,5})\s*x\s*(\d{2,5})\s*mm\b/i);
  if (threeDimensional) return `${threeDimensional[1]}x${threeDimensional[2]}x${threeDimensional[3]}mm`;
  const twoDimensional = clean.match(/\b(\d{2,5})\s*x\s*(\d{2,5})\s*mm\b/i);
  if (twoDimensional && /\b(standard\s+)?dining\s+height\b|\bstandard\s+height\b/i.test(clean)) {
    return `${twoDimensional[1]}x${twoDimensional[2]}x760mm`;
  }
  return clean;
}

function normalizeBaseValue(value: string) {
  return cleanInvoiceText(value).replace(/\s+base$/i, "");
}

function normalizeInvoiceFactValue(label: string, value: string) {
  if (label === "Shape") return normalizeShapeValue(value);
  if (label === "Dimensions") return normalizeDimensionValue(value);
  if (label === "Base") return normalizeBaseValue(value);
  return cleanInvoiceText(value);
}

const INTAKE_SPEC_LABEL_ORDER = ["Shape", "Dimensions", "Timber", "Colour", "Base", "Top / panel", "Legs / base", "Notes", "Location", "Address"];
const DELIVERY_FACT_LABELS = new Set(["Delivered to", "Delivery", "Location", "Address", "Phone"]);
const TIMBER_VALUE_PATTERN = /\b(t[oō]tara|rimu|beech|oak|ash|walnut|elm|macrocarpa|cedar|pine|northland|west\s+coast|american)\b/i;
const FINISH_VALUE_PATTERN = /\b(finish|clear|blackwash|whitewash|stain|oil|oiled|natural|raw|uncoated|paint|colour|color)\b/i;

function formatParsedIntakeSpec(parsed: ParsedIntakeInvoiceLine) {
  return [...parsed.facts].sort((left, right) => {
    const leftIndex = INTAKE_SPEC_LABEL_ORDER.indexOf(left.label);
    const rightIndex = INTAKE_SPEC_LABEL_ORDER.indexOf(right.label);
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  });
}

function parseUnlabelledInvoiceSpec(description: string): ParsedIntakeInvoiceLine | null {
  const lines = description.split(/\r?\n/).map((line) => cleanInvoiceText(line)).filter(Boolean);
  const compact = cleanInvoiceText(description);
  const dimensionMatch = compact.match(/\b\d{2,5}\s*[x×]\s*\d{2,5}(?:\s*[x×]\s*\d{2,5})?\s*mm\b/i);
  if (!dimensionMatch || dimensionMatch.index === undefined) return null;

  const dimensionText = dimensionMatch[0];
  const titleBeforeDimension = cleanInvoiceText(compact.slice(0, dimensionMatch.index));
  const title = normalizeInvoiceLineTitle(titleBeforeDimension || lines[0] || compact);
  const remainderFromCompact = cleanInvoiceText(compact.slice(dimensionMatch.index + dimensionText.length).replace(/^[-–,:;]+/, ""));
  const remainderFromLines = lines.filter((line) => !line.includes(dimensionText)).slice(titleBeforeDimension ? 0 : 1).join(", ");
  const remainder = remainderFromCompact || remainderFromLines;
  const remainderParts = remainder.split(/\s*,\s*/).map((part) => cleanInvoiceText(part)).filter(Boolean);
  const timberPart = remainderParts.find((part) => TIMBER_VALUE_PATTERN.test(part));
  const colourPart = remainderParts.find((part) => part !== timberPart && FINISH_VALUE_PATTERN.test(part));
  const facts = [
    { label: "Dimensions", value: normalizeDimensionValue(dimensionText) },
    ...(timberPart ? [{ label: "Timber", value: normalizeInvoiceFactValue("Timber", timberPart) }] : []),
    ...(colourPart ? [{ label: "Colour", value: normalizeInvoiceFactValue("Colour", colourPart) }] : []),
  ];
  const notes = remainderParts.filter((part) => part !== timberPart && part !== colourPart);
  return { title, facts, notes };
}

function parseIntakeInvoiceLine(description: string): ParsedIntakeInvoiceLine {
  const compact = cleanInvoiceText(description);
  if (!compact) return { title: "Invoice item", facts: [], notes: [] };
  const keyPattern = /\b(Shape|Dimensions?|Timber|Colou?r\s*\/\s*finish|Colou?r|Finish|Base\s*style|Base|Top\s*\/\s*panel|Legs\s*\/\s*base|Extras?|Notes?|Delivered\s+to|Delivery\s+to|Deliver\s+to|Location|Address|Phone|Mobile|Contact):\s*/gi;
  const matches = Array.from(compact.matchAll(keyPattern));
  if (matches.length === 0) {
    const unlabelledSpec = parseUnlabelledInvoiceSpec(description);
    if (unlabelledSpec) return unlabelledSpec;
    const [first, ...rest] = description.split(/\r?\n/).map((line) => cleanInvoiceText(line)).filter(Boolean);
    const dimensionLine = rest.find((line) => /\d{2,5}\s*[x×]\s*\d{2,5}/i.test(line));
    const colourLine = rest.find((line) => line !== dimensionLine && /colo[u]?r|finish|stain|wash|clear|black|natural|oil/i.test(line));
    const facts = [
      ...(dimensionLine ? [{ label: "Dimensions", value: normalizeDimensionValue(dimensionLine) }] : []),
      ...(colourLine ? [{ label: "Colour", value: normalizeInvoiceFactValue("Colour", colourLine.replace(/^colo[u]?r\s*:\s*/i, "")) }] : []),
    ];
    const notes = rest.filter((line) => line !== dimensionLine && line !== colourLine);
    return { title: normalizeInvoiceLineTitle(first || compact), facts, notes };
  }
  const title = normalizeInvoiceLineTitle(compact.slice(0, matches[0].index ?? 0));
  const facts = matches.flatMap((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? compact.length) : compact.length;
    const label = normalizeInvoiceFactLabel(match[1]);
    const value = normalizeInvoiceFactValue(label, compact.slice(start, end));
    if (!value) return [];
    return [{ label, value }];
  });
  return { title, facts, notes: [] };
}

function isPendingAkahuPayment(payment: OrderIntakePaymentEvidence) {
  return payment.matchStatus === "ignored" && Array.isArray(payment.matchReasons) && payment.matchReasons.includes("pending_akahu_transaction");
}

function formatOrderQuantity(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return "Quantity missing";
  const quantity = formatXeroQuantity(value);
  return `${quantity} ${value === 1 ? "item" : "items"}`;
}

type InvoiceSpecLineLike = {
  description: string;
  quantity?: number | null;
  lineAmount?: number | null;
};

function InvoiceSpecCard({
  line,
  sourceLabel,
  primary = false,
  compact = false,
  showDelivery = true,
}: {
  line: InvoiceSpecLineLike;
  sourceLabel?: string;
  primary?: boolean;
  compact?: boolean;
  showDelivery?: boolean;
}) {
  const parsed = parseIntakeInvoiceLine(line.description);
  const facts = formatParsedIntakeSpec(parsed);
  const specFacts = facts.filter((fact) => !DELIVERY_FACT_LABELS.has(fact.label));
  const deliveryFacts = facts.filter((fact) => DELIVERY_FACT_LABELS.has(fact.label));
  const titleSize = compact ? 17 : primary ? 24 : 15;
  const labelWidth = compact ? 74 : primary ? 98 : 78;
  return (
    <div style={{ border: `1px solid ${primary ? "rgba(12,124,122,0.26)" : DT.border}`, borderRadius: 11, padding: compact ? 9 : primary ? 12 : 8, background: primary ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.74)", boxShadow: primary ? "0 8px 18px rgba(37,30,20,0.045)" : "none", minWidth: 0 }}>
      <div style={{ display: "grid", gap: compact ? 5 : 6, fontFamily: DT.sans, color: DT.textPrimary, lineHeight: 1.16 }}>
        <div style={{ fontFamily: DT.serif, fontSize: titleSize, fontWeight: 700, color: DT.textPrimary, lineHeight: 1.03, overflowWrap: "anywhere" }}>{parsed.title}</div>
        {specFacts.length === 0 && <div style={{ fontFamily: DT.sans, fontSize: compact ? 10.5 : 11.5, color: DT.textMuted, fontWeight: 850 }}>No structured spec captured yet.</div>}
        {specFacts.map((fact) => (
          <div key={`${fact.label}:${fact.value}`} style={{ display: "grid", gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, gap: compact ? 7 : 10, fontSize: compact ? 11 : 12.5, fontWeight: 900, overflowWrap: "anywhere", alignItems: "baseline" }}>
            <span style={{ color: DT.textMuted, fontWeight: 950 }}>{fact.label}</span>
            <span>{fact.value}</span>
          </div>
        ))}
      </div>
      {parsed.notes.map((note) => <div key={note} style={{ marginTop: 7, fontFamily: DT.sans, fontSize: compact ? 10.5 : 11, color: DT.textMuted, fontWeight: 850, lineHeight: 1.25, overflowWrap: "anywhere" }}>{note}</div>)}
      {showDelivery && deliveryFacts.length > 0 && (
        <div style={{ marginTop: 9, border: "1px solid rgba(0,0,0,0.045)", background: "rgba(247,245,239,0.72)", borderRadius: 9, padding: "7px 8px" }}>
          <div style={{ fontFamily: DT.sans, fontSize: 8.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Delivered to</div>
          <div style={{ marginTop: 4, display: "grid", gap: 3 }}>
            {deliveryFacts.map((fact) => (
              <div key={`${fact.label}:${fact.value}`} style={{ fontFamily: DT.sans, fontSize: compact ? 10 : 10.5, fontWeight: 850, color: DT.textSecondary, lineHeight: 1.28, overflowWrap: "anywhere" }}>
                {fact.value}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 9, display: "flex", gap: 7, flexWrap: "wrap", fontFamily: DT.sans, fontSize: compact ? 10 : 11, color: DT.textMuted, fontWeight: 950 }}>
        {line.quantity !== undefined && <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.70)", borderRadius: 999, padding: "2px 6px" }}>Qty {formatXeroQuantity(line.quantity)}</span>}
        {line.lineAmount !== undefined && <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.70)", borderRadius: 999, padding: "2px 6px" }}>{formatXeroMoney(line.lineAmount)}</span>}
        {sourceLabel && <span style={{ border: `1px solid rgba(12,124,122,0.14)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "2px 6px" }}>{sourceLabel}</span>}
      </div>
    </div>
  );
}

function activeOrderFallbackDescription(order: UiOrder) {
  const lines = [order.rawMondayItem || order.product || "Order"];
  if (order.rawMondayTopPanel) lines.push(`Top / panel: ${order.rawMondayTopPanel}`);
  if (order.rawMondayLegs) lines.push(`Legs / base: ${order.rawMondayLegs}`);
  if (order.notes) lines.push(`Notes: ${order.notes}`);
  return lines.join("\n");
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
  afterSpec,
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
  afterSpec?: ReactNode;
}) {
  const showInvoiceDetails = false;
  const [invoiceDraft, setInvoiceDraft] = useState(xeroInvoiceNumber ?? "");
  const [xeroProof, setXeroProof] = useState<XeroProofState>({ loading: false, invoice: null, error: "", notFound: false, readiness: null });
  const invoiceExpectation = invoiceExpectationForOrder(order);
  const hasInvoiceReference = Boolean(xeroInvoiceNumber || xeroUrl);
  const invoiceDetailsAvailable = invoiceExpectation.requiresInvoice || hasInvoiceReference || Boolean(onInvoiceNumberChange);

  useEffect(() => {
    let cancelled = false;
	    async function loadXeroInvoice() {
	      if (!xeroInvoiceNumber) {
	        setXeroProof({ loading: false, invoice: null, error: "", notFound: false, readiness: null });
	        return;
	      }
      setXeroProof({ loading: true, invoice: null, error: "", notFound: false, readiness: null });
      try {
        const response = await fetch(`/api/xero/proof?invoiceNumber=${encodeURIComponent(xeroInvoiceNumber)}&includeLineItems=1`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as { ok?: boolean; invoiceCount?: number; invoices?: XeroProofInvoice[]; error?: string; readiness?: XeroProofReadiness } | null;
        if (!response.ok || !data?.ok) {
          const message = data?.readiness?.reason || data?.error || "Xero lookup failed";
          if (!cancelled) setXeroProof({ loading: false, invoice: null, error: message, notFound: false, readiness: data?.readiness ?? null });
          return;
        }
        const invoice = data.invoices?.[0] ?? null;
        if (!cancelled) setXeroProof({ loading: false, invoice, error: "", notFound: !invoice, readiness: data.readiness ?? null });
      } catch (error) {
        if (!cancelled) setXeroProof({ loading: false, invoice: null, error: error instanceof Error ? error.message : "Xero lookup failed", notFound: false, readiness: null });
      }
    }
    void loadXeroInvoice();
    return () => {
      cancelled = true;
    };
	  }, [xeroInvoiceNumber]);

  function saveInvoiceDraft() {
    onInvoiceNumberChange?.(invoiceDraft.trim() ? invoiceDraft.trim().toUpperCase() : null);
  }

  const parsedXeroSpec = parseXeroWorkshopSpec(xeroProof.invoice);
  const xeroSourceUrl = xeroProof.invoice?.xeroUrl || xeroUrl;
  const paymentLabel = invoiceDetailsAvailable ? xeroPaymentLabel(xeroProof.invoice, xeroProof.loading, xeroProof.error, xeroProof.notFound, xeroInvoiceNumber, Boolean(xeroSourceUrl), invoiceExpectation.requiresInvoice) : invoiceExpectation.label;
  const paymentTone = xeroPaymentTone(paymentLabel);
  const lineItems = xeroProof.invoice?.lineItems?.filter((line) => line.description?.trim()) ?? [];
  const visibleSpecLines = lineItems.length > 0
    ? lineItems
    : [{ description: activeOrderFallbackDescription(order), quantity: order.quantity, unitAmount: null, lineAmount: order.value }];
  const specSourceLabel = lineItems.length > 0 ? "Xero invoice" : "Monday order";
  const deliveryDetail = parsedXeroSpec.delivery || order.deliveryLocation || order.freightRef;
  const packDetailLabel = `${packLabel} - ${packDetail}`;
  const freightBookByLabel = `${formatLongDate(freightBookBy)} - ${freightWorkingDays} workday${freightWorkingDays === 1 ? "" : "s"} before due`;
  const xeroUnavailable = Boolean(xeroProof.error);
  const xeroReadinessLabel = xeroProof.readiness?.configured === false ? "Xero read-only credentials are not configured." : xeroProof.error;
  const invoiceContactValue = xeroProof.loading ? "Checking Xero" : xeroUnavailable ? "Unavailable" : xeroProof.invoice?.contact || "Not returned";
  const invoiceStatusValue = xeroProof.loading ? "Checking Xero" : xeroUnavailable ? "Unavailable" : xeroProof.invoice?.status || paymentLabel;
  const invoiceProofDetail = !invoiceExpectation.requiresInvoice && !xeroInvoiceNumber
    ? invoiceExpectation.detail
    : xeroProof.invoice
      ? "Tuesday is reading these details directly from Xero. Use Open Xero only when you need the original invoice screen."
      : xeroUnavailable
        ? "Tuesday has the invoice number, but exact Xero proof is unavailable here. Use Open Xero or verify outside Tuesday before relying on payment or invoice item details."
        : xeroInvoiceNumber
          ? "Invoice number is saved, but not verified yet. Use View invoice details to check whether Tuesday can pull the full Xero invoice."
          : "Add the Xero invoice number to unlock exact invoice items here.";

  return (
	    <div style={{ marginTop: prominent ? 0 : 8, border: `1px solid ${DT.border}`, background: prominent ? TUESDAY_THEME.surfaceClean : "rgba(255,255,255,0.72)", borderRadius: prominent ? 12 : 9, padding: prominent ? 12 : "8px 9px", boxShadow: prominent ? "0 6px 18px rgba(37,30,20,0.035)" : "none" }}>
	      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
	        <div>
	          <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: DT.teal }}>Order details</div>
	        </div>
	        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {xeroSourceUrl && (
            <a href={xeroSourceUrl} target="_blank" rel="noreferrer" style={{ border: "1px solid rgba(12,124,122,0.18)", background: "rgba(255,255,255,0.74)", color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textDecoration: "none" }}>
              Open Xero
            </a>
	          )}
	        </div>
	      </div>
		      <div style={{ marginTop: 8, border: `1px solid rgba(12,124,122,0.18)`, borderRadius: 11, background: "rgba(237,248,247,0.45)", padding: 8, display: "grid", gap: 7 }}>
		        {visibleSpecLines.map((line, index) => (
		          <InvoiceSpecCard
		            key={`${line.description}:${index}`}
		            line={line}
		            sourceLabel={specSourceLabel}
		            primary={index === 0}
		            compact={index > 0}
		          />
		        ))}
			      </div>
		      {afterSpec && <div style={{ marginTop: 8 }}>{afterSpec}</div>}
		      {deliveryDetail && !visibleSpecLines.some((line) => parseIntakeInvoiceLine(line.description).facts.some((fact) => DELIVERY_FACT_LABELS.has(fact.label))) && (
		        <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", borderRadius: 9, padding: "8px 9px" }}>
	          <div style={{ fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", color: DT.textFaint }}>Delivered to</div>
	          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 12, fontWeight: 850, color: DT.textPrimary, lineHeight: 1.28 }}>{deliveryDetail}</div>
	        </div>
	      )}
	      {showInvoiceDetails && (
	        <div style={{ marginTop: 8, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
	          <span style={{ border: `1px solid ${paymentTone.border}`, background: paymentTone.bg, color: paymentTone.color, borderRadius: 999, padding: "4px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>
	            Source: {paymentLabel}
	          </span>
	          {xeroInvoiceNumber && <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>From {xeroInvoiceNumber}</span>}
	          {xeroProof.invoice?.dueDate && <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>Invoice due {formatShortDate(xeroProof.invoice.dueDate)}</span>}
	          <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>Pack: {packDetailLabel}</span>
	          <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>Freight: {freightBookByLabel}</span>
	        </div>
	      )}
      {showInvoiceDetails && onInvoiceNumberChange && invoiceExpectation.requiresInvoice && (
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
            <MiniFact label="Contact" value={invoiceContactValue} />
            <MiniFact label="Status" value={invoiceStatusValue} />
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
              {!xeroProof.loading && xeroUnavailable && (
                <div style={{ border: "1px solid rgba(146,42,35,0.18)", background: "rgba(146,42,35,0.06)", borderRadius: 8, padding: "8px 9px", fontFamily: DT.sans, fontSize: 11, lineHeight: 1.35, color: "#922a23", fontWeight: 850 }}>
                  Xero proof unavailable. {xeroReadinessLabel || "Use Open Xero or verify outside Tuesday before relying on payment or invoice item details."}
                </div>
              )}
	              {!xeroProof.loading && lineItems.map((line, index) => { const parsed = parseIntakeInvoiceLine(line.description); const facts = formatParsedIntakeSpec(parsed); return (
	                <div key={`${index}-${line.description.slice(0, 24)}`} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, borderRadius: 8, padding: "7px 8px", display: "grid", gridTemplateColumns: prominent ? "minmax(0, 1fr) 58px 72px 82px" : "1fr", gap: prominent ? 8 : 5, alignItems: "start" }}>
	                  <div style={{ minWidth: 0 }}>
	                    <div style={{ fontFamily: DT.sans, fontSize: 12, lineHeight: 1.22, color: DT.textPrimary, fontWeight: 950, overflowWrap: "anywhere" }}>{parsed.title}</div>
	                    <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: prominent ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: 5 }}>
	                      {facts.length === 0 ? <MiniFact label="Spec" value="No structured spec" /> : facts.map((fact) => <MiniFact key={`${fact.label}:${fact.value}`} label={fact.label} value={fact.value} />)}
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
              {!xeroProof.loading && !xeroUnavailable && lineItems.length === 0 && <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted }}>No line item text returned from Xero yet.</div>}
            </div>
          </div>
        </div>
      )}
	      {showInvoiceDetails && <div style={{ marginTop: 7, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, lineHeight: 1.3 }}>
	        {invoiceProofDetail}
	      </div>}
      {xeroProof.error && !showInvoiceDetails && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: "#922a23", lineHeight: 1.3 }}>{xeroReadinessLabel}</div>}
    </div>
  );
}
function OrderPhotoTray({ orderId, embedded = false, onPhotoUploaded }: { orderId: number; embedded?: boolean; onPhotoUploaded?: () => void }) {
  const [requested, setRequested] = useState(true);
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [status, setStatus] = useState<string>("Loading photos...");
  const [disabledReason, setDisabledReason] = useState<string>("");
  const [deletingPathname, setDeletingPathname] = useState<string>("");
  const [pendingDeletePathname, setPendingDeletePathname] = useState<string>("");
  const [uploading, setUploading] = useState(false);

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
    setDeletingPathname(photo.pathname);
    setStatus("Deleting photo...");
    try {
      const params = new URLSearchParams({ orderId: String(orderId), pathname: photo.pathname });
      const response = await fetch(`/api/production/order-photos?${params.toString()}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Delete failed");
      setPhotos((current) => current.filter((item) => item.pathname !== photo.pathname));
      setStatus("Photo deleted");
    } finally {
      setDeletingPathname("");
      setPendingDeletePathname("");
    }
  }

  function requestDeletePhoto(photo: OrderPhoto) {
    if (pendingDeletePathname !== photo.pathname) {
      setPendingDeletePathname(photo.pathname);
      setStatus("Press Delete again to remove this photo.");
      return;
    }
    deletePhoto(photo).catch((err) => setStatus(err instanceof Error ? err.message : "Delete failed"));
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append("orderId", String(orderId));
    form.append("file", file);
    setUploading(true);
    setStatus("Uploading photo...");
    try {
      const response = await fetch("/api/production/order-photos", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setPhotos((current) => [data.photo as OrderPhoto, ...current]);
      setDisabledReason("");
      setStatus("Photo uploaded");
      onPhotoUploaded?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${embedded ? "rgba(12,124,122,0.16)" : DT.border}`, background: embedded ? "rgba(255,255,255,0.62)" : TUESDAY_THEME.surfaceClean, borderRadius: embedded ? 9 : 12, padding: embedded ? 8 : 12, boxShadow: embedded ? "none" : "0 6px 18px rgba(37,30,20,0.035)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          {!embedded && <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: DT.teal }}>Photos</div>}
          <div style={{ marginTop: embedded ? 0 : 2, fontFamily: DT.sans, fontSize: embedded ? 11 : 13, color: embedded ? DT.textPrimary : DT.textMuted, fontWeight: 900 }}>{embedded ? "QC photos" : "QC and dispatch evidence"}</div>
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
          <label title={disabledReason || "Upload order photos"} style={{ border: `1px solid rgba(12,124,122,0.18)`, background: disabledReason || uploading ? "rgba(0,0,0,0.035)" : DT.tealSoft, color: disabledReason || uploading ? DT.textFaint : DT.teal, borderRadius: 999, padding: embedded ? "5px 8px" : "6px 9px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: disabledReason || uploading ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
            {uploading ? "Uploading..." : "+ Photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={Boolean(disabledReason) || uploading}
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
      {(status || disabledReason || !requested) && <div style={{ marginTop: 6, border: disabledReason ? "1px solid rgba(154,91,18,0.20)" : "none", background: disabledReason ? "rgba(250,204,21,0.10)" : "transparent", borderRadius: 8, padding: disabledReason ? "6px 8px" : 0, fontFamily: DT.sans, fontSize: 10, color: disabledReason ? "#9a5b12" : DT.textMuted, fontWeight: 850, lineHeight: 1.3 }}>{status || disabledReason || "Photos load only when needed."}</div>}
      {requested && (
        <div style={{ marginTop: embedded ? 6 : 8, display: "grid", gridTemplateColumns: embedded ? "repeat(3, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 5 }}>
          {photos.map((photo) => (
            <div key={photo.pathname} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", border: `1px solid ${DT.border}`, background: DT.cardBg }}>
              <a href={photo.url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Order upload" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </a>
              <button
                type="button"
                disabled={deletingPathname === photo.pathname}
                onClick={() => requestDeletePhoto(photo)}
                style={{ position: "absolute", right: 4, top: 4, border: "1px solid rgba(146,42,35,0.16)", background: pendingDeletePathname === photo.pathname ? "rgba(146,42,35,0.88)" : "rgba(255,253,249,0.92)", color: deletingPathname === photo.pathname ? DT.textFaint : pendingDeletePathname === photo.pathname ? "#fff" : DT.textMuted, borderRadius: 999, minWidth: 30, height: 24, padding: "0 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, cursor: deletingPathname === photo.pathname ? "wait" : "pointer", lineHeight: "20px" }}
                aria-label="Delete photo"
                title="Delete photo"
              >
                {pendingDeletePathname === photo.pathname ? "Sure" : "Del"}
              </button>
            </div>
          ))}
          {photos.length === 0 && <div style={{ gridColumn: "1 / -1", border: `1px dashed ${DT.border}`, background: "rgba(255,255,255,0.60)", borderRadius: 9, padding: embedded ? "6px 7px" : "8px 9px", fontFamily: DT.sans, fontSize: embedded ? 10 : 11, color: DT.textMuted, lineHeight: 1.3 }}>No photos yet.</div>}
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
  sourceKind?: "plan" | "workflow" | "intake";
  appTask?: AppPlanTask;
};
type OrderJourneyRow = {
  id: string;
  order: UiOrder | null;
  name: string;
  dueLabel: string | null;
  statusLabel: string | null;
  health: OrderHealthLevel | "internal" | "unlinked";
  hasTasksThisWeek: boolean;
  tasks: OrderJourneyTask[];
};
type BoardDropTarget = { weekId: string; day: DayKey; person: Person; overTaskId?: string; rowId?: string };
type BoardDropPreview = { weekId: string; day: DayKey; person: Person; overId?: string; insertAfter?: boolean; rowId?: string };

function boardCollisionDetection(args: Parameters<typeof closestCorners>[0]) {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
}

function boardDropIdFromPoint(x: number, y: number) {
  if (typeof document === "undefined") return null;
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    const node = element instanceof HTMLElement
      ? element.closest("[data-order-row-drop-id], [data-qa-plan-lane], [data-order-row-task-id], [data-suggested-step-id]")
      : null;
    if (!(node instanceof HTMLElement)) continue;
    return node.dataset.orderRowDropId ?? node.dataset.qaPlanLane ?? node.dataset.orderRowTaskId ?? node.dataset.suggestedStepId ?? null;
  }
  return null;
}

function boardFallbackOverIdFromDrag(event: Pick<DragOverEvent, "active">) {
  const rect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  if (!rect) return null;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const points = [
    [centerX, centerY],
    [centerX, rect.top + 8],
    [centerX, rect.bottom - 8],
    [rect.left + 8, centerY],
    [rect.right - 8, centerY],
  ] as const;
  for (const [x, y] of points) {
    const id = boardDropIdFromPoint(x, y);
    if (id) return id;
  }
  return null;
}
type OrderConnectionState = "connected" | "possible" | "needs-order" | "internal";
type PlanTaskOrderMatchConfidence = "confirmed" | "exact" | "possible" | "none";
type PlanTaskOrderConnection = { orderId: number | null; confidence: PlanTaskOrderMatchConfidence };
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

function dateLabelForWeekTitleDay(weekTitle: string, day: DayKey) {
  const range = weekRangeFromTitle(weekTitle);
  if (!range) return `${displayWeekTitle(weekTitle)} · ${DAY_LABELS[day]}`;
  const date = new Date(range.start);
  date.setDate(range.start.getDate() + DAYS.indexOf(day));
  return formatTaskDateLabel(isoDateFromDate(date));
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

function orderConnectionLabel(
  task: DraggablePlanTask,
  planTaskLinks: PlanTaskLinks,
  resolvedOrderId: number | null = null,
  confidence: PlanTaskOrderMatchConfidence = "possible"
) {
  const assignedOrderId = assignedOrderIdForTask(task, planTaskLinks);
  const hasConfirmedOrder = Boolean(assignedOrderId || task.linkedOrderIds.length > 0);
  const looksInternal = /sample rack|shop|internal|maintenance|clean|tidy|tool|bench/i.test(`${task.text} ${task.rowName}`);
  if (hasConfirmedOrder) {
    return { state: "connected" as OrderConnectionState, label: "Order linked", detail: "Customer order attached" };
  }
  if (resolvedOrderId && confidence === "exact") {
    return { state: "connected" as OrderConnectionState, label: "Auto-linked", detail: "Exact customer match" };
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

function applyOrderJourneyRowOrder(rows: OrderJourneyRow[], savedOrder: string[] | undefined) {
  if (!savedOrder?.length) return rows;
  const savedIndex = new Map(savedOrder.map((id, index) => [id, index]));
  return [...rows].sort((left, right) => {
    const leftIndex = savedIndex.get(left.id);
    const rightIndex = savedIndex.get(right.id);
    if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
    if (leftIndex !== undefined) return -1;
    if (rightIndex !== undefined) return 1;
    return 0;
  });
}

function activeOrderJourneyRowIds(rows: OrderJourneyRow[]) {
  return rows.filter((row) => row.order && row.health !== "internal" && row.health !== "unlinked" && !isCompleteOrder(row.order)).map((row) => row.id);
}

function reorderStringList(items: string[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return items;
  const sourceIndex = items.indexOf(sourceId);
  const targetIndex = items.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const next = [...items];
  const [moving] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moving);
  return next;
}

function buildOrderJourneyRows({
  tasks,
  appTasks = [],
  weeks = [],
  orders,
  planTaskLinks,
  resolveOrderId,
  resolveOrderConnection,
  weekTitleForTask,
}: {
  tasks: BoardPlanTask[];
  appTasks?: AppPlanTask[];
  weeks?: PlanWeek[];
  orders: UiOrder[];
  planTaskLinks: PlanTaskLinks;
  resolveOrderId: (task: BoardPlanTask) => number | null;
  resolveOrderConnection?: (task: BoardPlanTask) => PlanTaskOrderConnection;
  weekTitleForTask: (task: BoardPlanTask) => string;
}): OrderJourneyRow[] {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const rows = new Map<string, OrderJourneyRow>();

  for (const task of tasks) {
    const orderConnectionResult = resolveOrderConnection?.(task) ?? {
      orderId: resolveOrderId(task),
      confidence: "possible" as PlanTaskOrderMatchConfidence,
    };
    const orderId = orderConnectionResult.orderId;
    const order = orderId ? ordersById.get(orderId) ?? null : null;
    const connection = orderConnectionLabel(task, planTaskLinks, orderId, orderConnectionResult.confidence);
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
      hasTasksThisWeek: true,
      tasks: [],
    };
    row.hasTasksThisWeek = true;
    row.tasks.push({
      ...task,
      orderId,
      orderName: row.name,
      weekTitle: displayWeekTitle(weekTitle),
      dateLabel: dateLabelForWeekTitleDay(weekTitle, task.day),
      sortKey: orderJourneyTaskSortKey(task, weekTitle),
      connectionState: connection.state,
      notes: task.rowNotes,
      assignedViaTuesday: Boolean(orderId && assignedOrderIdForTask(task, planTaskLinks) === orderId && !task.linkedOrderIds.includes(orderId)),
      placement: placementForTask(task, planTaskLinks),
      sourceKind: "plan",
    });
    rows.set(id, row);
  }

  for (const task of appTasks) {
    const week = weeks.find((candidate) => appTaskFallsInWeek(task, candidate));
    if (!week) continue;
    const order = task.orderId ? ordersById.get(task.orderId) ?? null : null;
    const id = order ? `order:${order.id}` : `${task.source === "intake" ? "intake" : "workflow"}:${task.orderUuid ?? task.orderId ?? normalizeOrderText(task.customer) ?? task.id}`;
    const row = rows.get(id) ?? {
      id,
      order,
      name: order?.customer ?? task.customer ?? "Tuesday order",
      dueLabel: order ? `${formatShortDate(order.shipDate)} · ${dueLabel(order)}` : null,
      statusLabel: order ? `${orderItemLabel(order)} · ${orderStatusLabel(order)}` : task.source === "intake" ? "Approved intake tasks" : "Tuesday tasks",
      health: order ? orderHealth(order) : "onTrack",
      hasTasksThisWeek: true,
      tasks: [],
    };
    row.hasTasksThisWeek = true;
    row.tasks.push({
      id: task.id,
      taskKey: task.id,
      rowId: `${task.source ?? "app"}:${task.orderUuid ?? task.orderId ?? task.id}`,
      rowName: task.customer ?? order?.customer ?? "Tuesday task",
      rowNotes: task.detail ?? null,
      weekId: week.id,
      sortOrder: 0,
      day: task.day,
      person: task.person,
      text: task.title,
      estimatedHours: task.estimatedHours ?? 1,
      done: task.done,
      linkedOrderIds: task.orderId ? [task.orderId] : [],
      linkedOrders: [],
      orderId: task.orderId,
      orderName: row.name,
      weekTitle: displayWeekTitle(week.title),
      dateLabel: task.scheduledDate ? formatTaskDateLabel(task.scheduledDate) : dateLabelForWeekTitleDay(week.title, task.day),
      sortKey: [task.scheduledDate || "9999-99-99", DAYS.indexOf(task.day), PEOPLE.indexOf(task.person), row.name, task.id].join(":"),
      connectionState: order ? "connected" : "internal",
      notes: task.detail ?? null,
      sourceKind: task.source ?? "workflow",
      appTask: task,
    });
    rows.set(id, row);
  }

  for (const order of orders.filter((order) => !isCompleteOrder(order))) {
    const id = `order:${order.id}`;
    if (rows.has(id)) continue;
    rows.set(id, {
      id,
      order,
      name: order.customer,
      dueLabel: `${formatShortDate(order.shipDate)} · ${dueLabel(order)}`,
      statusLabel: `${orderItemLabel(order)} · ${orderStatusLabel(order)}`,
      health: orderHealth(order),
      hasTasksThisWeek: false,
      tasks: [],
    });
  }

  const healthOrder: Record<OrderJourneyRow["health"], number> = { blocked: 0, watch: 1, onTrack: 2, unlinked: 3, internal: 4 };
  return Array.from(rows.values())
    .map((row) => ({ ...row, tasks: [...row.tasks].sort((a, b) => a.sortKey.localeCompare(b.sortKey)) }))
    .sort((a, b) => {
      const dueA = dateOnlyAtNoon(a.order?.shipDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = dateOnlyAtNoon(b.order?.shipDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return healthOrder[a.health] - healthOrder[b.health] || dueA - dueB || a.name.localeCompare(b.name);
    });
}

function boardPlanLaneId(weekId: string, day: DayKey, person: Person) {
  return `${weekId}::${day}:${person}`;
}

function orderJourneyLaneId(rowId: string, weekId: string, day: DayKey, person: Person) {
  return `order-row-lane::${rowId}::${weekId}::${day}:${person}`;
}

function orderJourneyDayId(rowId: string, weekId: string, day: DayKey) {
  return `order-row-day::${rowId}::${weekId}::${day}`;
}

function parseBoardPlanLane(value: string): { weekId: string; day: DayKey; person: Person } | null {
  const [weekId, lane] = value.split("::");
  if (!weekId || !lane) return null;
  const parsedLane = parsePlanLane(lane);
  return parsedLane ? { weekId, ...parsedLane } : null;
}

function parseOrderJourneyLane(value: string): { rowId: string; weekId: string; day: DayKey; person: Person } | null {
  if (!value.startsWith("order-row-lane::")) return null;
  const [, rowId, weekId, lane] = value.split("::");
  if (!rowId || !weekId || !lane) return null;
  const parsedLane = parsePlanLane(lane);
  return parsedLane ? { rowId, weekId, ...parsedLane } : null;
}

function parseOrderJourneyDay(value: string): { rowId: string; weekId: string; day: DayKey } | null {
  if (!value.startsWith("order-row-day::")) return null;
  const [, rowId, weekId, day] = value.split("::");
  if (!rowId || !weekId || !(DAYS as readonly string[]).includes(day)) return null;
  return { rowId, weekId, day: day as DayKey };
}

function boardDropTargetFromOverId(current: BoardPlanTask[], overId: string): BoardDropTarget | null {
  const orderLane = parseOrderJourneyLane(overId);
  if (orderLane) return orderLane;
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
  void _weekId;
  void _tasks;
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

function AppTaskDragCard({ task }: { task: AppPlanTask }) {
  const personVisual = PERSON_VISUALS[task.person];
  return (
    <div style={{ width: 220, maxWidth: "min(260px, 70vw)", pointerEvents: "none", borderWidth: "1px 1px 1px 6px", borderStyle: "solid", borderColor: `${personVisual.taskBorder} ${personVisual.taskBorder} ${personVisual.taskBorder} ${personVisual.stripe}`, background: personVisual.taskBg, borderRadius: 8, padding: "7px 8px", boxShadow: "0 14px 34px rgba(34,32,26,0.20)", fontFamily: DT.sans }}>
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: DT.textPrimary, lineHeight: 1.18, overflowWrap: "anywhere" }}>{task.title}</div>
          <div style={{ marginTop: 3, fontSize: 10, fontWeight: 750, color: DT.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.customer ?? "Tuesday task"}</div>
        </div>
        <span style={{ flex: "0 0 auto", border: "1px solid rgba(110,138,106,0.22)", background: "rgba(110,138,106,0.09)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontSize: 9, fontWeight: 950 }}>{formatTaskHours(task.estimatedHours ?? 1)}</span>
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
  resolveTaskOrderConnection,
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
  resolveTaskOrderConnection?: (task: DraggablePlanTask) => PlanTaskOrderConnection;
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
  const resolvedConnection = resolveTaskOrderConnection?.(task) ?? {
    orderId: resolveTaskOrderId?.(task) ?? null,
    confidence: "possible" as PlanTaskOrderMatchConfidence,
  };
  const resolvedOrderId = resolvedConnection.orderId;
  const effectiveOrderIds = resolvedOrderId ? [resolvedOrderId] : effectiveTaskOrderIds(task, planTaskLinks);
  const isSelectedOrderTask = selectedOrder ? effectiveOrderIds.includes(selectedOrder.id) || planTaskMatchesOrder(task, selectedOrder) : false;
  const isUnlinkedTask = effectiveOrderIds.length === 0;
  const personVisual = PERSON_VISUALS[task.person];
  const orderConnection = planTaskLinksLoaded
    ? orderConnectionLabel(task, planTaskLinks, resolvedOrderId, resolvedConnection.confidence)
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
        <div data-task-card-title="task-card-title" style={{ alignSelf: "center", fontSize: isSelectedOrderTask ? 13.5 : isNextTask ? 12.5 : 12, fontFamily: DT.sans, fontWeight: isSelectedOrderTask ? 980 : isUnlinkedTask ? 820 : 930, lineHeight: 1.18, overflowWrap: "break-word", wordBreak: "normal", color: task.done ? DONE_TASK_VISUAL.title : undefined, textDecorationLine: task.done ? "line-through" : "none", textDecorationColor: task.done ? "rgba(111,107,99,0.68)" : undefined, opacity: task.done ? 0.72 : 1 }}>{displayTaskText}</div>
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
  const exactMatchedOrder = exactOrderForPlanTask(task, orders);
  const connectedOrderId = assignedOrderIdForTask(task, planTaskLinks) ?? task.linkedOrderIds[0] ?? exactMatchedOrder?.id ?? "";
  const [orderId, setOrderId] = useState<string>(connectedOrderId ? String(connectedOrderId) : "");
  const connectionConfidence: PlanTaskOrderMatchConfidence = exactMatchedOrder && connectedOrderId === exactMatchedOrder.id ? "exact" : "possible";
  const connection = orderConnectionLabel(task, planTaskLinks, connectedOrderId ? Number(connectedOrderId) : null, connectionConfidence);
  const activeConnection = orderId ? (
    orderId === String(connectedOrderId)
      ? connection
      : { state: "connected" as OrderConnectionState, label: "Order selected", detail: "Customer order attached" }
  ) : connection;
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
                    {TABLE_TASK_STAGE_SUGGESTIONS.map((stage, optionIndex) => <option key={stage} value={stage}>{numberedJobTaskOptionLabel(stage, optionIndex)}</option>)}
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
  resolveTaskOrderConnection,
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
  resolveTaskOrderConnection?: (task: DraggablePlanTask) => PlanTaskOrderConnection;
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
                  <span style={{ fontSize: 10, fontWeight: 900, color: isTodayColumn ? DT.teal : DT.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: DT.sans }}>{dateOption?.dateLabel ?? DAY_LABELS[day]}</span>
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
                      const laneAppHours = laneOpenAppTasks.reduce((sum, task) => sum + Number(task.estimatedHours || 1), 0);
                      const capacity = summarizeLaneCapacity({ existingTaskCount: laneTasks.length, draftHours: laneDraftHours + laneAppHours });
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
                                resolveTaskOrderConnection={resolveTaskOrderConnection}
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
                                  <div style={{ fontSize: 12.5, fontFamily: DT.sans, fontWeight: 980, lineHeight: 1.2, overflowWrap: "anywhere", color: task.done ? DONE_TASK_VISUAL.title : undefined, textDecorationLine: task.done ? "line-through" : "none", textDecorationColor: task.done ? "rgba(111,107,99,0.68)" : undefined }}>{task.title}</div>
                                  {(task.customer || selectedOrder?.customer) && <div style={{ marginTop: 3, fontSize: 9, color: task.done ? DONE_TASK_VISUAL.text : DT.textMuted, fontFamily: DT.sans, lineHeight: 1.28, overflowWrap: "anywhere", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.customer || selectedOrder?.customer}</div>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "0 0 auto" }}>
                                  <span style={{ border: "1px solid rgba(110,138,106,0.20)", background: "rgba(110,138,106,0.08)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1 }}>{formatTaskHours(task.estimatedHours ?? 1)}</span>
                                  <span style={{ color: task.done ? DONE_TASK_VISUAL.title : DT.teal, background: task.done ? DONE_TASK_VISUAL.buttonBg : DT.tealSoft, border: `1px solid ${task.done ? DONE_TASK_VISUAL.buttonBorder : "rgba(12,124,122,0.14)"}`, borderRadius: 999, padding: "1px 5px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950, whiteSpace: "nowrap" }}>{task.done ? "Done" : task.source === "intake" ? "Order" : "Job"}</span>
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
  orderCostings,
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
  orderCostings?: OrderCostingContext;
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
      orderCostings={orderCostings}
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
  const isNarrow = useIsNarrow(760);
  const options: Array<{ id: PersonFilter; label: string; sublabel: string }> = [
    { id: "all", label: "All", sublabel: `${todayCounts.nick + todayCounts.dylan} tasks today` },
    { id: "nick", label: "Nick", sublabel: `${todayCounts.nick} tasks today` },
    { id: "dylan", label: "Dylan", sublabel: `${todayCounts.dylan} tasks today` },
  ];
  return (
    <div data-mobile-crew-pill="crew-filter" style={{ display: "flex", gap: isNarrow ? 0 : 5, flexWrap: isNarrow ? "nowrap" : "wrap", alignItems: "center", justifyContent: "flex-start", border: isNarrow ? `1px solid ${DT.border}` : 0, borderRadius: isNarrow ? 999 : 0, background: isNarrow ? "rgba(255,255,255,0.78)" : "transparent", padding: isNarrow ? 2 : 0, overflow: "hidden" }}>
      {options.map((option) => {
        const active = personFilter === option.id;
        return (
          <button
            type="button"
            key={option.id}
            aria-pressed={active}
            aria-label={`${option.label} crew filter, ${option.sublabel}`}
            onClick={() => onPersonFilterChange(option.id)}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: isNarrow ? 3 : 5, border: isNarrow ? 0 : `1px solid ${active ? "rgba(12,124,122,0.34)" : DT.border}`, background: active ? DT.tealSoft : isNarrow ? "transparent" : "rgba(255,255,255,0.72)", color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: isNarrow ? "5px 8px" : "6px 10px", fontFamily: DT.sans, cursor: "pointer", minHeight: isNarrow ? 30 : undefined, minWidth: isNarrow ? 0 : 112, flex: isNarrow ? "1 1 0" : undefined, textAlign: "center", whiteSpace: "nowrap", touchAction: "manipulation" }}
          >
            <span style={{ fontSize: isNarrow ? 11 : 11, fontWeight: 950, lineHeight: 1 }}>{option.label}</span>
            {!isNarrow && <span style={{ fontSize: 9, fontWeight: 850, lineHeight: 1, color: active ? DT.teal : DT.textFaint }}>{option.sublabel}</span>}
          </button>
        );
      })}
      {!isNarrow && historyControl}
    </div>
  );
}

function ProductionPlanModeToggle({ mode, onModeChange }: { mode: ProductionPlanMode; onModeChange: (mode: ProductionPlanMode) => void }) {
  const isNarrow = useIsNarrow(760);
  const options: Array<{ id: ProductionPlanMode; label: string; hint: string }> = [
    { id: "orderRows", label: "Orders", hint: "Order task view" },
    { id: "schedule", label: "Schedule board", hint: "Day / person capacity" },
  ];
  return (
    <div data-mobile-production-actions="workshop-primary-actions" aria-label="Production plan view" style={{ display: "flex", gap: 3, padding: isNarrow ? 2 : 3, border: `1px solid ${DT.border}`, borderRadius: 999, background: "rgba(255,255,255,0.76)", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", width: isNarrow ? "100%" : undefined }}>
      {options.map((option) => {
        const active = mode === option.id;
        return (
          <button key={option.id} type="button" aria-pressed={active} onClick={() => onModeChange(option.id)} title={option.hint} style={{ border: 0, borderRadius: 999, minHeight: isNarrow ? 30 : undefined, padding: isNarrow ? "5px 8px" : "7px 10px", background: active ? DT.tealSoft : "transparent", color: active ? DT.teal : DT.textMuted, fontFamily: DT.sans, fontSize: isNarrow ? 11 : 11, fontWeight: 950, cursor: "pointer", flex: isNarrow ? "1 1 0" : undefined, touchAction: "manipulation" }}>
            {option.id === "schedule" ? <><span className="plan-schedule-mobile-label">Schedule</span><span className="plan-schedule-desktop-label">{option.label}</span></> : option.label}
          </button>
        );
      })}
    </div>
  );
}

function processTemplateIssueStyle(level: ProcessTemplateIssueLevel): CSSProperties {
  if (level === "aligned") return { borderColor: "rgba(12,124,122,0.22)", background: "rgba(12,124,122,0.08)", color: DT.teal };
  if (level === "gap") return { borderColor: "rgba(161,31,31,0.22)", background: "rgba(161,31,31,0.07)", color: "#a11f1f" };
  return { borderColor: "rgba(190,137,24,0.24)", background: "rgba(255,246,199,0.72)", color: "#9a6a14" };
}

const PROCESS_TEMPLATE_ISSUE_OPTIONS: ProcessTemplateIssueLevel[] = ["aligned", "watch", "gap"];
const PROCESS_TEMPLATE_ISSUE_LABELS: Record<ProcessTemplateIssueLevel, string> = {
  aligned: "Ready",
  watch: "Review",
  gap: "Gap",
};
const PROCESS_TEMPLATE_ISSUE_HINTS: Record<ProcessTemplateIssueLevel, string> = {
  aligned: "Ready: the suggested tasks and order-detail flow are aligned enough to trust.",
  watch: "Review: usable, but Guido should check details before trusting it fully.",
  gap: "Gap: missing route logic or workflow detail before this should be trusted.",
};
const PROCESS_TEMPLATE_OWNER_OPTIONS = ["Nick", "Dylan", "Guido", "Other"] as const;
const PROCESS_TEMPLATE_WHO_OPTIONS = ["Workshop", "Guido", "Nick", "Dylan", "Customer follow-up", ""] as const;

function processTemplateInputStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    width: "100%",
    minWidth: 0,
    border: `1px solid ${DT.border}`,
    borderRadius: 10,
    background: "rgba(255,255,255,0.88)",
    color: DT.textPrimary,
    fontFamily: DT.sans,
    fontSize: 11,
    fontWeight: 850,
    minHeight: 40,
    padding: "5px 7px",
    outline: "none",
    lineHeight: 1.15,
    boxSizing: "border-box",
    ...extra,
  };
}

function processTemplateTextareaStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    ...processTemplateInputStyle({
      minHeight: 56,
      padding: "8px 9px",
      lineHeight: 1.28,
      resize: "vertical",
      overflow: "auto",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
    }),
    ...extra,
  };
}

function processTemplateTinyButtonStyle(tone: "neutral" | "danger" | "primary" = "neutral"): CSSProperties {
  const danger = tone === "danger";
  const primary = tone === "primary";
  return {
    border: `1px solid ${danger ? "rgba(161,31,31,0.22)" : primary ? "rgba(12,124,122,0.28)" : DT.border}`,
    background: danger ? "rgba(161,31,31,0.06)" : primary ? DT.tealSoft : "rgba(255,255,255,0.74)",
    color: danger ? "#a11f1f" : primary ? DT.teal : DT.textMuted,
    borderRadius: 999,
    minHeight: 40,
    padding: "8px 10px",
    fontFamily: DT.sans,
    fontSize: 10,
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
    lineHeight: 1.05,
  };
}

function processTemplateActionGroupStyle(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 4,
    justifyContent: "stretch",
    minWidth: 0,
  };
}

function processTemplateColumnStyle(tone: "logic" | "tasks" | "flow"): CSSProperties {
  const tones = {
    logic: {
      background: "rgba(255,255,255,0.62)",
      border: DT.border,
      stripe: "rgba(126,117,103,0.32)",
    },
    tasks: {
      background: "rgba(231,243,242,0.42)",
      border: "rgba(12,124,122,0.18)",
      stripe: "rgba(12,124,122,0.48)",
    },
    flow: {
      background: "rgba(255,246,199,0.32)",
      border: "rgba(190,137,24,0.20)",
      stripe: "rgba(190,137,24,0.45)",
    },
  }[tone];
  return {
    minWidth: 0,
    border: `1px solid ${tones.border}`,
    borderLeft: `4px solid ${tones.stripe}`,
    background: tones.background,
    borderRadius: 12,
    padding: 10,
    boxSizing: "border-box",
  };
}

function processTemplateStepKey(label: string, index: number) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `step-${index + 1}`;
}

function processTemplatePathRowId(index: number) {
  return `process-path-row-${index}`;
}

type ProcessTemplatePathRow = {
  id: string;
  task: ProcessTemplatePreview["suggestedTasks"][number] | undefined;
  step: ProductionStep | undefined;
};

function SortableProcessTemplatePathRow({
  row,
  index,
  rowCount,
  onUpdateTask,
  onUpdateStep,
  onMove,
  onDelete,
}: {
  row: ProcessTemplatePathRow;
  index: number;
  rowCount: number;
  onUpdateTask: (index: number, patch: Partial<ProcessTemplatePreview["suggestedTasks"][number]>) => void;
  onUpdateStep: (index: number, patch: Partial<ProductionStep>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { type: "process-template-path-row" },
  });
  const { task, step } = row;
  const pathWait = Boolean(step?.wait);
  return (
    <div
      ref={setNodeRef}
      key={row.id}
      data-process-template-row="path"
      style={{ display: "grid", gridTemplateColumns: "54px minmax(132px, 1.05fr) minmax(82px, 0.48fr) 60px minmax(132px, 0.9fr) minmax(90px, 0.48fr) 86px minmax(84px, 0.5fr) 112px", gap: 5, alignItems: "start", border: `1px solid ${isDragging ? "rgba(12,124,122,0.38)" : pathWait ? "rgba(190,137,24,0.22)" : "rgba(12,124,122,0.16)"}`, borderRadius: 9, padding: "5px 6px", background: isDragging ? "rgba(237,248,247,0.96)" : pathWait ? "rgba(255,246,199,0.46)" : "rgba(255,255,255,0.88)", boxSizing: "border-box", transform: CSS.Transform.toString(transform), transition, boxShadow: isDragging ? "0 12px 26px rgba(37,30,20,0.14)" : undefined, opacity: isDragging ? 0.9 : 1 }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag production path row ${index + 1}`}
        title="Drag to reorder"
        style={{ display: "grid", gridTemplateColumns: "1fr", alignItems: "center", gap: 2, minHeight: 40, borderRadius: 999, border: "1px solid rgba(12,124,122,0.20)", background: pathWait ? "rgba(255,246,199,0.72)" : DT.tealSoft, color: pathWait ? "#9a6a14" : DT.teal, fontFamily: DT.sans, fontSize: 9, fontWeight: 950, cursor: isDragging ? "grabbing" : "grab", touchAction: "none", padding: "5px 6px" }}
      >
        <span aria-hidden="true" style={{ color: DT.textMuted, fontSize: 7, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>Drag</span>
        <span>{index + 1}</span>
      </button>
      <textarea aria-label={`Production path ${index + 1} task`} value={task?.title || ""} placeholder="Scheduled task" rows={2} onChange={(event) => onUpdateTask(index, { title: event.target.value })} style={processTemplateTextareaStyle()} />
      <select aria-label={`Production path ${index + 1} task owner`} value={task?.owner || "Guido"} onChange={(event) => onUpdateTask(index, { owner: event.target.value as ProcessTemplatePreview["suggestedTasks"][number]["owner"] })} style={processTemplateInputStyle()}>
        {PROCESS_TEMPLATE_OWNER_OPTIONS.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
      </select>
      <input aria-label={`Production path ${index + 1} hours`} type="number" min={0} step={0.25} value={task?.estimatedHours ?? 0} onChange={(event) => onUpdateTask(index, { estimatedHours: Number(event.target.value) })} style={processTemplateInputStyle()} />
      <textarea aria-label={`Production path ${index + 1} flow stage`} value={step?.label || ""} placeholder="Visible flow stage" rows={2} onChange={(event) => onUpdateStep(index, { label: event.target.value, key: processTemplateStepKey(event.target.value, index) })} style={processTemplateTextareaStyle({ background: "rgba(255,253,249,0.94)" })} />
      <select aria-label={`Production path ${index + 1} flow owner`} value={step?.who || ""} onChange={(event) => onUpdateStep(index, { who: event.target.value || null })} style={processTemplateInputStyle()}>
        {PROCESS_TEMPLATE_WHO_OPTIONS.map((who) => <option key={who || "none"} value={who}>{who || "No owner"}</option>)}
      </select>
      <label style={{ position: "relative", minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, color: DT.textMuted, fontSize: 9, fontWeight: 950, cursor: "pointer", touchAction: "manipulation" }}>
        <input type="checkbox" checked={pathWait} onChange={(event) => onUpdateStep(index, { wait: event.target.checked })} style={{ position: "absolute", opacity: 0, width: 1, height: 1, margin: 0, pointerEvents: "none" }} />
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${pathWait ? "rgba(154,106,20,0.40)" : "rgba(12,124,122,0.28)"}`, background: pathWait ? "rgba(255,246,199,0.82)" : "rgba(255,255,255,0.82)", color: pathWait ? "#9a6a14" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, lineHeight: 1, fontWeight: 950, flex: "0 0 auto" }}>{pathWait ? "✓" : ""}</span>
        Supplier wait
      </label>
      <input aria-label={`Production path ${index + 1} wait label`} value={step?.waitLabel || ""} placeholder="Wait label" onChange={(event) => onUpdateStep(index, { waitLabel: event.target.value || undefined })} style={processTemplateInputStyle({ color: DT.textMuted })} />
      <div style={processTemplateActionGroupStyle()}>
        <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} style={processTemplateTinyButtonStyle()} aria-label={`Move production path row ${index + 1} up`} title="Move up">Up</button>
        <button type="button" onClick={() => onMove(index, 1)} disabled={index === rowCount - 1} style={processTemplateTinyButtonStyle()} aria-label={`Move production path row ${index + 1} down`} title="Move down">Dn</button>
        <button type="button" onClick={() => onDelete(index)} style={processTemplateTinyButtonStyle("danger")} aria-label={`Delete production path row ${index + 1}`} title="Delete">Del</button>
      </div>
      <textarea aria-label={`Production path ${index + 1} note`} value={task?.note || ""} placeholder="Task note" rows={2} onChange={(event) => onUpdateTask(index, { note: event.target.value })} style={{ ...processTemplateTextareaStyle({ color: DT.textMuted, minHeight: 54 }), gridColumn: "2 / span 4" }} />
      <div style={{ gridColumn: "6 / span 3", fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, fontWeight: 850, lineHeight: 1.25, overflow: "visible", textOverflow: "clip", whiteSpace: "normal", overflowWrap: "anywhere" }}>
        {task?.title && step?.label && task.title.toLowerCase() !== step.label.toLowerCase() ? `Shows as ${step.label} in the order flow` : "Task and visible flow stage are aligned"}
      </div>
    </div>
  );
}

function ProcessTemplatePathEditor({
  tasks,
  steps,
  onTasksChange,
  onStepsChange,
}: {
  tasks: ProcessTemplatePreview["suggestedTasks"];
  steps: ProductionStep[];
  onTasksChange: (tasks: ProcessTemplatePreview["suggestedTasks"]) => void;
  onStepsChange: (steps: ProductionStep[]) => void;
}) {
  const rowCount = Math.max(tasks.length, steps.length);
  const rows = Array.from({ length: rowCount }, (_, index) => ({ id: processTemplatePathRowId(index), task: tasks[index], step: steps[index] }));
  const rowIds = rows.map((row) => row.id);
  const pathSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const defaultTask = (index: number): ProcessTemplatePreview["suggestedTasks"][number] => ({
    title: steps[index]?.label || "New task",
    owner: "Guido",
    estimatedHours: 0.5,
  });
  const defaultStep = (index: number): ProductionStep => ({
    key: processTemplateStepKey(tasks[index]?.title || `Step ${index + 1}`, index),
    label: tasks[index]?.title || "New flow step",
    who: tasks[index]?.owner === "Guido" ? "Guido" : "Workshop",
    wait: false,
  });
  const updateTask = (index: number, patch: Partial<ProcessTemplatePreview["suggestedTasks"][number]>) => {
    const next = [...tasks];
    next[index] = { ...(next[index] ?? defaultTask(index)), ...patch };
    onTasksChange(next);
  };
  const updateStep = (index: number, patch: Partial<ProductionStep>) => {
    const next = [...steps];
    next[index] = { ...(next[index] ?? defaultStep(index)), ...patch };
    onStepsChange(next);
  };
  const reorderPathRow = (index: number, direction: -1 | 1) => {
    const nextRows = arrayMove(rows, index, index + direction);
    onTasksChange(nextRows.flatMap((row) => row.task ? [row.task] : []));
    onStepsChange(nextRows.flatMap((row) => row.step ? [row.step] : []));
  };
  const handlePathDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    const from = rows.findIndex((row) => row.id === activeId);
    const to = rows.findIndex((row) => row.id === overId);
    if (from < 0 || to < 0) return;
    const nextRows = arrayMove(rows, from, to);
    onTasksChange(nextRows.flatMap((row) => row.task ? [row.task] : []));
    onStepsChange(nextRows.flatMap((row) => row.step ? [row.step] : []));
  };
  const deletePathRow = (index: number) => {
    onTasksChange(tasks.filter((_, taskIndex) => taskIndex !== index));
    onStepsChange(steps.filter((_, stepIndex) => stepIndex !== index));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {rowCount > 0 && (
        <div
          data-process-template-row="path-header"
          style={{ display: "grid", gridTemplateColumns: "54px minmax(132px, 1.05fr) minmax(82px, 0.48fr) 60px minmax(132px, 0.9fr) minmax(90px, 0.48fr) 86px minmax(84px, 0.5fr) 112px", gap: 5, alignItems: "end", padding: "0 6px 2px", boxSizing: "border-box", fontFamily: DT.sans, fontSize: 8.5, lineHeight: 1.1, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", color: DT.textFaint }}
        >
          <span>Drag</span>
          <span>Task to schedule</span>
          <span>Who does it</span>
          <span>Hours</span>
          <span>Stage shown on order</span>
          <span>Stage owner</span>
          <span>Supplier wait?</span>
          <span>Wait time</span>
          <span>Move / delete</span>
        </div>
      )}
      {rowCount === 0 && (
        <div style={{ border: "1px dashed rgba(161,31,31,0.26)", background: "rgba(161,31,31,0.04)", color: "#a11f1f", borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 900 }}>
          No production path yet
        </div>
      )}
      <DndContext id="process-template-path" sensors={pathSensors} collisionDetection={closestCorners} onDragEnd={handlePathDragEnd}>
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {rows.map((row, index) => (
            <SortableProcessTemplatePathRow
              key={row.id}
              row={row}
              index={index}
              rowCount={rowCount}
              onUpdateTask={updateTask}
              onUpdateStep={updateStep}
              onMove={reorderPathRow}
              onDelete={deletePathRow}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => {
          onTasksChange([...tasks, { title: "New task", owner: "Guido", estimatedHours: 0.5 }]);
          onStepsChange([...steps, { key: `step-${steps.length + 1}`, label: "New flow step", who: "Workshop", wait: false }]);
        }}
        style={processTemplateTinyButtonStyle("primary")}
      >
        Add path row
      </button>
    </div>
  );
}

function processTemplateRowCount(template: ProcessTemplatePreview) {
  return Math.max(template.suggestedTasks.length, template.orderFlow.length);
}

function processTemplateTotalHours(template: ProcessTemplatePreview) {
  return template.suggestedTasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);
}

function ProcessTemplateSummaryChip({ label }: { label: string }) {
  return (
    <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.74)", color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1 }}>
      {label}
    </span>
  );
}

function ProcessTemplateCard({
  template,
  templateIndex,
  isNarrow,
  expanded,
  onExpand,
  updateTemplate,
}: {
  template: ProcessTemplatePreview;
  templateIndex: number;
  isNarrow: boolean;
  expanded: boolean;
  onExpand: () => void;
  updateTemplate: (index: number, updater: (template: ProcessTemplatePreview) => ProcessTemplatePreview) => void;
}) {
  const showEditor = !isNarrow || expanded;
  const rowCount = processTemplateRowCount(template);
  const totalHours = processTemplateTotalHours(template);
  const waitCount = template.orderFlow.filter((step) => step.wait).length;
  const summaryLabel = `${rowCount} ${rowCount === 1 ? "step" : "steps"}`;
  const titleRows = template.title.length > 26 ? 2 : 1;
  return (
    <article
      key={template.id}
      data-process-template-card="true"
      data-process-template-expanded={expanded ? "true" : "false"}
      style={{ border: `1px solid ${expanded || !isNarrow ? DT.border : "rgba(12,124,122,0.18)"}`, borderRadius: DT.radius, background: DT.cardBg, boxShadow: DT.shadow, padding: isNarrow ? 10 : 12, display: "grid", gridTemplateColumns: showEditor ? "minmax(280px, 0.46fr) minmax(620px, 1fr)" : "1fr", gap: isNarrow ? 8 : 16, alignItems: "start" }}
    >
      <div style={processTemplateColumnStyle("logic")}>
        <div style={{ display: isNarrow ? "grid" : "flex", gridTemplateColumns: isNarrow ? "1fr" : undefined, gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          {isNarrow && !showEditor ? (
            <div title={template.title} style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 10, background: "rgba(255,255,255,0.88)", color: DT.textPrimary, fontFamily: DT.serif, fontSize: 18, lineHeight: 1.08, letterSpacing: "-0.03em", fontWeight: 850, padding: "11px 12px", overflowWrap: "anywhere" }}>
              {template.title}
            </div>
          ) : isNarrow ? (
            <textarea aria-label={`${template.title} template title`} value={template.title} onChange={(event) => updateTemplate(templateIndex, (item) => ({ ...item, title: event.target.value }))} rows={titleRows} style={processTemplateInputStyle({ fontFamily: DT.serif, fontSize: 18, lineHeight: 1.08, letterSpacing: "-0.03em", fontWeight: 850, padding: "9px 10px", resize: "vertical", minHeight: titleRows > 1 ? 76 : 54 })} />
          ) : (
            <input aria-label={`${template.title} template title`} value={template.title} onChange={(event) => updateTemplate(templateIndex, (item) => ({ ...item, title: event.target.value }))} style={processTemplateInputStyle({ fontFamily: DT.serif, fontSize: 20, lineHeight: 1.02, letterSpacing: "-0.03em", fontWeight: 850, padding: "5px 7px", flex: "1 1 164px" })} />
          )}
          <select aria-label={`${template.title} readiness`} title={PROCESS_TEMPLATE_ISSUE_HINTS[template.issueLevel]} value={template.issueLevel} onChange={(event) => updateTemplate(templateIndex, (item) => ({ ...item, issueLevel: event.target.value as ProcessTemplateIssueLevel }))} style={{ ...processTemplateInputStyle({ width: isNarrow ? "100%" : 110, flex: isNarrow ? undefined : "0 0 110px" }), ...processTemplateIssueStyle(template.issueLevel) }}>
            {PROCESS_TEMPLATE_ISSUE_OPTIONS.map((level) => <option key={level} value={level}>{PROCESS_TEMPLATE_ISSUE_LABELS[level]}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
          <ProcessTemplateSummaryChip label={summaryLabel} />
          <ProcessTemplateSummaryChip label={`${totalHours.toLocaleString("en-NZ", { maximumFractionDigits: 1 })}h`} />
          <ProcessTemplateSummaryChip label={`${template.detection.length} rules`} />
          {waitCount ? <ProcessTemplateSummaryChip label={`${waitCount} waits`} /> : null}
          <ProcessTemplateSummaryChip label={PROCESS_TEMPLATE_ISSUE_LABELS[template.issueLevel]} />
        </div>
        {isNarrow ? (
          <textarea aria-label={`${template.title} issue label`} value={template.issueLabel} onChange={(event) => updateTemplate(templateIndex, (item) => ({ ...item, issueLabel: event.target.value }))} rows={2} style={processTemplateInputStyle({ marginTop: 5, fontSize: 10, lineHeight: 1.25, minHeight: 58, resize: "vertical" })} />
        ) : (
          <input aria-label={`${template.title} issue label`} value={template.issueLabel} onChange={(event) => updateTemplate(templateIndex, (item) => ({ ...item, issueLabel: event.target.value }))} style={processTemplateInputStyle({ marginTop: 5, fontSize: 10 })} />
        )}
        {showEditor ? (
          <>
            <textarea aria-label={`${template.title} description`} value={template.subtitle} onChange={(event) => updateTemplate(templateIndex, (item) => ({ ...item, subtitle: event.target.value }))} rows={isNarrow ? 3 : 2} style={processTemplateInputStyle({ margin: "5px 0 8px", minHeight: isNarrow ? 74 : 44, resize: "vertical", color: DT.textMuted, lineHeight: 1.25, overflow: "auto" })} />
            <div title="Rules Tuesday uses to decide when this process template applies." style={{ marginBottom: 5, fontSize: 9, fontWeight: 950, letterSpacing: "0.10em", textTransform: "uppercase", color: DT.textFaint }}>Matching rules</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {template.detection.map((rule, ruleIndex) => (
                <div key={`detection-row-${ruleIndex}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 48px", gap: 6, alignItems: "start" }}>
                  <textarea aria-label={`${template.title} matching rule ${ruleIndex + 1}`} value={rule} onChange={(event) => updateTemplate(templateIndex, (item) => ({ ...item, detection: item.detection.map((current, index) => index === ruleIndex ? event.target.value : current) }))} rows={isNarrow ? 3 : 2} style={processTemplateInputStyle({ background: "rgba(245,243,238,0.65)", color: DT.textSecondary, fontSize: 10, minHeight: isNarrow ? 74 : 44, lineHeight: 1.22, resize: "vertical", overflow: "auto" })} />
                  <button type="button" onClick={() => updateTemplate(templateIndex, (item) => ({ ...item, detection: item.detection.filter((_, index) => index !== ruleIndex) }))} style={processTemplateTinyButtonStyle("danger")}>Del</button>
                </div>
              ))}
              <button type="button" onClick={() => updateTemplate(templateIndex, (item) => ({ ...item, detection: [...item.detection, "New rule"] }))} style={processTemplateTinyButtonStyle("primary")}>Add rule</button>
            </div>
          </>
        ) : (
          <p style={{ margin: "7px 0 0", fontFamily: DT.sans, color: DT.textMuted, fontSize: 11, lineHeight: 1.35 }}>{template.subtitle}</p>
        )}
        {isNarrow && (
          <button type="button" onClick={onExpand} aria-expanded={expanded} style={{ ...processTemplateTinyButtonStyle(expanded ? "neutral" : "primary"), width: "100%", marginTop: 8 }}>
            {expanded ? "Editor open" : "Edit path and rules"}
          </button>
        )}
      </div>
      {showEditor && (
        <div style={{ ...processTemplateColumnStyle("tasks"), overflowX: "auto" }}>
          <div style={{ marginBottom: 7, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, fontWeight: 950, letterSpacing: "0.10em", textTransform: "uppercase", color: DT.textFaint }}>Production path</div>
            <div style={{ fontSize: 9, fontWeight: 850, color: DT.textMuted }}>One row links the scheduled task to the visible order-flow stage.</div>
          </div>
          <ProcessTemplatePathEditor
            tasks={template.suggestedTasks}
            steps={template.orderFlow}
            onTasksChange={(suggestedTasks) => updateTemplate(templateIndex, (item) => ({ ...item, suggestedTasks }))}
            onStepsChange={(orderFlow) => updateTemplate(templateIndex, (item) => ({ ...item, orderFlow }))}
          />
        </div>
      )}
    </article>
  );
}

function ProcessTemplatesView() {
  const [templates, setTemplates] = useState<ProcessTemplatePreview[]>(DEFAULT_PROCESS_TEMPLATE_PREVIEWS);
  const [dirty, setDirty] = useState(false);
  const [source, setSource] = useState<"loading" | "file" | "defaults" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<string>("Loading saved templates...");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const isNarrow = useIsNarrow(760);
  const changeVersionRef = useRef(0);
  useEffect(() => {
    let active = true;
    fetch("/api/production/process-templates", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Process template load failed");
        if (!active) return;
        const nextTemplates: ProcessTemplatePreview[] = Array.isArray(body.templates) ? body.templates as ProcessTemplatePreview[] : DEFAULT_PROCESS_TEMPLATE_PREVIEWS;
        setTemplates(nextTemplates);
        setExpandedTemplateId((current) => current && nextTemplates.some((template) => template.id === current) ? current : null);
        setSource(body.source === "file" ? "file" : "defaults");
        setSaveStatus(body.updatedAt ? `Saved ${new Date(body.updatedAt).toLocaleString("en-NZ")}` : "Using built-in defaults");
      })
      .catch((err) => {
        if (!active) return;
        setSource("error");
        setSaveStatus(err instanceof Error ? err.message : "Process template load failed");
      });
    return () => {
      active = false;
    };
  }, []);
  const persistTemplates = useCallback(async (
    nextTemplates: ProcessTemplatePreview[],
    options: { mode: "manual" | "auto"; resetToDefaults?: boolean; version?: number }
  ) => {
    setSaveStatus(options.resetToDefaults ? "Resetting..." : options.mode === "auto" ? "Autosaving..." : "Saving...");
    const response = await fetch("/api/production/process-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.resetToDefaults ? { resetToDefaults: true } : { templates: nextTemplates }),
    });
    const body = await response.json();
    if (!response.ok) {
      setSaveStatus(body.error || (options.mode === "auto" ? "Autosave failed" : "Save failed"));
      return;
    }
    const savedAt = body.updatedAt ? `Saved ${new Date(body.updatedAt).toLocaleString("en-NZ")}` : "Saved";
    if (options.resetToDefaults) {
      const nextTemplates: ProcessTemplatePreview[] = Array.isArray(body.templates) ? body.templates as ProcessTemplatePreview[] : DEFAULT_PROCESS_TEMPLATE_PREVIEWS;
      setTemplates(nextTemplates);
      changeVersionRef.current += 1;
      setDirty(false);
      setSource("file");
      setSaveStatus(savedAt);
      setExpandedTemplateId(null);
      return;
    }
    if (options.mode === "manual" || options.version === changeVersionRef.current) {
      setDirty(false);
      setSource("file");
      setSaveStatus(options.mode === "auto" ? `${savedAt} automatically` : savedAt);
    }
  }, []);
  const updateTemplate = (index: number, updater: (template: ProcessTemplatePreview) => ProcessTemplatePreview) => {
    changeVersionRef.current += 1;
    setTemplates((current) => current.map((template, templateIndex) => templateIndex === index ? updater(template) : template));
    setDirty(true);
    setSaveStatus("Unsaved changes - autosave pending");
  };
  const saveTemplates = async (resetToDefaults = false) => {
    await persistTemplates(templates, { mode: "manual", resetToDefaults });
  };
  useEffect(() => {
    if (!dirty || source === "loading") return undefined;
    const version = changeVersionRef.current;
    const id = window.setTimeout(() => {
      void persistTemplates(templates, { mode: "auto", version });
    }, 900);
    return () => window.clearTimeout(id);
  }, [dirty, persistTemplates, source, templates]);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        [data-process-template-row] input,
        [data-process-template-row] select {
          min-width: 0;
        }
        @media (max-width: 980px) {
          [data-process-template-row="path-header"] {
            display: none !important;
          }
          [data-process-template-card] {
            grid-template-columns: 1fr !important;
          }
          [data-process-template-row] {
            grid-template-columns: 26px minmax(0, 1fr) !important;
          }
          [data-process-template-row] > * {
            grid-column: 2 / -1 !important;
          }
          [data-process-template-row] > span:first-child {
            grid-column: 1 !important;
            grid-row: 1 !important;
          }
          [data-process-template-row] > div:last-child {
            justify-content: flex-start !important;
          }
        }
        @media (min-width: 981px) and (max-width: 1320px) {
          [data-process-template-card] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div style={{ border: `1px solid ${DT.border}`, borderRadius: DT.radius, background: DT.cardBg, boxShadow: DT.shadow, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 950, letterSpacing: "0.10em", textTransform: "uppercase", color: DT.teal }}>Guido</div>
          <h2 style={{ margin: "2px 0 0", fontFamily: DT.serif, fontSize: 28, lineHeight: 1.02, letterSpacing: "-0.04em", color: DT.textPrimary }}>Process templates</h2>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
          <span style={{ border: "1px solid rgba(12,124,122,0.22)", background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "5px 8px", fontSize: 10, fontWeight: 950 }}>{dirty ? "Autosave pending" : source === "loading" ? "Loading" : "Autosaves on edit"}</span>
          <span title={saveStatus} style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.70)", color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontSize: 10, fontWeight: 900 }}>{saveStatus}</span>
          <button type="button" onClick={() => void saveTemplates(false)} style={processTemplateTinyButtonStyle("primary")}>Save</button>
          <button type="button" onClick={() => void saveTemplates(true)} style={processTemplateTinyButtonStyle()}>Reset</button>
        </div>
      </div>
      {templates.map((template, templateIndex) => (
        <ProcessTemplateCard
          key={template.id}
          template={template}
          templateIndex={templateIndex}
          isNarrow={isNarrow}
          expanded={!isNarrow || expandedTemplateId === template.id}
          onExpand={() => setExpandedTemplateId(template.id)}
          updateTemplate={updateTemplate}
        />
      ))}
      <button
        type="button"
        onClick={() => {
          const newTemplateId = `template-${templates.length + 1}`;
          changeVersionRef.current += 1;
          setTemplates((current) => [...current, { id: newTemplateId, title: "New template", subtitle: "Describe when this process applies.", detection: ["New detection rule"], suggestedTasks: [{ title: "Order Loaded", owner: "Guido", estimatedHours: 1 }], orderFlow: [], issueLevel: "watch", issueLabel: "Needs review" }]);
          setExpandedTemplateId(newTemplateId);
          setDirty(true);
          setSaveStatus("Unsaved changes - autosave pending");
        }}
        style={{ ...processTemplateTinyButtonStyle("primary"), alignSelf: "flex-start", padding: "9px 12px" }}
      >
        Add template
      </button>
    </section>
  );
}

const ORDER_JOURNEY_MOBILE_CSS = `
  @media (max-width: 879px) {
    [data-process-template-card] {
      grid-template-columns: 1fr !important;
    }
    [data-mobile-workshop-header-controls="true"] {
      display: grid !important;
      grid-template-columns: 1fr !important;
      justify-content: stretch !important;
      width: 100% !important;
      min-width: 0 !important;
    }
    [data-mobile-production-actions="workshop-primary-actions"] {
      width: 100% !important;
    }
    [data-order-capacity-strip-mobile="true"] {
      display: grid !important;
    }
    [data-order-capacity-strip-desktop="true"] {
      display: none !important;
    }
    [data-order-row-week-grid] {
      grid-template-columns: 1fr !important;
    }
    [data-order-row-day-mobile-visible="false"],
    [data-order-row-drop-mobile-visible="false"] {
      display: none !important;
    }
    [data-order-row-mobile-day-header="true"] {
      display: flex !important;
    }
    [data-order-journey-empty-mobile="true"] {
      display: block !important;
    }
    [data-order-journey-section-label="true"] {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 2px !important;
    }
    [data-order-row-task-compact="true"] button {
      touch-action: manipulation !important;
    }
  }
  @media (min-width: 880px) {
    [data-order-capacity-strip-mobile="true"],
    [data-order-row-mobile-day-header="true"],
    [data-order-journey-empty-mobile="true"] {
      display: none !important;
    }
  }
`;

function OrderCapacityStrip({ rows, week, dayFilter, onDayFilterChange, isNarrow }: { rows: OrderJourneyRow[]; week: PlanWeek; dayFilter: OrderDayFilter; onDayFilterChange: (filter: OrderDayFilter) => void; isNarrow: boolean }) {
  const todayKey = currentDayKey();
  const tasksForDay = (day: DayKey) => rows.flatMap((row) => row.tasks).filter((task) => task.day === day);
  const hoursFor = (tasks: OrderJourneyTask[], person?: Person) => tasks.filter((task) => !person || task.person === person).reduce((sum, task) => sum + Number(task.estimatedHours || 1), 0);
  const compactControl = (label: string, active: boolean, onClick: () => void, disabled = false, disabledReason = "") => (
    <button type="button" aria-pressed={active} aria-label={`${label} order schedule filter${disabledReason ? ` - ${disabledReason}` : ""}`} disabled={disabled} onClick={onClick} style={{ minHeight: isNarrow ? 40 : undefined, border: `1px solid ${active ? "rgba(12,124,122,0.28)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.72)", color: disabled ? DT.textFaint : active ? DT.teal : DT.textMuted, borderRadius: 999, padding: isNarrow ? "8px 10px" : "5px 9px", fontFamily: DT.sans, fontSize: isNarrow ? 10 : 10, fontWeight: 950, cursor: disabled ? "not-allowed" : "pointer", lineHeight: 1.05, whiteSpace: "nowrap", touchAction: "manipulation" }}>{label}</button>
  );
  const dayGauge = (day: DayKey) => {
    const tasks = tasksForDay(day);
    const totalHours = hoursFor(tasks);
    const nickHours = hoursFor(tasks, "nick");
    const dylanHours = hoursFor(tasks, "dylan");
    const capacityHours = PEOPLE.length * 7;
    const ratio = Math.min(1, totalHours / capacityHours);
    const fillWidth = totalHours > 0 ? Math.max(8, Math.round(ratio * 100)) : 0;
    const color = totalHours > capacityHours ? "#9b2f22" : ratio >= 0.82 ? "#9a6a14" : ratio >= 0.45 ? "#6f7d38" : ratio > 0 ? DT.sage : "rgba(124,116,107,0.26)";
    const bg = totalHours > capacityHours ? "rgba(155,47,34,0.12)" : ratio >= 0.82 ? "rgba(200,169,110,0.16)" : ratio >= 0.45 ? "rgba(111,125,56,0.12)" : "rgba(110,138,106,0.10)";
    return { totalHours, nickHours, dylanHours, capacityHours, fillWidth, color, bg };
  };
  const daySummaries = DAYS.map((day) => ({ day, ...dayGauge(day) }));
  const busiestDay = daySummaries.reduce((best, current) => current.totalHours > best.totalHours ? current : best, daySummaries[0]);
  const mobileCapacitySummary = busiestDay && busiestDay.totalHours > 0
    ? `${DAY_LABELS[busiestDay.day].slice(0, 3)} busiest · ${formatTaskHours(busiestDay.totalHours)}`
    : "No scheduled hours yet";
  return (
    <>
      <details data-order-capacity-strip="orders-week-capacity" data-order-day-filter="orders-day-filter" data-mobile-capacity-strip="temperature-pill-row" data-order-capacity-strip-mobile="true" aria-hidden={!isNarrow} style={{ display: "none", border: `1px solid ${DT.border}`, borderRadius: 999, background: "rgba(255,255,255,0.72)", boxShadow: "0 1px 4px rgba(0,0,0,0.025)", overflow: "hidden" }}>
        <summary style={{ listStyle: "none", minHeight: 30, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 9px", cursor: "pointer", fontFamily: DT.sans }}>
          <span style={{ fontSize: 9.5, fontWeight: 950, color: DT.textMuted, whiteSpace: "nowrap" }}>Capacity</span>
          <span style={{ minWidth: 0, flex: "1 1 auto", textAlign: "right", fontSize: 9.5, fontWeight: 850, color: DT.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mobileCapacitySummary}</span>
          <span aria-hidden="true" style={{ fontSize: 10, fontWeight: 950, color: DT.teal }}>View</span>
        </summary>
        <div style={{ display: "grid", gap: 4, padding: "0 4px 4px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {compactControl("Week", dayFilter === "allWeek", () => onDayFilterChange("allWeek"))}
        {compactControl("Today", dayFilter === "today", () => onDayFilterChange("today"), !todayKey, "today is not a workshop weekday")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
        {DAYS.map((day) => {
          const option = suggestedDateOptionForWeekDay(week, day);
          const active = dayFilter === day;
          const gauge = dayGauge(day);
          const shortDate = option ? new Date(`${option.dateIso}T12:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }) : DAY_LABELS[day].slice(0, 3);
          return (
            <button key={day} type="button" aria-pressed={active} aria-label={`${option?.dateLabel ?? DAY_LABELS[day]} order schedule filter: ${formatTaskHours(gauge.totalHours)} scheduled, Nick ${formatTaskHours(gauge.nickHours)}, Dylan ${formatTaskHours(gauge.dylanHours)}`} onClick={() => onDayFilterChange(day)} title={`${option?.dateLabel ?? DAY_LABELS[day]}: ${formatTaskHours(gauge.totalHours)} scheduled. Nick ${formatTaskHours(gauge.nickHours)}, Dylan ${formatTaskHours(gauge.dylanHours)}.`} style={{ minWidth: 0, minHeight: 48, border: `1px solid ${active ? "rgba(12,124,122,0.30)" : DT.border}`, borderRadius: 10, background: active ? DT.tealSoft : gauge.bg, padding: "7px 4px 6px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, cursor: "pointer", overflow: "hidden", boxShadow: active ? "0 0 0 2px rgba(12,124,122,0.08)" : "none", touchAction: "manipulation" }}>
              <span style={{ fontFamily: DT.sans, fontSize: 8.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.02em", color: active ? DT.teal : DT.textMuted, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip" }}>{DAY_LABELS[day]}</span>
              <span style={{ fontFamily: DT.sans, fontSize: 8.5, fontWeight: 900, color: active ? DT.teal : DT.textFaint, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip" }}>{shortDate}</span>
              <span aria-hidden="true" style={{ height: 5, width: "100%", borderRadius: 999, background: "rgba(255,255,255,0.70)", overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)" }}>
                <span style={{ display: "block", width: `${gauge.fillWidth}%`, height: "100%", borderRadius: 999, background: gauge.color, transition: "width 160ms ease" }} />
              </span>
            </button>
          );
        })}
      </div>
      </div>
      </details>
      <div data-order-capacity-strip="orders-week-capacity" data-order-day-filter="orders-day-filter" data-order-capacity-strip-desktop="true" aria-hidden={isNarrow} style={{ display: "grid", gridTemplateColumns: "220px repeat(5, minmax(104px, 1fr))", border: `1px solid ${DT.border}`, borderRadius: DT.radius, background: "rgba(255,255,255,0.84)", boxShadow: DT.shadow, overflow: "hidden" }}>
      <div style={{ padding: 7, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", borderRight: `1px solid ${DT.border}` }}>
        <span style={{ width: "100%", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", color: DT.textFaint }}>Allocated capacity</span>
        {compactControl("Whole week", dayFilter === "allWeek", () => onDayFilterChange("allWeek"))}
        {compactControl("Today only", dayFilter === "today", () => onDayFilterChange("today"), !todayKey, "today is not a workshop weekday")}
      </div>
      {DAYS.map((day) => {
        const option = suggestedDateOptionForWeekDay(week, day);
        const active = dayFilter === day;
        const gauge = dayGauge(day);
        return (
          <button key={day} type="button" aria-pressed={active} aria-label={`${option?.dateLabel ?? DAY_LABELS[day]} order schedule filter: ${formatTaskHours(gauge.totalHours)} scheduled, Nick ${formatTaskHours(gauge.nickHours)}, Dylan ${formatTaskHours(gauge.dylanHours)}`} onClick={() => onDayFilterChange(day)} title={`${option?.dateLabel ?? DAY_LABELS[day]}: ${formatTaskHours(gauge.totalHours)} scheduled. Nick ${formatTaskHours(gauge.nickHours)}, Dylan ${formatTaskHours(gauge.dylanHours)}.`} style={{ minWidth: 0, border: 0, borderLeft: day === "monday" ? "none" : `1px solid ${DT.border}`, background: active ? DT.tealSoft : "rgba(247,249,248,0.62)", padding: "7px 8px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, cursor: "pointer", overflow: "hidden" }}>
            <span style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: active ? DT.teal : DT.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{option ? option.dateLabel.replace(/^\w+,\s*/, "") : DAY_LABELS[day]}</span>
            <span aria-hidden="true" style={{ height: 7, width: "100%", borderRadius: 999, background: gauge.bg, overflow: "hidden", boxShadow: active ? "0 0 0 1px rgba(12,124,122,0.18)" : "inset 0 0 0 1px rgba(0,0,0,0.04)" }}>
              <span style={{ display: "block", width: `${gauge.fillWidth}%`, height: "100%", borderRadius: 999, background: gauge.color, transition: "width 160ms ease" }} />
            </span>
          </button>
        );
      })}
      </div>
    </>
  );
}

function OrderJourneyDayDropCell({
  id,
  rowId,
  weekId,
  day,
  children,
  style,
  hasTasks,
  mobileVisible,
}: {
  id: string;
  rowId: string;
  weekId: string;
  day: DayKey;
  children: ReactNode;
  style: CSSProperties;
  hasTasks?: boolean;
  mobileVisible?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id, data: { type: "order-journey-day", rowId, weekId, day } });
  return (
    <div ref={setNodeRef} data-order-row-day-drop-cell="order-row-day-drop-cell" data-order-row-drop-id={id} data-order-row-day={day} data-order-row-day-has-tasks={hasTasks ? "true" : "false"} data-order-row-day-mobile-visible={mobileVisible ? "true" : "false"} style={style}>
      {children}
    </div>
  );
}

function OrderJourneyDropLane({
  id,
  day,
  person,
  dateIso,
  dateLabel,
  items,
  isDropTarget,
  dragActive,
  children,
  mobileVisible = true,
  compactMobile = false,
}: {
  id: string;
  day: DayKey;
  person: Person;
  dateIso?: string;
  dateLabel?: string;
  items: string[];
  isDropTarget: boolean;
  dragActive: boolean;
  children: ReactNode;
  mobileVisible?: boolean;
  compactMobile?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id, data: { type: "order-journey-lane", day, person, dateIso, dateLabel } });
  const personVisual = PERSON_VISUALS[person];
  const hasItems = items.length > 0;
  const readyBorder = dragActive ? "rgba(12,124,122,0.26)" : personVisual.laneBorder;
  const readyBackground = dragActive
    ? "linear-gradient(135deg, rgba(12,124,122,0.055), rgba(255,255,255,0.82))"
    : `linear-gradient(135deg, ${personVisual.laneBg}, rgba(255,255,255,0.82))`;
  return (
    <div
      ref={setNodeRef}
      data-order-row-drop-lane="order-row-drop-lane"
      data-order-row-drop-id={id}
      data-order-row-drop-person={person}
      data-order-row-drop-active={isDropTarget ? "true" : "false"}
      data-order-row-drop-has-items={hasItems ? "true" : "false"}
      data-order-row-drop-mobile-visible={mobileVisible ? "true" : "false"}
      style={{ minHeight: compactMobile ? 0 : hasItems || isDropTarget ? 58 : 31, boxSizing: "border-box", display: "flex", flexDirection: "column", borderWidth: compactMobile ? "0 0 0 2px" : "1px 1px 1px 3px", borderStyle: compactMobile ? "solid" : isDropTarget ? "solid solid solid solid" : "dashed dashed dashed solid", borderColor: compactMobile ? (isDropTarget ? DT.teal : personVisual.stripe) : `${isDropTarget ? "rgba(12,124,122,0.58)" : readyBorder} ${isDropTarget ? "rgba(12,124,122,0.58)" : readyBorder} ${isDropTarget ? "rgba(12,124,122,0.58)" : readyBorder} ${isDropTarget ? DT.teal : personVisual.stripe}`, borderRadius: compactMobile ? 5 : 10, background: compactMobile ? "transparent" : isDropTarget ? "rgba(12,124,122,0.12)" : hasItems ? readyBackground : "rgba(255,255,255,0.42)", padding: compactMobile ? "0 0 0 4px" : hasItems || isDropTarget ? 6 : "5px 6px", transition: "background 150ms ease, border-color 150ms ease, box-shadow 150ms ease", boxShadow: compactMobile ? undefined : isDropTarget ? "inset 0 0 0 1px rgba(12,124,122,0.12), 0 8px 18px rgba(12,124,122,0.10)" : hasItems ? "inset 0 0 0 1px rgba(255,255,255,0.42)" : undefined }}
    >
      <div data-order-row-lane-header="true" style={{ marginBottom: hasItems || isDropTarget ? 5 : 0, display: compactMobile ? "none" : "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, color: personVisual.text, fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: personVisual.stripe, boxShadow: `0 0 0 2px ${personVisual.taskSoft}`, flex: "0 0 auto" }} />
          {PERSON_LABELS[person]}
        </span>
        {items.length > 0 && <span style={{ color: DT.textFaint, fontFamily: DT.sans, fontSize: 9, fontWeight: 900 }}>{items.length}</span>}
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div style={{ display: "flex", flexDirection: "column", gap: compactMobile ? 2 : 5, minWidth: 0, minHeight: 0 }}>{children}</div>
      </SortableContext>
    </div>
  );
}

function OrderJourneyTaskCard({ task, selected, compactMobile = false, onTaskSelect, onTaskOpen, onTaskEdit, onTaskDoneToggle }: { task: OrderJourneyTask; selected: boolean; compactMobile?: boolean; onTaskSelect: (task: OrderJourneyTask) => void; onTaskOpen: (task: OrderJourneyTask) => void; onTaskEdit: (task: OrderJourneyTask) => void; onTaskDoneToggle: (task: OrderJourneyTask, done: boolean, origin?: DelightOrigin) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: task.appTask ? "app-task" : "plan-task" } });
  const personVisual = PERSON_VISUALS[task.person];
  const connection = orderConnectionStyle(task.connectionState, selected);
  const taskDone = Boolean(task.done);
  const orderRowTaskBorder = taskDone ? DONE_TASK_VISUAL.border : personVisual.taskBorder;
  const orderRowTaskStripe = taskDone ? DONE_TASK_VISUAL.stripe : personVisual.stripe;
  const orderRowTaskBg = taskDone ? DONE_TASK_VISUAL.bg : personVisual.taskBg;
  const connectionMessage = task.connectionState === "possible" ? "Possible order match. Use edit to confirm the customer/order." : task.connectionState === "needs-order" ? "No confirmed order link yet. Use edit to connect this task." : "";
  const editLabel = task.appTask ? "Open task details" : "Edit task";
  const dragCursor = isDragging ? "grabbing" : "grab";
  if (compactMobile) {
    const compactDoneSize = 18;
    const compactEditSize = 22;
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        key={task.id}
        data-order-row-task-id={task.id}
        data-order-row-sortable-task="order-row-sortable-task"
        data-order-row-drag-surface="order-row-drag-surface"
        data-order-row-task-compact="true"
        title="Drag this task to another day or person"
        style={{ borderWidth: "1px 1px 1px 3px", borderStyle: taskDone ? "dashed" : "solid", borderColor: `${orderRowTaskBorder} ${orderRowTaskBorder} ${orderRowTaskBorder} ${orderRowTaskStripe}`, borderRadius: 7, background: orderRowTaskBg, padding: "3px 4px", minHeight: 28, opacity: isDragging ? 0.35 : 1, transform: CSS.Transform.toString(transform), transition: transition ?? "transform 160ms ease, opacity 120ms ease", cursor: dragCursor, touchAction: "none", userSelect: "none" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "18px auto minmax(0, 1fr) auto 22px", gap: 5, alignItems: "center", minWidth: 0 }}>
          <button
            type="button"
            role="checkbox"
            aria-checked={taskDone}
            aria-label={task.done ? "Mark task not done" : "Mark task done"}
            title={task.done ? "Mark task not done" : "Mark task done"}
            data-order-row-done-button="order-row-done-button"
            data-order-row-done-checkbox="order-row-done-checkbox"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const cardElement = event.currentTarget.closest("[data-order-row-task-id]") as HTMLElement | null;
              onTaskDoneToggle(task, !task.done, { x: event.clientX, y: event.clientY, cardRect: cardElement?.getBoundingClientRect() });
            }}
            style={{ width: compactDoneSize, height: compactDoneSize, minWidth: compactDoneSize, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${taskDone ? DONE_TASK_VISUAL.buttonBorder : "rgba(124,116,107,0.42)"}`, background: taskDone ? DONE_TASK_VISUAL.buttonBg : "rgba(255,255,255,0.92)", color: taskDone ? DONE_TASK_VISUAL.title : "transparent", borderRadius: 4, padding: 0, fontFamily: DT.sans, fontSize: 10, fontWeight: 950, lineHeight: 1, cursor: "pointer", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.72)" }}
          >
            {task.done ? "✓" : ""}
          </button>
          <span style={{ color: taskDone ? DONE_TASK_VISUAL.text : personVisual.text, fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1, whiteSpace: "nowrap" }}>
            {PERSON_LABELS[task.person]}
          </span>
          <button type="button" onClick={() => onTaskSelect(task)} style={{ minWidth: 0, padding: 0, border: 0, background: "transparent", color: taskDone ? DONE_TASK_VISUAL.title : DT.textPrimary, textAlign: "left", fontFamily: DT.sans, fontSize: 10.5, lineHeight: 1.05, fontWeight: 900, cursor: dragCursor, textDecorationLine: taskDone ? "line-through" : "none", textDecorationColor: taskDone ? "rgba(111,107,99,0.68)" : undefined, opacity: taskDone ? 0.74 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", touchAction: "manipulation" }}>{friendlyWorkshopTaskText(task.text)}</button>
          <span style={{ color: taskDone ? DONE_TASK_VISUAL.text : DT.textMuted, fontFamily: DT.sans, fontSize: 9, fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap" }}>{formatTaskHours(task.estimatedHours)}</span>
          <button
            type="button"
            aria-label={editLabel}
            title={editLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (task.appTask) {
                onTaskOpen(task);
              } else {
                onTaskEdit(task);
              }
            }}
            style={{ width: compactEditSize, height: compactEditSize, minWidth: compactEditSize, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", color: DT.textMuted, borderRadius: 999, padding: 0, fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer", lineHeight: 1 }}
          >
            ✎
          </button>
        </div>
        {connectionMessage && <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 8.5, fontWeight: 850, color: connection.color, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{connectionMessage}</div>}
      </div>
    );
  }
  const doneSize = compactMobile ? 40 : 19;
  const editSize = compactMobile ? 40 : 20;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      key={task.id}
      data-order-row-task-id={task.id}
      data-order-row-sortable-task="order-row-sortable-task"
      data-order-row-drag-surface="order-row-drag-surface"
      data-order-row-task-compact={compactMobile ? "true" : "false"}
      title="Drag this task to another day or person"
      style={{ borderWidth: "1px 1px 1px 4px", borderStyle: taskDone ? "dashed" : "solid", borderColor: `${orderRowTaskBorder} ${orderRowTaskBorder} ${orderRowTaskBorder} ${orderRowTaskStripe}`, borderRadius: compactMobile ? 10 : 9, background: orderRowTaskBg, boxShadow: taskDone && !compactMobile ? DONE_TASK_VISUAL.shadow : undefined, padding: compactMobile ? 6 : 6, minHeight: compactMobile ? 56 : 52, opacity: isDragging ? 0.35 : 1, transform: CSS.Transform.toString(transform), transition: transition ?? "transform 160ms ease, opacity 120ms ease", cursor: dragCursor, touchAction: "none", userSelect: "none" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: compactMobile ? 6 : 7, alignItems: compactMobile ? "center" : "start" }}>
        <button
          type="button"
          role="checkbox"
          aria-checked={taskDone}
          aria-label={task.done ? "Mark task not done" : "Mark task done"}
          title={task.done ? "Mark task not done" : "Mark task done"}
          data-order-row-done-button="order-row-done-button"
          data-order-row-done-checkbox="order-row-done-checkbox"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const cardElement = event.currentTarget.closest("[data-order-row-task-id]") as HTMLElement | null;
            onTaskDoneToggle(task, !task.done, { x: event.clientX, y: event.clientY, cardRect: cardElement?.getBoundingClientRect() });
          }}
          style={{ width: doneSize, height: doneSize, minWidth: doneSize, marginTop: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `2px solid ${taskDone ? DONE_TASK_VISUAL.buttonBorder : "rgba(124,116,107,0.42)"}`, background: taskDone ? DONE_TASK_VISUAL.buttonBg : "rgba(255,255,255,0.92)", color: taskDone ? DONE_TASK_VISUAL.title : "transparent", borderRadius: compactMobile ? 9 : 5, padding: 0, fontFamily: DT.sans, fontSize: compactMobile ? 12 : 12, fontWeight: 950, lineHeight: 1, cursor: "pointer", boxShadow: taskDone && !compactMobile ? "0 1px 4px rgba(111,107,99,0.18)" : "inset 0 0 0 1px rgba(255,255,255,0.72)" }}
        >
          {task.done ? "✓" : ""}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, color: taskDone ? DONE_TASK_VISUAL.text : personVisual.text, fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>
              {PERSON_LABELS[task.person]}
              {connectionMessage && <span aria-label={connectionMessage} title={connectionMessage} style={{ width: 7, height: 7, borderRadius: 999, background: connection.color, boxShadow: `0 0 0 2px ${connection.bg}`, flex: "0 0 auto" }} />}
            </span>
            <span style={{ color: taskDone ? DONE_TASK_VISUAL.text : DT.textMuted, fontFamily: DT.sans, fontSize: 9, fontWeight: 900 }}>{formatTaskHours(task.estimatedHours)}</span>
          </div>
          <button type="button" onClick={() => onTaskSelect(task)} style={{ marginTop: compactMobile ? 2 : 3, minWidth: compactMobile ? 40 : undefined, minHeight: compactMobile ? 40 : undefined, display: compactMobile ? "flex" : undefined, alignItems: compactMobile ? "center" : undefined, padding: 0, border: 0, background: "transparent", color: taskDone ? DONE_TASK_VISUAL.title : DT.textPrimary, textAlign: "left", fontFamily: DT.sans, fontSize: compactMobile ? 11.5 : 11.5, lineHeight: compactMobile ? 1.18 : 1.16, fontWeight: 950, cursor: dragCursor, textDecorationLine: taskDone ? "line-through" : "none", textDecorationColor: taskDone ? "rgba(111,107,99,0.68)" : undefined, opacity: taskDone ? 0.74 : 1, touchAction: compactMobile ? "manipulation" : undefined }}>{friendlyWorkshopTaskText(task.text)}</button>
        </div>
        <button
          type="button"
          aria-label={editLabel}
          title={editLabel}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (task.appTask) {
              onTaskOpen(task);
            } else {
              onTaskEdit(task);
            }
          }}
          style={{ width: editSize, height: editSize, minWidth: editSize, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", color: DT.textMuted, borderRadius: 999, padding: 0, fontFamily: DT.sans, fontSize: compactMobile ? 13 : 11, fontWeight: 950, cursor: "pointer", lineHeight: 1 }}
        >
          ✎
        </button>
      </div>
    </div>
  );
}

function OrderJourneyView({
  rows,
  week,
  weekIndex,
  weekCount,
  selectedOrder,
  personFilter,
  dayFilter,
  manualRowOrderActive,
  activeTaskId,
  dropPreview,
  onDayFilterChange,
  onMoveRow,
  onResetRowOrder,
  onPreviousWeek,
  onThisWeek,
  onNextWeek,
  onTaskEdit,
  onTaskSelect,
  onTaskOpen,
  onOrderOpen,
  onTaskDoneToggle,
}: {
  rows: OrderJourneyRow[];
  week: PlanWeek;
  weekIndex: number;
  weekCount: number;
  selectedOrder: UiOrder | null;
  personFilter: PersonFilter;
  dayFilter: OrderDayFilter;
  manualRowOrderActive: boolean;
  activeTaskId: string | null;
  dropPreview: BoardDropPreview | null;
  onDayFilterChange: (filter: OrderDayFilter) => void;
  onMoveRow: (sourceRowId: string, targetRowId: string) => void;
  onResetRowOrder: () => void;
  onPreviousWeek: () => void;
  onThisWeek: () => void;
  onNextWeek: () => void;
  onTaskEdit: (task: OrderJourneyTask) => void;
  onTaskSelect: (task: OrderJourneyTask) => void;
  onTaskOpen: (task: OrderJourneyTask) => void;
  onOrderOpen: (orderId: number) => void;
  onTaskDoneToggle: (task: OrderJourneyTask, done: boolean, origin?: DelightOrigin) => void;
}) {
  const isNarrow = useIsNarrow(880);
  const todayKey = currentDayKey();
  const weekRange = weekRangeFromTitle(week.title);
  const isCurrentWeek = Boolean(weekRange && weekRange.start.getTime() === planningVisibleStart(new Date()).getTime());
  const matchesTaskFilter = (task: OrderJourneyTask) => {
    const personMatches = personFilter === "all" || task.person === personFilter;
    const dayMatches = dayFilter === "allWeek" ? true : dayFilter === "today" ? Boolean(isCurrentWeek && todayKey && task.day === todayKey) : task.day === dayFilter;
    return personMatches && dayMatches;
  };
  const filteredRows = rows
    .map((row) => ({ ...row, tasks: row.tasks.filter(matchesTaskFilter) }))
    .filter((row) => personFilter === "all" && dayFilter === "allWeek" ? true : row.tasks.length > 0);
  const activeRows = filteredRows.filter((row) => row.order && row.health !== "internal" && row.health !== "unlinked" && !isCompleteOrder(row.order));
  const activeRowsWithTasks = activeRows.filter((row) => row.hasTasksThisWeek);
  const activeRowsWithoutTasks = activeRows.filter((row) => !row.hasTasksThisWeek);
  const needsRows = filteredRows.filter((row) => !row.order || row.health === "internal" || row.health === "unlinked");
  const weekLabel = displayWeekTitle(week.title);
  const renderSectionLabel = (label: string, count: number, detail: string) => (
    <div data-order-journey-section-label="true" style={{ padding: isNarrow ? "2px 1px 0" : "5px 2px 2px", display: "flex", flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: isNarrow ? 6 : 10, fontFamily: DT.sans }}>
      <div style={{ fontSize: isNarrow ? 9.5 : 10, fontWeight: 950, color: DT.textFaint, textTransform: "uppercase", letterSpacing: isNarrow ? "0.05em" : "0.08em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: isNarrow ? 9.5 : 10, fontWeight: 850, color: DT.textMuted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{count} {count === 1 ? "order" : "orders"} · {detail}</div>
    </div>
  );
  const renderRow = (row: OrderJourneyRow) => {
    const selected = Boolean(row.order && selectedOrder?.id === row.order.id);
    const healthMeta = row.health === "internal"
      ? { label: "Internal", color: DT.sage, bg: "rgba(110,138,106,0.10)", border: "rgba(110,138,106,0.22)" }
      : row.health === "unlinked"
        ? { label: "Needs order", color: "#9a6a14", bg: "rgba(200,169,110,0.14)", border: "rgba(200,169,110,0.34)" }
        : HEALTH_META[row.health];
    const canMoveRow = row.health !== "internal" && row.health !== "unlinked";
    const rowPriorityIndex = activeRows.findIndex((candidate) => candidate.id === row.id);
    const canMoveUp = canMoveRow && rowPriorityIndex > 0;
    const canMoveDown = canMoveRow && rowPriorityIndex >= 0 && rowPriorityIndex < activeRows.length - 1;
    const shouldShowDayOnMobile = (day: DayKey) => {
      if (activeTaskId) return true;
      if (dayFilter !== "allWeek" && dayFilter !== "today") return day === dayFilter;
      return row.tasks.some((task) => task.day === day);
    };
    const mobileVisibleDayCount = DAYS.filter(shouldShowDayOnMobile).length;
    const rowStyle = {
      borderWidth: "1px 1px 1px 4px",
      borderStyle: "solid",
      borderColor: `${selected ? "rgba(12,124,122,0.20)" : DT.border} ${selected ? "rgba(12,124,122,0.20)" : DT.border} ${selected ? "rgba(12,124,122,0.20)" : DT.border} ${healthMeta.color}`,
      background: selected ? "rgba(12,124,122,0.04)" : "rgba(255,255,255,0.86)",
      boxShadow: selected ? "0 8px 22px rgba(12,124,122,0.08)" : DT.shadow,
      borderRadius: DT.radius,
      overflow: "hidden",
    };
    if (isNarrow && !activeTaskId) {
      const visibleDays = DAYS.filter(shouldShowDayOnMobile);
      const compactTaskLimit = dayFilter === "allWeek" && personFilter === "all" ? 2 : 3;
      const compactTaskIds = new Set(row.tasks.slice(0, compactTaskLimit).map((task) => task.id));
      const compactVisibleDays = visibleDays.filter((day) => row.tasks.some((task) => task.day === day && compactTaskIds.has(task.id)));
      const hiddenTaskCount = Math.max(0, row.tasks.length - compactTaskIds.size);
      return (
        <article key={row.id} data-order-journey-row-card="true" data-order-journey-row-compact="true" style={{ ...rowStyle, borderRadius: 11 }}>
          <div data-order-row-summary="true" style={{ padding: "7px 9px 6px", background: "rgba(255,253,249,0.72)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start" }}>
              {row.order ? (
                <button type="button" onClick={() => onOrderOpen(row.order!.id)} title={`Open ${row.name} order`} style={{ minWidth: 0, minHeight: 40, display: "flex", alignItems: "center", padding: 0, border: 0, background: "transparent", fontFamily: DT.serif, fontSize: 15.5, lineHeight: 1.08, color: DT.textPrimary, fontWeight: 760, textAlign: "left", cursor: "pointer", textDecorationLine: selected ? "underline" : "none", textDecorationColor: "rgba(12,124,122,0.28)", textUnderlineOffset: 3, overflowWrap: "anywhere", touchAction: "manipulation" }}>{row.name}</button>
              ) : (
                <div style={{ minWidth: 0, fontFamily: DT.serif, fontSize: 15.5, lineHeight: 1.02, color: DT.textPrimary, fontWeight: 760, overflowWrap: "anywhere" }}>{row.name}</div>
              )}
              {canMoveRow && (
                <div data-order-row-priority-controls="order-row-priority-controls" title="Priority: move this order earlier or later in the week list" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.68)", borderRadius: 999, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.025)" }}>
                  <button type="button" title="Move this order earlier" aria-label={`Move ${row.name} earlier in the list`} disabled={!canMoveUp} onClick={() => { const previousRow = activeRows[rowPriorityIndex - 1]; if (previousRow) onMoveRow(row.id, previousRow.id); }} style={{ width: 40, height: 40, border: 0, borderRight: `1px solid ${DT.border}`, background: canMoveUp ? "transparent" : "rgba(0,0,0,0.025)", color: canMoveUp ? DT.textMuted : DT.textFaint, padding: 0, fontFamily: DT.sans, fontSize: 15, fontWeight: 950, cursor: canMoveUp ? "pointer" : "not-allowed", lineHeight: 1, touchAction: "manipulation" }}>↑</button>
                  <button type="button" title="Move this order later" aria-label={`Move ${row.name} later in the list`} disabled={!canMoveDown} onClick={() => { const nextRow = activeRows[rowPriorityIndex + 1]; if (nextRow) onMoveRow(nextRow.id, row.id); }} style={{ width: 40, height: 40, border: 0, background: canMoveDown ? "transparent" : "rgba(0,0,0,0.025)", color: canMoveDown ? DT.textMuted : DT.textFaint, padding: 0, fontFamily: DT.sans, fontSize: 15, fontWeight: 950, cursor: canMoveDown ? "pointer" : "not-allowed", lineHeight: 1, touchAction: "manipulation" }}>↓</button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ border: `1px solid ${healthMeta.border}`, background: healthMeta.bg, color: healthMeta.color, borderRadius: 999, padding: "2px 6px", fontSize: 8.5, fontFamily: DT.sans, fontWeight: 950, lineHeight: 1 }}>{healthMeta.label}</span>
              {row.dueLabel && <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", color: DT.textMuted, borderRadius: 999, padding: "2px 6px", fontSize: 8.5, fontFamily: DT.sans, fontWeight: 850, lineHeight: 1 }}>{row.dueLabel}</span>}
              {row.statusLabel && <span style={{ minWidth: 0, color: DT.textMuted, fontFamily: DT.sans, fontSize: 9.5, fontWeight: 850, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.statusLabel}</span>}
            </div>
          </div>
          {visibleDays.length === 0 ? (
            <div data-order-journey-empty-mobile="true" style={{ display: "block", padding: "6px 9px 7px", borderTop: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.52)", fontFamily: DT.sans, fontSize: 10, lineHeight: 1.25, color: DT.textMuted, fontWeight: 850 }}>
              No tasks scheduled this week.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 0 }}>
              {compactVisibleDays.map((day) => {
                const allDayTasks = row.tasks.filter((task) => task.day === day);
                const dayTasks = allDayTasks.filter((task) => compactTaskIds.has(task.id));
                const dateOption = suggestedDateOptionForWeekDay(week, day);
                const visiblePeople = personFilter === "all" ? PEOPLE : [personFilter];
                const dayHours = allDayTasks.reduce((sum, task) => sum + Number(task.estimatedHours || 1), 0);
                return (
                  <OrderJourneyDayDropCell key={`${row.id}:${day}`} id={orderJourneyDayId(row.id, week.id, day)} rowId={row.id} weekId={week.id} day={day} hasTasks={dayTasks.length > 0} mobileVisible style={{ minHeight: 0, padding: "5px 8px 6px", borderTop: `1px solid ${DT.border}`, background: dayTasks.length ? "rgba(255,255,255,0.58)" : "rgba(255,255,255,0.24)", display: "flex", flexDirection: "column" }}>
                    <div data-order-row-mobile-day-header="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: dayTasks.length ? 4 : 0 }}>
                      <span style={{ fontFamily: DT.sans, fontSize: 8.5, fontWeight: 950, color: DT.textFaint, textTransform: "uppercase", letterSpacing: "0.04em" }}>{dateLabelForWeekTitleDay(week.title, day)}</span>
                      <span style={{ fontFamily: DT.sans, fontSize: 8.5, fontWeight: 950, color: DT.textMuted, whiteSpace: "nowrap" }}>{allDayTasks.length > 0 ? `${allDayTasks.length} · ${formatTaskHours(dayHours)}` : "No tasks"}</span>
                    </div>
                    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                      {visiblePeople.map((person) => {
                        const laneId = orderJourneyLaneId(row.id, week.id, day, person);
                        const laneTasks = dayTasks.filter((task) => task.person === person);
                        if (laneTasks.length === 0) return null;
                        return (
                          <OrderJourneyDropLane key={laneId} id={laneId} day={day} person={person} dateIso={dateOption?.dateIso} dateLabel={dateOption?.dateLabel} items={laneTasks.map((task) => task.id)} isDropTarget={false} dragActive={false} mobileVisible compactMobile>
                            {laneTasks.map((task) => (
                              <OrderJourneyTaskCard key={task.id} task={task} selected={selected} compactMobile onTaskSelect={onTaskSelect} onTaskOpen={onTaskOpen} onTaskEdit={onTaskEdit} onTaskDoneToggle={onTaskDoneToggle} />
                            ))}
                          </OrderJourneyDropLane>
                        );
                      })}
                    </div>
                  </OrderJourneyDayDropCell>
                );
              })}
              {hiddenTaskCount > 0 && (
                <button type="button" onClick={() => row.order && onOrderOpen(row.order.id)} style={{ minHeight: 40, border: 0, borderTop: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.62)", color: DT.textMuted, padding: "5px 9px 6px", fontFamily: DT.sans, fontSize: 9.5, fontWeight: 900, textAlign: "left", cursor: row.order ? "pointer" : "default", touchAction: "manipulation" }}>
                  + {hiddenTaskCount} more task{hiddenTaskCount === 1 ? "" : "s"}
                </button>
              )}
            </div>
          )}
        </article>
      );
    }
    return (
      <article key={row.id} data-order-journey-row-card="true" data-order-journey-row-compact="false" style={rowStyle}>
        <div data-order-row-week-grid="order-row-week-grid" style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "220px repeat(5, minmax(104px, 1fr))", gap: 0 }}>
          <div style={{ padding: 12, borderRight: isNarrow ? "none" : `1px solid ${DT.border}`, borderBottom: isNarrow ? `1px solid ${DT.border}` : "none", background: "rgba(255,253,249,0.72)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              {row.order ? (
	                <button type="button" onClick={() => onOrderOpen(row.order!.id)} title={`Open ${row.name} order`} style={{ minWidth: 0, minHeight: isNarrow ? 40 : undefined, display: isNarrow ? "flex" : undefined, alignItems: isNarrow ? "center" : undefined, padding: 0, border: 0, background: "transparent", fontFamily: DT.serif, fontSize: 16, lineHeight: isNarrow ? 1.08 : 1.04, color: DT.textPrimary, fontWeight: 750, textAlign: "left", cursor: "pointer", textDecorationLine: selected ? "underline" : "none", textDecorationColor: "rgba(12,124,122,0.28)", textUnderlineOffset: 3, touchAction: isNarrow ? "manipulation" : undefined }}>{row.name}</button>
	              ) : (
	                <div style={{ minWidth: 0, fontFamily: DT.serif, fontSize: 16, lineHeight: 1.04, color: DT.textPrimary, fontWeight: 750 }}>{row.name}</div>
	              )}
              {canMoveRow && (
                <div data-order-row-drag-handle="order-row-drag-handle" data-order-row-priority-controls="order-row-priority-controls" title="Priority: move this order earlier or later in the week list" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.68)", borderRadius: 999, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.025)" }}>
                  <span aria-hidden="true" style={{ padding: "0 6px", height: isNarrow ? 40 : 23, display: "inline-flex", alignItems: "center", borderRight: `1px solid ${DT.border}`, color: DT.textFaint, fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1 }}>
                    Priority
                  </span>
                  <button
                    type="button"
                    title="Move this order earlier"
                    aria-label={`Move ${row.name} earlier in the list`}
                    disabled={!canMoveUp}
                    onClick={() => {
                      const previousRow = activeRows[rowPriorityIndex - 1];
                      if (previousRow) onMoveRow(row.id, previousRow.id);
                    }}
		                    style={{ width: isNarrow ? 40 : 23, height: isNarrow ? 40 : 23, border: 0, borderRight: `1px solid ${DT.border}`, background: canMoveUp ? "transparent" : "rgba(0,0,0,0.025)", color: canMoveUp ? DT.textMuted : DT.textFaint, padding: 0, fontFamily: DT.sans, fontSize: isNarrow ? 15 : 12, fontWeight: 950, cursor: canMoveUp ? "pointer" : "not-allowed", lineHeight: 1, touchAction: isNarrow ? "manipulation" : undefined }}
		                  >
		                    ↑
		                  </button>
                  <button
                    type="button"
                    title="Move this order later"
                    aria-label={`Move ${row.name} later in the list`}
                    disabled={!canMoveDown}
                    onClick={() => {
                      const nextRow = activeRows[rowPriorityIndex + 1];
                      if (nextRow) onMoveRow(nextRow.id, row.id);
                    }}
		                    style={{ width: isNarrow ? 40 : 23, height: isNarrow ? 40 : 23, border: 0, background: canMoveDown ? "transparent" : "rgba(0,0,0,0.025)", color: canMoveDown ? DT.textMuted : DT.textFaint, padding: 0, fontFamily: DT.sans, fontSize: isNarrow ? 15 : 12, fontWeight: 950, cursor: canMoveDown ? "pointer" : "not-allowed", lineHeight: 1, touchAction: isNarrow ? "manipulation" : undefined }}
		                  >
		                    ↓
		                  </button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 7, display: "flex", gap: 5, flexWrap: "wrap" }}>
              <span style={{ border: `1px solid ${healthMeta.border}`, background: healthMeta.bg, color: healthMeta.color, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontFamily: DT.sans, fontWeight: 950, lineHeight: 1 }}>{healthMeta.label}</span>
              {row.dueLabel && <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.78)", color: DT.textMuted, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontFamily: DT.sans, fontWeight: 850, lineHeight: 1 }}>{row.dueLabel}</span>}
            </div>
            {row.statusLabel && <div style={{ marginTop: 7, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 800, lineHeight: 1.2 }}>{row.statusLabel}</div>}
          </div>
          {mobileVisibleDayCount === 0 && (
            <div data-order-journey-empty-mobile="true" style={{ display: "none", padding: "10px 12px", borderTop: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.52)", fontFamily: DT.sans, fontSize: 11, lineHeight: 1.35, color: DT.textMuted, fontWeight: 850 }}>
              No tasks scheduled this week.
            </div>
          )}
          {DAYS.map((day) => {
            const dayTasks = row.tasks.filter((task) => task.day === day);
            const dateOption = suggestedDateOptionForWeekDay(week, day);
            const visiblePeople = personFilter === "all" ? PEOPLE : [personFilter];
            const mobileDayVisible = shouldShowDayOnMobile(day);
            const dayHours = dayTasks.reduce((sum, task) => sum + Number(task.estimatedHours || 1), 0);
            return (
              <OrderJourneyDayDropCell key={`${row.id}:${day}`} id={orderJourneyDayId(row.id, week.id, day)} rowId={row.id} weekId={week.id} day={day} hasTasks={dayTasks.length > 0} mobileVisible={mobileDayVisible} style={{ minHeight: 0, padding: isNarrow ? 8 : 6, borderLeft: isNarrow ? "none" : `1px solid ${DT.border}`, borderTop: isNarrow ? `1px solid ${DT.border}` : "none", background: dayTasks.length ? "rgba(255,255,255,0.58)" : "rgba(255,255,255,0.24)", display: "flex", flexDirection: "column" }}>
                <div data-order-row-mobile-day-header="true" style={{ display: isNarrow ? "flex" : "none", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: dayTasks.length ? 6 : 0 }}>
                  <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, color: DT.textFaint, textTransform: "uppercase", letterSpacing: "0.06em" }}>{dateLabelForWeekTitleDay(week.title, day)}</span>
                  <span style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, color: DT.textMuted, whiteSpace: "nowrap" }}>
                    {dayTasks.length > 0 ? `${dayTasks.length} ${dayTasks.length === 1 ? "task" : "tasks"} · ${formatTaskHours(dayHours)}` : "No tasks"}
                  </span>
                  </div>
	                <div style={{ display: "grid", gridTemplateRows: `repeat(${visiblePeople.length}, minmax(0, auto))`, gap: 6, minHeight: 0, alignContent: "start" }}>
                  {visiblePeople.map((person) => {
                    const laneId = orderJourneyLaneId(row.id, week.id, day, person);
                    const laneTasks = dayTasks.filter((task) => task.person === person);
                    const isDropTarget = Boolean(activeTaskId && dropPreview?.weekId === week.id && dropPreview.day === day && dropPreview.person === person && (!dropPreview.rowId || dropPreview.rowId === row.id));
                    const mobileLaneVisible = Boolean(activeTaskId || laneTasks.length > 0);
                    const showDropSlot = (itemId?: string, insertAfter = false) => Boolean(isDropTarget && dropPreview?.overId === itemId && Boolean(dropPreview?.insertAfter) === insertAfter);
                    const dropSlot = <div aria-hidden="true" style={{ height: 7, borderRadius: 999, background: "rgba(12,124,122,0.36)", boxShadow: "0 0 0 3px rgba(12,124,122,0.08)", margin: "1px 2px" }} />;
                    return (
                      <OrderJourneyDropLane key={laneId} id={laneId} day={day} person={person} dateIso={dateOption?.dateIso} dateLabel={dateOption?.dateLabel} items={laneTasks.map((task) => task.id)} isDropTarget={isDropTarget} dragActive={Boolean(activeTaskId)} mobileVisible={mobileLaneVisible}>
                        {laneTasks.map((task) => (
                          <div key={task.id} style={{ display: "contents" }}>
                            {showDropSlot(task.id, false) && dropSlot}
                            <OrderJourneyTaskCard task={task} selected={selected} onTaskSelect={onTaskSelect} onTaskOpen={onTaskOpen} onTaskEdit={onTaskEdit} onTaskDoneToggle={onTaskDoneToggle} />
                            {showDropSlot(task.id, true) && dropSlot}
                          </div>
                        ))}
                        {isDropTarget && !dropPreview?.overId && dropSlot}
                        {laneTasks.length === 0 && (
	                          <div data-empty-order-day-cell="empty-order-day-cell" data-order-row-empty-drop-target="order-row-empty-drop-target" style={{ minHeight: activeTaskId ? 24 : 0, border: activeTaskId ? `1px dashed rgba(12,124,122,0.28)` : 0, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: activeTaskId ? DT.teal : "transparent", fontFamily: DT.sans, fontSize: 9, fontWeight: 850, fontStyle: "italic", background: activeTaskId ? "rgba(12,124,122,0.045)" : "transparent" }}>
	                            {activeTaskId ? "Drop task" : ""}
	                          </div>
                        )}
                      </OrderJourneyDropLane>
                    );
                  })}
                </div>
              </OrderJourneyDayDropCell>
            );
          })}
        </div>
      </article>
    );
  };

  const header = (
    <div style={{ border: `1px solid ${DT.border}`, borderRadius: isNarrow ? 999 : DT.radius, background: isNarrow ? "rgba(255,255,255,0.72)" : DT.cardBg, boxShadow: isNarrow ? "0 1px 4px rgba(0,0,0,0.025)" : DT.shadow, padding: isNarrow ? "3px 4px 3px 8px" : "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: isNarrow ? 4 : 8, flexWrap: isNarrow ? "nowrap" : "wrap" }}>
      <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 5 }}>
        <div style={{ fontFamily: DT.sans, fontSize: isNarrow ? 9 : 9, fontWeight: 950, color: DT.teal, textTransform: isNarrow ? "none" : "uppercase", letterSpacing: isNarrow ? 0 : "0.08em", flex: "0 0 auto" }}>{isNarrow ? "This week" : "Orders"}</div>
        <div style={{ fontFamily: isNarrow ? DT.sans : DT.serif, color: DT.textPrimary, fontSize: isNarrow ? 11 : 20, fontWeight: isNarrow ? 900 : 400, lineHeight: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{weekLabel}</div>
      </div>
      <div style={{ display: "flex", gap: isNarrow ? 2 : 6, alignItems: "center", flex: "0 0 auto" }}>
        {manualRowOrderActive && <button type="button" onClick={onResetRowOrder} style={{ minHeight: isNarrow ? 28 : undefined, border: `1px solid rgba(146,42,35,0.16)`, background: "rgba(146,42,35,0.06)", color: "#922a23", borderRadius: 999, padding: isNarrow ? "5px 7px" : "7px 10px", fontFamily: DT.sans, fontSize: isNarrow ? 9 : 11, fontWeight: 950, cursor: "pointer", touchAction: "manipulation" }}>{isNarrow ? "Reset" : "Reset to due-date order"}</button>}
        <button type="button" aria-label="Previous week" onClick={onPreviousWeek} disabled={weekIndex <= 0} style={{ minHeight: isNarrow ? 28 : undefined, border: `1px solid ${DT.border}`, background: weekIndex <= 0 ? "rgba(0,0,0,0.03)" : DT.cardBg, color: weekIndex <= 0 ? DT.textFaint : DT.textMuted, borderRadius: 999, padding: isNarrow ? "5px 7px" : "7px 10px", fontFamily: DT.sans, fontSize: isNarrow ? 10 : 11, fontWeight: 950, cursor: weekIndex <= 0 ? "not-allowed" : "pointer", touchAction: "manipulation" }}>{isNarrow ? "‹" : "Previous week"}</button>
        <button type="button" onClick={onThisWeek} style={{ minHeight: isNarrow ? 28 : undefined, border: `1px solid rgba(12,124,122,0.20)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: isNarrow ? "5px 8px" : "7px 10px", fontFamily: DT.sans, fontSize: isNarrow ? 9.5 : 11, fontWeight: 950, cursor: "pointer", touchAction: "manipulation" }}>{isNarrow ? "This" : "This week"}</button>
        <button type="button" aria-label="Next week" onClick={onNextWeek} disabled={weekIndex >= weekCount - 1} style={{ minHeight: isNarrow ? 28 : undefined, border: `1px solid ${DT.border}`, background: weekIndex >= weekCount - 1 ? "rgba(0,0,0,0.03)" : DT.cardBg, color: weekIndex >= weekCount - 1 ? DT.textFaint : DT.textMuted, borderRadius: 999, padding: isNarrow ? "5px 7px" : "7px 10px", fontFamily: DT.sans, fontSize: isNarrow ? 10 : 11, fontWeight: 950, cursor: weekIndex >= weekCount - 1 ? "not-allowed" : "pointer", touchAction: "manipulation" }}>{isNarrow ? "›" : "Next week"}</button>
      </div>
    </div>
  );

  if (rows.length === 0) {
    return <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>{header}<OrderCapacityStrip rows={rows} week={week} dayFilter={dayFilter} onDayFilterChange={onDayFilterChange} isNarrow={isNarrow} /><div style={{ border: `1px solid ${DT.border}`, borderRadius: DT.radius, background: DT.cardBg, padding: 22, fontFamily: DT.sans, color: DT.textMuted }}>No active order tasks in this week.</div></section>;
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: isNarrow ? 5 : 8 }}>
      {header}
      <OrderCapacityStrip rows={rows} week={week} dayFilter={dayFilter} onDayFilterChange={onDayFilterChange} isNarrow={isNarrow} />
      {activeRows.length === 0 && needsRows.length === 0 && <div style={{ border: `1px solid ${DT.border}`, borderRadius: DT.radius, background: DT.cardBg, padding: 22, fontFamily: DT.sans, color: DT.textMuted }}>No order tasks match this filter.</div>}
      {activeRowsWithTasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {renderSectionLabel("Tasks this week", activeRowsWithTasks.length, "scheduled work visible below")}
          {activeRowsWithTasks.map(renderRow)}
        </div>
      )}
      {activeRowsWithoutTasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {renderSectionLabel("No tasks this week", activeRowsWithoutTasks.length, "active orders needing plan or later work")}
          {activeRowsWithoutTasks.map(renderRow)}
        </div>
      )}
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
  orderCostings,
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
  orderCostings?: OrderCostingContext;
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
  const [planViewMode, setPlanViewMode] = useState<ProductionPlanMode>("orderRows");
  const [orderRowsWeekIndex, setOrderRowsWeekIndex] = useState(0);
  const [orderDayFilter, setOrderDayFilter] = useState<OrderDayFilter>("allWeek");
  const [orderRowOrders, setOrderRowOrders] = useState<PlanRowOrders>(() => initialPlanTaskLinkState?.orderRowOrders ?? {});
  const [delightBurst, setDelightBurst] = useState<{ id: number; origin: DelightOrigin } | null>(null);
  const [boardTasks, setBoardTasks] = useState<BoardPlanTask[]>(sourceBoardTasks);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeAppTaskId, setActiveAppTaskId] = useState<string | null>(null);
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
  const [orderOverrides, setOrderOverrides] = useState<OrderOverrides>(() => initialPlanTaskLinkState?.orderOverrides ?? {});
  const planTaskLinksRealtimeRef = useRef<RealtimeChannel | null>(null);
  const planTaskLinksUpdatedAtRef = useRef<string | null>(initialPlanTaskLinkState?.updatedAt ?? null);
  const [assignmentStatus, setAssignmentStatus] = useState(initialPlanTaskLinksDisabledReason ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const [orderIntakeItems, setOrderIntakeItems] = useState<OrderIntakeItem[]>([]);
  const [orderIntakeStatus, setOrderIntakeStatus] = useState("");
  const [orderIntakeBusy, setOrderIntakeBusy] = useState(false);
  const [openIntakeOrderId, setOpenIntakeOrderId] = useState<string | null>(null);
  const [orderWorkflowsById, setOrderWorkflowsById] = useState<Record<string, OrderWorkflowState>>({});
  const [completionRequest, setCompletionRequest] = useState<TuesdayCompletionRequest | null>(null);
  const undoBoardLayoutsRef = useRef<BoardPlanTask[][]>([]);
  const dragStartBoardTasksRef = useRef<BoardPlanTask[] | null>(null);
  const lastBoardPreviewRef = useRef<string | null>(null);
  const lastBoardPointerRef = useRef<{ x: number; y: number } | null>(null);
  const isRailNarrow = useIsNarrow(1040);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const activeTuesdayOrders = useMemo(
    () => ordersForHealth.filter((order) => orderOverrides[String(order.id)]?.status !== "completed"),
    [ordersForHealth, orderOverrides]
  );
  const activeOrderIntakeItems = useMemo(
    () => orderIntakeItems.filter((item) => orderOverrides[item.orderId]?.status !== "completed"),
    [orderIntakeItems, orderOverrides]
  );
  const completedTuesdayItems = useMemo<CompletedTuesdayItem[]>(() => {
    const items: CompletedTuesdayItem[] = [];
    const seen = new Set<string>();
    for (const order of ordersForHealth) {
      const id = String(order.id);
      const override = orderOverrides[id];
      if (override?.status !== "completed") continue;
      seen.add(id);
      items.push({
        id,
        kind: "order",
        label: order.customer,
        detail: `${orderItemLabel(order)} · ${orderStatusLabel(order)}${override.updatedAt ? ` · ${formatShortDate(override.updatedAt)}` : ""}`,
        reason: override.reason,
        note: override.note,
        updatedAt: override.updatedAt,
      });
    }
    for (const item of orderIntakeItems) {
      const override = orderOverrides[item.orderId];
      if (override?.status !== "completed") continue;
      seen.add(item.orderId);
      items.push({
        id: item.orderId,
        kind: "intake",
        label: item.customerName,
        detail: `${item.invoiceNumber || "No invoice"} · ${item.itemCategory || item.productSummary || "Intake order"}${override.updatedAt ? ` · ${formatShortDate(override.updatedAt)}` : ""}`,
        reason: override.reason,
        note: override.note,
        updatedAt: override.updatedAt,
      });
    }
    for (const [id, override] of Object.entries(orderOverrides)) {
      if (override.status !== "completed" || seen.has(id)) continue;
      items.push({
        id,
        kind: "unknown",
        label: "Completed order override",
        detail: `${id}${override.updatedAt ? ` · ${formatShortDate(override.updatedAt)}` : ""}`,
        reason: override.reason,
        note: override.note,
        updatedAt: override.updatedAt,
      });
    }
    return items.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || a.label.localeCompare(b.label));
  }, [ordersForHealth, orderIntakeItems, orderOverrides]);
  const orderIdsKey = useMemo(() => activeTuesdayOrders.map((order) => order.id).sort((a, b) => a - b).join(","), [activeTuesdayOrders]);
  const loadOrderWorkflows = useCallback(async () => {
    if (!orderIdsKey) {
      setOrderWorkflowsById({});
      return;
    }
    const response = await fetch(`/api/production/order-workflow?orderIds=${encodeURIComponent(orderIdsKey)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as OrderWorkflowApiResponse;
    if (!response.ok) throw new Error(data.error || "Workflow tasks unavailable");
    setOrderWorkflowsById(data.states ?? {});
  }, [orderIdsKey]);
  useEffect(() => {
    void loadOrderWorkflows().catch(() => undefined);
  }, [loadOrderWorkflows]);
  const handleAllWorkflowRealtimeChange = useCallback((payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    const orderId = Number(row?.order_id ?? 0);
    if (orderId > 0) void loadOrderWorkflows().catch(() => undefined);
  }, [loadOrderWorkflows]);
  useRealtimeRefresh({
    channelName: "production-order-workflows:all",
    table: "production_order_workflows",
    refreshOnChange: false,
    onChange: handleAllWorkflowRealtimeChange,
  });
  const loadOrderIntake = useCallback(async (quiet = false) => {
    if (!quiet) setOrderIntakeStatus("Checking pending new orders...");
    try {
      const response = await fetch("/api/production/order-intake", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as OrderIntakeApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.error || "Order intake unavailable");
      setOrderIntakeItems(Array.isArray(data.items) ? data.items : []);
      setOrderIntakeStatus("");
    } catch (error) {
      setOrderIntakeStatus(error instanceof Error ? error.message : "Order intake unavailable");
    }
  }, []);
  useEffect(() => {
    void loadOrderIntake(true);
  }, [loadOrderIntake]);
  const handleOrderIntakeRealtimeChange = useCallback(() => {
    void loadOrderIntake(true);
  }, [loadOrderIntake]);
  useRealtimeRefresh({
    channelName: "production-order-intake-reviews",
    table: "order_intake_reviews",
    refreshOnChange: false,
    onChange: handleOrderIntakeRealtimeChange,
  });
  useRealtimeRefresh({
    channelName: "production-order-tasks",
    table: "production_order_tasks",
    refreshOnChange: false,
    onChange: handleOrderIntakeRealtimeChange,
  });
  const selectedOrder = useMemo(
    () => activeTuesdayOrders.find((order) => order.id === selectedOrderId) ?? null,
    [activeTuesdayOrders, selectedOrderId]
  );
  const openOrder = useMemo(
    () => activeTuesdayOrders.find((order) => order.id === openOrderId) ?? null,
    [activeTuesdayOrders, openOrderId]
  );
  const ordersByIdForWorkflow = useMemo(() => new Map(activeTuesdayOrders.map((order) => [order.id, order])), [activeTuesdayOrders]);
  const effectiveOrderWorkflows = useMemo(() => {
    const next = { ...orderWorkflowsById };
    if (selectedWorkflow) next[String(selectedWorkflow.orderId)] = selectedWorkflow;
    return next;
  }, [orderWorkflowsById, selectedWorkflow]);
  const workflowAppTasks = useMemo(() => Object.values(effectiveOrderWorkflows).flatMap((workflow) => workflowTasksForPlan(workflow, ordersByIdForWorkflow.get(workflow.orderId) ?? null)), [effectiveOrderWorkflows, ordersByIdForWorkflow]);
  const approvedIntakeAppTasks = useMemo<AppPlanTask[]>(() => activeOrderIntakeItems.flatMap((item) => {
    const matchedOrder = findOrderForIntakeItem(item, activeTuesdayOrders);
    return item.approvedTasks.flatMap((task) => {
      const day = task.day || dateToDayKey(task.scheduledDate);
      if (!day || !task.title.trim()) return [];
      return [{
        id: `intake-${task.id}`,
        orderId: matchedOrder?.id ?? null,
        orderUuid: item.orderId,
        title: task.title,
        detail: task.detail,
        customer: matchedOrder?.customer ?? item.customerName,
        owner: task.owner,
        scheduledDate: task.scheduledDate,
        day,
        person: task.person,
        done: task.status === "done",
        estimatedHours: task.estimatedHours,
        source: "intake" as const,
      }];
    });
  }), [activeOrderIntakeItems, activeTuesdayOrders]);
  const visibleAppTasks = useMemo(() => [...workflowAppTasks, ...approvedIntakeAppTasks], [workflowAppTasks, approvedIntakeAppTasks]);
  const openIntakeItem = useMemo(() => activeOrderIntakeItems.find((item) => item.orderId === openIntakeOrderId) ?? null, [openIntakeOrderId, activeOrderIntakeItems]);
  const newOrderCoveredByIntake = useMemo(() => Boolean(newOrder && activeOrderIntakeItems.some((item) => intakeItemMatchesNewOrder(item, newOrder))), [newOrder, activeOrderIntakeItems]);
  const activeTask = activeTaskId ? boardTasks.find((task) => task.id === activeTaskId) ?? null : null;
  const activeAppTask = activeAppTaskId ? visibleAppTasks.find((task) => task.id === activeAppTaskId) ?? null : null;
  const weekTitleById = useMemo(() => new Map(visibleProductionWeeks.map((week) => [week.id, displayWeekTitle(week.title)])), [visibleProductionWeeks]);
  const isDraftChanged = !boardPlanLayoutsEqual(sourceBoardTasks, boardTasks);
  const handleSelectedWorkflowChange = useCallback((workflow: OrderWorkflowState | null) => {
    setSelectedWorkflow(workflow);
    if (workflow) setOrderWorkflowsById((current) => ({ ...current, [String(workflow.orderId)]: workflow }));
  }, []);
  const keepOverlayWorkflow = useCallback((workflow: OrderWorkflowState | null) => {
    if (!workflow) return;
    setSelectedWorkflow(workflow);
    setOrderWorkflowsById((current) => ({ ...current, [String(workflow.orderId)]: workflow }));
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
    setActiveAppTaskId(null);
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
    const previousBoardTasks = boardTasks;
    const previousPlanTaskEdits = planTaskEdits;
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
    if (qaFixtureMode) {
      setAssignmentStatus("QA fixture only - not saved");
      if (keepEditorOpen) setEditingTask(nextTask);
      return;
    }
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
      .catch((err) => {
        setBoardTasks(previousBoardTasks);
        saveDraftTasks("six-week-board", previousBoardTasks);
        setPlanTaskEdits(previousPlanTaskEdits);
        setAssignmentStatus(err instanceof Error ? `${err.message} - restored unsaved change` : "Task edit save failed - restored unsaved change");
      });
    if (keepEditorOpen) setEditingTask(nextTask);
  }

  function toggleBoardTaskDone(task: BoardPlanTask, done: boolean, origin?: DelightOrigin) {
    if (done) triggerDelightBurst(origin);
    updateBoardTaskFromEditor({ ...task, done }, false);
  }

  function handleWorkflowTaskDoneToggle(done: boolean, origin?: DelightOrigin) {
    if (done) triggerDelightBurst(origin);
  }

  function workflowOwnerForPerson(person: Person): WorkshopPerson {
    return person === "dylan" ? "Dylan" : "Nick";
  }

  function rawAppTaskId(task: AppPlanTask) {
    if (task.source === "workflow" && task.orderId != null) {
      const prefix = `workflow-${task.orderId}-`;
      return task.id.startsWith(prefix) ? task.id.slice(prefix.length) : task.id;
    }
    return task.id.startsWith("intake-") ? task.id.slice("intake-".length) : task.id;
  }

  function patchWorkflowAppTask(task: AppPlanTask, patch: AppTaskPatch) {
    if (task.orderId == null) return;
    const workflow = effectiveOrderWorkflows[String(task.orderId)] ?? defaultWorkflowState(task.orderId);
    const rawId = rawAppTaskId(task);
    const now = new Date().toISOString();
    let changed = false;
    const nextWorkflow: OrderWorkflowState = {
      ...workflow,
      tasks: workflow.tasks.map((workflowTask) => {
        if (workflowTask.id !== rawId) return workflowTask;
        changed = true;
        const owner = workflowTask.owner === "Guido" && patch.person ? "Guido" : patch.person ? workflowOwnerForPerson(patch.person) : workflowTask.owner;
        const done = typeof patch.done === "boolean" ? patch.done : workflowTask.done;
        return {
          ...workflowTask,
          owner,
          scheduledDate: patch.scheduledDate ?? workflowTask.scheduledDate,
          done,
          completedAt: patch.done === true ? now : patch.done === false ? null : workflowTask.completedAt,
          completedBy: patch.done === true ? owner : patch.done === false ? "" : workflowTask.completedBy,
        };
      }),
      updatedAt: now,
    };
    if (!changed) {
      setAssignmentStatus("Task could not be found in this order");
      return;
    }
    setOrderWorkflowsById((current) => ({ ...current, [String(nextWorkflow.orderId)]: nextWorkflow }));
    if (selectedWorkflow?.orderId === nextWorkflow.orderId) setSelectedWorkflow(nextWorkflow);
    setAssignmentStatus("Saving task...");
    if (qaFixtureMode) {
      setAssignmentStatus("QA fixture only - not saved");
      return;
    }
    fetch("/api/production/order-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: nextWorkflow }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Task save failed"))))
      .then((data: { state?: OrderWorkflowState }) => {
        const saved = data.state ?? nextWorkflow;
        setOrderWorkflowsById((current) => ({ ...current, [String(saved.orderId)]: saved }));
        if (selectedWorkflow?.orderId === saved.orderId) setSelectedWorkflow(saved);
        setAssignmentStatus("Task saved");
      })
      .catch((err) => {
        setAssignmentStatus(err instanceof Error ? err.message : "Task save failed");
        void loadOrderWorkflows().catch(() => undefined);
      });
  }

  function patchApprovedIntakeTask(task: AppPlanTask, patch: AppTaskPatch) {
    const rawId = rawAppTaskId(task);
    const now = new Date().toISOString();
    setOrderIntakeItems((current) => current.map((item) => ({
      ...item,
      approvedTasks: item.approvedTasks.map((approved) => {
        if (approved.id !== rawId) return approved;
        const owner = approved.owner === "Guido" && patch.person ? "Guido" : patch.person ? workflowOwnerForPerson(patch.person) : approved.owner;
        return {
          ...approved,
          owner: owner as OrderIntakeOwner,
          person: patch.person ?? approved.person,
          scheduledDate: patch.scheduledDate ?? approved.scheduledDate,
          day: patch.day ?? approved.day,
          estimatedHours: patch.estimatedHours ?? approved.estimatedHours,
          status: patch.done === true ? "done" : patch.done === false ? "planned" : approved.status,
          completedAt: patch.done === true ? now : patch.done === false ? null : approved.completedAt,
          completedBy: patch.done === true ? owner : patch.done === false ? null : approved.completedBy,
        };
      }),
    })));
    setAssignmentStatus("Saving task...");
    if (qaFixtureMode) {
      setAssignmentStatus("QA fixture only - not saved");
      return;
    }
    fetch(`/api/production/order-intake/tasks/${encodeURIComponent(rawId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Task save failed"))))
      .then(() => {
        setAssignmentStatus("Task saved");
        void loadOrderIntake(true);
      })
      .catch((err) => {
        setAssignmentStatus(err instanceof Error ? err.message : "Task save failed");
        void loadOrderIntake(true);
      });
  }

  function updateAppTask(task: AppPlanTask, patch: AppTaskPatch, origin?: DelightOrigin) {
    const effectivePatch = patch.done === true && !patch.person ? { ...patch, person: task.person } : patch;
    if (effectivePatch.done === true) triggerDelightBurst(origin);
    if (task.source === "intake") {
      patchApprovedIntakeTask(task, effectivePatch);
      return;
    }
    patchWorkflowAppTask(task, effectivePatch);
  }

  function toggleOrderJourneyTaskDone(task: OrderJourneyTask, done: boolean, origin?: DelightOrigin) {
    if (task.appTask) {
      updateAppTask(task.appTask, { done }, origin);
      return;
    }
    toggleBoardTaskDone(task, done, origin);
  }

  function persistBoardTaskMove(nextTask: BoardPlanTask, originalLayout: BoardPlanTask[]) {
    const taskKey = stablePlanTaskKey(nextTask);
    const taskEdit = taskEditForBoardTask(nextTask);
    const previousPlanTaskEdits = planTaskEdits;
    setAssignmentStatus("Saving move...");
    startTransition(() => {
      setPlanTaskEdits((current) => ({
        ...current,
        [taskKey]: taskEdit,
      }));
    });
    if (qaFixtureMode) {
      setAssignmentStatus("QA fixture move only - not saved");
      return;
    }
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
        setPlanTaskEdits(previousPlanTaskEdits);
        setAssignmentStatus(err instanceof Error ? err.message : "Move save failed");
      });
  }

  const resolveOrderConnectionForPlanTask = useCallback((task: DraggablePlanTask): PlanTaskOrderConnection => {
    const assignedId = assignedOrderIdForTask(task, planTaskLinks);
    if (assignedId && activeTuesdayOrders.some((order) => order.id === assignedId)) {
      return { orderId: assignedId, confidence: "confirmed" };
    }
    const linkedId = task.linkedOrderIds.find((id) => activeTuesdayOrders.some((order) => order.id === id));
    if (linkedId) return { orderId: linkedId, confidence: "confirmed" };
    const exactOrder = exactOrderForPlanTask(task, activeTuesdayOrders);
    if (exactOrder) return { orderId: exactOrder.id, confidence: "exact" };
    const scored = activeTuesdayOrders
      .map((order) => ({ order, score: orderNameMatchScore(order, task.rowName, ...task.linkedOrders.map((linked) => linked.name)) }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score || ((orderDaysUntil(a.order.shipDate) ?? 999) - (orderDaysUntil(b.order.shipDate) ?? 999)));
    return scored[0] ? { orderId: scored[0].order.id, confidence: "possible" } : { orderId: null, confidence: "none" };
  }, [activeTuesdayOrders, planTaskLinks]);

  const resolveOrderIdForPlanTask = useCallback((task: DraggablePlanTask) => {
    return resolveOrderConnectionForPlanTask(task).orderId;
  }, [resolveOrderConnectionForPlanTask]);

  useEffect(() => {
    setOrderRowsWeekIndex((current) => Math.min(current, Math.max(visibleProductionWeeks.length - 1, 0)));
  }, [visibleProductionWeeks.length]);
  const orderRowsWeek = visibleProductionWeeks[orderRowsWeekIndex] ?? visibleProductionWeeks[0] ?? null;
  const orderRowsWeekKey = orderRowsWeek ? planningWeekStartKey(orderRowsWeek) ?? orderRowsWeek.id : "";
  const boardOrderJourneyRows = useMemo(() => buildOrderJourneyRows({
    tasks: boardTasks,
    weeks: visibleProductionWeeks,
    orders: activeTuesdayOrders,
    planTaskLinks,
    resolveOrderId: resolveOrderIdForPlanTask,
    resolveOrderConnection: resolveOrderConnectionForPlanTask,
    weekTitleForTask: (task) => weekTitleById.get(task.weekId) ?? task.weekId,
  }), [boardTasks, visibleProductionWeeks, activeTuesdayOrders, planTaskLinks, resolveOrderIdForPlanTask, resolveOrderConnectionForPlanTask, weekTitleById]);
  const orderJourneyRowsBase = useMemo(() => orderRowsWeek ? buildOrderJourneyRows({
    tasks: boardTasks.filter((task) => task.weekId === orderRowsWeek.id),
    appTasks: visibleAppTasks.filter((task) => appTaskFallsInWeek(task, orderRowsWeek)),
    weeks: [orderRowsWeek],
    orders: activeTuesdayOrders,
    planTaskLinks,
    resolveOrderId: resolveOrderIdForPlanTask,
    resolveOrderConnection: resolveOrderConnectionForPlanTask,
    weekTitleForTask: (task) => weekTitleById.get(task.weekId) ?? task.weekId,
  }) : [], [orderRowsWeek, boardTasks, visibleAppTasks, activeTuesdayOrders, planTaskLinks, resolveOrderIdForPlanTask, resolveOrderConnectionForPlanTask, weekTitleById]);
  const orderJourneyRows = useMemo(() => applyOrderJourneyRowOrder(orderJourneyRowsBase, orderRowsWeekKey ? orderRowOrders[orderRowsWeekKey] : undefined), [orderJourneyRowsBase, orderRowOrders, orderRowsWeekKey]);

  function persistOrderJourneyRowOrder(weekKey: string, rowIds: string[] | null) {
    if (!weekKey) return;
    const previous = orderRowOrders;
    setOrderRowOrders((current) => {
      const next = { ...current };
      if (rowIds?.length) next[weekKey] = rowIds;
      else delete next[weekKey];
      return next;
    });
    setAssignmentStatus(rowIds?.length ? "Saving order priority..." : "Resetting order priority...");
    if (qaFixtureMode) {
      setAssignmentStatus(rowIds?.length ? "QA fixture order priority only - not saved" : "QA fixture order priority reset");
      return;
    }
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderRowOrder: { weekKey, rowIds } }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((data) => Promise.reject(new Error(data.error ?? "Order priority save failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderOverrides) setOrderOverrides(data.state.orderOverrides);
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus(rowIds?.length ? "Order priority saved" : "Order priority reset");
      })
      .catch((err) => {
        setOrderRowOrders(previous);
        setAssignmentStatus(err instanceof Error ? err.message : "Order priority save failed");
      });
  }

  function moveOrderJourneyRow(sourceRowId: string, targetRowId: string) {
    if (!orderRowsWeekKey || sourceRowId === targetRowId) return;
    const activeIds = activeOrderJourneyRowIds(orderJourneyRowsBase);
    const activeIdSet = new Set(activeIds);
    if (!activeIdSet.has(sourceRowId) || !activeIdSet.has(targetRowId)) return;
    const saved = orderRowOrders[orderRowsWeekKey] ?? [];
    const current = [...saved.filter((id) => activeIdSet.has(id)), ...activeIds.filter((id) => !saved.includes(id))];
    const next = reorderStringList(current, sourceRowId, targetRowId);
    if (next.join("|") === current.join("|")) return;
    persistOrderJourneyRowOrder(orderRowsWeekKey, next);
  }

  function resetOrderJourneyRowOrder() {
    if (!orderRowsWeekKey) return;
    persistOrderJourneyRowOrder(orderRowsWeekKey, null);
  }
  function executeMarkOrderCompleteInTuesday(order: UiOrder, completion: CompletionDecision) {
    const note = completion.note || `Marked complete in Tuesday. Source Monday status at time of edit: ${orderStatusLabel(order)}.`;
    const previousOrderOverrides = orderOverrides;
    setOrderOverrides((current) => ({
      ...current,
      [String(order.id)]: { status: "completed", reason: completion.reason, note, updatedAt: new Date().toISOString(), updatedBy: "Tuesday" },
    }));
    setSelectedOrderId((current) => current === order.id ? null : current);
    setOpenOrderId((current) => current === order.id ? null : current);
    setAssignmentStatus("Marking order complete in Tuesday...");
    if (qaFixtureMode) {
      setAssignmentStatus("QA fixture order override only - not saved");
      return;
    }
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderOverride: { orderId: order.id, status: "completed", reason: completion.reason, note } }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((data) => Promise.reject(new Error(data.error ?? "Order override save failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        if (data.state?.orderOverrides) setOrderOverrides(data.state.orderOverrides);
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus("Order marked complete in Tuesday");
      })
      .catch((err) => {
        setOrderOverrides(previousOrderOverrides);
        setAssignmentStatus(err instanceof Error ? err.message : "Order override save failed");
      });
  }

  function markOrderCompleteInTuesday(order: UiOrder) {
    setCompletionRequest({ type: "order", order });
  }

  function executeMarkIntakeOrderCompleteInTuesday(item: OrderIntakeItem, completion: CompletionDecision) {
    const note = completion.note || `Marked complete in Tuesday from intake review. Invoice: ${item.invoiceNumber || "not recorded"}.`;
    const previousOrderOverrides = orderOverrides;
    setOrderOverrides((current) => ({
      ...current,
      [item.orderId]: { status: "completed", reason: completion.reason, note, updatedAt: new Date().toISOString(), updatedBy: "Tuesday" },
    }));
    setOpenIntakeOrderId((current) => current === item.orderId ? null : current);
    setOrderIntakeStatus("Marking order complete in Tuesday...");
    if (qaFixtureMode) {
      setOrderIntakeStatus("QA fixture intake override only - not saved");
      return;
    }
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderOverride: { orderId: item.orderId, status: "completed", reason: completion.reason, note } }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((data) => Promise.reject(new Error(data.error ?? "Intake order override save failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        if (data.state?.orderOverrides) setOrderOverrides(data.state.orderOverrides);
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setOrderIntakeStatus("Order marked complete in Tuesday");
      })
      .catch((err) => {
        setOrderOverrides(previousOrderOverrides);
        setOrderIntakeStatus(err instanceof Error ? err.message : "Intake order override save failed");
      });
  }

  function markIntakeOrderCompleteInTuesday(item: OrderIntakeItem) {
    setCompletionRequest({ type: "intake", item });
  }

  function executeRestoreCompletedTuesdayOrder(item: CompletedTuesdayItem) {
    const previousOrderOverrides = orderOverrides;
    setOrderOverrides((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setAssignmentStatus("Restoring order to active views...");
    setOrderIntakeStatus("Restoring order to active views...");
    if (qaFixtureMode) {
      setAssignmentStatus("QA fixture restore only - not saved");
      setOrderIntakeStatus("QA fixture restore only - not saved");
      return;
    }
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderOverride: { orderId: item.id, status: "active" } }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((data) => Promise.reject(new Error(data.error ?? "Order restore failed"))))
      .then((data: { state?: PlanTaskLinkStatePayload; storage?: PlanTaskLinksStorage }) => {
        if (data.storage) setPlanTaskLinksStorage(data.storage);
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        if (data.state?.taskEdits) setPlanTaskEdits(data.state.taskEdits);
        if (data.state?.orderRowOrders) setOrderRowOrders(data.state.orderRowOrders);
        setOrderOverrides(data.state?.orderOverrides ?? {});
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus("Order restored to active Tuesday views");
        setOrderIntakeStatus("Order restored to active Tuesday views");
      })
      .catch((err) => {
        setOrderOverrides(previousOrderOverrides);
        const message = err instanceof Error ? err.message : "Order restore failed";
        setAssignmentStatus(message);
        setOrderIntakeStatus(message);
      });
  }

  function restoreCompletedTuesdayOrder(item: CompletedTuesdayItem) {
    setCompletionRequest({ type: "restore", item });
  }

  function confirmCompletionRequest(decision: CompletionDecision | null) {
    const request = completionRequest;
    if (!request) return;
    setCompletionRequest(null);
    if (request.type === "restore") {
      executeRestoreCompletedTuesdayOrder(request.item);
      return;
    }
    if (!decision) return;
    if (request.type === "order") executeMarkOrderCompleteInTuesday(request.order, decision);
    else executeMarkIntakeOrderCompleteInTuesday(request.item, decision);
  }
  const openOrderTasks = useMemo(() => {
    if (!openOrder) return [];
    return boardOrderJourneyRows.find((row) => row.order?.id === openOrder.id)?.tasks ?? [];
  }, [openOrder, boardOrderJourneyRows]);
  const selectedOrderTasks = useMemo(() => {
    if (!selectedOrder) return [];
    return boardOrderJourneyRows.find((row) => row.order?.id === selectedOrder.id)?.tasks ?? [];
  }, [selectedOrder, boardOrderJourneyRows]);

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
      setOpenIntakeOrderId(null);
      setSelectedAssignmentTask(null);
      setShowNewOrder(false);
      if (activeTaskId || activeAppTaskId) handleBoardDragCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, activeAppTaskId]);

  useEffect(() => {
    if (!activeTaskId && !activeAppTaskId) return;
    function recordPointer(event: PointerEvent | MouseEvent | TouchEvent) {
      if ("touches" in event) {
        const touch = event.touches[0] ?? event.changedTouches[0];
        if (touch) lastBoardPointerRef.current = { x: touch.clientX, y: touch.clientY };
        return;
      }
      lastBoardPointerRef.current = { x: event.clientX, y: event.clientY };
    }
    window.addEventListener("pointermove", recordPointer, true);
    window.addEventListener("mousemove", recordPointer, true);
    window.addEventListener("touchmove", recordPointer, true);
    return () => {
      window.removeEventListener("pointermove", recordPointer, true);
      window.removeEventListener("mousemove", recordPointer, true);
      window.removeEventListener("touchmove", recordPointer, true);
    };
  }, [activeTaskId, activeAppTaskId]);

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
    lastBoardPointerRef.current = null;
    setActiveTaskId(null);
    setActiveAppTaskId(null);
    setDropPreview(null);
  }

  function handleBoardDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    if (suggestedStepIdFromDragId(activeId)) return;
    lastBoardPointerRef.current = null;
    const task = boardTasks.find((current) => current.id === activeId);
    if (task) {
      dragStartBoardTasksRef.current = boardTasks;
      lastBoardPreviewRef.current = null;
      setActiveTaskId(activeId);
      setActiveAppTaskId(null);
      setDropPreview({ weekId: task.weekId, day: task.day, person: task.person, insertAfter: true });
      return;
    }
    const appTask = visibleAppTasks.find((current) => current.id === activeId);
    const appWeek = appTask ? visibleProductionWeeks.find((candidate) => appTaskFallsInWeek(appTask, candidate)) : null;
    if (!appTask || !appWeek) return;
    dragStartBoardTasksRef.current = null;
    lastBoardPreviewRef.current = null;
    setActiveTaskId(null);
    setActiveAppTaskId(activeId);
    setDropPreview({ weekId: appWeek.id, day: appTask.day, person: appTask.person, insertAfter: true });
  }

  function fallbackBoardOverIdFromPointer(event: DragOverEvent | DragEndEvent) {
    const pointId = lastBoardPointerRef.current ? boardDropIdFromPoint(lastBoardPointerRef.current.x, lastBoardPointerRef.current.y) : null;
    return pointId ?? boardFallbackOverIdFromDrag(event);
  }

  function boardDropTargetFromOverIdWithSuggestions(overId: string) {
    const orderDay = parseOrderJourneyDay(overId);
    if (orderDay) {
      const sourceTask = activeTaskId ? boardTasks.find((task) => task.id === activeTaskId) : null;
      const sourceAppTask = activeAppTaskId ? visibleAppTasks.find((task) => task.id === activeAppTaskId) : null;
      return { weekId: orderDay.weekId, day: orderDay.day, person: sourceTask?.person ?? sourceAppTask?.person ?? "nick", rowId: orderDay.rowId, overId: undefined as string | undefined, overTaskId: undefined as string | undefined, overSuggestedId: undefined as string | undefined };
    }
    const target = boardDropTargetFromOverId(boardTasks, overId);
    if (target) return { ...target, overId: target.overTaskId, overSuggestedId: undefined as string | undefined };
    const appTarget = visibleAppTasks.find((task) => task.id === overId);
    const appWeek = appTarget ? visibleProductionWeeks.find((candidate) => appTaskFallsInWeek(appTarget, candidate)) : null;
    if (appTarget && appWeek) return { weekId: appWeek.id, day: appTarget.day, person: appTarget.person, overId, overTaskId: undefined as string | undefined, overSuggestedId: undefined as string | undefined };
    const suggestedId = suggestedStepIdFromDragId(overId);
    const step = suggestedId ? editableSteps.find((item) => item.id === suggestedId) : null;
    const week = step ? visibleProductionWeeks.find((candidate) => suggestedStepFallsInWeek(step, candidate)) : null;
    return step && week ? { weekId: week.id, day: step.day, person: step.person, overId, overTaskId: undefined as string | undefined, overSuggestedId: step.id } : null;
  }

  function previewBoardTaskMove(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = fallbackBoardOverIdFromPointer(event) ?? (event.over?.id ? String(event.over.id) : null);
    if (!overId || (!activeTaskId && !activeAppTaskId)) return;
    const target = boardDropTargetFromOverIdWithSuggestions(overId);
    if (!target) return;
    const insertAfter = target.overId ? shouldInsertAfterOver(event) : true;
    const previewKey = [activeId, target.rowId ?? "board", target.weekId, target.day, target.person, target.overId ?? "lane", insertAfter ? "after" : "before"].join(":");
    if (lastBoardPreviewRef.current === previewKey) return;
    lastBoardPreviewRef.current = previewKey;
    setDropPreview({ weekId: target.weekId, day: target.day, person: target.person, rowId: target.rowId, overId: target.overId, insertAfter });
  }

  function handleBoardDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const original = dragStartBoardTasksRef.current;
    const overId = fallbackBoardOverIdFromPointer(event) ?? (event.over?.id ? String(event.over.id) : null);
    const draggedAppTask = activeAppTaskId ? visibleAppTasks.find((task) => task.id === activeAppTaskId) : null;
    if (draggedAppTask) {
      const target = overId ? boardDropTargetFromOverIdWithSuggestions(overId) : null;
      const targetWeek = target ? visibleProductionWeeks.find((week) => week.id === target.weekId) : null;
      const dateOption = targetWeek && target ? suggestedDateOptionForWeekDay(targetWeek, target.day) : null;
      if (target && dateOption) {
        updateAppTask(draggedAppTask, { day: target.day, person: target.person, scheduledDate: dateOption.dateIso });
      }
      clearBoardDragState();
      return;
    }
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

  function openIntakeReview(orderId: string) {
    setSelectedAssignmentTask(null);
    setSelectedWorkflow(null);
    setSelectedOrderId(null);
    setOpenOrderId(null);
    setOpenIntakeOrderId(orderId);
  }

  function selectOrderForAppTask(task: AppPlanTask) {
    if (task.orderId != null) {
      if (selectedOrderId === task.orderId) {
        setSelectedAssignmentTask(null);
        setSelectedWorkflow(null);
        setSelectedOrderId(null);
        return;
      }
      selectOrder(task.orderId);
      return;
    }
    if (task.orderUuid) openIntakeReview(task.orderUuid);
  }

  function openAppTask(task: AppPlanTask) {
    if (task.orderId != null) {
      openOrderOverview(task.orderId);
      return;
    }
    if (task.orderUuid) openIntakeReview(task.orderUuid);
  }

  function assignPlanTaskToOrder(task: AssignablePlanTask, orderId: number, placement?: PlanTaskPlacement) {
    const taskKey = stablePlanTaskKey(task);
    const linkValue = linkValueForPlanTaskSave(orderId, placement);
    const previousPlanTaskLinks = planTaskLinks;
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
        setPlanTaskLinks(previousPlanTaskLinks);
      });
  }

  function removePlanTaskLink(task: AssignablePlanTask) {
    const taskKey = stablePlanTaskKey(task);
    const previousPlanTaskLinks = planTaskLinks;
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
        broadcastPlanTaskLinkChange(data.state?.updatedAt);
        setAssignmentStatus("Order connection removed");
      })
      .catch((err) => {
        setPlanTaskLinks(previousPlanTaskLinks);
        setAssignmentStatus(err instanceof Error ? err.message : "Save failed");
      });
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

  async function refreshOrderIntakeList() {
    setOrderIntakeBusy(true);
    try {
      await loadOrderIntake(false);
    } finally {
      setOrderIntakeBusy(false);
    }
  }

  async function saveIntakeDraft(orderId: string, tasks: OrderIntakeTaskDraft[]) {
    setOrderIntakeBusy(true);
    try {
      const response = await fetch(`/api/production/order-intake/${orderId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      const data = await response.json().catch(() => ({})) as OrderIntakeApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.error || "Draft save failed");
      await loadOrderIntake(true);
      setOrderIntakeStatus("Draft saved");
    } finally {
      setOrderIntakeBusy(false);
    }
  }

  async function approveIntakeOrder(orderId: string, tasks: OrderIntakeTaskDraft[]) {
    setOrderIntakeBusy(true);
    try {
      const response = await fetch(`/api/production/order-intake/${orderId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks, approvedBy: "Tuesday review" }),
      });
      const data = await response.json().catch(() => ({})) as OrderIntakeApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.error || "Approval failed");
      if (Array.isArray(data.items)) setOrderIntakeItems(data.items);
      await loadOrderIntake(true);
      setOrderIntakeStatus("Added to Tuesday schedule");
      setOpenIntakeOrderId(null);
    } finally {
      setOrderIntakeBusy(false);
    }
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
          const intakeHours = approvedIntakeAppTasks
            .filter((task) => appTaskCountsTowardWorkshopCapacity(task) && task.scheduledDate === option.dateIso && task.person === person && !task.done)
            .reduce((sum, task) => sum + Number(task.estimatedHours || 1), 0);
          summaries[dateCapacityKey(option.dateIso, person)] = summarizeLaneCapacity({ existingTaskCount, draftHours: draftHours + intakeHours });
          summaries[laneCapacityKey(day, person)] = summaries[dateCapacityKey(option.dateIso, person)];
        }
      }
    }
    return summaries;
  }, [visibleProductionWeeks, editableSteps, boardTasks, approvedIntakeAppTasks]);

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
    <div data-mobile-workshop-header-controls="true" style={{ display: isRailNarrow ? "grid" : "flex", gridTemplateColumns: isRailNarrow ? "1fr" : undefined, gap: isRailNarrow ? 6 : 8, flexWrap: "wrap", alignItems: "center", justifyContent: isRailNarrow ? "stretch" : "flex-start", width: isRailNarrow ? "100%" : undefined, minWidth: 0 }}>
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
    <>
      <OrderIntakeRailCard
        items={activeOrderIntakeItems}
        status={orderIntakeStatus}
        busy={orderIntakeBusy}
        onRefresh={refreshOrderIntakeList}
        onOpen={openIntakeReview}
      />
      {!newOrderCoveredByIntake && (
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
      )}
    </>
  );

  const weekSections = visibleProductionWeeks.map((week, index) => (
    <MonthWeekSection
      key={week.id}
      week={week}
      tasks={boardTasks}
      suggestedSteps={(showTasksInMonth || approvedSteps) ? editableSteps.filter((step) => suggestedStepFallsInWeek(step, week)) : []}
      approvedSuggestions={approvedSteps}
      selectedOrder={selectedOrder}
      appTasks={visibleAppTasks}
      planTaskLinks={planTaskLinks}
      planTaskLinksLoaded={planTaskLinksLoaded}
      activeTaskId={activeTaskId ?? activeAppTaskId}
      dropPreview={dropPreview}
      isDraftChanged={isDraftChanged}
      showDraftControls={index === 0}
      onResetDraftLayout={resetBoardDraftLayout}
      personFilter={personFilter}
      resolveTaskOrderId={resolveOrderIdForPlanTask}
      resolveTaskOrderConnection={resolveOrderConnectionForPlanTask}
      onTaskSelect={(task) => selectOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
      onTaskOpen={(task) => openOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
      onTaskEdit={setEditingTask}
      onTaskDoneToggle={toggleBoardTaskDone}
      onAppTaskSelect={selectOrderForAppTask}
      onAppTaskOpen={openAppTask}
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
          appTasks={visibleAppTasks}
          planTaskLinks={planTaskLinks}
          planTaskLinksLoaded={planTaskLinksLoaded}
          personFilter={personFilter}
          resolveTaskOrderId={resolveOrderIdForPlanTask}
          resolveTaskOrderConnection={resolveOrderConnectionForPlanTask}
          onTaskSelect={(task) => selectOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
          onTaskOpen={(task) => openOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
          onTaskEdit={setEditingTask}
          onTaskDoneToggle={toggleBoardTaskDone}
          onAppTaskSelect={selectOrderForAppTask}
          onAppTaskOpen={openAppTask}
        />
      ))}
    </section>
  ) : null;

  const intakeReviewModal = openIntakeItem ? (
    <OrderIntakeReviewModal
      key={openIntakeItem.orderId}
      item={openIntakeItem}
      dateOptions={suggestedDateOptions}
      busy={orderIntakeBusy}
      onClose={() => setOpenIntakeOrderId(null)}
      onMarkComplete={() => markIntakeOrderCompleteInTuesday(openIntakeItem)}
      onSave={(tasks) => saveIntakeDraft(openIntakeItem.orderId, tasks)}
      onApprove={(tasks) => approveIntakeOrder(openIntakeItem.orderId, tasks)}
    />
  ) : null;

  const planningBoard = (
    <DndContext
      id="production-plan-board"
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      onDragStart={handleBoardDragStart}
      onDragOver={previewBoardTaskMove}
      onDragEnd={handleBoardDragEnd}
      onDragCancel={handleBoardDragCancel}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: isRailNarrow ? 8 : 14, minWidth: 0 }}>
        <style>{ORDER_JOURNEY_MOBILE_CSS}</style>
        {workshopHeaderControl}
        {isRailNarrow && <OrderHealthStrip orders={activeTuesdayOrders} orderCostings={orderCostings} activeFilter={railFilter} onFilterChange={onRailFilterChange} />}
        {planViewMode === "schedule" ? (
          <>
            {newOrderPanel}
            {weekSections}
            {historySections}
          </>
        ) : (
          orderRowsWeek ? (
            <OrderJourneyView
              rows={orderJourneyRows}
              week={orderRowsWeek}
              weekIndex={orderRowsWeekIndex}
              weekCount={visibleProductionWeeks.length}
              selectedOrder={selectedOrder}
              personFilter={personFilter}
              dayFilter={orderDayFilter}
              manualRowOrderActive={Boolean(orderRowsWeekKey && orderRowOrders[orderRowsWeekKey]?.length)}
              activeTaskId={activeTaskId ?? activeAppTaskId}
              dropPreview={dropPreview}
              onDayFilterChange={setOrderDayFilter}
              onMoveRow={moveOrderJourneyRow}
              onResetRowOrder={resetOrderJourneyRowOrder}
              onPreviousWeek={() => setOrderRowsWeekIndex((current) => Math.max(0, current - 1))}
              onThisWeek={() => setOrderRowsWeekIndex(0)}
              onNextWeek={() => setOrderRowsWeekIndex((current) => Math.min(visibleProductionWeeks.length - 1, current + 1))}
              onTaskEdit={setEditingTask}
              onTaskSelect={(task) => task.appTask ? selectOrderForAppTask(task.appTask) : selectOrderForPlanTask({ ...task, weekTitle: task.weekTitle })}
              onTaskOpen={(task) => task.appTask ? openAppTask(task.appTask) : openOrderForPlanTask({ ...task, weekTitle: task.weekTitle })}
              onOrderOpen={openOrderOverview}
              onTaskDoneToggle={toggleOrderJourneyTaskDone}
            />
          ) : (
            <section style={{ border: `1px solid ${DT.border}`, borderRadius: DT.radius, background: DT.cardBg, padding: 22, fontFamily: DT.sans, color: DT.textMuted }}>No production weeks available.</section>
          )
        )}
        {editingTask && (
          <WorkshopTaskEditor
            key={editingTask.id}
            task={editingTask}
            orders={activeTuesdayOrders}
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
      <DragOverlay dropAnimation={null}>{activeTask ? <PlanTaskDragCard task={activeTask} /> : activeAppTask ? <AppTaskDragCard task={activeAppTask} /> : null}</DragOverlay>
    </DndContext>
  );

  const orderRail = (
    <OrderRail
      orders={activeTuesdayOrders}
      orderCostings={orderCostings}
      selectedOrder={selectedOrder}
      selectedOrderTasks={selectedOrderTasks}
      assignmentTask={selectedAssignmentTask}
      assignmentStatus={assignmentStatus}
      onAssignTask={assignPlanTaskToOrder}
      onRemoveTaskLink={removePlanTaskLink}
      onPlanTaskEdit={setEditingTask}
      onPlanTaskDoneToggle={toggleBoardTaskDone}
      onWorkflowTaskDoneToggle={handleWorkflowTaskDoneToggle}
      canRemoveAssignmentLink={selectedAssignmentTask ? Boolean(assignedOrderIdForTask(selectedAssignmentTask, planTaskLinks)) : false}
      newOrderCard={railNewOrderCard}
      onWorkflowChange={handleSelectedWorkflowChange}
      onSelect={selectOrder}
      onOpenOrder={openOrderOverview}
      onMarkOrderComplete={markOrderCompleteInTuesday}
      completedItems={completedTuesdayItems}
      onRestoreCompletedOrder={restoreCompletedTuesdayOrder}
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
  const completionDialog = completionRequest ? (
    <TuesdayCompletionDialog
      key={completionRequestKey(completionRequest)}
      request={completionRequest}
      onCancel={() => setCompletionRequest(null)}
      onConfirm={confirmCompletionRequest}
    />
  ) : null;

  if (!planTaskLinksLoaded) {
    return <TuesdayPlanStateLoading isNarrow={isRailNarrow} />;
  }

  const desktopHealthStrip = !isRailNarrow ? (
    <OrderHealthStrip orders={activeTuesdayOrders} orderCostings={orderCostings} activeFilter={railFilter} onFilterChange={onRailFilterChange} />
  ) : null;

  if (isRailNarrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {planningBoard}
        {delightEnabled && delightBurst ? <DelightDoneBurst key={delightBurst.id} origin={delightBurst.origin} /> : null}
        {intakeReviewModal}
        {openOrder && <OrderOverviewOverlay key={`overlay-${openOrder.id}`} order={openOrder} planTasks={openOrderTasks} onMarkComplete={markOrderCompleteInTuesday} onPlanTaskEdit={setEditingTask} onPlanTaskDoneToggle={toggleBoardTaskDone} onWorkflowTaskDoneToggle={handleWorkflowTaskDoneToggle} onRemoveTaskLink={removePlanTaskLink} onClose={closeOrderOverview} onWorkflowChange={keepOverlayWorkflow} />}
        {completionDialog}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {desktopHealthStrip}
      <div
        className="production-plan-layout-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "318px minmax(0, 1fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        {orderRail}
        {planningBoard}
        {delightEnabled && delightBurst ? <DelightDoneBurst key={delightBurst.id} origin={delightBurst.origin} /> : null}
        {intakeReviewModal}
        {openOrder && <OrderOverviewOverlay key={`overlay-${openOrder.id}`} order={openOrder} planTasks={openOrderTasks} onMarkComplete={markOrderCompleteInTuesday} onPlanTaskEdit={setEditingTask} onPlanTaskDoneToggle={toggleBoardTaskDone} onWorkflowTaskDoneToggle={handleWorkflowTaskDoneToggle} onRemoveTaskLink={removePlanTaskLink} onClose={closeOrderOverview} onWorkflowChange={keepOverlayWorkflow} />}
        {completionDialog}
      </div>
    </div>
  );
}

export type PlanClientProps = {
  rows: PlanRow[];
  orders: UiOrder[];
  orderCostings?: OrderCostingContext;
  syncedAt: string;
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
  delightEnabled?: boolean;
  qaFixtureMode?: boolean;
  initialUtilityView?: "processTemplates" | null;
  initialPlanTaskLinkState?: PlanTaskLinkStatePayload;
  initialPlanTaskLinksStorage?: PlanTaskLinksStorage;
  initialPlanTaskLinksDisabledReason?: string;
};

export default function PlanClient({
  rows,
  orders,
  orderCostings,
  syncedAt,
  source,
  mondayError,
  delightEnabled = false,
  qaFixtureMode = false,
  initialUtilityView = null,
  initialPlanTaskLinkState,
  initialPlanTaskLinksStorage = "blob",
  initialPlanTaskLinksDisabledReason,
}: PlanClientProps) {
  const [railFilter, setRailFilter] = useState<RailFilter>("all");
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
      section={initialUtilityView === "processTemplates" ? "processTemplates" : "plan"}
      pageTitle="Production Plan"
      syncedAt={syncedAt}
      source={source}
      mondayError={mondayError}
      pageTitleAccessory={undefined}
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
        {initialUtilityView === "processTemplates" ? (
          <ProcessTemplatesView />
        ) : rows.length === 0 ? (
          <section
            style={{
              margin: "0 auto",
              maxWidth: 780,
              padding: "42px 24px",
              textAlign: "center",
              fontSize: 13,
              color: DT.textSecondary,
              fontFamily: DT.sans,
              background: DT.cardBg,
              border: `1px solid ${DT.border}`,
              borderRadius: DT.radius,
              boxShadow: DT.shadow,
            }}
          >
            <h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 26 }}>No Production Plan rows loaded</h2>
            <p style={{ margin: "9px auto 0", maxWidth: 640, lineHeight: 1.5 }}>
              Monday remains the current workshop source for production. This empty state means Tuesday could not load that source in this environment; do not treat it as proof that the workshop plan is empty.
            </p>
            {mondayError && <p style={{ margin: "14px auto 0", maxWidth: 640, border: "1px solid rgba(180,107,70,0.16)", borderRadius: 10, background: "rgba(180,107,70,0.08)", color: "#8f3f24", padding: 10, fontWeight: 850 }}>Production source issue: {mondayError}</p>}
          </section>
        ) : (
          <MonthView
            weeks={activeWeeks}
            newOrder={newOrder}
            orders={orders}
            orderCostings={orderCostings}
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
