# HTTPS Setup

The server starts on HTTP by default. After installation, generate an HTTPS certificate from the Settings UI or the command line.

---

## How It Works

- If certificates exist in `server/data/certs/`, the server uses HTTPS automatically
- If no certificates exist, it falls back to HTTP
- Set `HTTP_ONLY=1` to force HTTP even when certificates are present

---

## Generate a Certificate (Settings UI)

1. Open `http://your-server-ip` in a browser
2. Go to **Settings → Server → Network & Security**
3. Click **Generate Certificate** and enter your server's hostname or IP
4. Restart the service:

```bash
sudo systemctl restart jvshomecontrol
```

5. For a clean HTTPS URL, change the **Port** to **443** in Settings → Server
6. Restart the service and access at `https://your-server-ip`

---

## Generate a Certificate (Command Line)

```bash
cd /opt/jvshomecontrol/server
sudo -u jvshome HTTPS=1 HTTPS_SETUP_ASSUME_YES=1 HTTPS_CERT_HOSTNAME=your-hostname node scripts/https-setup.js
sudo systemctl restart jvshomecontrol
```

---

## Certificate Locations

| File | Path |
|------|------|
| Certificate | `/opt/jvshomecontrol/server/data/certs/localhost.crt` |
| Private Key | `/opt/jvshomecontrol/server/data/certs/localhost.key` |

---

## Trust the Certificate

Self-signed certificates show browser warnings. To avoid them:

### Desktop Browsers
1. Open `https://your-server`
2. Click "Advanced" > "Proceed anyway"
3. Some browsers let you install the cert permanently

### iOS
1. Open the URL in Safari
2. Accept the warning
3. Go to Settings > General > About > Certificate Trust Settings
4. Enable the certificate

### Android
1. Download the `.crt` file
2. Go to Settings > Security > Install certificates

---

## Maker API postURL with HTTPS

If your dashboard uses HTTPS, configure Maker API to post to:
```
https://your-server/api/events
```

**Note:** Hubitat may not trust self-signed certs. You may need to fall back to HTTP for the postURL.

---

## Hubitat HTTPS

If your Hubitat uses HTTPS with a self-signed cert, enable **Allow self-signed certs** in **Settings → Server**, or set via environment:

```bash
# In /etc/jvshomecontrol.env:
HUBITAT_TLS_INSECURE=1
```

Then restart: `sudo systemctl restart jvshomecontrol`

---

## Custom Certificate Paths

```bash
# In /etc/jvshomecontrol.env:
HTTPS_CERT_PATH=/path/to/cert.crt
HTTPS_KEY_PATH=/path/to/cert.key
```

---

## Force HTTP Only

Disable HTTPS in **Settings → Server**, or via environment:

```bash
# In /etc/jvshomecontrol.env:
HTTP_ONLY=1
```
