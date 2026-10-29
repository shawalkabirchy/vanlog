# VanLog visual specification

References: `assets/concept-dashboard.png`, `assets/concept-mobile.png`, `assets/concept-landing.png`.
Generated with the built-in Image Gen tool. Prompts describe a light, practical Next.js/Tailwind/shadcn application for mobile-kitchen maintenance, complete dashboard, mobile logging, and public intro surfaces.

- White surfaces; cool page background `#f6f8fa`; navy text `#162a2b`; forest primary `#16725d`; border `#e3e9e7`.
- Self-hosted Geist Sans, 14px UI controls, 16px body, strong 32px page headings, 10px panel radius.
- Desktop: 240px white navigation rail, thin header, amber demo alert, open page heading, four summary panels, maintenance table, activity and maintenance-coverage panels.
- Mobile: compact header, collapsible navigation, full-width reading and service forms with 44px touch targets.
- Public page: two-column hero with product preview, owner/staff actions, three open workflow columns, pale-mint studio section and quiet footer.
- Icons: Lucide outlines at 1.75px stroke. Status always has a word and color.
- Data, dates and counts come from the real API; reference images contain illustrative values only. “Maintenance coverage” replaces the concept's “Equipment health” to avoid suggesting mechanical safety predictions.
- Required states extend these component families: readable tables, fields, alerts, dialogs, skeletons and empty states. No decorative charts or additional feature sections.

Final visual check: the generated references and actual 1440px desktop / 360px mobile screenshots were opened side by side. Navigation, palette, white panels, typography hierarchy, queue, activity, public-page sections and logging form follow the references. Actual task ordering, dates, additional record rows and the placement of the active reading form reflect the implemented workflow and live synthetic data. Contrast was checked with axe and strengthened for captions and hovered primary buttons.

## Concept-generation briefs

The generated references use the following complete design direction. These are reproduction briefs for the saved references; the coded product supplies real data and accessible interactions.

**Owner dashboard:** Create a complete, readable desktop SaaS operations dashboard for VanLog, a food-truck/mobile-kitchen equipment maintenance app. Light theme, airy white surfaces, cool gray background, dark navy typography, restrained forest-green actions, Geist-like sans serif, thin borders and 10px corners. Use a 240px left navigation rail with truck wordmark, Dashboard, Equipment, Maintenance, History and Cost reports; a quiet top breadcrumb/date header; an amber shared-demo banner; the heading “Equipment, ready for the next stop.” and Add equipment action; four metrics for active equipment, overdue, due now and due soon; a maintenance queue with equipment, task, threshold, text status and View action; lower recent-activity and maintenance-status distribution panels. Use realistic fictional generator, pump, refrigerator and hood records. Include the whole primary screen, not only a hero. No photography, gradients, decorative illustrations or invented AI features.

**Mobile equipment and logging:** Use the same VanLog visual system at a phone width. Show a compact brand/menu header, persistent shared-demo notice, Generator G-01 equipment title, category, a clear cumulative-runtime panel, Log reading action, a short maintenance task card with threshold and text status, and the current reading form with previous hours, new cumulative hours, note, increase preview, confirmation and Save/Cancel actions. Maintain 44px touch targets, generous field spacing and a readable continuation into activity history. Treat the counter as cumulative and show an explicit confirmation for increases above 24 hours.

**Public introduction:** Create a complete light VanLog product introduction with the same navy/forest typography and white/cool-gray palette. Header has VanLog, How it works, About the project and Sign in. A spacious two-column hero uses “Keep your kitchen moving.”, a short maintenance-workflow description, Try as owner and Try as staff actions, a shared-fictional-demo note, and a code-like maintenance queue preview on the right. Follow it with three open columns: Open the equipment, Log the work, Know what is due. Add a pale mint studio band headed “Built for the work between stops.” describing a self-initiated ConsoleLog Studio project, and a quiet source-link footer. No eyebrow above the main heading, extra feature grids, paid claims, photographs or decorative graphics.
