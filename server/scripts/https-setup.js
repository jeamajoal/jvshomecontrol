/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CERT_DIR_DEFAULT = path.join(DATA_DIR, 'certs');

const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
const falsy = (v) => ['0', 'false', 'no', 'off'].includes(String(v || '').trim().toLowerCase());

function resolveCertPaths() {
  const certPath = String(process.env.HTTPS_CERT_PATH || '').trim() || path.join(CERT_DIR_DEFAULT, 'localhost.crt');
  const keyPath = String(process.env.HTTPS_KEY_PATH || '').trim() || path.join(CERT_DIR_DEFAULT, 'localhost.key');
  return { certPath, keyPath };
}

function certExists({ certPath, keyPath }) {
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

async function promptYesNo(question, defaultYes = true) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultYes ? ' (Y/n) ' : ' (y/N) ';
  try {
    const answer = await new Promise((resolve) => rl.question(`${question}${suffix}`, resolve));
    const raw = String(answer || '').trim().toLowerCase();
    if (!raw) return defaultYes;
    if (['y', 'yes'].includes(raw)) return true;
    if (['n', 'no'].includes(raw)) return false;
    return defaultYes;
  } finally {
    rl.close();
  }
}

async function promptText(question, defaultValue = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` (default: ${defaultValue}) ` : ' ';
  try {
    const answer = await new Promise((resolve) => rl.question(`${question}${suffix}`, resolve));
    const raw = String(answer || '').trim();
    return raw || String(defaultValue || '').trim();
  } finally {
    rl.close();
  }
}

function printTrustWarning({ certPath }) {
  console.log('');
  console.log('HTTPS: self-signed certificate created.');
  console.log('IMPORTANT: You must TRUST this certificate on the device/browser running the dashboard,');
  console.log('otherwise you will see security warnings and the panel may alert on every load.');
  console.log('');
  console.log(`Certificate: ${certPath}`);
  console.log('');
  console.log('Maker API note: if Hubitat Maker "postURL" is set to HTTPS and Hubitat does not trust your cert,');
  console.log('you must configure Hubitat/Maker to ignore certificate warnings (if available) or use HTTP for the postURL.');
  console.log('');
  console.log('If your HUBITAT_HOST uses https:// with a self-signed cert, set: HUBITAT_TLS_INSECURE=1');
  console.log('');
}

async function main() {
  // Escape hatch
  if (truthy(process.env.HTTP_ONLY) || falsy(process.env.HTTPS)) {
    return;
  }

  const paths = resolveCertPaths();

  if (certExists(paths)) {
    console.log(`HTTPS: using existing certificate (${paths.certPath})`);
    return;
  }

  const interactive = Boolean(process.stdin.isTTY);
  if (!interactive) {
    console.log('HTTPS: certificate not found (non-interactive session).');
    console.log('Run again in an interactive terminal to create a self-signed cert, or provide HTTPS_CERT_PATH/HTTPS_KEY_PATH.');
    return;
  }

  const create = await promptYesNo('HTTPS certificate not found. Create a self-signed certificate now and enable HTTPS?', true);
  if (!create) {
    console.log('HTTPS: skipping certificate creation. Server will fall back to HTTP unless you provide a cert.');
    return;
  }

  const selfsigned = require('selfsigned');

  const certDir = path.dirname(paths.certPath);
  fs.mkdirSync(certDir, { recursive: true });

  const envHostname = String(process.env.HTTPS_CERT_HOSTNAME || '').trim();
  const suggestedHostname = envHostname || os.hostname() || 'localhost';
  const hostname = envHostname || await promptText('Hostname (or IP) to include in the HTTPS certificate', suggestedHostname);

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 2, value: hostname },
    { type: 7, ip: '127.0.0.1' },
  ];

  // If the user entered an IPv4 literal, also add it as an IP SAN.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    altNames.push({ type: 7, ip: hostname });
  }

  const attrs = [{ name: 'commonName', value: hostname }];
  const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    keySize: 2048,
    days: 3650,
    extensions: [{ name: 'subjectAltName', altNames }],
  });

  fs.writeFileSync(paths.keyPath, pems.private, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(paths.certPath, pems.cert, { encoding: 'utf8' });

  printTrustWarning(paths);
}

main().catch((err) => {
  console.error('HTTPS setup failed:', err);
  process.exitCode = 1;
});
