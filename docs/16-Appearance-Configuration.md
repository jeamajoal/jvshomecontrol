# Appearance Configuration

Welcome to the fun part. You've installed the server, wired up Hubitat, and your devices are flowing in — now it's time to make this dashboard **yours**. Every color, every card size, every pixel of transparency is configurable. This guide walks you through the entire process from a blank slate to a fully polished multi-panel setup.

> **Tip:** Open Settings by tapping the gear icon in the bottom navigation bar, or by navigating to the Settings page.

---

## Table of Contents

1. [The Strategy: Start Big, Then Specialize](#1-the-strategy-start-big-then-specialize)
2. [Step 1 — Trim the Device List (Global Options)](#2-step-1--trim-the-device-list-global-options)
3. [Step 2 — Create Your First Panel](#3-step-2--create-your-first-panel)
4. [Step 3 — Configure Device Visibility & Behavior (Device Options)](#4-step-3--configure-device-visibility--behavior-device-options)
5. [Step 4 — Style Your Panel (Panel Options)](#5-step-4--style-your-panel-panel-options)
6. [Step 5 — Set Up Climate Tolerances](#6-step-5--set-up-climate-tolerances)
7. [Step 6 — Build Your Climate Floor Plan](#7-step-6--build-your-climate-floor-plan)
8. [Step 7 — Create Room-Specific Panels](#8-step-7--create-room-specific-panels)
9. [Quick Reference: All Settings by Tab](#9-quick-reference-all-settings-by-tab)

---

## 1. The Strategy: Start Big, Then Specialize

Before diving into individual settings, understand the workflow:

1. **Build one "master" panel first** — typically your *Control Everything* panel. This panel will have every device visible, every command enabled, and every metric shown. Getting this right means every other panel is just a trimmed copy.
2. **Use Global Options to remove junk** — devices you never want on *any* panel (test devices, virtual switches, hub internals) get removed here once and disappear everywhere.
3. **Create new panels by copying your master** — then remove devices and tweak the look for each room/tablet.

This "additive first, subtractive second" approach saves hours of configuration.

<!-- 📸 SCREENSHOT: Overview of a fully configured Home page with multiple room cards, showing the kind of result users are working towards -->

---

## 2. Step 1 — Trim the Device List (Global Options)

Open **Settings → Global Options**. This tab controls server-enforced boundaries that affect *every* panel.

### Global Device Availability

This is the first thing to configure. Every device discovered from Hubitat appears here with a checkbox.

- **Checked** = the device is available across all panels and views
- **Unchecked** = the device is blocked everywhere — it cannot be controlled or displayed on any panel

Use this to permanently hide devices you'll never want on the dashboard: virtual switches used for automations, test devices, hub firmware update sensors, etc.

<!-- 📸 SCREENSHOT: Global Options tab showing the device availability checkbox grid with some devices unchecked -->

> **When to use Global vs. Device Options:** If you want a device hidden from *one specific panel* but visible on others, don't uncheck it here. Use the per-panel visibility controls in Device Options instead (Step 3).

### Global Display Defaults

Scroll down to the **Display Settings** section. These are baseline values that any panel inherits unless it overrides them:

| Setting | Range | Default | What It Does |
|---------|-------|---------|--------------|
| Card transparency | 0–200% | 100% | Glass-like card backgrounds — lower = more transparent |
| Blur | 0–200% | 100% | Frosted glass blur behind cards |
| Primary text opacity | 0–100% | 100% | Room titles and big metric values |
| Primary text size | 50–200% | 100% | Scale for primary text |
| Secondary text opacity | 0–100% | 45% | Small labels and subtitles |
| Secondary text size | 50–200% | 100% | Scale for secondary text |
| Tertiary text opacity | 0–100% | 70% | Info card values |
| Tertiary text size | 50–200% | 100% | Scale for info card values |
| Icon size | 50–200% | 100% | Metric icons in room cards |
| Card spacing | 50–200% | 100% | Padding between/around cards |
| Home columns (wide) | 1–6 | 3 | Room cards per row on large screens |

Set these to sensible defaults for your main display. Individual panels can override any of them later.

> **Pro tip:** Configure these Global Display Defaults *before* creating your first panel or changing any panel-level settings. Every new panel — whether created from a preset or copied from your master — inherits these values as its starting point. Get them right once here and you won't have to repeat yourself on every panel you create.

<!-- 📸 SCREENSHOT: Global Display Settings section showing the sliders for card transparency, blur, and text settings -->

### Other Global Settings

While you're here, also configure:

- **Activity Alert Sounds** — choose which sound files play on motion, door open, and door close events. Place custom `.mp3`/`.wav`/`.ogg` files in `server/data/sounds/`.
- **Weather (Open-Meteo)** — enter your latitude, longitude, and timezone for the Weather page.
- **Rooms & Labels** — add manual rooms (for spaces without Hubitat devices), manage room visibility defaults, and create freeform text labels for the Climate floor plan.
- **Cameras** — register all your cameras here (snapshot URL, RTSP, embed URL). Camera setup is global; individual panels choose whether to show previews.

<!-- 📸 SCREENSHOT: Weather configuration section showing lat/lon/timezone fields -->

<!-- 📸 SCREENSHOT: Cameras section showing a registered camera with snapshot URL and RTSP fields -->

---

## 3. Step 2 — Create Your First Panel

Navigate to any panel-profile-aware tab (**Device Options**, **Panel Options**, or **Climate**). You'll see the **panel profile selector** at the top.

### Browse the Presets

JVS ships with **22 built-in preset themes**, each with a curated background image, accent color, icon style, and text color:

| Category | Presets |
|----------|---------|
| **Subtle / Professional** | Neon Glass, Stealth Slate, Zinc Minimal, Urban Concrete, Platinum Frost |
| **Warm Earth Tones** | Copper Warmth, Amber Signal, Sunset Horizon, Desert Mirage, Golden Hour, Lava Flow |
| **Cool Blues & Cyans** | Ice Cave, Midnight Canvas, Ocean Depths, Azure Dream |
| **Nature Greens** | Tropical Oasis, Forest Whisper |
| **Vibrant / Neon** | Arcade Mint, Red Alert, Electric Storm, Neon Tokyo, Northern Lights |
| **Pink / Soft** | Cherry Blossom |

Select each preset from the dropdown to preview its look on the Home page. Presets are **read-only** — you can't modify them directly, but you can use one as a starting point.

<!-- 📸 SCREENSHOT: Panel profile selector dropdown showing the list of preset themes -->

<!-- 📸 SCREENSHOT: Home page with the "Neon Glass" preset applied — showing the background image, neon blue accent, cyan icons -->

<!-- 📸 SCREENSHOT: Home page with the "Sunset Horizon" preset applied — warm orange tones, mountain background -->

<!-- 📸 SCREENSHOT: Home page with the "Neon Tokyo" preset applied — cyberpunk fuchsia/pink, Japanese street background -->

### Create Your Panel

1. Browse presets until you find one you like (or pick any — everything is changeable).
2. Type a name in the **New Panel Name** field (e.g. "Living Room", "Master Control", "Kitchen Tablet").
3. Click **Create**. Your new panel is seeded with all the settings from the selected preset.

Now you have a fully editable copy. All your customizations on the Device Options, Panel Options, and Climate tabs will apply to this panel.

<!-- 📸 SCREENSHOT: Panel creation form with "Master Control" typed in the name field and the Create button highlighted -->

> **Pro tip:** Name your first panel something like "Master" or "Control Everything". This will be your template for all other panels.

---

## 4. Step 3 — Configure Device Visibility & Behavior (Device Options)

Switch to the **Device Options** tab. Make sure your new panel is selected in the profile dropdown.

### Per-Device Cards

Every discovered device gets an expandable card. Click a device to expand it and access all its settings.

<!-- 📸 SCREENSHOT: Device Options tab showing several collapsed device cards, with one expanded showing all options -->

### Visibility: Home & Controls

Each device has two visibility checkboxes:

| Checkbox | What It Controls |
|----------|-----------------|
| **Home** | Whether the device's metrics appear in the room card on the Home page |
| **Controls** | Whether the device appears on the Controls page for direct interaction |

For your master panel, you'll probably want most devices visible on both. For room-specific panels later, you'll trim these down.

<!-- 📸 SCREENSHOT: Expanded device card showing the Home and Controls visibility checkboxes both checked -->

### Display Name Override

Don't like "Zooz ZSE40 4-in-1 Sensor"? Type a friendly name like "Hallway Sensor" in the **Display Name** field. Leave it blank to inherit the original Hubitat label.

<!-- 📸 SCREENSHOT: Device card showing the Display Name field with a custom name entered -->

### Home Metrics (Multi-Sensors)

For devices that report multiple sensor values (like a 4-in-1 sensor reporting temperature, humidity, lux, and motion), the **Home Metrics** checkboxes let you choose which metrics appear on the Home room card.

| Metric | Notes |
|--------|-------|
| **Temperature** | Sensor temperature reading |
| **Humidity** | Sensor humidity percentage |
| **Lux** | Illuminance reading |
| **Motion** | Not a numeric metric — it creates the **glow effect** around the room card border. Motion is always enabled as it's a visual indicator, not a text value. |

Use this to declutter: if you have three temperature sensors in one room, you might hide temp on two of them and only show the most accurate one.

<!-- 📸 SCREENSHOT: Home Metrics checkbox section for a multi-sensor device, with Temperature and Motion checked, Humidity and Lux unchecked -->

> **Per-device vs. panel-wide metrics:** These checkboxes affect *this specific device* on *this panel*. If you want to remove a metric (e.g. humidity) from **all** sensors on a panel at once, use the **Room Metric Cards** setting in Panel Options (Step 4) instead.

### Info Cards

Choose which device attributes appear as info cards (the detailed metric tiles). This is per-device and lets you surface things like battery level, power consumption, or lock status.

<!-- 📸 SCREENSHOT: Info Cards checkbox section for a device showing Temperature, Battery, and Humidity checked -->

### Commands

The **Commands** section is an allowlist of which actions the dashboard can send to this device. Only commands the device actually supports are shown.

For your master panel, you'll typically leave all commands enabled. For a wall-mounted kitchen tablet, you might remove `lock`/`unlock` commands from smart locks.

<!-- 📸 SCREENSHOT: Commands checkbox section showing on, off, setLevel enabled; lock/unlock disabled -->

### Control Icons

The **Control Icons** section shows available interactive SVG icons for this device. These are the visual controls users tap on the Controls page — toggles, sliders, color wheels, media transports, etc.

Icons are matched to devices by their required commands. If a device supports `on`/`off`, the light toggle icon appears. If it supports `setLevel`, the brightness slider appears. Multiple icons can be stacked on a single device.

> **Note:** Control icon assignments are global (not per-panel). Assigning an icon here affects all panels that show this device.

<!-- 📸 SCREENSHOT: Control Icons section for a dimmer device showing light toggle and brightness slider icons assigned -->

---

## 5. Step 4 — Style Your Panel (Panel Options)

Switch to **Panel Options**. This is where the visual magic happens. Every setting here is per-panel, so each tablet or display can have its own distinct look.

### UI Accent Color

The accent color drives the overall personality of your panel — it tints active states, glows, buttons, and highlights across the entire UI.

Choose from **30 color options** including neons (blue, green, red), warm tones (amber, orange, rose), cool tones (sky, cyan, teal, indigo), and neutrals (slate, zinc, stone).

<!-- 📸 SCREENSHOT: UI Accent color picker grid showing all 30 color swatches with "Neon Blue" selected -->

### Background Image

Set a background image that shows through the frosted glass cards on the Home page:

1. **Add images** to `server/data/backgrounds/` on the server (`.jpg`, `.png`, `.webp`, `.gif` supported).
2. The image grid shows all available files as clickable thumbnails.
3. Click to select — click again to deselect.
4. Use the **Opacity** slider (0–100%) to control how visible the image is behind cards. Lower = more subtle.
5. Click **Remove** to disable the background entirely.

<!-- 📸 SCREENSHOT: Background Image selector showing a grid of thumbnail images with one selected (highlighted with green "Active" badge) -->

<!-- 📸 SCREENSHOT: Home page with a background image at 35% opacity showing through frosted glass room cards -->

<!-- 📸 SCREENSHOT: Home page with the same background at 75% opacity — much more visible -->

> **Tip:** 35% opacity is a good starting point — visible enough to set the mood without overwhelming the text.

### Card Transparency & Blur

These two sliders work together to create the "frosted glass" effect:

| Setting | Effect | Sweet Spot |
|---------|--------|------------|
| **Card transparency** (0–200%) | How see-through the card backgrounds are | 80–120% for subtle; <50% for nearly invisible |
| **Blur** (0–200%) | Frosted glass blur intensity behind cards | 100% for standard; 150%+ for heavy frosting |

<!-- 📸 SCREENSHOT: Side-by-side comparison — left: high transparency + high blur (elegant glass); right: low transparency + no blur (solid dark cards) -->

### Text Customization

Fine-tune three tiers of text independently:

| Tier | Where It Appears | Controls |
|------|-----------------|----------|
| **Primary** | Room titles, big metric values | Opacity (0–100%), Size (50–200%), Color |
| **Secondary** | Subtle labels, subtitles, timestamps | Opacity (0–100%), Size (50–200%), Color |
| **Tertiary** | Info card values | Opacity (0–100%), Size (50–200%), Color |

Each tier has its own opacity slider, size slider, and color dropdown. The color dropdown offers all 30 color choices plus "Default" (inherits from the theme).

<!-- 📸 SCREENSHOT: Primary text settings showing opacity at 100%, size at 100%, and color set to "White" -->

<!-- 📸 SCREENSHOT: Home page comparing default text colors vs. custom text colors (e.g. cyan primary, teal secondary) -->

### Glow

The animated glow appears around Home room cards when motion is detected. It pulses gently to draw your eye. All three settings work together:

| Setting | Controls | Options |
|---------|----------|---------|
| **Glow color** | The color of the pulsing border glow | "Inherit (UI accent)" or any of the 30 colors |
| **Glow opacity** | How intense/visible the glow effect is | 0–100% slider (100% = full intensity, 0% = invisible) |
| **Glow size** | How far the glow spreads from the card edge | 50–200% slider (100% = default, 200% = dramatic halo) |

Set opacity to 0% to effectively disable the glow entirely. Crank it to 100% and bump size to 150–200% for an eye-catching presence indicator.

<!-- 📸 SCREENSHOT: Room card with an active motion glow in emerald green around the border -->

<!-- 📸 SCREENSHOT: Glow section in Panel Options showing color dropdown, opacity slider at 80%, and size slider at 150% -->

### Icons

| Setting | Controls | Options |
|---------|----------|---------|
| **Icon color** | Metric icons in room cards (temperature, humidity, etc.) | "Default (scheme)" or any color |
| **Icon opacity** | How bold the icons appear | 0–100% slider |
| **Icon size** | Scale of metric icons | 50–200% slider |

<!-- 📸 SCREENSHOT: Room card showing custom icon colors (amber icons instead of default) -->

### Card Spacing

Adjusts the padding around and between room cards. Lower values pack cards tighter (great for small tablets); higher values give a more spacious layout.

| Value | Result |
|-------|--------|
| 50% | Tight, compact — maximum density |
| 100% | Default spacing |
| 150–200% | Spacious, airy — great for large displays |

<!-- 📸 SCREENSHOT: Side-by-side comparison — 60% card spacing (compact) vs. 150% card spacing (spacious) -->

### Home Top Row

The top row shows summary cards at the top of the Home page:

| Setting | Description |
|---------|-------------|
| **Show** | Toggle the entire top row on/off |
| **Scale** | Shrink it down (50–120%) for smaller screens |
| **Cards** | Choose which cards appear: Time & Date, Outside (weather), Inside (indoor averages), Home Status |

<!-- 📸 SCREENSHOT: Home page top row showing all four cards: Time, Outside weather, Inside averages, Home status -->

<!-- 📸 SCREENSHOT: Home page with the top row hidden (Show = off) — room cards start immediately -->

### Home Columns

Controls how many room cards appear per row on wide screens:

| Screen & Devices | Recommended Columns |
|-----------------|-------------------|
| Phone / small tablet | 1–2 (handled automatically) |
| 10" tablet | 2–3 |
| 1080p display, 10–15 devices | 3 |
| 1440p display, 15–25 devices | 3–4 |
| 4K display, 20+ devices | 4–6 |

<!-- 📸 SCREENSHOT: Home page with 2 columns — fewer, wider room cards -->

<!-- 📸 SCREENSHOT: Home page with 4 columns — more compact, denser grid -->

### Room Layout

For granular control over how room cards are arranged:

| Setting | Options | Description |
|---------|---------|-------------|
| **Layout mode** | Grid (default) / Masonry | Grid = uniform rows; Masonry = Pinterest-style variable-height packing |
| **Auto-fit room grid** | Checkbox | Packs rooms by minimum width instead of fixed columns |
| **Minimum room width** | 240–1200 px | Only active with auto-fit enabled |
| **Masonry row height** | 4–40 px | Only active in masonry mode |

Each room also gets per-room overrides:

| Override | Range | Purpose |
|----------|-------|---------|
| **Span** | 1–6 columns | Make important rooms wider (e.g. living room = 2-wide) |
| **Order** | -999 to 999 | Force a room to appear first, last, or anywhere in between |
| **Rows** (masonry) | 1–999 | Control how tall a room card is in masonry mode |

<!-- 📸 SCREENSHOT: Grid layout with one room spanning 2 columns -->

<!-- 📸 SCREENSHOT: Masonry layout showing variable-height room cards packed efficiently -->

### Sub-card Columns

Controls how metric sub-cards are arranged inside each room card:

| Option | Result |
|--------|--------|
| Auto | Adapts based on card width |
| 1 | Single column — tall, narrow metric list |
| 2 | Two-column grid — good for rooms with 4–8 metrics |
| 3 | Three-column grid — dense, for many metrics |

<!-- 📸 SCREENSHOT: Room card with 1-column sub-cards vs. 3-column sub-cards -->

### Room Metric Cards (Panel-Wide)

This is the panel-wide toggle for hiding an entire metric type from **all** sensors on the Home view:

| Toggle | Effect |
|--------|--------|
| **Temperature** | Show/hide temperature on every room card |
| **Humidity** | Show/hide humidity on every room card |
| **Illuminance** | Show/hide lux readings on every room card |

> **Motion is not listed here** because it doesn't display as a text metric. Motion creates the **glow effect** around room card borders — it's always active as a visual indicator.

Use this when you want a clean, temperature-only dashboard (uncheck humidity and illuminance) or a motion-only presence board (uncheck all three).

<!-- 📸 SCREENSHOT: Room Metric Cards toggles — Temperature checked, Humidity and Illuminance unchecked -->

<!-- 📸 SCREENSHOT: Home page with only Temperature shown — clean, minimal room cards -->

### Cameras & Sensors

#### Camera Previews

| Setting | Description |
|---------|-------------|
| **Home** | Show camera snapshot tiles on the Home page |
| **Controls** | Show camera snapshot tiles on the Controls page |
| **Refresh interval** | How often snapshots auto-refresh (2–120 seconds) |

<!-- 📸 SCREENSHOT: Home page with camera preview tiles embedded among room cards -->

#### Sensor Badge Colors

Customize the indicator colors for different sensor types on Home room cards:

| Sensor | Default Color | Purpose |
|--------|---------------|---------|
| Motion | Amber | Active motion glow/badge |
| Door | Neon Red | Open door indicator |
| Smoke | Neon Red | Smoke alarm active |
| CO | Neon Red | Carbon monoxide alarm |
| Water/Leak | Neon Blue | Water leak detected |
| Presence | Neon Green | Person present |

<!-- 📸 SCREENSHOT: Sensor Badge Colors dropdown selections showing custom colors for motion (cyan) and door (amber) -->

#### Visible Rooms (Per-Panel)

Override which rooms appear on this specific panel. If none are selected, all rooms show (inheriting the global default).

<!-- 📸 SCREENSHOT: Visible Rooms per-panel checkboxes with only "Living Room", "Kitchen", and "Bedroom" checked -->

---

## 6. Step 5 — Set Up Climate Tolerances

Switch to the **Climate** tab. These settings are **global** — they apply to the Climate heatmap and optionally colorize the Home page too.

### Colorize Home Values

Before configuring tolerances, decide whether you want the color coding to bleed into the Home page:

| Setting | Description |
|---------|-------------|
| **Colorize Home values** | When enabled, the big metric numbers on Home room cards glow with your tolerance colors (blue for cold, green for comfy, red for hot, etc.) |
| **Color opacity** | Intensity of the colorization (0–100%). Lower = more subtle. |

<!-- 📸 SCREENSHOT: Home page with Colorize Home Values ON — temperature numbers glowing blue (cold), green (comfy), and red (hot) -->

<!-- 📸 SCREENSHOT: Home page with Colorize Home Values OFF — all metric numbers in neutral white -->

### Temperature Tolerances

Set the boundaries for your temperature zones:

```
Cold → Comfy → Warm → Hot
  68°F    72°F    74°F
```

| Zone | Default Threshold | Default Color | Meaning |
|------|------------------|----------------|---------|
| Cold | Below 68°F | 🔵 Neon Blue | Uncomfortably cold |
| Comfy | 68–72°F | 🟢 Neon Green | Just right |
| Warm | 72–74°F | 🟡 Amber | Getting warm |
| Hot | Above 74°F | 🔴 Neon Red | Too hot |

Adjust these to match your climate and comfort preferences. Each zone's color is independently configurable.

<!-- 📸 SCREENSHOT: Temperature tolerance configuration showing threshold inputs and color dropdowns -->

### Humidity Tolerances

```
Dry → Comfy → Humid → Very Humid
 35%    55%     65%
```

| Zone | Default Threshold | Default Color |
|------|------------------|----------------|
| Dry | Below 35% | 🔵 Neon Blue |
| Comfy | 35–55% | 🟢 Neon Green |
| Humid | 55–65% | 🟡 Amber |
| Very Humid | Above 65% | 🔴 Neon Red |

<!-- 📸 SCREENSHOT: Humidity tolerance configuration -->

### Illuminance Tolerances

```
Dark → Dim → Bright → Very Bright
 50 lux  250 lux  600 lux
```

| Zone | Default Threshold | Default Color |
|------|------------------|----------------|
| Dark | Below 50 lux | 🔵 Neon Blue |
| Dim | 50–250 lux | 🟢 Neon Green |
| Bright | 250–600 lux | 🟡 Amber |
| Very Bright | Above 600 lux | 🟢 Neon Green |

<!-- 📸 SCREENSHOT: Illuminance tolerance configuration -->

---

## 7. Step 6 — Build Your Climate Floor Plan

The **Climate** page is a color-coded heatmap of your home. Rooms colorize based on the temperature (and humidity/lux) tolerances you just configured.

### How It Works

1. Every room that has a temperature sensor colorizes automatically.
2. The color transitions smoothly between zones (e.g. a room at 71°F shows between green and amber).
3. Open a window in winter? Watch that room shift from green to blue in real-time.
4. A fireplace roaring? See the warm glow spread through adjacent rooms.

### Adding Rooms

If Hubitat doesn't provide a room for every space you want to visualize:

1. Go to **Settings → Global Options → Rooms & Labels**.
2. Type a room name and click **Add**.
3. The room appears on the Climate floor plan, ready to position.

### Positioning Rooms

On the Climate page itself, use **Edit mode** (pencil icon) to:

- **Drag** rooms to their approximate positions in your home layout.
- **Resize** rooms to match their relative sizes.
- Add **freeform text labels** (like "Upstairs", "Garage", "2nd Floor") for orientation.

The goal is a rough floor plan that lets you see temperature flow at a glance — it doesn't need to be architecturally precise.

<!-- 📸 SCREENSHOT: Climate page showing a floor plan layout with colorized rooms — some blue (cold), some green (comfy), one red (hot near fireplace) -->

<!-- 📸 SCREENSHOT: Climate page in Edit mode with rooms being dragged and resized -->

<!-- 📸 SCREENSHOT: Climate page with freeform text labels like "Upstairs" and "Basement" -->

---

## 8. Step 7 — Create Room-Specific Panels

Now that your master panel is fully configured, it's time to create specialized panels for individual rooms, tablets, or use cases.

### The Copy Strategy

1. Go to any panel-profile-aware tab (e.g. **Panel Options**).
2. Select your **master panel** in the profile dropdown.
3. Type a new name (e.g. "Kitchen Tablet") in the **New Panel Name** field.
4. Click **Create**.

The new panel is an exact copy of your master — all device visibility, commands, colors, and layout settings are duplicated. Now you only need to **subtract**:

<!-- 📸 SCREENSHOT: Creating a "Kitchen Tablet" panel by copying from "Master Control" -->

### Tailoring a Room Panel

Switch to the new panel and work through:

1. **Device Options** — Uncheck **Home** and **Controls** visibility for devices not relevant to this room. A kitchen tablet probably doesn't need bedroom motion sensors or garage door controls.

2. **Panel Options** — Adjust the look for the room's display:
   - Fewer **Home columns** (maybe 1–2 for a small tablet).
   - Different **accent color** to visually distinguish panels.
   - Smaller **card spacing** if the screen is small.
   - Customize the **Home Top Row** — maybe hide the weather card to save space.
   - Set a different **background image** to match the room's vibe.

3. **Visible Rooms** (in Panel Options → Cameras & Sensors) — Show only the rooms relevant to this space.

<!-- 📸 SCREENSHOT: Device Options for "Kitchen Tablet" panel with only kitchen-relevant devices checked -->

<!-- 📸 SCREENSHOT: Panel Options for "Kitchen Tablet" with 2 columns, compact spacing, and a warm accent color -->

### Panel Profile Ideas

| Panel Name | Purpose | Key Settings |
|------------|---------|-------------|
| **Master Control** | Full house control from a desktop/large display | All devices, 3–4 columns, all metrics |
| **Living Room** | Wall-mounted tablet by the couch | Living room devices only, 1–2 columns, large cards |
| **Kitchen** | Counter-top tablet | Kitchen devices + dining room, compact spacing, warm accent |
| **Bedroom** | Nightstand tablet | Bedroom devices, low opacity (dark mode), minimal metrics |
| **Security** | Dedicated monitoring display | Only locks, doors, motion sensors; bold alert colors |
| **Guest** | Simplified guest access | Limited devices, no locks, friendly display names |

<!-- 📸 SCREENSHOT: Two tablets side by side showing different panels — "Living Room" (warm, spacious, 2 columns) vs. "Kitchen" (compact, cool tones, 1 column) -->

---

## 9. Quick Reference: All Settings by Tab

### Global Options (applies to all panels)

| Section | Key Settings |
|---------|-------------|
| **Device Availability** | Server-enforced device allowlist (checkbox per device) |
| **Alert Sounds** | Motion / Door Open / Door Close sound file selection |
| **Weather** | Latitude, Longitude, Timezone for Open-Meteo |
| **Display Defaults** | Baseline card transparency, blur, text opacity/size, icon size, card spacing, columns |
| **Rooms & Labels** | Manual rooms, global room visibility, freeform Climate labels |
| **Cameras** | Camera registry (snapshot URL, RTSP, embed, credentials) |

### Device Options (per-panel)

| Section | Key Settings |
|---------|-------------|
| **Per-Device** | Home/Controls visibility, display name, home metrics, info cards, command allowlist, control icons |

### Panel Options (per-panel)

| Section | Key Settings |
|---------|-------------|
| **UI Accent** | Accent color (30 choices) |
| **Background Image** | Image file selection, opacity slider |
| **Card Transparency** | 0–200% slider |
| **Blur** | 0–200% slider |
| **Text** | Primary/Secondary/Tertiary opacity, size, and color |
| **Glow & Icons** | Glow color/opacity/size, icon color/opacity/size |
| **Card Spacing** | 50–200% slider |
| **Home Top Row** | Show/hide, scale, card selection |
| **Home Columns** | 1–6 columns for wide screens |
| **Room Layout** | Grid/Masonry mode, auto-fit, per-room span/order/rows |
| **Sub-card Columns** | Auto / 1 / 2 / 3 metric columns per room card |
| **Room Metric Cards** | Panel-wide Temperature/Humidity/Illuminance toggles |
| **Camera Previews** | Home/Controls preview toggles, refresh interval |
| **Sensor Badge Colors** | Motion/Door/Smoke/CO/Water/Presence colors |
| **Visible Rooms** | Per-panel room visibility override |

### Climate (global)

| Section | Key Settings |
|---------|-------------|
| **Colorize Home Values** | Enable/disable + opacity |
| **Temperature** | Cold/Comfy/Warm thresholds + zone colors |
| **Humidity** | Dry/Comfy/Humid thresholds + zone colors |
| **Illuminance** | Dark/Dim/Bright thresholds + zone colors |

### Server (global)

| Section | Key Settings |
|---------|-------------|
| **Network** | Port, HTTPS certificates |
| **Hubitat** | Host, App ID, Access Token, TLS Insecure, Poll Interval |
| **Weather Units** | Temperature (°F/°C), Wind Speed, Precipitation |
| **Events** | Max in memory, persist to disk |
| **Backups** | Max backup files |
| **Restart** | Restart server button |

---

## Screenshot Placeholders Index

For easy reference, here are all the screenshots needed for this document:

| # | Location | Description |
|---|----------|-------------|
| 1 | §1 | Fully configured Home page with multiple room cards |
| 2 | §2 | Global Options — device availability checkbox grid |
| 3 | §2 | Global Display Settings — sliders for transparency, blur, text |
| 4 | §2 | Weather configuration — lat/lon/timezone fields |
| 5 | §2 | Cameras section — registered camera with URLs |
| 6 | §3 | Panel profile selector dropdown with preset list |
| 7 | §3 | Home page — "Neon Glass" preset |
| 8 | §3 | Home page — "Sunset Horizon" preset |
| 9 | §3 | Home page — "Neon Tokyo" preset |
| 10 | §3 | Panel creation form with name field and Create button |
| 11 | §4 | Device Options tab — collapsed and expanded device cards |
| 12 | §4 | Device card — Home and Controls visibility checkboxes |
| 13 | §4 | Device card — Display Name override field |
| 14 | §4 | Home Metrics checkboxes for a multi-sensor device |
| 15 | §4 | Info Cards checkboxes |
| 16 | §4 | Commands allowlist checkboxes |
| 17 | §4 | Control Icons assignment for a dimmer device |
| 18 | §5 | UI Accent color picker grid |
| 19 | §5 | Background Image selector — thumbnail grid with active badge |
| 20 | §5 | Home page — background at 35% opacity |
| 21 | §5 | Home page — background at 75% opacity |
| 22 | §5 | Card transparency/blur comparison — glass vs. solid |
| 23 | §5 | Primary text settings — opacity, size, color |
| 24 | §5 | Home page — default vs. custom text colors |
| 25 | §5 | Room card — motion glow in custom color |
| 26 | §5 | Glow section — color dropdown, opacity slider, size slider |
| 27 | §5 | Room card — custom icon colors |
| 27 | §5 | Card spacing comparison — 60% vs. 150% |
| 28 | §5 | Home Top Row — all four summary cards |
| 29 | §5 | Home page — top row hidden |
| 30 | §5 | Home page — 2 columns |
| 31 | §5 | Home page — 4 columns |
| 32 | §5 | Grid layout — room spanning 2 columns |
| 33 | §5 | Masonry layout — variable-height cards |
| 34 | §5 | Sub-card columns — 1-column vs. 3-column |
| 35 | §5 | Room Metric Cards toggles |
| 36 | §5 | Home page — temperature only (humidity/lux hidden) |
| 37 | §5 | Camera preview tiles on Home page |
| 38 | §5 | Sensor Badge Colors dropdown selections |
| 39 | §5 | Visible Rooms per-panel checkboxes |
| 40 | §6 | Home page — Colorize Home Values ON |
| 41 | §6 | Home page — Colorize Home Values OFF |
| 42 | §6 | Temperature tolerance configuration |
| 43 | §6 | Humidity tolerance configuration |
| 44 | §6 | Illuminance tolerance configuration |
| 45 | §7 | Climate floor plan — colorized rooms |
| 46 | §7 | Climate page — Edit mode with dragging/resizing |
| 47 | §7 | Climate page — freeform text labels |
| 48 | §8 | Creating "Kitchen Tablet" panel from "Master Control" |
| 49 | §8 | Device Options for room-specific panel |
| 50 | §8 | Panel Options for room-specific panel |
| 51 | §8 | Two tablets showing different panels side by side |
