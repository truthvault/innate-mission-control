import { readFileSync } from 'node:fs';

const clientSource = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../app/api/production/plan-task-links/route.ts', import.meta.url), 'utf8');
const dragSource = readFileSync(new URL('../lib/production/plan-drag.ts', import.meta.url), 'utf8');

const clientMustHave = [
  ['plan task edits can store done state', 'done?: boolean'],
  ['plan task edits apply done state to cards', 'done: edit.done ?? task.done'],
  ['card renders a Done button', 'data-task-card-done-button="task-card-done-button"'],
  ['task cards use cleaned grid layout', 'data-task-card-clean-layout="true"'],
  ['task cards keep a separate title area', 'data-task-card-title="task-card-title"'],
  ['internal placeholder labels are shortened', 'return "Internal"'],
  ['task cards have a calmer minimum height', 'minHeight: isSelectedOrderTask ? 96 : 88'],
  ['task card edit action is compact', 'Edit'],
  ['done card can be undone', 'Undo'],
  ['done card is visually struck through', 'textDecoration: task.done ? "line-through" : "none"'],
  ['card done toggles persist through task edit save path', 'done: nextTask.done'],
  ['done button uses shared save handler', 'onTaskDoneToggle?: (task: DraggablePlanTask, done: boolean, origin?: DelightOrigin) => void'],
  ['order rows accept a done toggle handler', 'onTaskDoneToggle: (task: OrderJourneyTask, done: boolean, origin?: DelightOrigin) => void'],
  ['order rows render a Done button', 'data-order-row-done-button="order-row-done-button"'],
  ['order rows can undo done tasks', 'task.done ? "Undo" : "Done"'],
  ['order rows done button persists through same handler', 'cardRect: cardElement?.getBoundingClientRect()'],
  ['order rows done button guards parent interactions', 'data-order-row-done-button="order-row-done-button"\n                              onPointerDown={(event) => event.stopPropagation()}'],
  ['done click triggers delight burst', 'triggerDelightBurst(origin)'],
  ['delight burst renders when enabled', 'delightEnabled && delightBurst'],
  ['delight burst has visible unicorn marker', 'data-delight-done-burst="delight-done-burst"'],
  ['delight burst uses a canvas renderer', 'data-delight-canvas="pineapple-unicorn-canvas"'],
  ['delight burst draws from the clicked card origin', 'cardRect?: DOMRect'],
  ['delight burst has canvas engine', 'function runPineappleUnicornCanvas'],
  ['delight burst draws card shards', 'drawCardShard'],
  ['delight burst draws rainbow trail', 'drawRainbowTrail'],
  ['delight burst draws a pineapple shell', 'drawPineapple'],
  ['delight burst draws the flying unicorn', 'drawUnicorn'],
  ['delight burst draws polished unicorn', 'drawHyperRealisticUnicorn'],
  ['delight burst gives unicorn sunglasses', 'drawFrontFacingSunglasses'],
  ['delight burst gives unicorn smile', 'drawUnicornSmile'],
  ['delight burst has a straight-on face', 'drawFrontFacingUnicornFace'],
  ['delight burst draws symmetrical face highlights', 'drawFaceHighlight'],
  ['delight burst gives front face sunglasses', 'drawFrontFacingSunglasses'],
  ['delight burst has animated legs', 'drawUnicornLeg'],
  ['delight burst has premium mane motion', 'maneFlow'],
  ['delight burst has motion blur trail', 'drawUnicornMotionBlur'],
  ['delight burst flies straight out of pineapple', 'straightOutLaunch'],
  ['delight burst fills the screen', 'screenFillScale'],
  ['delight burst flies through the camera', 'cameraPassThrough'],
  ['delight burst exits right near eighty percent approach', 'rightExitAtEightyPercent'],
  ['delight burst has near-camera offscreen exit', 'offscreenRightExit'],
  ['delight burst aims mostly forward before peeling right', 'forwardThenRightExit'],
  ['delight burst unifies ending around camera impact', 'cameraImpact'],
  ['delight burst fades trail before impact', 'trailFadeBeforeImpact'],
  ['delight burst cuts off trail before immersion', 'trailCutoff'],
  ['delight burst avoids flame after camera impact', 'impactStart'],
  ['delight burst fades origin before camera hit', 'originFade'],
  ['delight burst tightens flame jet before cutoff', 'flameJetTightness'],
  ['delight burst fades out cleanly as it exits right', 'rightExitFade'],
  ['delight burst cuts the canvas cleanly after offscreen exit', 'slickOffscreenCutoff'],
  ['delight burst returns to the schedule without a black blink', 'noBlackExitBlink'],
  ['delight burst removes impact glow after right exit', 'noPostExitGlow'],
  ['delight burst does not arc sideways first', 'targetX = cx'],
  ['delight burst flies toward the screen', 'screenApproach'],
  ['delight burst has smoke trail', 'drawSmokeTrail'],
  ['delight burst smoke becomes flames', 'drawFlameTrail'],
  ['delight burst blends smoke into flame', 'flameMix'],
  ['delight burst has larger card explosion', 'length: 22'],
  ['delight burst runs for three seconds', 'DELIGHT_CANVAS_DURATION_MS = 3000'], 
  ['delight burst clears without an older timer killing a newer burst', 'current?.id === burstId ? null : current'],
  ['delight burst has legacy pineapple marker for live verification', 'data-delight-pineapple="delight-pineapple"'],
  ['delight burst has legacy flying unicorn marker for live verification', 'data-delight-flying-unicorn="delight-flying-unicorn"'],
  ['delight burst has canvas engine marker', 'Canvas Delight Engine'],
  ['delight burst no longer relies on CSS keyframes', 'requestAnimationFrame(frame)'],
];

const apiMustHave = [
  ['plan task API accepts done flag', 'done?: unknown'],
  ['plan task API persists boolean done state', 'if (typeof source.done === "boolean") edit.done = source.done'],
];

const dragMustHave = [
  ['draggable task type carries done state', 'done?: boolean'],
];

const forbiddenClientNeedles = [
  ['delight burst should not draw caption text', 'Done. Unicorn escaped the pineapple.'],
  ['delight burst should not draw text labels', 'fillText(label'],
  ['delight burst should not black-flash after the right exit', 'drawBlackTransition'],
  ['delight burst should not keep camera-impact glow after right exit', 'drawCameraImpactFlash(ctx, width, height, unicornX, unicornY, cameraImpact)'],
];

const missing = [
  ...clientMustHave.filter(([, needle]) => !clientSource.includes(needle)).map(([label, needle]) => ['client', label, needle]),
  ...apiMustHave.filter(([, needle]) => !apiSource.includes(needle)).map(([label, needle]) => ['api', label, needle]),
  ...dragMustHave.filter(([, needle]) => !dragSource.includes(needle)).map(([label, needle]) => ['drag', label, needle]),
];

const forbidden = forbiddenClientNeedles.filter(([, needle]) => clientSource.includes(needle)).map(([label, needle]) => ['client', label, needle]);

if (missing.length || forbidden.length) {
  console.error('Production Plan task-card done button requirements missing:');
  for (const [file, label, needle] of missing) console.error(`- ${file}: ${label}: ${needle}`);
  for (const [file, label, needle] of forbidden) console.error(`- ${file}: forbidden ${label}: ${needle}`);
  process.exit(1);
}

console.log('OK: production plan task-card done button requirements present');
