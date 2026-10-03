# Report Dashboard Widgets — UI/UX Spec

> Analytics and report dashboard widgets for monitoring brand content performance across channels.
> Consistent with the Modern Design System (indigo accent, dark primary, 8px spacing grid, card-based surfaces).

---

## Dashboard Header

```
┌─────────────────────────────────────────────────────────────┐
│ Brand Performance — NVIDIA K3          [7 days ▼] [+ Add] │
│                                                             │
│  [Export All ▼]                                            │
└─────────────────────────────────────────────────────────────┘
```

**Container**
- Height: 56px (padding 12px 20px)
- Background: `--surface`
- Border-bottom: 1px solid `--line`
- Sticky at top of dashboard content

**Title**
- Text: "Brand Performance" — 16px, 600 weight, `--ink`
- Brand name appended: "— NVIDIA K3" — 14px, `--muted`
- Flex: 1

**Date Range Picker** (right side)
- See Date Range Picker section below
- Width: ~200px

**Add Widget Button**
- Style: secondary button (background `--surface`, border 1px `--line`, text `--ink`)
- Text: "+ Add Widget" — 13px, 500 weight
- Icon: plus glyph (14px) to left
- Height: 34px

**Export All Button**
- Style: ghost button (transparent, text `--muted`, hover `--ink`)
- Text: "Export All" — 13px, 500 weight
- Icon: download arrow (14px) to left
- Position: far right
- Opens dropdown: "Export as CSV" | "Export as PDF" | "Export as PNG (dashboard snapshot)"

---

## Date Range Picker

**Trigger**: The date range chip in the dashboard header (shows current selection)

**Expanded View** (dropdown, 280px width, anchored to trigger):

```
┌─────────────────────────────────────────┐
│ Date Range                              │
├─────────────────────────────────────────┤
│                                         │
│  Presets                                │
│  [7 days        ]  ← active (primary)  │
│  [30 days       ]                      │
│  [90 days       ]                      │
│  [This year     ]                      │
│  [This month    ]                      │
│  [Last month    ]                      │
│                                         │
│  ─── Custom ───                        │
│  From: [Feb 1 ___]  To: [Feb 28 ___]  │
│                                         │
│           [Clear]  [Apply]             │
│                                         │
└─────────────────────────────────────────┘
```

**Preset Chips** (vertical list in dropdown)
- Style: 100% width row, 36px height, cursor pointer
- Unselected: background transparent, text `--ink`, 13px, 500 weight
- Hover: background `--raised`
- Selected (active): background `rgba(primary 0.12)`, left border 2px `--primary`, text `--primary`
- Active preset shows checkmark icon to the right

**Custom Range Section**
- Divider: 1px `--line`, margin 8px 0
- Label: "Custom" — 11px, uppercase, 600 weight, `--muted`, margin-bottom 8px
- Two date inputs side by side:
  - "From:" label (11px, `--muted`) + date input (13px, `--ink`, border 1px `--line`, radius 6px, padding 6px 10px)
  - "To:" label + date input (same style)
  - Gap between them: 8px

**Footer Buttons**
- Clear: ghost button, "Clear" — 12px, resets to default (7 days)
- Apply: primary button, "Apply" — 12px, applies selection and closes dropdown
- Gap between buttons: 8px

**Default Selection**: "7 days" (last 7 days from today)

**Dates Format**: "Feb 15, 2026" — 13px, `--ink`, in inputs and chips

---

## Widget Grid Layout

**Grid Container**
- Padding: 20px (matches page content)
- Display: CSS grid
- Gap: 16px between widgets
- Auto-fill columns: `minmax(280px, 1fr)` — widgets flow into available space

**Widget Sizes**
- Standard widget: 1 grid unit (min 280px width, stretches to fill column)
- Wide widget: 2 grid units (span 2 columns — for wide charts)
- Tall widget: same width, more body height (for activity feeds, lists)

**Widget Chrome** (all widgets share this):
```
┌─────────────────────────────────────────┐
│ [Icon] Title                 [⋯ menu]   │ Header: 40px, border-bottom
├─────────────────────────────────────────┤
│                                         │
│           Widget Body                   │ Body: variable height, 16px padding
│                                         │
└─────────────────────────────────────────┘
```
- Background: `--surface`
- Border: 1px solid `--line`
- Border-radius: `--radius` (8px)
- Hover: border-color `--primary`, elevated shadow

---

## Widget Type 1: Metrics Card

**The building block of the dashboard. Used for any single-number metric.**

### Layout
```
┌─────────────────────────────────────────┐
│ [chart icon] Posts Published    [⋯]     │
├─────────────────────────────────────────┤
│                                         │
│            89                           │
│         Posts Published                 │
│                                         │
│     ↑ 12%  vs last 7 days              │
│                                         │
│     ▂▃▅▆▇▆▃  (sparkline)               │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Elements

**Header**
- Icon: 14px, `--muted`, left of title
- Title: 12px, 600 weight, uppercase, `--muted`, letter-spacing 0.05em
- Menu button: 24px, `--muted`, hover `--ink`

**Metric Number**
- Font: 32px, 700 weight, `--ink`, letter-spacing -0.02em, JetBrains Mono optional
- Position: centered or left-aligned (consistent across all metric cards in a row)
- Color: `--ink`
- If metric is 0 or negative: color `--muted` (de-emphasize)

**Label**
- Text: "Posts Published" — 13px, 500 weight, `--muted`
- Position: directly below the number
- Could include unit: "89 posts" or "89" (label says "Posts")

**Trend Indicator**
- Position: below label, 8px gap
- Format: trend arrow + percentage + "vs [period]" label
- Up trend: ↑ icon (12px) + percentage (12px, 500 weight) + "vs last 7 days" (11px, `--muted`)
  - Arrow color: `--success` (green)
  - Percentage color: `--success`
  - Background: `rgba(success 0.1)`, pill shape, 2px 8px padding
- Down trend: ↓ icon + percentage, color `--danger`
  - Arrow color: `--danger`
  - Percentage color: `--danger`
  - Background: `rgba(danger 0.1)`, pill shape
- Stable (no change): → icon, color `--warning`
  - Background: `rgba(warning 0.1)`, pill shape

**Comparison Period Label**
- Text: "vs last 7 days" or "vs last month" — 11px, `--muted`
- Inline with trend, after the percentage

**Sparkline** (optional, included in most metric cards)
- Height: 32px
- Width: 100% of card body
- Position: bottom of card, 12px margin-top
- Style: SVG or CSS bars, `--primary` color at 0.4 opacity (default), 0.8 on hover
- No axes, no labels — pure trend shape
- Tooltip on hover: show exact value at that point

### Metric Card Variations

**Metric Card with Comparison**
- Shows two numbers: current period + comparison period
- "89" (current, large) / "78" (previous, smaller, `--muted`) / "↑ 14%" (trend)
- Previous number right-aligned, smaller font, above or beside trend

**Metric Card with Goal**
- Shows current vs goal: "89 / 100 posts"
- Progress bar below the number: 89% filled, `--primary` color, height 4px
- Label: "of 100 goal"

**Metric Card Compact** (for dense dashboards)
- No sparkline
- Smaller number (24px)
- Trend inline: "↑ 12%" as a colored badge, right-aligned
- Used when space is constrained

---

## Widget Type 2: Bar Chart Widget

**For comparing values across categories or time periods.**

### Layout
```
┌─────────────────────────────────────────┐
│ [bar chart icon] Content by Channel [⋯] │
├─────────────────────────────────────────┤
│                                         │
│  Posts published by channel            │
│  Last 30 days                           │
│                                         │
│  120 ┤                                    │
│      ┃   ██                              │
│   90 ┤   ██  ██                          │
│      ┃   ██  ██  ██                      │
│   60 ┤   ██  ██  ██  ██                  │
│      ┃   ██  ██  ██  ██  ██              │
│   30 ┤   ██  ██  ██  ██  ██  ██          │
│      ┃   ██  ██  ██  ██  ██  ██  ██      │
│    0 ┤───────────────────────────────────│
│      └───────────────────────────────────┘│
│      LinkedIn  X  TikTok  YouTube  Pinterest│
│                                         │
│                              Total: 412   │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Elements

**Header**: Same chrome as all widgets

**Title + Subtitle** (in body, above chart)
- Title: "Content by Channel" — 13px, 600 weight, `--ink`
- Subtitle: "Last 30 days" — 12px, `--muted`, margin-top 2px

**Chart Area**
- Width: 100% of widget body
- Height: 180px (configurable: 120px compact, 180px default, 240px large)
- Padding: 8px from bottom (for x-axis labels), 16px from top (for value labels)

**Y-Axis (vertical)**
- Grid lines: 1px `--line`, dashed or solid, at 0, 25%, 50%, 75%, 100% of max value
- Value labels: 10px, `--muted`, right-aligned at each grid line

**Bars**
- Width: calculated (total width / number of categories, with 2px gap between bars)
- Color: `--primary` (indigo) at 0.8 opacity
- Hover: full opacity (`--primary`), slight scale up (1.02)
- Tooltip on hover: "LinkedIn: 85 posts" — 12px, `--ink`, with channel name and value
- Border-radius: 3px top corners only

**X-Axis (horizontal)**
- Labels below bars: 10px, `--muted`, centered under each bar
- Truncated if too long (e.g., "Pinterest" → "Pint...")

**Total Label**
- Text: "Total: 412 posts" — 12px, 500 weight, `--ink`
- Position: bottom-right of chart area, or below x-axis labels
- Style: slightly emphasized (600 weight)

### Bar Chart Variants

**Horizontal Bar Chart** (for many categories or long labels)
- Bars grow rightward from left axis
- Category labels on left (12px, `--ink`, aligned with bar start)
- Value labels at end of each bar (12px, `--muted`)
- Good for 6+ categories or when labels are long

**Stacked Bar Chart**
- Multiple segments per bar, each segment a different color from a palette
- Palette: `--primary`, `--info`, `--success`, `--warning`, `--muted`
- Legend below chart: color swatch + label per segment
- Tooltip shows stacked breakdown

**Grouped Bar Chart** (multi-series)
- Multiple bars per category, grouped side by side
- Series colors: primary, info, success (3 series max recommended)
- Legend below or beside chart
- Useful for comparing current period vs previous period per category

---

## Widget Type 3: Line Chart Widget

**For showing trends over time.**

### Layout
```
┌─────────────────────────────────────────┐
│ [line chart icon] Engagement Trend [⋯]  │
├─────────────────────────────────────────┤
│                                         │
│  Daily engagement rate                  │
│  Jan 1 – Feb 15, 2026                  │
│                                         │
│  100% ┤                                    │
│       ┃    ⋅╲                            │
│   75% ┃       ╲⋅╲                        │
│       ┃          ╲╲                      │
│   50% ┃             ╲⋅╲                  │
│       ┃                ╲╲⋅              │
│   25% ┃                     ╲╲          │
│       ┃                          ╲╲     │
│    0% ┤──────────────────────────────────│
│       └───────────────────────────────────┘│
│       Jan 1  Jan 8  Jan 15  Jan 22  Feb 5  Feb 15 │
│                                         │
│  Peak: 92% on Feb 12                    │
│  Avg: 64% over this period              │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Elements

**Header**: Same chrome

**Title + Subtitle**: Same pattern as bar chart

**Chart Area**
- Height: 180px (same as bar chart)
- Grid lines: `--line`, at 0%, 25%, 50%, 75%, 100% of Y range

**Line**
- Color: `--primary` (indigo)
- Width: 2px
- Style: smooth bezier curve through data points (not straight segments)
- Points (data dots): 4px circle, `--primary`, shown on all points or on hover only
- Hover: show point tooltip with exact value + date

**Area Fill** (optional)
- Fill below line to bottom of chart: `--primary` at 0.08 opacity
- Gives visual weight to the trend

**X-Axis Labels**
- Date labels at regular intervals: "Jan 1", "Jan 8", "Jan 15"... — 10px, `--muted`
- Frequency: show ~5-7 labels, spaced evenly

**Y-Axis Labels**
- Percentage or value labels: 10px, `--muted`, right-aligned

**Summary Stats** (below chart)
- "Peak: 92% on Feb 12" — 12px, `--ink`, 500 weight
- "Avg: 64% over this period" — 12px, `--muted`
- Two stats side by side, or stacked on mobile

### Line Chart Variants

**Multi-Line Chart** (compare 2-3 series)
- Each line: distinct color from palette (`--primary`, `--info`, `--success`)
- Legend: color swatch + label per series, below chart or in header
- Hover: highlight hovered line, dim others to 0.2 opacity
- Tooltip: all series values at hovered date

**Area Chart** (filled line)
- Same as line chart but with filled area below
- Good for showing volume/trend magnitude
- Use semi-transparent fill (0.08–0.12 opacity)

**Comparison Line Chart** (current vs previous period)
- Two lines: current period (solid `--primary`) + previous period (dashed `--muted`)
- Direct visual comparison of same date range across two periods
- Legend: "This period" | "Previous period"

---

## Widget Type 4: Pie / Donut Chart Widget

**For showing composition/breakdown of a total.**

### Layout
```
┌─────────────────────────────────────────┐
│ [donut icon] Content by Type [⋯]        │
├─────────────────────────────────────────┤
│                                         │
│        ┌─────────────────────┐          │
│        │         ╭─────╮      │          │
│        │    58% ╱  Posts ╲    │          │
│        │       ╱           ╲  │          │
│        │   Posts       Links │          │
│        │   58%          22%  │          │
│        │                     │          │
│        │  ╲ Videos         │          │
│        │   20%             │          │
│        │                     │          │
│        └─────────────────────┘          │
│                                         │
│  Posts: 58% (142 items)                │
│  Links: 22% (54 items)                 │
│  Videos: 20% (49 items)                │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Elements

**Chart**
- Type: Donut (preferred) or pie
- Donut inner radius: 40% of outer radius
- Center of donut: optional label showing total (e.g., "245 items")
- Segments: each segment is a different color from palette

**Segment Colors** (from design tokens):
- `--primary` (indigo) — first/largest segment
- `--info` (blue) — second segment
- `--success` (green) — third segment
- `--warning` (yellow) — fourth segment
- `--muted` (gray) — any additional segments
- Max 5 segments recommended (more becomes hard to distinguish)

**Legend**
- Position: right side of donut (or below on mobile)
- Each legend item: color swatch (10px circle) + label + percentage + count
- Format: "Posts: 58% (142 items)" — 12px, `--ink`
- Hover on legend item: highlight corresponding segment (dim others)
- Click on legend item: toggle that segment's visibility (optional interaction)

**Center Label** (donut only)
- Total count: "245" — 24px, 700 weight, `--ink`, JetBrains Mono
- Total label: "total items" — 11px, `--muted`
- Centered in donut hole

**Alternative Center Content**
- Could show the largest segment's label and percentage instead of total
- Or show a custom metric

### Pie vs Donut Decision
- **Donut**: preferred for modern aesthetic. More compact, center can show info.
- **Pie**: use when there are only 2-3 segments and the full-circle feel is important.

---

## Widget Type 5: Activity Feed Widget

**For showing recent events/changes on the dashboard.**

### Layout
```
┌─────────────────────────────────────────┐
│ [activity icon] Recent Activity [⋯]     │
├─────────────────────────────────────────┤
│                                         │
│  Alice Kim published a post             │
│  ● 12 minutes ago                       │
│                                         │
│  Marcus submitted "Benchmark Report"    │
│  ● 1 hour ago                           │
│                                         │
│  Sarah approved "API Guide"             │
│  ● 3 hours ago                          │
│                                         │
│  New member Jay joined Demo Agency      │
│  ● Yesterday                             │
│                                         │
│  [View all activity →]                  │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Elements

**Header**: Same chrome

**Activity Items**
- Vertical list, divider between items (1px `--line`)
- Padding: 10px 0 between items
- Height: variable (1-2 lines of text)

**Activity Dot**
- 8px circle, left of each item
- Color: `--primary` (default), or categorized by type
- Types: contentcreated (primary), contentupdated (info), approved (success), joined (warning)

**Activity Text**
- Format: "**Actor** did something" — 13px, `--ink`, bold on actor name
- Line height: 1.4
- Max 2 lines, truncate with ellipsis

**Timestamp**
- Format: "12 minutes ago" / "1 hour ago" / "Yesterday" / "Feb 15" — 11px, `--muted`
- Position: below activity text, margin-top 2px

**View All Link**
- Text: "View all activity →" — 12px, `--primary`, 500 weight
- Position: bottom of widget body, margin-top 8px
- Link style: cursor pointer, hover underline

### Activity Feed Variants

**Filtered Feed**: Show only certain activity types (content events, team events, system events)
**Compact Feed**: Single line per item (text + timestamp on same line)
**With Avatars**: Show actor's avatar (20px circle) next to the dot

---

## Widget Type 6: Quick Stats / KPI Row

**A horizontal row of 3-4 compact metric cards for top-level KPIs.**

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ KPI Row                                                     │
│  Posts Published  │  Approval Rate  │  Avg Engagement  │   │
│       89          │     94%        │      4.2%       │   │
│    ↑ 12%         │     → 0%       │    ↑ 0.3%       │   │
│    vs 7 days     │    this month  │    vs last week │   │
└─────────────────────────────────────────────────────────────┘
```

### Visual Elements
- 3-4 metric cards in a row, equal width
- Compact card style: smaller padding (10px), smaller number (24px font), no sparkline
- Trend badge inline (right-aligned in card)
- Good for dashboard top row as "at a glance" summary
- Title above row: "Key Metrics" — 12px, uppercase, `--muted`, 600 weight

---

## Widget Type 7: Content Pipeline Widget

**Shows content in each stage of the workflow.**

### Layout
```
┌─────────────────────────────────────────┐
│ [pipeline icon] Content Pipeline [⋯]    │
├─────────────────────────────────────────┤
│                                         │
│  Draft          3 items  [████░░░░] 15% │
│  In Review      5 items  [█████░░░░] 25%│
│  Approved       8 items  [███████░░] 40%│
│  Published     12 items  [██████████] 60%│
│                                         │
│  Total: 28 items in pipeline            │
│                                         │
└─────────────────────────────────────────┘
```

### Visual Elements

**Pipeline Stages** (vertical list)
- Each row: stage name + count + progress bar
- Stage name: 13px, 500 weight, `--ink`
- Count: 12px, `--muted`, "3 items"
- Progress bar: 80px wide, 6px height, `--raised` background, `--primary` fill
- Fill percentage reflects proportion of total (or proportion of goal)

**Empty Stage**
- Count: "0 items"
- Progress bar: empty (no fill)
- Stage name still shown (not hidden)

**Total Line** (bottom)
- "Total: 28 items in pipeline" — 12px, `--ink`, 500 weight
- Or "Total: 28 items" — simpler

### Pipeline Variant: Horizontal Flow
- Stages arranged horizontally as connected boxes
- Arrow connectors between stages (1 → 2 → 3 → 4)
- Each box: stage name + count
- Useful for showing flow progression at a glance

---

## Widget Type 8: Empty State Widget

**Standard empty state for any widget with no data.**

### Visual
```
┌─────────────────────────────────────────┐
│                                         │
│           [icon]                        │
│                                         │
│        No data for this period          │
│                                         │
│  Try a wider date range or create       │
│  content to see metrics.                │
│                                         │
│  [Try wider range]  [Create content]    │
│                                         │
└─────────────────────────────────────────┘
```

- Centered in widget body
- Icon: 36px, `--raised` background, `--muted` color, relevant to context (chart icon, file icon)
- Title: 13px, 500 weight, `--ink`, "No data for this period"
- Description: 12px, `--muted`, 2 lines max
- Action buttons: 2 secondary-style buttons, 12px, 500 weight, gap 8px
- Buttons are context-aware: "Try wider range" opens date picker, "Create content" navigates to creation flow

---

## Widget Type 9: Loading State Widget

**Shows skeleton placeholders while data is loading.**

### Visual
```
┌─────────────────────────────────────────┐
│ [icon] Metric Title          [⋯]       │
├─────────────────────────────────────────┤
│                                         │
│     � 호흡기 호흡기 호흡기                  │
│     � 호흡기 호흡기                      │
│                                         │
│     � 호흡기 호흡기 호흡기 호흡기          │
│                                         │
│     � 호흡기 호흡기 호흡기                │
│                                         │
└─────────────────────────────────────────┘
```

- Header: icon + title visible immediately (not skeleton)
- Body: skeleton blocks matching the content layout
- Skeleton style: shimmer animation (gradient 200% width, 1.5s loop), `--raised` base color, `--line` mid color
- Skeleton shapes match the content: large rectangle for metric number, thin rectangles for labels, bars for chart
- Loading duration: typically < 2 seconds, skeleton visible until data arrives

---

## Widget Type 10: Error State Widget

**Shows when a widget fails to load data.**

### Visual
```
┌─────────────────────────────────────────┐
│ [icon] Widget Title          [⋯]       │
├─────────────────────────────────────────┤
│                                         │
│           [⚠]                          │
│                                         │
│        Failed to load data              │
│        API returned an error.           │
│                                         │
│        [Retry]                          │
│                                         │
└─────────────────────────────────────────┘
```

- Centered in widget body
- Icon: 32px circle, `rgba(danger 0.1)` background, `--danger` color, warning glyph
- Title: 13px, 500 weight, `--danger`, "Failed to load data"
- Description: 12px, `--muted`, "API returned an error." — or specific error message if available
- Retry button: secondary style, 12px, 500 weight, "Retry" — primary color on hover
- Error details (optional): collapsible "Show error details" with raw error message/debug info for developers

---

## Responsive Behavior

### Desktop (≥1200px)
- Widget grid: 3-4 columns (depending on widget sizes)
- Wide widgets (2-col span) available for charts
- Date range picker inline in header

### Tablet (768px–1200px)
- Widget grid: 2 columns
- Wide widgets become 1 column (full width)
- Date range picker remains in header

### Mobile (<768px)
- Widget grid: 1 column (all widgets stacked)
- All widgets full-width
- Date range picker opens as bottom sheet (not dropdown)
- Export button moves to bottom of header or becomes icon-only
- Widgets maintain their internal layout (charts resize, text stays readable)

---

## Design Token References

| Element | Token | Value (Dark) |
|---------|-------|-------------|
| Dashboard background | `--bg` | `#0c0e13` |
| Widget background | `--surface` | `#14171e` |
| Widget hover | `--raised` | `#1b1f28` |
| Widget border | `--line` | `#2c323f` |
| Text | `--ink` | `#ececf4` |
| Muted text | `--muted` | `#969ead` |
| Primary | `--primary` | `#818cf8` |
| Success | `--success` | `#4ade80` |
| Warning | `--warning` | `#fbbf24` |
| Danger | `--danger` | `#f87171` |
| Info | `--info` | `#38bdf8` |
| Widget radius | `--radius` | 8px |
| Metric number | 32px, 700 weight | (compact: 24px) |
| Chart height | 180px (default) | (compact: 120px, large: 240px) |
| Sparkline height | 32px | — |
| Grid gap | 16px | — |
| Widget padding | 16px | (compact: 12px) |

---

## Implementation Notes

### Widget Data Model (for implementation reference)
```
WidgetConfig {
  id: string
  type: 'metric' | 'bar-chart' | 'line-chart' | 'pie-chart' | 'activity-feed' | 'pipeline' | 'kpi-row'
  title: string
  dataSource: string   // API endpoint or data identifier
  position: { row: number, col: number }
  size: 'standard' | 'wide' | 'tall'
  config: object       // type-specific config (e.g., metric name, chart type, date range)
}

MetricWidgetConfig {
  metricKey: string            // e.g., "postsPublished"
  label: string                // "Posts Published"
  trendPeriod: '7d' | '30d' | '90d' | 'month' | 'quarter'
  showSparkline: boolean
  showComparison: boolean
  goal?: number                // optional goal/target
}

ChartWidgetConfig {
  chartType: 'bar' | 'line' | 'pie' | 'donut' | 'stacked-bar' | 'grouped-bar'
  dataKey: string              // e.g., "contentByChannel"
  groupBy: string              // e.g., "channel", "date", "type"
  dateRange: string            // inherited from dashboard date picker
  height: 'compact' | 'default' | 'large'
  showTotal: boolean
  showLegend: boolean
}
```

### Widget Grid System
- CSS Grid with `auto-fill, minmax(280px, 1fr)` for responsive columns
- Widget size classes: `.widget` (1 unit), `.widget-wide` (2 units span), `.widget-tall` (taller body)
- Drag-to-rearrange: stretch goal, not required for initial implementation

### Date Range Inheritance
All widgets in the dashboard inherit the date range from the dashboard header picker. Changing the date range re-fetches data for all widgets. Individual widgets can override the date range in their config (future enhancement).

### Real-time Updates
- Dashboard could poll for updates (e.g., every 60 seconds for activity feed)
- New data could pulse/highlight briefly when it arrives (subtle animation on changed values)
- Not required for initial implementation

### Export
- CSV export: each widget exports its data as CSV rows
- PDF export: dashboard snapshot as PDF (render to canvas or use print CSS)
- PNG export: dashboard snapshot as PNG image

---

*Spec version 1.0 — covers dashboard header, date range picker, 10 widget types (metric card, bar chart, line chart, pie/donut chart, activity feed, KPI row, pipeline, empty state, loading state, error state), widget grid layout, responsive behavior, and design token references.*
