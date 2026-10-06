/* ==========================================================
   NOIR STORE — Servidor local (sin dependencias)
   Guarda los datos en una base de datos SQL (SQLite):
   ./data/noir-store.sqlite, con copias diarias en ./data/backups.
   Si Node.js no trae SQLite, usa ./data/noir-db.json.
   Uso:  node server.js   (puerto por defecto 8080)
   ========================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = +process.env.PORT || 8080;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'noir-db.json');
const SQL_FILE = path.join(DATA, 'noir-store.sqlite');
const BACKUPS = path.join(DATA, 'backups');
const KEEP_BACKUPS = 60;
/* Debe coincidir con LIC_PUBLIC_KEY de js/license.js */
const LIC_PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: 'hlLoieombQc23q161Ug5pdqRipCdcc9PYZ29S9ZphE4', y: '_7n-MORetUUTm3XvTDsomkSOkUkmh2O4N2LpYxaBURs' };

fs.mkdirSync(BACKUPS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/* ---------- Almacenamiento: SQL (SQLite) con respaldo a JSON ---------- */
let sql = null;
try {
  const { SqlStore } = require('./db-sql.js');
  sql = new SqlStore(SQL_FILE);
  // migración automática desde el archivo JSON anterior
  if (sql.isEmpty() && fs.existsSync(DB_FILE)) {
    const old = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (old && old.meta) { sql.save(old); fs.renameSync(DB_FILE, DB_FILE.replace(/\.json$/, '.migrado-a-sql.json')); console.log('  Datos migrados de JSON a la base de datos SQL.'); }
  }
} catch (e) { sql = null; console.log('  Aviso: SQLite no disponible (' + e.message + '). Se usará el archivo JSON.'); }

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function pruneBackups(prefix) {
  const files = fs.readdirSync(BACKUPS).filter(f => f.startsWith(prefix)).sort();
  files.slice(0, Math.max(0, files.length - KEEP_BACKUPS)).forEach(f => fs.unlink(path.join(BACKUPS, f), () => { }));
}
let cache = null;
function readDb() {
  if (cache) return cache;
  try { cache = sql ? sql.load() : JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.error(e); cache = null; }
  return cache;
}
function writeDb(obj, raw) {
  if (sql) {
    sql.save(obj);
    cache = obj;
    try { sql.backup(path.join(BACKUPS, `noir-store-${today()}.sqlite`)); pruneBackups('noir-store-'); } catch (e) { console.error('Respaldo:', e.message); }
    return;
  }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, raw);
  fs.renameSync(tmp, DB_FILE);
  cache = obj;
  fs.writeFile(path.join(BACKUPS, `noir-db-${today()}.json`), raw, () => pruneBackups('noir-db-'));
}
function readBody(req) { return new Promise((ok, ko) => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => ok(Buffer.concat(ch).toString('utf8'))); req.on('error', ko); }); }

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/db') {
    if (req.method === 'GET') return send(res, 200, JSON.stringify(readDb()));
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const obj = JSON.parse(raw);
          if (!obj || !obj.meta) return send(res, 400, '{"error":"datos inválidos"}');
          const cur = readDb();
          const base = +req.headers['x-base-rev'];
          if (cur && cur.meta && Number.isFinite(base) && (cur.meta.rev || 0) !== base) return send(res, 409, '{"error":"conflicto"}');
          writeDb(obj, raw);
          send(res, 200, JSON.stringify({ ok: true, rev: obj.meta.rev }));
        } catch (e) { send(res, 500, JSON.stringify({ error: e.message })); }
      });
      return;
    }
    return send(res, 405, '{}');
  }
  /* Verificación de códigos de activación (para equipos conectados por red) */
  if (url === '/api/license/verify' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const { code } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const m = String(code || '').replace(/\s+/g, '').match(/^NOIR1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
        if (!m) return send(res, 200, '{"ok":false}');
        const key = require('crypto').createPublicKey({ key: LIC_PUBLIC_KEY, format: 'jwk' });
        const ok = require('crypto').verify('sha256', Buffer.from(m[1]), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[2], 'base64url'));
        send(res, 200, JSON.stringify({ ok }));
      } catch (e) { send(res, 200, '{"ok":false}'); }
    });
    return;
  }
  /* Envío por WhatsApp Business Cloud API (las credenciales se leen de la configuración guardada) */
  if (url === '/api/whatsapp' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const { to, text, template, lang, params } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const w = (readDb() || {}).settings?.whatsapp || {};
        if (!w.token || !w.phoneNumberId) return send(res, 400, JSON.stringify({ error: 'Falta configurar el token o el Phone Number ID' }));
        const body = template
          ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: template, language: { code: lang || 'es' }, components: [{ type: 'body', parameters: (params || []).map(t => ({ type: 'text', text: String(t) })) }] } }
          : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } };
        const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(w.phoneNumberId)}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return send(res, 502, JSON.stringify({ error: j.error?.message || `Meta respondió ${r.status}` }));
        send(res, 200, JSON.stringify({ ok: true, id: j.messages?.[0]?.id }));
      } catch (e) { send(res, 500, JSON.stringify({ error: e.message })); }
    });
    return;
  }
  /* Información de la base de datos */
  if (url === '/api/info') {
    if (!sql) return send(res, 200, JSON.stringify({ storage: 'json', file: DB_FILE }));
    try { return send(res, 200, JSON.stringify(sql.info())); } catch (e) { return send(res, 500, JSON.stringify({ error: e.message })); }
  }
  /* Consultas SQL de solo lectura */
  if (url === '/api/sql' && req.method === 'POST') {
    readBody(req).then(raw => {
      if (!sql) return send(res, 400, JSON.stringify({ error: 'La base de datos SQL no está disponible' }));
      try { const { query } = JSON.parse(raw); const t0 = Date.now(); const r = sql.query(query); send(res, 200, JSON.stringify({ ...r, ms: Date.now() - t0 })); }
      catch (e) { send(res, 400, JSON.stringify({ error: e.message })); }
    });
    return;
  }
  /* Descargar una copia del archivo .sqlite */
  if (url === '/api/sql/backup') {
    if (!sql) return send(res, 400, '{}');
    try {
      const tmp = path.join(BACKUPS, `descarga-${Date.now()}.sqlite`);
      sql.backup(tmp);
      res.writeHead(200, { 'Content-Type': 'application/vnd.sqlite3', 'Content-Disposition': `attachment; filename="noir-store-${today()}.sqlite"` });
      fs.createReadStream(tmp).on('close', () => fs.unlink(tmp, () => { })).pipe(res);
    } catch (e) { send(res, 500, JSON.stringify({ error: e.message })); }
    return;
  }
  if (url === '/api/rev') { const d = readDb(); return send(res, 200, JSON.stringify({ rev: d && d.meta ? d.meta.rev || 0 : 0 })); }

  // archivos estáticos
  let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT) || file.startsWith(DATA)) return send(res, 403, 'Prohibido', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'No encontrado', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  ✦ NOIR STORE en funcionamiento ✦\n');
  console.log(`  En esta computadora:   http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  En otras de la red:    http://${ip}:${PORT}`));
  console.log(`\n  Base de datos:         ${sql ? SQL_FILE + ' (SQL · ' + sql.info().engine + ')' : DB_FILE + ' (JSON)'}`);
  console.log('  No cierres esta ventana mientras uses el sistema.\n');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.log(`\n  El puerto ${PORT} ya está en uso (¿el sistema ya está abierto?). Abre http://localhost:${PORT}\n`);
  else console.error(e);
});
