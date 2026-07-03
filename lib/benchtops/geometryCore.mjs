// Deterministic geometry core for the Innate benchtop designer surface.
// Local/source module only: this is not wired to Shopify/live assets yet.

const EPSILON = 1e-9;

export function normaliseRotation(rotationDeg = 0) {
  const value = Number.isFinite(rotationDeg) ? rotationDeg : 0;
  return ((Math.round(value / 90) * 90) % 360 + 360) % 360;
}

export function rotatedSize(panel) {
  const rotation = normaliseRotation(panel.rotationDeg);
  const width = Number(panel.widthMm) || 0;
  const length = Number(panel.lengthMm) || 0;
  if (rotation === 90 || rotation === 270) {
    return { wMm: width, hMm: length, rotationDeg: rotation };
  }
  return { wMm: length, hMm: width, rotationDeg: rotation };
}

export function panelBounds(panel) {
  const size = rotatedSize(panel);
  const xMm = Number(panel.xMm) || 0;
  const yMm = Number(panel.yMm) || 0;
  return {
    id: panel.id,
    left: xMm,
    top: yMm,
    right: xMm + size.wMm,
    bottom: yMm + size.hMm,
    wMm: size.wMm,
    hMm: size.hMm,
    cx: xMm + size.wMm / 2,
    cy: yMm + size.hMm / 2,
    rotationDeg: size.rotationDeg,
  };
}

export function clampPanelToWorkspace(panel, workspace) {
  const bounds = panelBounds(panel);
  const maxX = Math.max(0, workspace.widthMm - bounds.wMm);
  const maxY = Math.max(0, workspace.heightMm - bounds.hMm);
  return {
    ...panel,
    xMm: clamp(Number(panel.xMm) || 0, 0, maxX),
    yMm: clamp(Number(panel.yMm) || 0, 0, maxY),
  };
}

export function clampPanelsToWorkspace(panels, workspace) {
  return panels.map((panel) => clampPanelToWorkspace(panel, workspace));
}

export function movePanel(panels, panelId, delta, workspace, snapOptions = {}) {
  return panels.map((panel) => {
    if (panel.id !== panelId) return panel;
    const moved = {
      ...panel,
      xMm: (Number(panel.xMm) || 0) + (Number(delta.dxMm) || 0),
      yMm: (Number(panel.yMm) || 0) + (Number(delta.dyMm) || 0),
    };
    const snapped = applySnap(moved, panels.filter((other) => other.id !== panelId), workspace, snapOptions);
    return clampPanelToWorkspace(snapped, workspace);
  });
}

export function resizePanel(panels, panelId, nextSize, workspace) {
  return panels.map((panel) => {
    if (panel.id !== panelId) return panel;
    const resized = {
      ...panel,
      lengthMm: positiveOr(panel.lengthMm, nextSize.lengthMm),
      widthMm: positiveOr(panel.widthMm, nextSize.widthMm),
    };
    return clampPanelToWorkspace(resized, workspace);
  });
}

export function rotatePanel(panels, panelId, workspace) {
  return panels.map((panel) => {
    if (panel.id !== panelId) return panel;
    return clampPanelToWorkspace({ ...panel, rotationDeg: normaliseRotation((panel.rotationDeg || 0) + 90) }, workspace);
  });
}

export function hitTestPanel(panels, point, { activePanelId = null } = {}) {
  // Active panel wins when the pointer is inside it. This avoids overlap states where
  // an older/later DOM element captures a drag meant for the selected panel.
  if (activePanelId) {
    const active = panels.find((panel) => panel.id === activePanelId);
    if (active && pointInBounds(point, panelBounds(active))) return active;
  }

  const byZ = [...panels].sort((a, b) => (Number(b.zIndex) || 0) - (Number(a.zIndex) || 0));
  return byZ.find((panel) => pointInBounds(point, panelBounds(panel))) || null;
}

export function fitLayoutToWorkspace(panels, workspace, paddingMm = 0) {
  if (!panels.length) return panels;
  const union = layoutBounds(panels);
  const dx = union.left < paddingMm ? paddingMm - union.left : union.right > workspace.widthMm - paddingMm ? workspace.widthMm - paddingMm - union.right : 0;
  const dy = union.top < paddingMm ? paddingMm - union.top : union.bottom > workspace.heightMm - paddingMm ? workspace.heightMm - paddingMm - union.bottom : 0;
  return clampPanelsToWorkspace(panels.map((panel) => ({ ...panel, xMm: (panel.xMm || 0) + dx, yMm: (panel.yMm || 0) + dy })), workspace);
}

export function layoutBounds(panels) {
  const bounds = panels.map(panelBounds);
  return bounds.reduce((acc, b) => ({
    left: Math.min(acc.left, b.left),
    top: Math.min(acc.top, b.top),
    right: Math.max(acc.right, b.right),
    bottom: Math.max(acc.bottom, b.bottom),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

export function allPanelsFit(panels, workspace) {
  return panels.every((panel) => {
    const b = panelBounds(panel);
    return b.left >= -EPSILON && b.top >= -EPSILON && b.right <= workspace.widthMm + EPSILON && b.bottom <= workspace.heightMm + EPSILON;
  });
}

export function ensureActiveTabVisible(rail, activeTab) {
  const railLeft = Number(rail.scrollLeft) || 0;
  const railRight = railLeft + (Number(rail.widthPx) || 0);
  const tabLeft = Number(activeTab.leftPx) || 0;
  const tabRight = tabLeft + (Number(activeTab.widthPx) || 0);
  const padding = Number(rail.paddingPx) || 0;

  if (tabLeft < railLeft + padding) return Math.max(0, tabLeft - padding);
  if (tabRight > railRight - padding) return Math.max(0, tabRight - (Number(rail.widthPx) || 0) + padding);
  return railLeft;
}

function applySnap(panel, others, workspace, options = {}) {
  const threshold = Number(options.thresholdMm) || 0;
  const hysteresis = Number(options.hysteresisMm) || 0;
  const previous = options.previousSnap || null;
  if (!threshold) return panel;

  const candidates = snapCandidates(panel, others, workspace);
  const activeThreshold = previous ? threshold + hysteresis : threshold;
  const xCandidate = closestCandidate(candidates.x, activeThreshold);
  const yCandidate = closestCandidate(candidates.y, activeThreshold);

  return {
    ...panel,
    xMm: xCandidate ? (Number(panel.xMm) || 0) + xCandidate.delta : panel.xMm,
    yMm: yCandidate ? (Number(panel.yMm) || 0) + yCandidate.delta : panel.yMm,
  };
}

function snapCandidates(panel, others, workspace) {
  const b = panelBounds(panel);
  const xTargets = [0, workspace.widthMm, workspace.widthMm / 2];
  const yTargets = [0, workspace.heightMm, workspace.heightMm / 2];
  for (const other of others) {
    const ob = panelBounds(other);
    xTargets.push(ob.left, ob.right, ob.cx);
    yTargets.push(ob.top, ob.bottom, ob.cy);
  }
  const panelXs = [b.left, b.right, b.cx];
  const panelYs = [b.top, b.bottom, b.cy];
  return {
    x: targetDeltas(panelXs, xTargets),
    y: targetDeltas(panelYs, yTargets),
  };
}

function targetDeltas(edges, targets) {
  const deltas = [];
  for (const edge of edges) for (const target of targets) deltas.push({ delta: target - edge, distance: Math.abs(target - edge) });
  return deltas;
}

function closestCandidate(candidates, threshold) {
  return candidates
    .filter((candidate) => candidate.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function pointInBounds(point, bounds) {
  return point.xMm >= bounds.left - EPSILON && point.xMm <= bounds.right + EPSILON && point.yMm >= bounds.top - EPSILON && point.yMm <= bounds.bottom + EPSILON;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positiveOr(current, next) {
  const value = Number(next);
  return Number.isFinite(value) && value > 0 ? value : current;
}
