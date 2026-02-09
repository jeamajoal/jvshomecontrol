# PWA and Kiosk Mode

Turn a wall tablet or spare phone into a permanent, always-on control panel.

---

## Install as a PWA (Progressive Web App)

JVSHomeControl includes a web app manifest that lets you "install" the dashboard to a device's home screen. It opens full-screen without browser chrome — no address bar, no tabs.

### iOS (iPad / iPhone)

1. Open `https://your-server` in **Safari** (required — Chrome on iOS can't install PWAs)
2. Tap the **Share** button (box with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Name it (e.g., "Home Control") and tap **Add**
5. Open from the home screen — it launches full-screen

### Android

1. Open `https://your-server` in **Chrome**
2. Tap the three-dot menu → **Add to Home screen** (or **Install app**)
3. Confirm the name and tap **Add**
4. Open from the home screen — it launches as a standalone app

### Desktop (Chrome / Edge)

1. Open the dashboard URL
2. Click the install icon in the address bar (or menu → **Install JVS Home Control**)
3. The app opens in its own window without browser controls

> **Note:** The PWA requires a network connection to your server. It doesn't cache pages for offline use — if the server is unreachable, the dashboard will show a connection error.

---

## Kiosk Mode for Wall Tablets

For a permanently mounted tablet, you want the dashboard to stay on screen 24/7 without accidental navigation.

### Android Kiosk Options

**Option 1: Fully Kiosk Browser (Recommended)**

[Fully Kiosk Browser](https://www.fully-kiosk.com/) ($6.90 one-time) is purpose-built for wall tablets:
- Locks the device to a single URL
- Auto-launches on boot
- Prevents status bar / navigation gestures
- Screen dimming on schedule
- Motion-based wake (front camera)
- Remote admin panel

Set the URL to `https://your-server` and enable kiosk mode.

**Option 2: Android Kiosk Mode (Free)**

1. Install the PWA (see above)
2. Go to **Settings → Apps → JVS Home Control → Set as default**
3. Enable **Screen Pinning**: Settings → Security → Screen Pinning
4. Open the app and pin it

**Option 3: Chrome Kiosk Flag**

```
chrome --kiosk --app=https://your-server
```

### iOS Kiosk Options

**Guided Access:**

1. Open the dashboard in Safari (or use the PWA)
2. Triple-click the side button → **Guided Access**
3. Tap **Start** — the device is locked to the dashboard
4. Triple-click again to exit (passcode required)

**Single App Mode (Supervised):**

For enterprise-managed iPads, use Apple Configurator or an MDM to lock the device to a single app.

---

## Screen & Power Tips

| Tip | How |
|-----|-----|
| **Keep screen on** | Android: Developer Options → Stay Awake while charging. iOS: Settings → Display → Auto-Lock → Never |
| **Dim at night** | Fully Kiosk has a schedule. On stock Android, use Tasker or a screen dimmer app. |
| **Auto-start on boot** | Fully Kiosk does this. On stock Android, use a launcher app or Tasker. |
| **Prevent burn-in** | The dark theme helps. Consider a subtle screensaver on OLED panels. |
| **Mount the tablet** | Velcro Command strips, 3D-printed mounts, or flush wall mounts (Niu / VidaMount). |

---

## Connection Resilience

The dashboard is designed for always-on operation:

- **Auto-reconnects** to the server with exponential backoff (1s → 30s max)
- **Falls back** from WebSocket to HTTP polling if WebSocket fails
- **Shows a status indicator** when disconnected (pulsing dot in the header)
- **Recovers silently** when the server restarts — no manual refresh needed

If the server goes down for a reboot, the dashboard will reconnect automatically within seconds of it coming back up.

---

## Recommended Hardware

| Device | Price | Notes |
|--------|-------|-------|
| Amazon Fire HD 10 | ~$100 | Great value. Install Fully Kiosk via sideloading. |
| Samsung Galaxy Tab A | ~$150 | Good screen. Native Android kiosk options. |
| iPad (10th gen) | ~$330 | Premium display. Use Guided Access. |
| Lenovo Smart Tab | ~$120 | Has a dock for charging. |
| Old phone/tablet | Free | Any Android 8+ or iOS 14+ device works. |
