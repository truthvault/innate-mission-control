# Known Failure Modes

These are the repeat mistakes to avoid.

## Wrong Source

Do not diagnose live website problems from local files. Check the live rendered page, Shopify admin/content, and exact live theme asset first.

## Stale Patch Folders

Old `.codex-theme-work` folders are historical evidence only. They are not source of truth.

## Visual Guessing

Rendered HTML and code checks are not visual QA. Look at desktop and mobile.

## Configurator Selection Drift

For the benchtop configurator, the canvas panel, detail/editor row, mobile piece tab, and selected-object rotate target must share one selected panel index. Verify both directions: canvas-to-card/tab and card/tab-to-canvas. After adding or copying a second piece, rotate the selected second piece and confirm the first piece keeps its previous orientation.

## Copy Drift

Do not change page wording during a theme cleanup unless Guido approves copy changes.

## H1 Drift

Do not use loud hero-sized H1s on About, Contact, FAQ, policy, or quiet utility pages.

## Crop Drift

Do not ship bad image crops. Faces, heads, hands, tools, furniture, timber detail and room context need to be protected.

## Raw Widgets

Do not leave raw Google Reviews, newsletter, form, app, or Shopify default styling on a polished page.

## Fragile Image Sources

Do not leave live pages pointing at staging theme asset URLs. Use Shopify Files, live theme assets, product media, or the correct external app source.

## Locked Pages

Do not build page content in a way that Guido cannot reasonably edit in Shopify. Page text, images, links, cards, FAQs and repeatable blocks should be controlled through section settings or blocks wherever practical.

## Global Drift

Do not change global header, footer, product cards, settings, or shared snippets unless the task is explicitly global.

## Approval Drift

Prepared is not approved. Staged is not live. Live needs explicit approval.
