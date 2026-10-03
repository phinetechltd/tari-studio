## Task: Implement Brand Detail Page from Design Spec

### Goal
Build the brand detail/view page at the correct route using the design spec from claude-bot's MODERN_BRAND_VIEW_DESIGN.html mockup.

### Context
- Design spec exists: `platform/MODERN_BRAND_VIEW_DESIGN.html` (4.7KB, interactive mockup with Tweaks panel)
- Design system spec: `platform/MODERN_DESIGN_SYSTEM_SPEC.md` (18KB)
- Design language: Vercel/Linear-inspired, indigo accent (#818cf8), dark (#0c0e13) + light (#f8f9fb) mode, 8px border radius, Inter font
- Current state: /brand and /brand/brand-management return 404 — the route doesn't exist yet

### What to Build
1. Create the brand detail page route (check existing Next.js app router structure for the right path)
2. Implement from the design spec:
   - Page header: brand name + model type + content count + team count
   - Stats grid: 4 key metrics in card layout
   - Content list: items with status badges
   - Brand details card
   - Team members section
   - Sidebar: quick actions, activity feed, connected channels
   - Full sidebar navigation
   - Top bar with search
3. Make it responsive (desktop → tablet → mobile)
4. Include dark/light mode variants using existing design tokens

### Acceptance Criteria
- Brand detail page renders at the correct URL
- All sections from the design spec are present
- Responsive layout works at 3 breakpoints
- Dark/light mode toggles correctly
- Matches the design language from MODERN_DESIGN_SYSTEM_SPEC.md

### Design Reference
The HTML mockup at `platform/MODERN_BRAND_VIEW_DESIGN.html` has an interactive Tweaks panel — open it in a browser to explore variants (theme, density, accent color). The spec document has exact token values, component measurements, and CSS patterns.
