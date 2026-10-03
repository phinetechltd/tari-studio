# Content Task Board — UI/UX Spec

> Kanban board for managing content workflow: Draft → In Review → Approved → Scheduled → Published.
> Consistent with the Modern Design System (indigo accent, dark primary, 8px spacing grid, card-based surfaces).

---

## Board Overview

**Container**
- Full-width board, fills available page width
- Background: `--bg` (#0c0e13 dark / #f8f9fb light)
- Minimum height: full viewport height
- Horizontal scroll on mobile (columns shrink, horizontal scrollbar appears)

**Board Header (Toolbar)**
- Height: 52px (padding 12px 20px)
- Border-bottom: 1px solid `--line`
- Background: `--surface`
- Content: Left to right — title, search/filter bar, view toggle, add button

**Board Columns**
- 5 columns: Draft | In Review | Approved | Scheduled | Published
- Equal width (flex: 1 each), minimum 240px each
- Horizontal gap between columns: 12px
- Vertical scroll within each column if cards overflow
- Column header sticky at top of column

---

## Board Toolbar

```
┌─────────────────────────────────────────────────────────┐
│  Content Tasks                    [Search...]  [Board] [✓]│
└─────────────────────────────────────────────────────────┘
```

### Title
- Text: "Content Tasks" — 16px, 600 weight, `--ink`
- Left-aligned, margin-right 16px

### Search / Filter Input
- Width: 240px (flexible on wider screens)
- Height: 34px (padding 6px 12px)
- Background: `--raised`
- Border: 1px solid `--line`
- Border-radius: 6px
- Placeholder: "Search by title, brand, channel..."
- Font: 13px, `--ink`
- Focus: border-color `--primary`
- Left icon: search glyph (14px, `--muted`)

### Filter Toggle (optional advanced filter)
- Icon button: filter glyph (34px, `--muted`, hover `--ink`)
- Opens filter dropdown: brand selector, channel multi-select, assignee selector, date range
- Active filter indicator: badge on the button showing count (e.g., "2")

### View Toggle (Board / List)
- Two-segment control: "Board" (active) | "List"
- Style: pill toggle, 80px total, 40px per segment
- Active segment: background `--primary`, text `--onprimary`
- Inactive: background `--raised`, text `--muted`
- Border-radius: 10px pill

### Add Content Button
- Style: primary button (background `--primary`, text `--onprimary`)
- Text: "+ New Content" — 13px, 500 weight
- Icon: plus glyph (14px) to left of text
- Height: 34px

---

## Columns

### Column Header

```
┌────────────────────┐
│ Draft          12  │
│ [Filter] [Sort ▼]  │
└────────────────────┘
```

**Layout**: Horizontal row, padding 12px 14px

**Column Title**
- Text: "Draft" — 13px, 600 weight, uppercased via CSS, `--ink`
- Flex: 1

**Count Badge**
- Style: Pill badge, 20px width, 18px height, 18px font
- Background: `--raised`
- Border: 1px solid `--line`
- Color: `--muted`
- Font: 11px, 600 weight, monospace
- Position: right side of header
- Updates live as cards are moved

**Column Header Actions** (right side, 2 icon buttons)
1. **Filter**: filter glyph icon button (28px, `--muted`, hover `--primary`)
   - Opens column-specific filter (same options as board filter but scoped to this column)
2. **Sort**: sort dropdown (chevron-down icon, 28px)
   - Options: "Default order", "By due date (soonest first)", "By due date (latest first)", "By assignee"
   - Selected option shown as tooltip on hover

**Column Header Background**: `--surface`, border-bottom 1px `--line`

---

## Cards

### Default Card

```
┌─────────────────────────────────┐
│ █ Brand    Content Title Here.. │
│   [LinkedIn]    Due: Feb 15     │
│              [AK]  [✎][🗑]      │
└─────────────────────────────────┘
```

**Card Container**
- Background: `--surface`
- Border: 1px solid `--line`
- Border-radius: `--radius` (8px)
- Padding: 12px
- Min-height: 80px
- Cursor: grab (default), grabbing (during drag)
- Transition: box-shadow 120ms, transform 120ms, border-color 120ms
- Hover: border-color `--primary`, elevated shadow (`0 4px 16px rgba(0,0,0,0.5)`)
- Drag-over (drop zone highlight on column): border-color `--primary`, background `rgba(primary 0.05)`, dashed top border

**Card Header Row** (flex row, align-start)
- Left: Brand thumbnail + brand name (16px, 600 weight, `--ink`, truncated)
- Brand thumbnail: 24px square, brand avatar/initials, 4px right margin
- Flexible width, min-width 0 (truncates)

**Channel Icon**
- Position: Right side of header row, after brand
- Size: 20px icon
- Color: channel-specific (LinkedIn blue, X black, TikTok black, YouTube red, etc.)
- Tooltip on hover: channel name

**Due Date**
- Position: Below header row, left side
- Format: "Due: Feb 15" — 11px, `--muted`
- Overdue: text color `--danger`, with danger dot indicator (6px circle, `--danger`, positioned left of date)
- No due date: "No due date" — 11px, `--muted`

**Assignee Avatar**
- Position: Below header row, right side of card body
- Size: 24px circle
- Brand initials or user initials
- Background: `--primary` (or assignee-specific color)
- Color: `--onprimary`
- Tooltip on hover: assignee name

**Status Badge** (optional, since column = status — could be shown or omitted)
- If shown: 10px pill badge, 11px font, 500 weight
- Color by status: draft=muted, review=info, approved=success, scheduled=warning, published=primary
- Position: bottom-right corner of card

**Quick Action Buttons** (bottom-right)
- Two icon buttons: Edit (pencil) | Delete (trash)
- Size: 28px square
- Background: transparent
- Border: none
- Color: `--muted`
- Opacity: 0 (hidden by default), 1 (visible on card hover)
- Transition: opacity 120ms
- Hover: color `--primary` (edit), `--danger` (delete)
- Delete on hover: shows confirmation tooltip "Delete this content task?"

---

## Drag and Drop

### Visual Feedback During Drag

**Dragging Card**
- Transform: scale(1.02), rotate(1.5deg) — subtle lift effect
- Shadow: elevated, more intense (`0 8px 24px rgba(0,0,0,0.6)`)
- Opacity: 0.9
- Cursor: grabbing
- Original position: placeholder shown (dashed border rect, `--line` color, same size as card)

**Drop Zone (target column)**
- Column background: `rgba(primary 0.03)` when a card is being dragged over it
- Column border: top border becomes 2px dashed `--primary`
- If column has a sort order, the insertion point is shown as a 2px `--primary` horizontal line between cards

**Drop Feedback**
- On drop: card animates to new position (150ms ease-out)
- Column count badge updates immediately
- If dropped outside any column: card snaps back to original position with a subtle bounce animation

### Drag Constraints
- Cards can be moved between any columns (workflow is linear but can skip steps if needed — e.g., Draft → Published for quick posts)
- Cards within a column can be reordered by dragging
- Dropping on a full-width area outside columns: card returns to origin

### Touch Support
- Touch drag: long-press (300ms) to initiate drag on touch devices
- Visual feedback same as mouse drag
- Haptic feedback optional (vibration API — note as enhancement)

---

## Empty States

### Column Empty State

When a column has 0 cards:

```
┌────────────────────┐
│ Draft          0   │
│ [Filter] [Sort ▼]  │
├────────────────────┤
│                   │
│  No draft content  │
│                   │
│     [+ Create]     │
│                   │
└────────────────────┘
```

**Visual**:
- Centered in column body
- Icon: document/file icon, 32px, `--raised` background, `--muted` color
- Title: "No draft content" — 13px, 500 weight, `--ink`
- Description: "Create your first content task to get started." — 12px, `--muted`, margin-top 2px
- Create button: primary style, "+ Create" — 12px, 500 weight, padding 6px 12px
- Button appears only on empty columns (not on columns that are empty because everything is published)

### Board Empty State (no content at all)

```
┌─────────────────────────────────────────────────────────┐
│  Content Tasks                    [Search...]  [Board]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│           📝                                            │
│        No content tasks yet                              │
│        Create your first content item to start           │
│        managing your workflow.                           │
│                                                         │
│              [+ New Content]                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Centered in board area
- Icon: 48px, `--raised` background, `--muted` color
- Title: 16px, 600 weight, `--ink`
- Description: 13px, `--muted`, 2 lines max
- Button: primary, centered below text

---

## Filter & Sort

### Board-Level Filter
- Opens as a dropdown/popover anchored to the filter button in the toolbar
- Options:
  - **Brand**: multi-select dropdown of brands (checkbox per brand)
  - **Channel**: multi-select of channels (checkbox per channel)
  - **Assignee**: multi-select of team members (checkbox per member)
  - **Date range**: "Any time" | "Today" | "This week" | "This month" | "Custom" (calendar range)
- Active filters shown as chips below the toolbar: "Brand: NVIDIA K3 ✓" with × to remove
- "Clear all" link when filters active
- Filter count badge on toolbar button

### Column-Level Filter
- Same options as board filter but scoped to cards in that column
- Opens from the column header filter button
- Does not affect other columns

### Sort Options
- **Default order**: manual drag order (last dragged position)
- **By due date (soonest first)**: cards with due dates at top, sorted ascending; no-due-date cards at bottom
- **By due date (latest first)**: reverse
- **By assignee**: group by assignee, then alphabetical by name

---

## Responsive Behavior

### Desktop (≥1200px)
- 5 columns visible simultaneously
- Full card layout with all elements
- Horizontal toolbar with all controls visible

### Tablet (768px–1200px)
- Columns shrink to minimum 240px
- If 5 columns don> 1200px total, horizontal scroll enabled
- Card layout same, font sizes unchanged
- Toolbar wraps if needed (search goes below title)

### Mobile (<768px)
- **Horizontal scroll mode**: 5 columns at minimum 200px each, horizontal scrollbar
- Column peek: first column visible + scroll arrow indicators on sides
- OR **List view toggle**: switch to single-column list view (all cards stacked, status shown as badge not column position)
- Cards: slightly smaller padding (8px instead of 12px)
- Channel icon: 16px instead of 20px
- Assignee avatar: 20px instead of 24px
- Due date + assignee on same row, below title
- Quick action buttons: always visible (not hover-only), smaller (24px)
- Toolbar: search input expands to full width below title, filter/view toggle below that

### List View (alternative to board)
- Single column, full width
- Each card is a row: title + brand + channel + due date + assignee + status badge + actions
- Sortable by clicking column headers
- Filterable with same filter options
- Good for mobile or for power users who prefer list over board

---

## Status Color Reference

All status colors from `MODERN_DESIGN_SYSTEM_SPEC.md`:

| Status | Column | Badge Color | Badge Background | Text Color |
|--------|--------|-------------|-----------------|------------|
| Draft | Draft | `--muted` | `--raised` | `--muted` |
| In Review | In Review | `--info` | `rgba(info 0.12)` | `--info` |
| Approved | Approved | `--success` | `rgba(success 0.12)` | `--success` |
| Scheduled | Scheduled | `--warning` | `rgba(warning 0.12)` | `--warning` |
| Published | Published | `--primary` | `rgba(primary 0.12)` | `--primary` |

---

## Design Token References

| Element | Token | Value (Dark) |
|---------|-------|-------------|
| Board background | `--bg` | `#0c0e13` |
| Column/card background | `--surface` | `#14171e` |
| Hover background | `--raised` | `#1b1f28` |
| Border | `--line` | `#2c323f` |
| Text | `--ink` | `#ececf4` |
| Muted text | `--muted` | `#969ead` |
| Primary | `--primary` | `#818cf8` |
| Card radius | `--radius` | 8px |
| Column header radius-top | `--radius` | 8px (top corners only — achieved via border-radius + overflow hidden on column) |
| Toolbar height | — | 52px |
| Card min-height | — | 80px |
| Card padding | — | 12px |
| Column gap | — | 12px |
| Spacing base | — | 4px |

---

## Implementation Notes

### Column Overflow
Each column has `overflow-y: auto` and a minimum height. The column body scrolls when cards exceed available space. Column header stays fixed (position sticky, top: 0 within column).

### Drag-and-Drop Library
Recommend a lightweight DnD library compatible with the design system. Key requirements: visual feedback on drag (lift + shadow), drop zone highlighting, smooth drop animation, touch support, accessible keyboard alternative (arrow key reordering).

### Card Data Model (for implementation reference)
```
Card {
  id: string
  title: string           // truncated at 80 chars in UI
  brandId: string
  brandName: string
  brandAvatar: string     // initials or thumbnail URL
  channel: string         // channel identifier + icon
  dueDate: Date | null
  assigneeId: string
  assigneeName: string
  assigneeAvatar: string
  status: 'draft' | 'review' | 'approved' | 'scheduled' | 'published'
  createdAt: Date
  updatedAt: Date
}
```

### Performance
- Virtualize card rendering if a column has 50+ cards (only render visible cards + buffer)
- Debounce filter input (150ms)
- Optimistically update UI on drag (revert on API error)

---

*Spec version 1.0 — covers board toolbar, 5 columns, card anatomy, drag-and-drop interaction, empty states, filter/sort, responsive behavior (3 breakpoints + list view), and design token references.*
