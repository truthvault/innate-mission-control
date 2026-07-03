import { test, expect } from 'playwright/test';
import {
  addPieces,
  attachState,
  clickMobilePieceTab,
  dragPanelByVisibleIndex,
  loadConfigurator,
  measure,
  panelNumberFromLabel,
  panelNumberFromRow,
  panelNumberFromTab,
  rotatePanelRow,
  rotateSelectedPanel,
  selectPanelRow,
  setPanelDimensions,
} from './helpers/configurator.mjs';

test.describe('Innate benchtop live geometry regression suite (read-only)', () => {
  test('live smoke guard: defaults, protected controls, pricing and endpoint markers are present', async ({ page }, testInfo) => {
    await loadConfigurator(page, testInfo);
    const state = await measure(page);
    await attachState(testInfo, 'smoke-state', state);

    expect(state.panels.length).toBe(1);
    expect(state.selectedRotatePresent).toBe(true);
    expect(state.overflowX).toBe(false);
    expect(state.bodyText).toContain('Tōtara');
    expect(state.bodyText).toContain('1800');
    expect(state.bodyText).toContain('600');
    expect(state.bodyText).toContain('43');
    expect(state.bodyText).toContain('$1,299');
    expect(state.bodyText).not.toContain('Add a benchtop 1200');
    expect(state.bodyText).not.toContain('innate-benchtop-quote.vercel.app');
  });

  test('desktop regression: dragging selected overlapping rotated panel must not move another panel or leave preview', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only failure reproduction');
    await loadConfigurator(page, testInfo);
    await addPieces(page, 8);
    await rotatePanelRow(page, 2);
    await setPanelDimensions(page, 2, { length: 3600, width: 900 });

    const before = await measure(page);
    await attachState(testInfo, 'before-overlap-drag', before);
    expect(panelNumberFromRow(before.activeRow)).toBe(2);

    await page.locator('.slab-preview, .stage__preview').first().scrollIntoViewIfNeeded();
    await dragPanelByVisibleIndex(page, 1, 500, 0);
    const after = await measure(page);
    await attachState(testInfo, 'after-overlap-drag', after);

    // This is the desired invariant. It currently fails on live: active row 2 remains selected,
    // but the visible panel hit target being dragged can move panel 4 and push it outside preview.
    expect(after.offPreviewPanels, JSON.stringify(after.offPreviewPanels.map((p) => ({ id: p.id, label: p.label, rect: p.rect })), null, 2)).toHaveLength(0);

    const beforeP2 = before.panels.find((panel) => panelNumberFromLabel(panel) === 2);
    const afterP2 = after.panels.find((panel) => panelNumberFromLabel(panel) === 2);
    expect(beforeP2 && afterP2, 'panel 2 should be measurable before and after drag').toBeTruthy();
    const movedDistance = Math.hypot(afterP2.rect.cx - beforeP2.rect.cx, afterP2.rect.cy - beforeP2.rect.cy);
    expect(movedDistance, 'selected panel 2 should be the object that moves').toBeGreaterThan(20);
  });

  test('desktop regression: corner drag recovery keeps every panel within the design preview', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only failure reproduction');
    await loadConfigurator(page, testInfo);
    await addPieces(page, 8);
    await rotatePanelRow(page, 2);
    await setPanelDimensions(page, 2, { length: 3600, width: 900 });
    await page.locator('.slab-preview, .stage__preview').first().scrollIntoViewIfNeeded();
    await dragPanelByVisibleIndex(page, 1, 500, 0);
    await dragPanelByVisibleIndex(page, 1, -900, -600);
    const state = await measure(page);
    await attachState(testInfo, 'after-corner-drag', state);

    // Desired invariant for the future designer: no normal drag can strand panels far off-canvas.
    expect(state.offPreviewPanels, JSON.stringify(state.offPreviewPanels.map((p) => ({ id: p.id, label: p.label, rect: p.rect, preview: state.preview })), null, 2)).toHaveLength(0);
  });

  test('desktop regression: repeated move/resize stress does not corrupt geometry or controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only long interaction failure reproduction');
    await loadConfigurator(page, testInfo);
    await addPieces(page, 4);
    await rotatePanelRow(page, 2);
    await setPanelDimensions(page, 2, { length: 3600, width: 900 });

    const moves = [
      { dx: 180, dy: 80 },
      { dx: -220, dy: -100 },
      { dx: 320, dy: 140 },
      { dx: -360, dy: -160 },
      { dx: 450, dy: 60 },
      { dx: -500, dy: -80 },
    ];
    const snapshots = [];

    for (let i = 0; i < moves.length; i += 1) {
      await dragPanelByVisibleIndex(page, 1, moves[i].dx, moves[i].dy, { steps: 12 });
      if (i === 2) {
        await setPanelDimensions(page, 2, { length: 3000, width: 800 });
      }
      const state = await measure(page);
      snapshots.push({
        step: i + 1,
        move: moves[i],
        activeRow: panelNumberFromRow(state.activeRow),
        activePanel: state.activePanel ? panelNumberFromLabel(state.activePanel) : null,
        offPreviewPanels: state.offPreviewPanels.map((panel) => ({
          panel: panelNumberFromLabel(panel),
          id: panel.id,
          label: panel.label,
          rect: panel.rect,
        })),
        preview: state.preview,
        union: state.union,
        overflowX: state.overflowX,
        selectedRotatePresent: state.selectedRotatePresent,
      });

      // Desired long-session invariant: accumulated drag/resize/rotate work must not
      // strand panels off-canvas or desynchronise the active editor/control state.
      expect(state.overflowX).toBe(false);
      expect(state.selectedRotatePresent).toBe(true);
      expect(panelNumberFromRow(state.activeRow)).toBe(2);
      expect(state.offPreviewPanels, JSON.stringify(snapshots, null, 2)).toHaveLength(0);
    }

    await attachState(testInfo, 'long-interaction-geometry-stress', snapshots);
  });

  test('tablet regression: visible piece tab selects the same panel ID', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-chromium', 'tablet-only failure reproduction');
    await loadConfigurator(page, testInfo);
    await addPieces(page, 4);
    const click = await clickMobilePieceTab(page, 2);
    const state = await measure(page);
    await attachState(testInfo, 'tablet-piece-2-click', { click, state });

    expect(click.hit.text).toContain('1800');
    expect(panelNumberFromTab(state.activeTab)).toBe(2);
    expect(panelNumberFromRow(state.activeRow)).toBe(2);
  });

  test('tablet regression: rotate after selecting piece tab rotates that same piece', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-chromium', 'tablet-only failure reproduction');
    await loadConfigurator(page, testInfo);
    await addPieces(page, 4);
    await clickMobilePieceTab(page, 2);
    await rotateSelectedPanel(page);
    const state = await measure(page);
    await attachState(testInfo, 'tablet-rotate-after-piece-2-click', state);

    expect(panelNumberFromTab(state.activeTab)).toBe(2);
    expect(panelNumberFromRow(state.activeRow)).toBe(2);
    const row2 = state.rows.find((row) => row.index === 2);
    const row4 = state.rows.find((row) => row.index === 4);
    expect(row2?.text.toLowerCase()).toContain('vertical');
    expect(row4?.text.toLowerCase()).not.toContain('vertical');
  });

  test('mobile regression: active selected tab remains visible after adding four pieces', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile-only failure reproduction');
    await loadConfigurator(page, testInfo);
    await addPieces(page, 4);
    const state = await measure(page);
    await attachState(testInfo, 'mobile-after-add-four', state);

    const active = state.activeTab;
    expect(active, 'active mobile tab should exist').toBeTruthy();
    expect(active.rect.left, JSON.stringify(active, null, 2)).toBeGreaterThanOrEqual(0);
    expect(active.rect.right, JSON.stringify(active, null, 2)).toBeLessThanOrEqual(state.viewport.w);
  });

  test.skip('pricing regression: cutout count changes visible total without sending quote', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only pricing path for first suite');
    await loadConfigurator(page, testInfo);
    await setPanelDimensions(page, 1, { length: 3600, width: 900 });
    const before = await measure(page);

    const cutoutControl = page.locator('.panel-row').first().locator('input, button').filter({ hasText: /cut|CUT/i }).first();
    // The current control markup has varied; use DOM fallback to find a numeric cut-out control.
    const changed = await page.evaluate(() => {
      const row = document.querySelector('.panel-row');
      if (!row) return false;
      const labels = Array.from(row.querySelectorAll('label, span, small, div'));
      const cutText = labels.find((el) => /cut-outs?/i.test(el.textContent || ''));
      const scope = cutText?.closest('.panel-field, .panel-row__field, div') || row;
      const input = scope.querySelector('input[type="number"], input:not([type])');
      if (input) {
        input.focus();
        input.value = '1';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      const plus = Array.from(row.querySelectorAll('button')).find((button) => /cut|\+/i.test(button.textContent || button.getAttribute('aria-label') || ''));
      if (plus) {
        plus.click();
        return true;
      }
      return false;
    });
    test.skip(!changed, 'cutout control not found in current live markup; keep this as pending harness coverage');
    await page.waitForTimeout(500);
    const after = await measure(page);
    await attachState(testInfo, 'cutout-pricing', { before, after });
    expect(after.totalText).not.toEqual(before.totalText);
    expect(after.bodyText.toLowerCase()).toContain('cut');
  });
});
