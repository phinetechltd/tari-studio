# Modern Design System — Tokens & Components

> Design system specification for the Agency Platform modernization.
> Inspired by Vercel/Linear SaaS aesthetic: monochrome base + single accent, clean hierarchy, card-based surfaces.

---

## 1. Color Palette

### Dark Mode (Primary)

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Background | `--bg` | `#0c0e13` | Page background, app shell |
| Surface | `--surface` | `#14171e` | Cards, panels, modals |
| Raised | `--raised` | `#1b1f28` | Hover states, input backgrounds, nested cards |
| Border | `--line` | `#2c323f` | Borders, dividers, card edges |
| Ink | `--ink` | `#ececf4` | Primary text, headings |
| Muted | `--muted` | `#969ead` | Secondary text, labels, placeholders |
| Primary | `--primary` | `#818cf8` | Accent, links, primary buttons, active states |
| Primary Hover | `--primary-hover` | `#6366f1` | Hover on primary elements |
| On Primary | `--onprimary` | `#0c0e13` | Text on primary-colored backgrounds |
| Success | `--success` | `#4ade80` | Positive trends, success states, online indicators |
| Warning | `--warning` | `#fbbf24` | Pending states, caution, "away" indicators |
| Danger | `--danger` | `#f87171` | Errors, destructive actions, negative trends |
| Info | `--info` | `#38bdf8` | In-progress states, links, info indicators |

### Light Mode

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Background | `--bg` | `#f8f9fb` | Page background |
| Surface | `--surface` | `#ffffff` | Cards, panels |
| Raised | `--raised` | `#f0f2f5` | Hover states |
| Border | `--line` | `#e2e5eb` | Borders |
| Ink | `--ink` | `#111827` | Primary text |
| Muted | `--muted` | `#64748b` | Secondary text |
| Primary | `--primary` | `#818cf8` | Accent (same as dark) |
| Success/Warning/Danger/Info | Same as dark | — | Status colors unchanged |

### Accent Variations (Tweaks)
- **Indigo** (default): `#818cf8`
- **Violet**: `#a78bfa`
- **Blue**: `#38bdf8`
- **Emerald**: `#4ade80`
- **Rose**: `#f87171`

---

## 2. Typography

### Font Stack
- **Primary**: `Inter`, system-ui, -apple-system, sans-serif
- **Monospace**: `JetBrains Mono`, ui-monospace, monospace (for metrics, code, IDs)

### Type Scale

| Level | Size | Weight | Letter Spacing | Usage |
|-------|------|--------|----------------|-------|
| Display | 36px | 700 | -0.03em | Hero metrics, large numbers |
| H1 / Page Title | 24px | 600 | -0.02em | Page titles, card titles |
| H2 / Section | 18px | 600 | -0.01em | Section headers |
| Body | 14px | 400 | 0 | Body text, descriptions |
| Small | 13px | 400/500 | 0 | Labels, metadata, list items |
| Micro | 12px | 500 | 0.04em (uppercase) | Uppercase labels, badges |
| Tiny | 11px | 400 | 0 | Timestamps, secondary metadata |

### Typography Rules
- Headings use font-weight 600-700 with negative letter-spacing (-0.01 to -0.03em) for tight, modern feel
- Body text at 14px with 1.5 line-height
- Small labels at 12-13px
- Never use Inter at weights below 400 for UI text — it reads too light on dark backgrounds
- Monospace only for numeric metrics, IDs, code — not for body copy

---

## 3. Spacing Scale

Base unit: **4px**

| Name | Value | Usage |
|------|-------|-------|
| xs | 4px | Tight gaps inside compact elements (badge padding, icon gaps) |
| sm | 8px | Default component internal padding, list item gaps |
| md | 12px | Card header/body separation, form field gaps |
| lg | 16px | Page section gaps, widget padding, card padding (compact) |
| xl | 20px | Card padding (comfortable), sidebar gaps |
| 2xl | 24px | Page content padding (tablet), between major sections |
| 3xl | 28px | Page content padding (desktop) |
| 4xl | 32px | Top-level page padding (mobile), section separation |

### Grid
- **4px base grid** — all spacing values are multiples of 4px
- **8px default gap** between cards in a grid
- **16px gap** between major layout sections

---

## 4. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Buttons, inputs, small cards, badges, avatars |
| `--radius` | 8px (compact: 6px) | Default card, input, small widget |
| `--radius-lg` | 10px (compact: 8px) | Large cards, modals, panels, page sections |

**Rule**: Round corners slightly more on larger surfaces. Cards are 8-10px, buttons/inputs are 6px. Never use fully rounded (9999px) except on tags/badges (10px pill shape).

---

## 5. Shadows & Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| None | `none` | Flat surfaces, sidebar, topbar |
| Default | `0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)` | Cards on hover, active elements |
| Elevated | `0 4px 16px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)` | Tweaks panel, modals, dropdowns, hover lift |
| Focus Ring | `0 0 0 2px rgba(129, 140, 248, 0.4)` | Focus states on interactive elements |

**Rule**: Shadows are functional, not decorative. Default state has no shadow. Hover lifts slightly. Modals/dropdowns are the only consistently elevated surfaces.

---

## 6. Component Specifications

### 6.1 Buttons

All buttons: `font-family: Inter`, `font-size: 13px`, `font-weight: 500`, `border-radius: 6px`, `cursor: pointer`, `transition: all 120ms ease`

**Primary Button**
- Background: `--primary`
- Text: `--onprimary`
- Hover: `--primary-hover`
- Padding: 8px 16px
- Icon + label: 6px gap
- Disabled: opacity 0.5, cursor not-allowed

**Secondary Button**
- Background: `--surface`
- Border: 1px solid `--line`
- Text: `--ink`
- Hover: background `--raised`, border-color `--primary`

**Ghost Button**
- Background: transparent
- Border: none
- Text: `--muted`
- Padding: 8px 10px
- Hover: background `--raised`, text `--ink`

**Icon Button**
- Width/height: 34px
- Border: 1px solid `--line`
- Background: `--surface`
- Color: `--muted`
- Border-radius: 6px
- Hover: background `--raised`, color `--ink`, border-color `--primary`

### 6.2 Cards

**Card Structure**
```
┌─────────────────────────────────┐
│ [Header: title + menu]  Border │
├─────────────────────────────────┤
│ [Body: content]                │
└─────────────────────────────────┘
```

- Background: `--surface`
- Border: 1px solid `--line`
- Border-radius: `--radius` (8px default, 10px for large cards)
- Shadow: none (default), elevated on hover
- Hover: border-color `--primary`, elevated shadow
- Header padding: 14px 18px (comfortable), 10px 14px (compact)
- Body padding: 18px (comfortable), 12px (compact)

### 6.3 Inputs & Search

**Text Input**
- Width: 100% of container
- Height: ~38px (padding 8px 12px)
- Background: `--surface`
- Border: 1px solid `--line`
- Border-radius: 6px
- Text: `--ink`, 13px
- Placeholder: `--muted`
- Focus: border-color `--primary`, subtle glow
- Disabled: opacity 0.5

**Search Box**
- Background: `--surface`
- Border: 1px solid `--line`
- Border-radius: 6px
- Padding: 7px 12px
- Width: 220px (topbar), flexible (forms)
- Icon: search glyph (⌕) at start, `--muted`
- Focus: border-color `--primary`

### 6.4 Navigation

**Sidebar**
- Width: 240px (fixed)
- Background: `--surface`
- Border-right: 1px solid `--line`
- Logo: 32px icon square (primary background, white text) + text label

**Nav Items**
- Padding: 8px 12px
- Gap: 10px (icon + text)
- Font: 13px, 500 weight
- Default color: `--muted`
- Hover: background `--raised`, color `--ink`
- Active: background rgba(primary 0.1), color `--primary`
- Icon: 16x16, opacity 0.7 (1.0 when active)
- Group labels: 11px uppercase, 600 weight, `--muted`, letter-spacing 0.05em

**Top Bar**
- Height: ~52px (content + padding)
- Border-bottom: 1px solid `--line`
- Sticky
- Breadcrumb: 13px, `--muted`, separator 10px, current item 500 weight `--ink`
- Right side: search box + icon buttons

### 6.5 Badges & Tags

**Default Tag**
- Padding: 2px 8px
- Border-radius: 10px (pill)
- Font: 11px, 500 weight
- Background: `--raised`
- Border: 1px solid `--line`
- Color: `--muted`

**Primary Tag**
- Background: rgba(primary 0.1)
- Color: `--primary`
- Border: 1px solid rgba(primary 0.2)

**Status Badges** (pill, 11px, 500 weight)
- Ready: bg rgba(success 0.12), color success
- In Progress: bg rgba(info 0.12), color info
- Review: bg rgba(warning 0.12), color warning
- Done: bg rgba(primary 0.12), color primary

### 6.6 Metric Values

- **Large metric**: 36px, 700 weight, -0.03em letter-spacing (compact: 28px)
- **Small metric**: 26px, 700 weight, -0.02em letter-spacing
- **Trend badge**: 12px, 500 weight, pill-shaped, 2px 8px padding
- **Trend up**: bg rgba(success 0.1), color success, ↑ prefix
- **Trend down**: bg rgba(danger 0.1), color danger, ↓ prefix
- **Trend stable**: bg rgba(warning 0.1), color warning, → prefix
- Monospace font for numeric metrics where precision matters

### 6.7 Lists & Items

**Content List Item**
- Padding: 12px 20px
- Border-bottom: 1px solid `--line`
- Gap: 14px (icon + info)
- Hover: background `--raised`
- Icon: 36x36, `--raised` background, centered
- Title: 13px, 500 weight
- Meta: 12px, `--muted`, flex row with `·` separators
- Status badge: aligned right, 11px pill

**Activity Item**
- Padding: 10px 0
- Border-bottom: 1px solid `--line`
- Gap: 12px
- Dot: 8px circle, colored by type
- Text: 13px, bold on names
- Time: 11px, `--muted`, margin-top 2px

### 6.8 Tabs

- Border-bottom: 1px solid `--line`
- Tab padding: 10px 16px
- Font: 13px, 500 weight
- Default color: `--muted`
- Hover: color `--ink`
- Active: color `--primary`, 2px bottom border in primary color
- No top/left/right borders on tab items

### 6.9 Modal

- Background: `--surface`
- Border: 1px solid `--line`
- Border-radius: `--radius-lg` (10px)
- Shadow: elevated (0 4px 16px...)
- Padding: 20px
- Max-width: 480px (small), 640px (medium), 800px (large)
- Header: title + close button (icon-btn style)
- Footer: action buttons right-aligned, primary on right

### 6.10 Empty States

- Centered in widget body
- Icon: 40x40, `--raised` background, `--muted` color
- Title: 13px, 500 weight
- Description: 12px, `--muted`
- Optional action button below

### 6.11 Loading Skeleton

- Background: linear-gradient shimmer (200% width, 1.5s infinite)
- Colors: `--raised` → `--line` → `--raised`
- Border-radius: 4px
- Used for: metric values (full width), text lines (varied width), chart bars

### 6.12 Error States

- Icon: 36x36 circle, bg rgba(danger 0.1), danger color
- Title: 13px, 500 weight, danger color
- Description: 12px, `--muted`
- Retry button: ghost style, 6px 14px, 12px font

---

## 7. Widget Design System

### Widget Chrome (all widgets)
```
┌─────────────────────────────────────┐
│ [Icon] Title          [⋯ menu]     │ Header: 14px uppercase label, 14px icon, menu on right
├─────────────────────────────────────┤
│                                     │
│         Widget Body                 │ Body: content-specific, 18px padding
│                                     │
└─────────────────────────────────────┘
```

- Border-radius: 10px
- Border: 1px solid `--line`
- Hover: border-color `--primary`, elevated shadow
- Header padding: 14px 18px
- Body padding: 18px
- Menu button: 24x24, transparent bg, `--muted` color, `⋯` glyph

### Widget Types

| Type | Header Icon | Body Pattern | Example |
|------|-------------|--------------|---------|
| Metric Card | Document/Check/Percent/Users | Large number + label + trend badge + sparkline | Total Content: 147 ↑12% |
| Chart Widget | Chart bars icon | Chart area (180px) + axis labels + summary stat | Content Performance (7-day) |
| Activity Feed | Fire/Activity icon | Vertical list of activity items with colored dots | Recent Activity (5 items) |
| Quick Actions | Plus/Action icon | 2x2 grid of icon+label buttons | New Content, Add Member, etc. |
| Recent Items | Clock/List icon | Vertical list with avatars, titles, meta, badges | Recent Content Items |
| Team Status | Users icon | Vertical list with avatar, name, role, online indicator | Team Status (4 members) |
| Campaign Performance | Chart simple icon | Rows: name + metric + bar fill | Campaign names with % change |
| Content Pipeline | Board/Trello icon | Vertical stages: label + count + bar fill | Draft → Review → Approved → Published |

### Widget States
- **Default**: surface bg, line border
- **Hover**: primary border, elevated shadow
- **Empty**: centered empty state (icon + title + description)
- **Error**: centered error state (warning icon + title + retry button)
- **Loading**: skeleton placeholders matching content layout

### Widget Grid
- **4-column**: Metric cards row (desktop)
- **2-column**: Chart + Activity, Quick Actions + Recent Items, Team + Campaigns, Pipeline + Empty
- **1-column**: Mobile
- Gap: 16px between all widgets

---

## 8. Layout Patterns

### Page Structure
```
┌──────┬──────────────────────────────────────┐
│      │  Top Bar (sticky)                    │
│      │  Breadcrumb · Search · Icons         │
│      ├──────────────────────────────────────┤
│      │  Page Header (title + subtitle)       │
│      │                                       │
│ Side │  Widget Grid / Content                │
│ bar  │  (responsive columns)                 │
│      │                                       │
│      │                                       │
│      │                                       │
└──────┴──────────────────────────────────────┘
```

- **Page content padding**: 28px desktop, 16px tablet, 16px mobile
- **Page title**: 24px, 600 weight, -0.02em letter-spacing
- **Page subtitle**: 14px, `--muted`

### Brand Detail Page Layout
1. **Brand Header Card** (full width): gradient cover + avatar + name + actions
2. **Stats Grid** (4 columns, inside brand card): 4 metric cards
3. **Tabs**: Overview | Content | Team | Settings
4. **Content Grid** (1fr + 320px sidebar):
   - Left: Recent Content list, Brand Details card, Team Members card
   - Right: Quick Actions, Activity Feed, Connected Channels

### Dashboard Layout
- Metric cards row (4 columns)
- Chart + Activity Feed (2 columns)
- Quick Actions + Recent Items (2 columns)
- Team Status + Campaign Performance (2 columns)
- Content Pipeline + Empty State example (2 columns)

---

## 9. Interaction & Motion

### Transitions
- Default duration: 120ms ease
- Hover transitions: background-color, border-color, color, transform (translateY -1px for buttons)
- Card hover: border-color + shadow change, no transform
- Widget hover: border-color + shadow, no transform
- Tab active: color + border-bottom transition

### Motion Rules
- Use motion as discipline, not theater
- No animation on page load (content appears instantly)
- Hover states transition 120ms — fast enough to feel responsive, slow enough to see
- Skeleton shimmer: 1.5s infinite (only during loading)
- No entrance animations, no staggered reveals
- `prefers-reduced-motion` respected: disable all non-essential animation

### Interactive Behaviors
- **Buttons**: hover lifts slightly (translateY -1px) + color shift + shadow
- **Cards/Widgets**: hover changes border to primary + elevates shadow
- **Nav items**: hover highlights bg + text color, active has persistent accent bg
- **Inputs**: focus ring in primary color, border shift
- **Chart bars**: hover scales up slightly (scaleY 1.02 from bottom)
- **Spark bars**: hover increases opacity

---

## 10. Responsive Breakpoints

| Breakpoint | Condition | Changes |
|------------|-----------|---------|
| Desktop | > 1200px | Full layout: 4-col metric grid, 2-col content grid, 240px sidebar |
| Tablet | 768px–1200px | Metric grid → 2-col, content grid → 1-col, sidebar hidden, page padding 16px |
| Mobile | < 768px | All grids 1-col, sidebar hidden, topbar search hidden, padding 16px |

### Mobile Considerations
- Touch targets minimum 44px
- Cards stack vertically
- Widget grids collapse to single column
- Sidebar navigation replaced with top-level tabs or hamburger (out of scope for this spec — recommend top tabs for mobile)

---

## 11. Implementation Notes

### CSS Custom Properties
All tokens are CSS custom properties on `:root`. Theme switching (dark ↔ light) is a single class or attribute change on `<html>` or `<body>` that overrides the variable values.

```css
/* Dark (default) */
:root {
  --bg: #0c0e13;
  --surface: #14171e;
  /* ... */
}

/* Light — applied via [data-theme="light"] */
[data-theme="light"] {
  --bg: #f8f9fb;
  --surface: #ffffff;
  /* ... */
}
```

### Component Classes
Flat class structure (no deep nesting). Each component has a base class plus modifier classes:

```
.widget                    → base widget
.widget-header             → header section
.widget-body               → body section
.metric-value              → large number
.metric-trend.up           → trend badge variant
```

No BEM. No CSS-in-JS required. Plain CSS custom properties + class selectors. Works with Tailwind (tokens map to Tailwind config) or standalone.

### Accessibility
- All interactive elements have visible focus states (primary color ring)
- Color is never the sole indicator — status badges have text labels
- Contrast ratios: primary on surface exceeds 4.5:1 in both modes
- Skip-to-content link (implementation detail, not covered here)
- ARIA labels on icon-only buttons (menu, close, settings)

---

*Spec version 1.0 — covers tokens, components, widgets, layouts, and interaction patterns for the modernized Agency Platform UI.*
