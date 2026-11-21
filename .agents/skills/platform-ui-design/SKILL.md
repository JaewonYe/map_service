---
name: platform-ui-design
description: Implement and review this platform's UI using its approved navy/teal light and dark visual direction. Use for portal, map-service, reservation-service, layouts, forms, panels, calendars, theme controls, and visual consistency. Read this project skill before generic design skills.
---

# Platform light/dark UI implementation

The user requested visual alignment with the paired light/dark facility-platform concepts. Follow the same visual language across the portal, map and reservation modules. Do not invent an independent theme or turn operational screens into landing pages.

## Read in order

1. Repository AGENTS.md and current feature Issue/PR.
2. [Shared baseline](../../../design-system/platform/MASTER.md).
3. [Layout, controls, and theme behavior](../../../design-system/platform/IMPLEMENTATION.md).
4. [Working visual reference](../../../design-system/platform/reference.html) and [theme values](../../../design-system/platform/themes.json). Open the local reference in light and dark. The preview contains fictional fixtures; it is not a live map or reservation service.
5. Use `ui-ux-pro-max` only for focused UX/stack guidance that fits this baseline, then `web-design-guidelines` to review changed UI files using its bundled references/command.md.

## Implement

- Load this repository's `design-system/platform/tokens.css` in the framework's existing styling entry. Use semantic custom properties for surfaces, text, headers, controls and state. Keep existing styling/framework; no automatic font CDN, Tailwind or UI package installation.
- Follow the header, sidebar, map workspace, selected state, panel and form hierarchy in the reference. Reuse existing components; functional layout changes are allowed for mobile and task suitability.
- Implement light/dark/system selection only within an assigned UI implementation. Set `data-theme="light"` or `data-theme="dark"` on the HTML root; remove it for system. Guard browser-only storage and media queries, prevent hydration/first-paint mismatch using the project's supported approach, preserve user choices, and keep map viewport/selection/form state through switching.
- Use `themes.json` as the color source; generate CSS with `python3 scripts/render_design_tokens.py --write`. Never independently regenerate the project's master theme from upstream recommendations. Update the shared snapshot/lock through a reviewed cross-repository change.
- Map UI overlay theme and map-data styling are separate. Theme the map controls, markers and facility polygons. Only use dark basemap styles when the existing data/rendering can support them. Never invert or recolor satellite, DEM, or unstyled raster tile pixels to fake dark mode. Label an unchanged basemap honestly and do not add external tile dependencies to the offline map.
- Reservation wireframe demonstrates visual hierarchy only. It does not approve booking statuses, time policies, authentication, database, API or module ownership. Do not implement unapproved product behavior to mimic a reference image.

## Completion evidence

- Run `python3 scripts/check_design_skills.py` (platform root may add `--modules`).
- For an actual UI change, provide light/dark screenshots at desktop 1440x900 and mobile 390x844, and compare typography, tokens, spacing, selected/disabled/loading/error states and focus against reference.html.
- Exercise theme preference persistence, OS-theme change in system mode, storage-unavailable fallback, reload/hydration, keyboard/touch selection, and contrast. Preserve map editing/search and existing regression behavior.
- Run the repository's relevant functional/CI checks. Distinguish skill/token validation from actual app screenshots and behavior. Installing this skill alone does not claim that an application has been redesigned or theme switching implemented.
