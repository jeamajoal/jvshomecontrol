# Interactive Control Icons

JVSHomeControl uses an SVG-based control icon system for device controls. Each icon is defined by a JSON manifest that maps device commands to interactive regions in an SVG file.

---

## Built-in Control Icons

| Icon | Type | What It Does |
|------|------|--------------|
| `light-toggle` | Toggle | On/off for lights |
| `outlet-toggle` | Toggle | On/off for outlets and smart plugs |
| `fan-toggle` | Toggle | On/off for fans |
| `lock-toggle` | Toggle | Lock/unlock |
| `garage-toggle` | Toggle | Open/close garage doors |
| `shade-toggle` | Toggle | Open/close shades and blinds |
| `valve-toggle` | Toggle | Open/close valves |
| `siren-toggle` | Toggle | Activate/deactivate sirens |
| `power-toggle` | Toggle | Generic on/off |
| `play-toggle` | Toggle | Play/pause for media players |
| `mute-toggle` | Toggle | Mute/unmute |
| `brightness-slider` | Slider | Dimmer level control |
| `color-temp-slider` | Slider | Colour temperature adjustment |
| `saturation-slider` | Slider | Colour saturation |
| `color-wheel` | Picker | Hue colour selection |
| `volume-knob` | Knob | Rotary volume control |
| `media-transport` | Transport | Play/pause/stop/skip buttons |

---

## How Icons Are Assigned

The dashboard automatically assigns control icons to devices based on their available commands. For example, a device with `on` and `off` commands and a `switch` attribute gets a `light-toggle` icon.

You can override this in **Settings** → **Device Control Icons** to assign different icons to specific devices.

---

## How It Works

Each control icon has three parts:

1. **SVG file** — the visual design with interactive regions marked by `data-region` attributes
2. **Manifest file** — a JSON file that defines commands, state bindings, and interactive behaviour
3. **Schema** — a JSON Schema (`schema.json`) that validates all manifests

```
server/data/control-icons/
├── schema.json                     # Manifest schema definition
├── light-toggle.manifest.json      # Icon manifest
├── light-toggle.svg                # SVG artwork
├── brightness-slider.manifest.json
├── brightness-slider.svg
└── ...
```

---

## Manifest Format

A manifest file declares:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `light-toggle`) |
| `name` | string | Human-readable name |
| `file` | string | SVG filename relative to the manifest |
| `regions` | array | Interactive clickable/draggable regions |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | What this control does |
| `requiredCommands` | string[] | Commands the device **must** support |
| `optionalCommands` | string[] | Commands that add features if available |
| `stateBindings` | object | Maps device attributes to SVG visual state |

### Example Manifest

```json
{
  "id": "light-toggle",
  "name": "Light Toggle",
  "description": "On/off toggle for lights",
  "file": "light-toggle.svg",
  "requiredCommands": ["on", "off"],
  "stateBindings": {
    "power": {
      "attribute": "switch",
      "type": "boolean",
      "trueValues": ["on"],
      "cssClass": "is-on"
    }
  },
  "regions": [
    {
      "id": "toggle",
      "action": "toggle",
      "toggleCommands": { "on": "on", "off": "off" },
      "stateAttribute": "switch"
    }
  ]
}
```

---

## State Bindings

State bindings connect device attributes to visual changes in the SVG:

| Type | Usage | Example |
|------|-------|---------|
| `boolean` | Toggles a CSS class on/off | `switch: "on"` → adds `.is-on` class |
| `range` | Sets a CSS variable (0–1) | `level: 75` → `--brightness: 0.75` |
| `enum` | Maps specific values to classes | `speed: "high"` → class varies |

The SVG uses CSS to respond to these bindings (e.g., changing colours, opacity, or position when `.is-on` is applied).

---

## Interactive Regions

Regions define what happens when the user interacts with part of the SVG:

| Action | Behaviour |
|--------|-----------|
| `command` | Sends a single command |
| `toggle` | Sends on/off based on current state |
| `increment` | Increases a value by `step` |
| `decrement` | Decreases a value by `step` |
| `slider` | Drag to set a value in a range |

Each region targets an SVG element by its `id` or `data-region` attribute.

---

## Creating Custom Control Icons

### 1. Design the SVG

Create an SVG with clearly identified interactive regions. Add `data-region` attributes to clickable elements:

```svg
<svg viewBox="0 0 100 100">
  <circle data-region="toggle" cx="50" cy="50" r="40" fill="#333"/>
  <text x="50" y="55" text-anchor="middle" fill="#fff">Power</text>
</svg>
```

### 2. Create the manifest

Create a `.manifest.json` file alongside the SVG:

```json
{
  "id": "my-custom-toggle",
  "name": "My Custom Toggle",
  "file": "my-custom-toggle.svg",
  "requiredCommands": ["on", "off"],
  "stateBindings": {
    "power": {
      "attribute": "switch",
      "type": "boolean",
      "trueValues": ["on"],
      "cssClass": "is-on"
    }
  },
  "regions": [
    {
      "id": "toggle",
      "action": "toggle",
      "toggleCommands": { "on": "on", "off": "off" },
      "stateAttribute": "switch"
    }
  ]
}
```

### 3. Place the files

Copy both files to `server/data/control-icons/`. The server picks them up automatically — no restart needed.

### 4. Assign the icon

Go to **Settings** → **Device Control Icons** and assign your new icon to a device.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/control-icons` | GET | List all available control icons |
| `/api/control-icons/:id` | GET | Get a specific icon's manifest |
| `/api/control-icons/:id/svg` | GET | Get the SVG file for an icon |
| `/api/control-icons/compatible` | POST | Check which icons are compatible with a device |

---

## Validation

Manifests are validated against `schema.json` at runtime. If a manifest is invalid, the icon won't load and an error will appear in the server logs.

Validate manually:
```bash
# Using Node.js
node -e "const s = require('./server/data/control-icons/schema.json'); console.log(JSON.stringify(s, null, 2))"
```
