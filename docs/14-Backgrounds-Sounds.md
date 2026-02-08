# Custom Backgrounds and Sounds

Personalise the dashboard with custom background images and alert sounds.

---

## Custom Backgrounds

Background images appear behind the Home and Activity pages. Each panel profile can have its own background.

### Adding Background Images

Place image files in:
```
server/data/backgrounds/
```

Or, for a Debian install:
```
/opt/jvshomecontrol/server/data/backgrounds/
```

For Docker:
```bash
docker cp my-image.jpg jvshomecontrol:/app/server/data/backgrounds/
```

### Supported Formats

Any format your browser supports: **JPEG**, **PNG**, **WebP**, **AVIF**, **SVG**.

| Recommendation | Why |
|----------------|-----|
| Use JPEG or WebP | Smallest file size for photos |
| 1920×1080 or larger | Looks sharp on tablets and desktops |
| Keep files under 2 MB | Faster load times on slower networks |
| Dark / moody images work best | The dashboard uses a dark theme — bright backgrounds wash out text |

### Configuring a Background

1. Go to **Settings** → scroll to **Home Background**
2. Enable the toggle
3. Enter the filename: `/backgrounds/my-image.jpg`
4. Adjust the **opacity** slider (lower = more subtle, default ~35%)

You can also enter an external URL (e.g., `https://example.com/photo.jpg`).

> **Tip:** Each panel profile can have a different background. Use a kitchen photo for the kitchen tablet and a bedroom scene for the bedroom.

---

## Custom Alert Sounds

Alert sounds play on the Activity page when motion or door events are detected.

### Adding Sound Files

Place audio files in:
```
server/data/sounds/
```

Or, for a Debian install:
```
/opt/jvshomecontrol/server/data/sounds/
```

For Docker:
```bash
docker cp doorbell.mp3 jvshomecontrol:/app/server/data/sounds/
```

### Supported Formats

Any format your browser supports: **MP3**, **WAV**, **OGG**, **AAC**, **WebM**.

| Recommendation | Why |
|----------------|-----|
| Use MP3 | Universal browser support |
| Keep files short (1–3 seconds) | Alerts should be quick, not distracting |
| Moderate volume in the file | The dashboard controls playback gain |

### Configuring Alert Sounds

1. Go to **Settings** → scroll to **Alert Sounds**
2. Set sounds for:
   - **Motion** — plays when a motion sensor activates
   - **Door Open** — plays when a contact sensor opens
   - **Door Close** — plays when a contact sensor closes
3. Enter the filename (e.g., `doorbell.mp3`) or pick from the dropdown
4. Click the 🔔 button on the Activity page to enable audio alerts

> **Note:** Browsers require a user interaction before playing audio. Tap the alert toggle on the Activity page at least once after loading.

### Built-in Fallback Sounds

If no custom sound is configured, the dashboard plays simple synthesised tones:
- **Motion:** Double-tap tone (220 Hz → 180 Hz)
- **Door Open:** Descending creak (520 Hz → 360 Hz)
- **Door Close:** Short click (280 Hz → 220 Hz)

---

## File Listing API

The server provides endpoints to list available files:

```bash
# List background images
curl -sk https://localhost:3000/api/backgrounds

# List sound files
curl -sk https://localhost:3000/api/sounds
```

The Settings page uses these endpoints to populate dropdown selectors.
