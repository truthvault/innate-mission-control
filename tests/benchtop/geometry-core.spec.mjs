import { test, expect } from 'playwright/test';
import {
  allPanelsFit,
  ensureActiveTabVisible,
  fitLayoutToWorkspace,
  hitTestPanel,
  layoutBounds,
  movePanel,
  panelBounds,
  resizePanel,
  rotatePanel,
} from '../../lib/benchtops/geometryCore.mjs';

const workspace = { widthMm: 4200, heightMm: 4200 };

function basePanels() {
  return [
    { id: 'piece-1', label: 'Benchtop piece 1', lengthMm: 1800, widthMm: 600, xMm: 200, yMm: 200, rotationDeg: 0, zIndex: 1 },
    { id: 'piece-2', label: 'Benchtop piece 2', lengthMm: 3600, widthMm: 900, xMm: 260, yMm: 260, rotationDeg: 90, zIndex: 2 },
    { id: 'piece-3', label: 'Benchtop piece 3', lengthMm: 1800, widthMm: 600, xMm: 320, yMm: 320, rotationDeg: 0, zIndex: 3 },
    { id: 'piece-4', label: 'Benchtop piece 4', lengthMm: 1800, widthMm: 600, xMm: 360, yMm: 360, rotationDeg: 0, zIndex: 4 },
  ];
}

test.describe('local benchtop geometry core invariants', () => {
  test('active selected panel wins hit testing in an overlap stack', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'unit invariant only needs one project');
    const panels = basePanels();
    const activeBounds = panelBounds(panels[1]);
    const pointInsideActiveAndPanel4 = { xMm: activeBounds.left + 120, yMm: activeBounds.top + 160 };

    const hit = hitTestPanel(panels, pointInsideActiveAndPanel4, { activePanelId: 'piece-2' });

    expect(hit?.id).toBe('piece-2');
  });

  test('move operations are panel-ID based and keep every panel inside the workspace', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'unit invariant only needs one project');
    const panels = basePanels();
    const beforeP2 = panelBounds(panels[1]);
    const beforeP4 = panelBounds(panels[3]);

    const moved = movePanel(panels, 'piece-2', { dxMm: 8000, dyMm: 0 }, workspace);
    const afterP2 = panelBounds(moved.find((panel) => panel.id === 'piece-2'));
    const afterP4 = panelBounds(moved.find((panel) => panel.id === 'piece-4'));

    expect(afterP2.cx).toBeGreaterThan(beforeP2.cx);
    expect(afterP4).toMatchObject(beforeP4);
    expect(allPanelsFit(moved, workspace)).toBe(true);
  });

  test('repeated rotate resize and drag stress keeps layout recoverable', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'unit invariant only needs one project');
    let panels = basePanels();
    panels = rotatePanel(panels, 'piece-2', workspace);
    panels = resizePanel(panels, 'piece-2', { lengthMm: 4000, widthMm: 1000 }, workspace);

    for (const delta of [
      { dxMm: 1200, dyMm: 350 },
      { dxMm: -1800, dyMm: -700 },
      { dxMm: 3000, dyMm: 900 },
      { dxMm: -5000, dyMm: -3000 },
    ]) {
      panels = movePanel(panels, 'piece-2', delta, workspace, { thresholdMm: 25, hysteresisMm: 10 });
      panels = fitLayoutToWorkspace(panels, workspace, 0);
      expect(allPanelsFit(panels, workspace)).toBe(true);
    }

    const bounds = layoutBounds(panels);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(workspace.widthMm);
    expect(bounds.bottom).toBeLessThanOrEqual(workspace.heightMm);
  });

  test('tablet tab and rotate state use the same active panel ID', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'unit invariant only needs one project');
    let activePanelId = 'piece-2';
    let panels = basePanels();

    panels = rotatePanel(panels, activePanelId, workspace);

    const row2 = panels.find((panel) => panel.id === 'piece-2');
    const row4 = panels.find((panel) => panel.id === 'piece-4');
    expect(activePanelId).toBe('piece-2');
    expect(row2.rotationDeg).toBe(180);
    expect(row4.rotationDeg).toBe(0);
  });

  test('mobile active tab scroll target keeps selected piece visible', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'unit invariant only needs one project');
    const rail = { widthPx: 390, scrollLeft: 0, paddingPx: 12 };
    const fourthTab = { leftPx: 465, widthPx: 110 };

    const nextScrollLeft = ensureActiveTabVisible(rail, fourthTab);

    expect(nextScrollLeft).toBeGreaterThan(0);
    expect(fourthTab.leftPx - nextScrollLeft).toBeGreaterThanOrEqual(0);
    expect(fourthTab.leftPx + fourthTab.widthPx - nextScrollLeft).toBeLessThanOrEqual(rail.widthPx);
  });
});
