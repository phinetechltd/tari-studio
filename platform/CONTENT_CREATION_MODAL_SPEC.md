# Content Creation Modal — UI/UX Spec

> 4-step AI-assisted content creation flow as a modal overlay.
> Consistent with the Modern Design System (indigo accent, dark primary, 8px spacing grid).

---

## Modal Structure

**Container**
- Centered modal, not full-screen
- Width: 680px desktop, 100% mobile (with 16px padding)
- Max-height: 90vh, scrollable body if content exceeds
- Background: `--surface` (#14171e dark / #ffffff light)
- Border: 1px solid `--line`
- Border-radius: `--radius-lg` (10px)
- Box-shadow: elevated (`0 4px 16px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)`)
- Backdrop: `rgba(0,0,0,0.5)` with `backdrop-filter: blur(4px)` on body behind modal
- Body scroll-lock when modal open

**Header**
- Padding: 16px 20px
- Border-bottom: 1px solid `--line`
- Height: ~52px
- Left: Step indicator + "Create Content" title
- Right: Close button (icon-btn, 34px)

**Footer**
- Padding: 12px 20px
- Border-top: 1px solid `--line`
- Height: ~48px
- Right-aligned: Back (secondary) + Next/Generate/Publish (primary) buttons
- Gap between buttons: 8px

---

## Step Indicator

**Position**: Modal header, left side

**Visual**: Horizontal step dots with labels, connected by a line

```
● 1 → ○ 2 → ○ 3 → ○ 4
```

- 4 dots, connected by a 1px line in `--line` color
- Completed step: filled circle in `--primary`, with checkmark icon inside
- Current step: filled circle in `--primary`, no icon
- Upcoming step: hollow circle (border 1.5px `--line`, background transparent), `--muted` color
- Step labels below dots: 11px, 500 weight, `--muted` for upcoming, `--ink` for current/completed
- Labels: "Brief", "Generate", "Edit", "Approve"
- On mobile: hide labels, show only dots

**Transitions**: When advancing to next step, the current dot animates to filled (scale 0.8 → 1.0, 150ms).

---

## Step 1: Brief

### Layout
```
┌─────────────────────────────────────────┐
│ ○ 1  ──○ 2 ──○ 3 ──○ 4                  │
│ ● Brief                                  │
├─────────────────────────────────────────┤
│                                         │
│  Topic / Headline                        │
│  ┌─────────────────────────────────────┐│
│  │ Enter the main topic or headline... ││
│  └─────────────────────────────────────┘│
│                                         │
│  Tone                                   │
│  [Professional] [Casual]                │
│  [Promotional] [Educational]            │
│                                         │
│  Length                                 │
│  [Short] [Medium] [Long]                │
│                                         │
│  Target Channel                         │
│  ○ LinkedIn   ○ X / Twitter             │
│  ○ TikTok     ○ YouTube                 │
│  ○ Pinterest   ○ Instagram              │
│  ○ Facebook    ○ Newsletter             │
│                                         │
│  Brand Context                          │
│  ┌─────────────────────────────────────┐│
│  │ From: NVIDIA K3  [Edit]             ││
│  └─────────────────────────────────────┘│
│                                         │
├─────────────────────────────────────────┤
│              [Back]  [Generate →]       │
└─────────────────────────────────────────┘
```

### Fields

**Topic / Headline Input**
- Type: Text input, full width
- Placeholder: "Enter the main topic or headline for this content..."
- Height: 40px (padding 8px 12px)
- Border: 1px solid `--line`, radius 6px
- Focus: border-color `--primary`
- Required: Yes — disable Next/Generate if empty
- Font: 14px, `--ink`

**Tone Selector**
- Label: "Tone" — 12px uppercase, 600 weight, `--muted`, margin-bottom 8px
- Type: Chip group (horizontal scroll on mobile)
- Chips: 4 options — Professional, Casual, Promotional, Educational
- Chip style: 32px height, 12px 16px padding, border-radius 10px pill
- Default (unselected): background `--raised`, border 1px `--line`, color `--ink`, 500 weight
- Selected: background `rgba(primary 0.15)`, border 1px `--primary`, color `--primary`
- Hover: unselected chips get `--raised` background
- Gap between chips: 6px
- Default: "Professional" pre-selected
- Selection is single (radio behavior)

**Length Selector**
- Label: "Length" — same style as Tone
- Chips: Short (under 280 chars), Medium (280–1000 chars), Long (1000+ chars)
- Same chip style as Tone
- Default: "Medium" pre-selected

**Target Channel**
- Label: "Target Channel" — same style
- Type: Radio group, 2-column grid on desktop, 1-column on mobile
- Option style: 44px height row, cursor pointer, padding 8px 12px
- Unselected: transparent background
- Selected: background `rgba(primary 0.1)`, left border 2px `--primary`
- Radio indicator: 14px circle, `--line` when unselected, filled `--primary` when selected
- Label: 13px, 500 weight, `--ink`
- Icons: 16px channel icon next to label (LinkedIn blue, X black, TikTok black, YouTube red, Pinterest red, Instagram gradient, Facebook blue, Newsletter pen)
- Default: none selected — required, disable Generate if not selected

**Brand Context**
- Label: "Brand Context" — same style
- Card: `--surface` background, 1px `--line` border, 6px radius
- Content: "From: [Brand Name]  [Edit pencil icon button]"
- Brand name: 13px, 500 weight, `--ink`
- Edit button: 28px icon button, `--muted`, hover `--ink`
- Edit opens brand selector (outside this spec — note as integration point)
- Read-only display, not an input

### Generate Button (Step 1 Footer)
- Text: "Generate"
- Style: Primary button (background `--primary`, text `--onprimary`)
- Icon: Sparkle/magic wand glyph (20px) to the left of text
- Width: auto (fills available space in footer)
- Disabled state: opacity 0.4, cursor not-allowed, no hover effect
- Disabled when: topic empty OR no channel selected

---

## Step 2: Generate (Loading)

### Layout
```
┌─────────────────────────────────────────┐
│ ● 1 ──○ 2 ──○ 3 ──○ 4                  │
│ ○ Generate                               │
├─────────────────────────────────────────┤
│                                         │
│     ✦                                   │
│  Generating content for                 │
│  NVIDIA K3 — LinkedIn                   │
│                                         │
│  ○ ○ ○ ○ ○  (step dots, animating)     │
│                                         │
│  Applying brand voice & style...        │
│                                         │
├─────────────────────────────────────────┤
│           [Cancel]  (secondary)         │
└─────────────────────────────────────────┘
```

### Visual Elements

**Loading Icon**
- Large sparkle/magic wand icon, 48px, centered
- Color: `--primary`, with subtle pulse animation (opacity 0.6 → 1.0, 1s loop)
- Background: circular `--raised` surface, 80px diameter, 10px radius, centered

**Status Text**
- Title: "Generating content for" — 14px, `--muted`
- Brand + Channel line: "NVIDIA K3 — LinkedIn" — 16px, 600 weight, `--ink`
- Subtitle: "Applying brand voice and style..." — 13px, `--muted`, below with 4px gap

**Animated Step Dots**
- 5 dots in a row, representing generation progress stages
- Dots animate sequentially: each dot fills with `--primary` and a check appears, then next dot starts
- Cycle duration: ~3 seconds total, looping
- This is a visual indicator only — not tied to actual progress percentage

**Cancel Button**
- Step 2 footer has only Cancel (secondary button)
- No Next/Generate button — generation is in progress
- Cancel: secondary style, text "Cancel generation"
- Cancel stops the generation and returns to Step 1

### Brand Awareness
The generation step explicitly shows which brand is being used:
- Brand name in the status text (from Step 1's brand context)
- Channel name in the status text (from Step 1's channel selection)
- Optional: small brand avatar/initials next to the status text

---

## Step 3: Edit

### Layout
```
┌─────────────────────────────────────────┐
│ ● 1 ──● 2 ──○ 3 ──○ 4                  │
│ ○ Edit                                  │
├─────────────────────────────────────────┤
│  [✎ Bold] [✎ Italic] [🔗 Link]         │
│  [≡ List] [↩ Undo] [↪ Redo]  [#342 words]│
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │  The GeForce K3 series represents   ││
│  │  a breakthrough in...               ││
│  │                                     ││
│  │  [Generated content in rich text    ││
│  │   editor area — 400px height        ││
│  │   minimum, scrollable]              ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
│  AI Actions (floating toolbar, right)   │
│  [↻ Regenerate]                          │
│  [↔ Shorten]                              │
│  [↔ Expand]                              │
│  [ Tone → ]                              │
│                                         │
├─────────────────────────────────────────┤
│              [Back]  [Next →]           │
└─────────────────────────────────────────┘
```

### Toolbar

**Position**: Top of editor area, sticky, 40px height
**Background**: `--raised` (slightly lighter than editor bg)
**Border**: bottom 1px `--line`
**Style**: horizontal toolbar, icon buttons

**Toolbar Buttons** (left to right):
1. **Bold**: `B` icon, 16px, `--muted` default, `--primary` when active format
2. **Italic**: `I` icon, same style
3. **Link**: chain icon, same style
4. **List**: bullet/list icon, same style
5. **Undo**: arrow left, same style
6. **Redo**: arrow right, same style

**Word/Character Count** (right side of toolbar):
- "342 words · 1,850 characters" — 12px, `--muted`
- Updates live as user edits
- Format: `X words · Y characters`

**Active Format Indicator**: When text is bold, the Bold button shows `--primary` background. Same for italic.

### Editor Area

- Min-height: 400px, scrollable if content exceeds
- Background: `--surface` (same as modal)
- Padding: 16px
- Font: 14px, `--ink`, line-height 1.6
- Placeholder (empty state): "Content will appear here after generation..." — 14px, `--muted`, italic
- Border: none (editor lives inside modal card)
- Focus ring: 2px `--primary` with 2px offset (on the editor container)

### AI Action Buttons

**Position**: Floating toolbar on the right side of the editor, vertically stacked
**Background**: `--raised`
**Border**: 1px `--line`, left side (acts as a dividing line from editor)
**Border-radius**: 6px (only right corners rounded)
**Width**: 40px
**Button style**: 36px width, 36px height, icon + optional label below
**Gap**: 4px between buttons

**Buttons**:
1. **Regenerate** (↻): regenerate the entire content from the original brief
2. **Shorten** (↔←): attempt to reduce word count while preserving meaning
3. **Expand** (↔→): add detail and context to the content
4. **Change Tone** (→): opens a small popover with the 4 tone options

Each button:
- Icon: 16px, `--ink`
- Hover: background `--surface`, color `--primary`
- Active (while action processing): spinner replaces icon, button disabled
- Disabled when: no content in editor

**Change Tone popover**: Small 4-option chip list (same style as Step 1 tone selector), anchored to the button.

### Source/Citations Panel (optional)

When AI used web data to generate content, a small side panel appears:
- Position: Below the toolbar, as a collapsible strip
- Width: 100% of editor
- Background: `rgba(primary 0.05)`
- Border: top 1px `--line`
- Content: "Sources: [link 1], [link 2]" — 12px, `--muted`, link style on URLs
- Collapse toggle: small arrow button
- Hidden by default if no sources were used

---

## Step 4: Approve

### Layout
```
┌─────────────────────────────────────────┐
│ ● 1 ──● 2 ──● 3 ──○ 4                  │
│ ○ Approve                               │
├─────────────────────────────────────────┤
│  [Preview]  [Schedule]                  │
├─────────────────────────────────────────┤
│                                         │
│  TAB: Preview                           │
│  ┌─────────────────────────────────────┐│
│  │  Content preview in channel-        ││
│  │  appropriate format:                ││
│  │                                     ││
│  │  ── LinkedIn Post ──               ││
│  │  [The generated post appears       ││
│  │   formatted as it would on         ││
│  │   LinkedIn, with proper spacing]   ││
│  │                                     ││
│  │  ── X / Twitter ──                 ││
│  │  [The same content, optimized      ││
│  │   for Twitter's 280-char limit]    ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
│  TAB: Schedule                          │
│  ┌─────────────────────────────────────┐│
│  │  Publish Now  ○  ────  ○ Schedule  ││
│  │                                     ││
│  │  Date:  [Feb 15, 2026    ▼]        ││
│  │  Time:  [14:00          ▼]         ││
│  │  Timezone: UTC+3 (Nairobi)         ││
│  │                                     ││
│  │  Save as draft:  [ ]               ││
│  └─────────────────────────────────────┘│
│                                         │
├─────────────────────────────────────────┤
│  [Cancel]          [Publish Now →]      │
│  or [Schedule →] (when scheduled)      │
└─────────────────────────────────────────┘
```

### Tab Bar

- Position: Below modal header, above content area
- Style: Tabs component (from design system)
- Tabs: "Preview" | "Schedule"
- Active tab: `--primary` bottom border (2px), `--primary` color
- Inactive: `--muted` color
- Height: 40px (tabs + 12px padding)

### Preview Tab

**Channel Preview Cards**
- Show the generated content formatted as it would appear on the target channel
- If multiple channels selected in Step 1, show previews for each (tabs or stacked cards)
- Each preview card: `--raised` background, 1px `--line` border, 8px radius, 16px padding
- Header: channel name + icon (e.g., "LinkedIn Post" with LinkedIn icon)
- Content: formatted text with appropriate styling for that channel
- Character count shown per preview: "278 characters" — 11px, `--muted`, right-aligned

**Empty Preview**: If no content to preview (shouldn't happen — comes from Step 3), show "No content to preview" — same empty state pattern as design system.

### Schedule Tab

**Publish Toggle**
- Two options: "Publish Now" (radio default) | "Schedule"
- Style: Two large radio cards, full width, 48px height
- Publish Now selected: border `--primary`, background `rgba(primary 0.05)`
- Schedule selected: border `--line`, background `--raised`
- Icon: clock icon for Schedule, lightning/up arrow for Publish Now

**Date Picker** (shown when Schedule selected)
- Label: "Date" — 12px uppercase `--muted`
- Input: text input showing selected date (e.g., "Feb 15, 2026")
- Dropdown calendar on click (calendar component — note as implementation detail)
- Default: tomorrow's date

**Time Picker** (shown when Schedule selected)
- Label: "Time" — same style
- Input: text input showing selected time (e.g., "14:00")
- Dropdown time selector on click (hour + minute, 15-min intervals)
- Default: current time + 1 hour

**Timezone Display**
- Text below time: "UTC+3 (Nairobi)" — 12px, `--muted`
- Static display, not editable in this flow (user's profile timezone)
- Note: could be made editable in a future iteration

**Save as Draft**
- Checkbox: 16px square, `--line` border when unchecked, `--primary` fill + white check when checked
- Label: "Save as draft" — 13px, 500 weight, `--ink`
- Checkbox + label aligned on same row
- Default: unchecked
- When checked: the Publish/Schedule button changes to "Save Draft"

### Footer Buttons

**Cancel Button** (left)
- Secondary style
- Text: "Back to Edit" (returns to Step 3) OR "Cancel" (closes modal, discards)
- Behavior: if content is unsaved/new, show confirmation: "Discard this content?" with Confirm/Cancel options. If content was previously saved, just navigate back.

**Primary Action Button** (right)
- When Publish Now selected: "Publish Now" — primary style, green-tinted or standard primary
- When Schedule selected: "Schedule" — primary style
- When Save as Draft checked: "Save Draft" — secondary style, no icon
- Icon: appropriate glyph (up arrow for publish, clock for schedule, disk for draft)
- Disabled: when no content in editor (Step 3 was skipped)

---

## Modal Behavior & Edge Cases

### Navigation
- **Back**: Returns to previous step, preserves all entered data
- **Next/Generate**: Advances to next step, validates required fields
- **Escape key**: Closes modal. If there is unsaved content, show confirmation dialog first.
- **Click outside modal (on backdrop)**: Same as Escape — close with confirmation if unsaved.

### Validation
- **Step 1 → Step 2**: Topic must be non-empty. Channel must be selected. Generate button disabled until both are satisfied.
- **Step 2 → Step 3**: No validation (automatic transition after generation completes). Cancel returns to Step 1.
- **Step 3 → Step 4**: No validation required — user can approve empty content (they can edit it first).
- **Step 4 → Close**: Publishing/scheduling/draft-saving is the action. No "validation" — the action either succeeds or fails with error state.

### Error States
- **Generation failed**: In Step 2, replace loading UI with error state: warning icon + "Generation failed. [Try again] [Go back]"
- **Publish failed**: In Step 4, show error toast: "Publish failed: [reason]. [Retry]"
- **Schedule save failed**: Similar error toast.

### Responsive Behavior

**Desktop (≥768px)**
- Modal width: 680px
- Full 4-step layout as described
- Toolbar visible on one row
- AI action buttons floating on right side

**Mobile (<768px)**
- Modal width: 100% with 16px padding (effectively full-screen)
- Step indicator: dots only, no labels
- Tone/length chips: horizontal scroll
- Channel radio: full-width rows, single column
- Toolbar: wraps to 2 rows if needed
- AI action buttons: move below the editor, horizontal row
- Preview tab: stacked channel previews, one per section
- Footer buttons: stack vertically (Back on top, action below)

### Step Persistence
All entered data persists across steps. If user goes Back from Step 3 to Step 1, all values (topic, tone, length, channel, brand) are preserved. If user closes and reopens the modal within the same session, the last step and data should be restored (session storage — note as implementation detail).

---

## Design Token References

All colors, spacing, radii, and typography in this spec use tokens from `MODERN_DESIGN_SYSTEM_SPEC.md`:

| Element | Token | Value (Dark) |
|---------|-------|-------------|
| Modal background | `--surface` | `#14171e` |
| Modal border | `--line` | `#2c323f` |
| Body text | `--ink` | `#ececf4` |
| Labels/muted | `--muted` | `#969ead` |
| Primary action | `--primary` | `#818cf8` |
| Primary bg (selected chips) | `rgba(primary 0.15)` | `rgba(129,140,248,0.15)` |
| Border (selected radio) | `--primary` | `#818cf8` |
| Success (trends, approved) | `--success` | `#4ade80` |
| Warning (pending, schedule) | `--warning` | `#fbbf24` |
| Danger (errors, overdue) | `--danger` | `#f87171` |
| Info (review, in-progress) | `--info` | `#38bdf8` |
| Card radius | `--radius` / `--radius-lg` | 8px / 10px |
| Button radius | `--radius-sm` | 6px |
| Chip radius | 10px (pill) | — |
| Spacing base | 4px | — |
| Modal padding | 16px / 20px | — |

---

*Spec version 1.0 — covers all 4 steps, fields, states, interactions, responsive behavior, and edge cases for the Content Creation Modal.*
