from pathlib import Path
import re, json
root=Path('/Users/mack-mini/innate-mission-control')
work=Path('/tmp/benchtop_geometry_preview_workdir').read_text().strip()
work=Path(work)
candidate=work/'candidate'
(candidate/'assets').mkdir(parents=True, exist_ok=True)
core=(root/'lib/benchtops/geometryCore.mjs').read_text()
renderer=(root/'work/benchtop-local-renderer/renderer.mjs').read_text()
css=(root/'work/benchtop-local-renderer/renderer.css').read_text()
renderer=re.sub(r"import \{[\s\S]*?\} from '../../lib/benchtops/geometryCore\.mjs';\n\n", "", renderer)
mount_html = '''
<section class="innate-bench-widget innate-bench-widget--embedded" aria-label="Local benchtop quote renderer">
  <header class="local-hero">
    <p>Live design surface</p>
    <h1>Timber panels</h1>
    <span>Tōtara · 1800 × 600 × 43 · $1,299 incl GST</span>
  </header>
  <div class="stage">
    <div class="stage__preview">
      <div class="slab-preview" aria-label="Benchtop design preview">
        <svg id="preview-svg" viewBox="0 0 4200 4200" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Panel layout preview">
          <defs>
            <pattern id="grid" width="200" height="200" patternUnits="userSpaceOnUse">
              <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#e2d7c6" stroke-width="8" opacity=".5"/>
            </pattern>
          </defs>
          <rect x="0" y="0" width="4200" height="4200" fill="url(#grid)" opacity=".55"></rect>
          <g id="panel-layer"></g>
        </svg>
      </div>
      <button type="button" class="innate-selected-rotate" aria-label="Rotate selected panel 90 degrees">↻</button>
    </div>
    <aside class="editor" aria-label="Panel editor">
      <div class="mobile-piece-rail" role="tablist" aria-label="Benchtop pieces"></div>
      <div class="panel-list"></div>
      <button type="button" class="panel-editor__add mobile-piece-tab--add">Add another benchtop piece</button>
      <p class="quote-summary__total-amt">$1,299 incl GST</p>
      <p class="stickybar__price">$1,299 incl GST</p>
    </aside>
  </div>
  <p class="local-note">Choose size, timber, cutouts and delivery before sending a quote. This preview renderer is for geometry proof only.</p>
</section>
'''
core_bundle=core.replace('export function ', 'function ')
js=f'''// Benchtop geometry renderer preview candidate — 2026-06-26
// phase12-hardening-runtime-20260623
// Required protected markers: innate-selected-rotate innate-panel-is-active innate-panel-card-is-active
(function () {{
  const script = document.currentScript;
  const cssHref = script && script.src ? script.src.replace(/innate-benchtop-configurator\\.js(?:[?#].*)?$/, 'benchtop-geometry-renderer.css?geometry-preview=20260626') : '';
  if (cssHref && !document.querySelector('link[data-benchtop-geometry-renderer]')) {{
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    link.setAttribute('data-benchtop-geometry-renderer', '20260626');
    document.head.appendChild(link);
  }}
  function boot() {{
    const mount = document.querySelector('#innate-benchtop-configurator');
    if (!mount || mount.dataset.geometryRendererBooted === '1') return;
    mount.dataset.geometryRendererBooted = '1';
    mount.innerHTML = {json.dumps(mount_html)};
{core_bundle}
{renderer}
  }}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {{ once: true }});
  else boot();
}})();
'''
(candidate/'assets/innate-benchtop-configurator.js').write_text(js)
css = '/* Benchtop geometry renderer preview CSS — 2026-06-26 */\n' + re.sub(r"html, body \{[^}]*\}\n", "", css)
(candidate/'assets/benchtop-geometry-renderer.css').write_text(css)
print(candidate)
for p in sorted((candidate/'assets').iterdir()):
 print(p, p.stat().st_size)
