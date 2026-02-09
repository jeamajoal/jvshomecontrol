import React from 'react';

import { API_HOST } from '../apiHost';

/* ─── Helper: save server settings via REST ────────────────────────────── */

async function saveServerSettings(payload) {
  const res = await fetch(`${API_HOST}/api/server-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Server settings save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

/* ─── Stable sub-components (module-level = fixed references) ──────────── */

const NumericField = ({ label, value, min, max, step, unit, field }) => {
  const [draft, setDraft] = React.useState(String(value ?? ''));
  const focusRef = React.useRef(false);

  React.useEffect(() => {
    if (!focusRef.current) setDraft(String(value ?? ''));
  }, [value]);

  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step || 1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => { focusRef.current = true; }}
          onBlur={() => {
            focusRef.current = false;
            const num = Number(draft);
            if (!Number.isFinite(num)) { setDraft(String(value ?? '')); return; }
            const clamped = Math.max(min, Math.min(max, Math.floor(num)));
            setDraft(String(clamped));
            if (clamped !== value) saveServerSettings({ [field]: clamped }).catch(() => {});
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/85"
        />
        {unit ? <span className="text-[11px] text-white/40 shrink-0">{unit}</span> : null}
      </div>
    </div>
  );
};

const SelectField = ({ label, value, options, field }) => (
  <div>
    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">
      {label}
    </label>
    <select
      value={value || ''}
      onChange={(e) => {
        const next = e.target.value;
        if (next && next !== value) saveServerSettings({ [field]: next }).catch(() => {});
      }}
      className="mt-1 menu-select w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/85 outline-none focus:outline-none focus:ring-0 jvs-menu-select"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

const ToggleField = ({ label, value, field, description }) => (
  <div>
    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">
      {label}
    </label>
    <div className="mt-1 flex items-center gap-3">
      <button
        type="button"
        onClick={() => saveServerSettings({ [field]: !value }).catch(() => {})}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${value ? 'bg-emerald-500/70' : 'bg-white/15'}`}
        role="switch"
        aria-checked={!!value}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ease-in-out ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
      {description ? <span className="text-[11px] text-white/45">{description}</span> : null}
    </div>
  </div>
);

const TextField = ({ label, value, field, placeholder, type = 'text' }) => {
  const [draft, setDraft] = React.useState(value || '');
  const focusRef = React.useRef(false);

  React.useEffect(() => {
    if (!focusRef.current) setDraft(value || '');
  }, [value]);

  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">
        {label}
      </label>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => { focusRef.current = true; }}
        onBlur={() => {
          focusRef.current = false;
          const trimmed = draft.trim();
          if (trimmed !== (value || '')) saveServerSettings({ [field]: trimmed }).catch(() => {});
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/85 placeholder-white/25"
      />
    </div>
  );
};

const PasswordField = ({ label, field, hasValue }) => {
  const [draft, setDraft] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">
        {label}
      </label>
      {!editing ? (
        <div className="mt-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${hasValue ? 'text-emerald-400/70' : 'text-white/30'}`}>
              {hasValue ? '••••••••••••' : 'Not set'}
            </span>
            <button
              type="button"
              onClick={() => { setDraft(''); setEditing(true); }}
              className="text-[10px] font-bold uppercase tracking-widest text-sky-400/70 hover:text-sky-300/90"
            >
              {hasValue ? 'Change' : 'Set'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <input
            type="password"
            value={draft}
            autoFocus
            placeholder="Paste access token"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') { setEditing(false); setDraft(''); }
            }}
            onBlur={() => {
              const trimmed = draft.trim();
              if (trimmed) saveServerSettings({ [field]: trimmed }).catch(() => {});
              setEditing(false);
              setDraft('');
            }}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/85 placeholder-white/25"
          />
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(''); }}
            className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/60"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

const CertificateSection = ({ ss: s }) => {
  const [genHostname, setGenHostname] = React.useState('');
  const [genLoading, setGenLoading] = React.useState(false);
  const [genMsg, setGenMsg] = React.useState('');
  const [uploadMode, setUploadMode] = React.useState(false);
  const [certPem, setCertPem] = React.useState('');
  const [keyPem, setKeyPem] = React.useState('');
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const [uploadMsg, setUploadMsg] = React.useState('');
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const cert = s.certInfo;
  const formatDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } };

  const handleGenerate = async () => {
    setGenLoading(true); setGenMsg('');
    try {
      const res = await fetch(`${API_HOST}/api/server/generate-cert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: genHostname.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      setGenMsg(data.message || data.error || (res.ok ? 'Done' : 'Failed'));
    } catch (e) { setGenMsg(String(e.message || e)); }
    setGenLoading(false);
  };

  const handleUpload = async () => {
    if (!certPem.trim() || !keyPem.trim()) { setUploadMsg('Both certificate and key are required.'); return; }
    setUploadLoading(true); setUploadMsg('');
    try {
      const res = await fetch(`${API_HOST}/api/server/upload-cert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cert: certPem, key: keyPem }),
      });
      const data = await res.json().catch(() => ({}));
      setUploadMsg(data.message || data.error || (res.ok ? 'Done' : 'Failed'));
      if (res.ok) { setUploadMode(false); setCertPem(''); setKeyPem(''); }
    } catch (e) { setUploadMsg(String(e.message || e)); }
    setUploadLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete certificates? The server will revert to HTTP after restart.')) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API_HOST}/api/server/cert`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      setGenMsg(data.message || '');
    } catch (e) { setGenMsg(String(e.message || e)); }
    setDeleteLoading(false);
  };

  return (
    <div className="mt-6 pt-4 border-t border-white/5">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">HTTPS Certificates</div>

      {cert ? (
        <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11px] text-white/50 space-y-1">
          <div><span className="text-white/30 mr-1">Subject:</span>{cert.subject}</div>
          <div><span className="text-white/30 mr-1">Issuer:</span>{cert.issuer}</div>
          <div><span className="text-white/30 mr-1">Valid:</span>{formatDate(cert.validFrom)} — {formatDate(cert.validTo)}</div>
          {cert.selfSigned && <div className="text-amber-400/60">Self-signed certificate</div>}
        </div>
      ) : (
        <div className="mb-4 text-[11px] text-white/35">No certificate found. Generate or upload one to enable HTTPS.</div>
      )}

      {/* Generate */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">Hostname / IP</label>
          <input
            type="text"
            value={genHostname}
            placeholder="e.g. 192.168.1.100"
            onChange={(e) => setGenHostname(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/85 placeholder-white/25"
          />
        </div>
        <button
          type="button"
          disabled={genLoading}
          onClick={handleGenerate}
          className={`shrink-0 rounded-xl border border-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors hover:bg-white/5 ${genLoading ? 'opacity-50 cursor-wait' : 'text-sky-400/80'}`}
        >
          {genLoading ? 'Generating…' : 'Generate Self-Signed'}
        </button>
        {cert && (
          <button
            type="button"
            disabled={deleteLoading}
            onClick={handleDelete}
            className="shrink-0 rounded-xl border border-red-500/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-red-400/70 transition-colors hover:bg-red-500/5"
          >
            Delete
          </button>
        )}
      </div>
      {genMsg && <div className="mb-3 text-[11px] text-amber-400/70">{genMsg}</div>}

      {/* Upload */}
      {!uploadMode ? (
        <button
          type="button"
          onClick={() => setUploadMode(true)}
          className="text-[10px] font-bold uppercase tracking-widest text-sky-400/60 hover:text-sky-300/80"
        >
          Upload Custom Certificate
        </button>
      ) : (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Certificate PEM</label>
            <textarea
              rows={4}
              value={certPem}
              placeholder="-----BEGIN CERTIFICATE-----&#10;..."
              onChange={(e) => setCertPem(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-white/70 placeholder-white/20 resize-y"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Private Key PEM</label>
            <textarea
              rows={4}
              value={keyPem}
              placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
              onChange={(e) => setKeyPem(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-white/70 placeholder-white/20 resize-y"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploadLoading}
              onClick={handleUpload}
              className={`rounded-xl border border-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors hover:bg-white/5 ${uploadLoading ? 'opacity-50 cursor-wait' : 'text-sky-400/80'}`}
            >
              {uploadLoading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={() => { setUploadMode(false); setCertPem(''); setKeyPem(''); setUploadMsg(''); }}
              className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/60"
            >
              Cancel
            </button>
          </div>
          {uploadMsg && <div className="text-[11px] text-amber-400/70">{uploadMsg}</div>}
        </div>
      )}
    </div>
  );
};

/* ─── Main Server Settings Tab ─────────────────────────────────────────── */

const ServerSettingsTab = ({ config }) => {
  const ss = config?.serverSettings || {};

  return (
    <div className="utility-panel p-4 md:p-6">
      <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
        Server
      </div>
      <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
        Server Settings
      </div>
      <div className="mt-1 text-xs text-white/45">
        Runtime-tunable server configuration. Changes are saved to config.json automatically.
      </div>

      {/* Network */}
      <div className="mt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Network</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <NumericField
              label="Port"
              value={ss.port}
              min={80}
              max={65535}
              step={1}
              field="port"
            />
            <div className="mt-1 text-[10px] text-amber-400/60">⚠ Port changes require a server restart to take effect.</div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">Protocol</label>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${ss.httpsActive ? 'bg-emerald-400' : 'bg-amber-400/70'}`} />
              <span className="text-sm font-semibold text-white/70">{ss.httpsActive ? 'HTTPS' : 'HTTP'}</span>
              {ss.certExists && !ss.httpsActive && <span className="text-[10px] text-white/40">(cert found — restart to enable)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* HTTPS Certificates */}
      <CertificateSection ss={ss} />

      {/* Hubitat Connection */}
      <div className="mt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Hubitat Connection</div>
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-block h-2 w-2 rounded-full ${ss.hubitatConfigured ? 'bg-emerald-400' : 'bg-red-400/70'}`} />
          <span className="text-[11px] text-white/50">{ss.hubitatConfigured ? 'Connected' : 'Not configured — set Host, App ID, and Access Token below'}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Hubitat Host"
            value={ss.hubitatHost}
            field="hubitatHost"
            placeholder="http://192.168.1.x"
          />
          <TextField
            label="Maker API App ID"
            value={ss.hubitatAppId}
            field="hubitatAppId"
            placeholder="e.g. 42"
          />
          <PasswordField
            label="Access Token"
            field="hubitatAccessToken"
            hasValue={ss.hubitatHasAccessToken}
          />
          <ToggleField
            label="TLS Insecure"
            value={ss.hubitatTlsInsecure}
            field="hubitatTlsInsecure"
            description="Skip certificate verification (self-signed certs)"
          />
        </div>
      </div>

      {/* Hubitat Polling */}
      <div className="mt-6 pt-4 border-t border-white/5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Hubitat Polling</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumericField
            label="Poll Interval"
            value={ss.pollIntervalMs}
            min={1000}
            max={3600000}
            step={500}
            unit="ms"
            field="pollIntervalMs"
          />
        </div>
      </div>

      {/* Weather Units */}
      <div className="mt-6 pt-4 border-t border-white/5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Weather Units</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SelectField
            label="Temperature"
            value={ss.temperatureUnit}
            field="temperatureUnit"
            options={[
              { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
              { value: 'celsius', label: 'Celsius (°C)' },
            ]}
          />
          <SelectField
            label="Wind Speed"
            value={ss.windSpeedUnit}
            field="windSpeedUnit"
            options={[
              { value: 'mph', label: 'mph' },
              { value: 'kmh', label: 'km/h' },
              { value: 'ms', label: 'm/s' },
              { value: 'kn', label: 'Knots' },
            ]}
          />
          <SelectField
            label="Precipitation"
            value={ss.precipitationUnit}
            field="precipitationUnit"
            options={[
              { value: 'inch', label: 'Inches (in)' },
              { value: 'mm', label: 'Millimeters (mm)' },
            ]}
          />
        </div>
      </div>

      {/* Events */}
      <div className="mt-6 pt-4 border-t border-white/5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Events</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumericField
            label="Max Events in Memory"
            value={ss.eventsMax}
            min={50}
            max={10000}
            step={50}
            field="eventsMax"
          />
          <ToggleField
            label="Persist Events to Disk"
            value={ss.eventsPersistJsonl}
            field="eventsPersistJsonl"
            description="Write events to events.jsonl"
          />
        </div>
      </div>

      {/* Backups */}
      <div className="mt-6 pt-4 border-t border-white/5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Backups</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumericField
            label="Max Backup Files"
            value={ss.backupMaxFiles}
            min={10}
            max={1000}
            step={10}
            field="backupMaxFiles"
          />
        </div>
      </div>
    </div>
  );
};

export default ServerSettingsTab;
