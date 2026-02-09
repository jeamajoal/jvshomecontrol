# Hubitat Setup

JVSHomeControl connects to your Hubitat hub via the Maker API.

---

## Step 1: Enable Maker API

1. In Hubitat, go to **Apps** > **Add Built-In App**
2. Select **Maker API**
3. Select the devices you want to control
4. Note down:
   - **App ID** (in the URL after /apps/api/)
   - **Access Token** (shown on the page)

---

## Step 2: Enable HTTPS on Hubitat (Recommended)

Even on your local network, I recommend encrypting Maker API traffic:

1. In Hubitat, go to **Settings** > **Hub Details**
2. Enable HTTPS if available
3. Note: Hubitat uses a self-signed certificate by default

---

## Step 3: Configure JVSHomeControl

Open the dashboard and go to **Settings → Server**. Enter:

- **Hubitat Host** — your hub’s URL (e.g., https://192.168.1.50)
- **Maker API App ID** — the numeric ID from Step 1
- **Access Token** — your Maker API access token
- **Allow self-signed certs** — enable this if your Hubitat uses HTTPS (most do)

Click **Save**. The dashboard connects and populates immediately — no restart needed.

> **Why HTTPS?** Your Maker API access token is sent with every request. Even on a local network, unencrypted traffic can be intercepted. Always use HTTPS.

---

## Optional: Enable Instant Updates (postURL)

By default, JVSHomeControl polls Hubitat every 2 seconds. For instant updates:

1. In Hubitat Maker API settings, set **postURL** to:
   `
   https://your-server-ip/api/events
   `

2. Now device changes appear instantly on the dashboard

> **Note:** If both sides use self-signed certs, Hubitat may not trust the dashboard cert. You can use HTTP for postURL if needed (the event data is less sensitive than the access token).

---

## Adjust Poll Interval

Default is 2000ms (2 seconds). To poll less frequently, change the **Poll Interval** in **Settings → Server**.

---

## Troubleshooting

**Dashboard loads but no devices appear:**
`ash
# Check Hubitat connection
curl -sk https://localhost/api/hubitat/health
`

**Connection refused or timeout:**
- Verify the Hubitat IP address is correct
- Ensure devices are selected in Maker API settings
- Check that your access token is valid

**TLS/SSL errors:**
- Make sure **Allow self-signed certs** is enabled in **Settings → Server**
- Check logs: sudo journalctl -u jvshomecontrol -f

---

## Maker API Reference

For a quick reference of Maker API endpoints, token security, and event callbacks, see server/MAKER_API.md.
