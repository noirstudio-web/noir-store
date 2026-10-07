'use strict';
/* ==========================================================
   NOIR STORE — Suscripción y código de activación
   Los códigos se firman con la clave privada del panel
   "NOIR LICENCIAS" y aquí solo se verifican con la clave pública.
   ========================================================== */

/* Datos del proveedor del sistema (se muestran en la pantalla de activación) */
const LIC_CFG = {
  vendor: 'NOIR Studio',
  whatsapp: '',          // tu número con código de país, ej. '573001234567' (vacío = no muestra el botón)
  trialDays: 7,          // días de prueba gratis antes de pedir el código (0 = sin prueba)
  warnDays: 7,           // avisar cuando falten estos días para vencer
  revocationUrl: '',     // dirección pública de la lista firmada de licencias desactivadas (opcional)
};
/* Funciones que un plan puede incluir o no (las define el código de activación) */
const PLAN_FEATURES = {
  credits: 'Créditos y cobros', quotes: 'Cotizaciones', purchases: 'Compras y proveedores', reports: 'Reportes', whatsapp: 'Notificaciones por WhatsApp',
  layaway: 'Apartados (plan separe)', loyalty: 'Programa de puntos', promos: 'Promociones automáticas', commissions: 'Comisiones de vendedores',
  ownerAlerts: 'Resúmenes al dueño por WhatsApp', branding: 'Logo propio en facturas', support: 'Soporte prioritario',
};
/* Beneficios añadidos después: los códigos Básica antiguos no los incluyen */
const PREMIUM_EXTRAS = ['layaway', 'loyalty', 'promos', 'commissions', 'ownerAlerts', 'branding', 'support'];
/* Los datos del proveedor llegan configurados desde el Panel de Licencias */
if (window.NOIR_PROVISION && NOIR_PROVISION.vendor) Object.assign(LIC_CFG, NOIR_PROVISION.vendor);
/* Versión web pública (sin instalar): se entra solo con código de activación, sin prueba gratis */
const LIC_WEB = location.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname);
if (LIC_WEB) LIC_CFG.trialDays = 0;
/* App Android: licencia permanente con número corto, sin prueba gratis */
const LIC_APP = !!window.NOIR_SK;
if (LIC_APP) LIC_CFG.trialDays = 0;
const PLAN_LIMITS = { basic: { u: 2, pr: 300, on: ['credits', 'quotes'] }, premium: { u: 0, pr: 0, on: Object.keys(PLAN_FEATURES) } };
const LIC_PUBLIC_KEY ={ kty: 'EC', crv: 'P-256', x: 'hlLoieombQc23q161Ug5pdqRipCdcc9PYZ29S9ZphE4', y: '_7n-MORetUUTm3XvTDsomkSOkUkmh2O4N2LpYxaBURs' };

const LIC = {
  valid: false,          // la firma del código guardado fue verificada en esta sesión
  payload: null,

  b64uToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  },
  parse(code) {
    const clean = String(code || '').replace(/\s+/g, '');
    const m = clean.match(/^NOIR1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    try {
      const payload = JSON.parse(new TextDecoder().decode(this.b64uToBytes(m[1])));
      return { clean, data: m[1], sig: m[2], payload };
    } catch (e) { return null; }
  },
  async verifySig(p) {
    if (window.isSecureContext && crypto.subtle) {
      try {
        const key = await crypto.subtle.importKey('jwk', LIC_PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, this.b64uToBytes(p.sig), new TextEncoder().encode(p.data));
      } catch (e) { return false; }
    }
    // tablets/PC por red (sin contexto seguro): verifica el servidor local
    try {
      const r = await fetch('api/license/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: p.clean }) });
      return r.ok && (await r.json()).ok === true;
    } catch (e) { return false; }
  },

  /* Al iniciar: comprueba la licencia guardada */
  async init() {
    const d = DB.data;
    this.valid = false; this.payload = null;
    if (d.settings.vendorInfo && !(window.NOIR_PROVISION && NOIR_PROVISION.vendor)) Object.assign(LIC_CFG, d.settings.vendorInfo);
    if (d.license && d.license.code) {
      const p = this.parse(d.license.code);
      if (p && await this.verifySig(p) && (!p.payload.i || p.payload.i === d.meta.installId)) { this.valid = true; this.payload = p.payload; }
    }
    if (d.license && d.license.short) {
      const r = LicShort.check(window.NOIR_SK, d.license.short);
      if (r) { this.valid = true; this.payload = this.shortPayload(r); }
    }
    const t = today();
    this.clockBack = d.meta.lastSeen && t < addDays(d.meta.lastSeen, -1);
    if (!this.clockBack && (!d.meta.lastSeen || t > d.meta.lastSeen)) { d.meta.lastSeen = t; DB.commit(); }
  },

  /* Estado actual: active | trial | expired | none | clock */
  status() {
    const d = DB.data, t = today();
    if (this.valid && this.payload?.perpetual) return { state: 'active', perpetual: true, daysLeft: Infinity, plan: this.payload.p, business: this.payload.n };
    if (this.clockBack) return { state: 'clock' };
    if (this.valid && this.payload && d.license?.revoked) return { state: 'revoked', expires: this.payload.e, plan: this.payload.p, business: this.payload.n };
    if (this.valid && this.payload) {
      const left = daysBetween(t, this.payload.e);
      if (left >= 0) return { state: 'active', expires: this.payload.e, daysLeft: left, plan: this.payload.p, business: this.payload.n };
      return { state: 'expired', expires: this.payload.e, plan: this.payload.p, business: this.payload.n };
    }
    if (LIC_CFG.trialDays > 0) {
      const end = addDays(d.meta.trialStart, LIC_CFG.trialDays);
      const left = daysBetween(t, end);
      if (left >= 0) return { state: 'trial', expires: end, daysLeft: left };
    }
    return { state: d.license ? 'expired' : 'none', expires: this.payload?.e };
  },
  usable() { const s = this.status().state; return s === 'active' || s === 'trial'; },

  /* Límites del plan (la prueba gratis incluye todo, como Premium) */
  limits() {
    const st = this.status().state;
    const all = Object.keys(PLAN_FEATURES);
    if (st === 'trial' || !this.payload) return { tier: 'trial', name: 'Prueba gratis', users: Infinity, products: Infinity, on: all, off: [] };
    const l = this.payload.lim || {}, tier = this.payload.tier || 'premium';
    // formato nuevo: lista de funciones incluidas; formato anterior: lista de excluidas
    const on = Array.isArray(l.on) ? l.on : all.filter(f => !(l.off || []).includes(f) && !(tier === 'basic' && PREMIUM_EXTRAS.includes(f)));
    return {
      tier, name: tier === 'basic' ? 'Básica' : 'Premium',
      users: l.u > 0 ? l.u : Infinity, products: l.pr > 0 ? l.pr : Infinity, on, off: all.filter(f => !on.includes(f)),
    };
  },
  has(feature) { return this.limits().on.includes(feature); },
  key() { return this.payload?.k || ''; },
  upgradeMsg(what) { return `No disponible en tu plan ${this.limits().name}: ${what}. Mejora a Premium con ${LIC_CFG.vendor}.`; },

  /* Lista firmada de licencias desactivadas (si el proveedor la publica en internet) */
  async checkRevocation() {
    const d = DB.data, url = LIC_CFG.revocationUrl;
    if (!url || !this.valid || !this.key() || !navigator.onLine) return;
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 7000);
      const txt = (await (await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', signal: ctl.signal })).text()).trim();
      const p = this.parse(txt);
      if (!p || p.payload.type !== 'revocation' || !(await this.verifySig(p))) return;
      const revoked = (p.payload.keys || []).includes(this.key());
      if (!!d.license.revoked !== revoked) {
        d.license.revoked = revoked;
        audit(revoked ? 'Licencia desactivada' : 'Licencia reactivada', `Por ${LIC_CFG.vendor} · ${this.key()}`);
        DB.commit();
      }
      d.meta.revCheckedAt = nowISO();
    } catch (e) { /* sin internet: se revisa en el próximo intento */ }
  },

  /* Activa un código nuevo (o de renovación / restablecimiento de acceso) */
  shortPayload(r) {
    return { k: r.key, tier: r.tier, p: 'Licencia ' + (r.tier === 'premium' ? 'Premium' : 'Básica'), n: DB.data.settings.company.name, perpetual: true, lim: PLAN_LIMITS[r.tier] };
  },
  /* Activa el número de licencia permanente (sin internet) */
  async activateShort(code) {
    if (!window.NOIR_SK) throw new Error(`Este número de licencia se activa en la app NOIR STORE para Android. Pide el enlace de descarga a ${LIC_CFG.vendor}.`);
    const r = LicShort.check(window.NOIR_SK, code);
    if (!r) throw new Error('Número de licencia inválido. Revísalo: son letras y números intercalados, por ejemplo NOIR-A1B2-C3D4-E5F6.');
    const d = DB.data;
    d.license = { short: r.key, tier: r.tier, activatedAt: nowISO() };
    this.valid = true; this.payload = this.shortPayload(r);
    audit('Activación de licencia', `${this.payload.p} · ${r.key}`);
    DB.commit(); await DB.persist();
    return this.payload;
  },

  async activate(code) {
    if (LIC_SHORT_RE.test(String(code))) return this.activateShort(code);
    const d = DB.data;
    const p = this.parse(code);
    if (!p) throw new Error('El código no tiene un formato válido. Cópialo completo, empieza con "NOIR1."');
    if (!(await this.verifySig(p))) throw new Error('Código inválido: la firma no corresponde a ' + LIC_CFG.vendor);
    const pl = p.payload;
    if (pl.type || !pl.e) throw new Error('Esto no es un código de activación');
    if (pl.i && pl.i !== d.meta.installId) throw new Error(`Este código es para otra instalación (${pl.i}). El ID de este equipo es ${d.meta.installId}.`);
    // el usuario y la contraseña firmados se aplican aunque el código ya haya vencido
    if (d.license && d.license.short && LicShort.check(window.NOIR_SK, pl.k || '')?.key !== d.license.short) throw new Error('Este código es para otra licencia. Pide a ' + LIC_CFG.vendor + ' el código de tu número ' + d.license.short + '.');
    const credsApplied = this.applyCredentials(pl);
    if (credsApplied) { audit('Acceso del administrador', `Usuario ${pl.u} configurado por ${LIC_CFG.vendor}`); DB.commit(); await DB.persist(); }
    if (d.license && d.license.short) {
      if (!credsApplied) throw new Error('Tu licencia es permanente: no necesitas este código.');
      return { ...this.payload, u: pl.u, credsOnly: true };
    }
    if (pl.e < today()) throw new Error(`Este código ya venció el ${fmtDate(pl.e)}.${credsApplied ? ` Tu usuario "${pl.u}" quedó configurado; pide a ${LIC_CFG.vendor} un código de renovación.` : ''}`);
    if (this.valid && this.payload && pl.e < this.payload.e && !pl.u) throw new Error(`Ya tienes una suscripción hasta el ${fmtDate(this.payload.e)}; este código es anterior.`);
    d.license = { code: p.clean, activatedAt: nowISO(), id: pl.id };
    this.applyBusiness(pl);
    d.meta.lastSeen = today(); this.clockBack = false;
    this.valid = true; this.payload = pl;
    audit('Activación de suscripción', `${pl.p || ''} hasta ${fmtDate(pl.e)}${pl.u ? ' · credenciales de administrador actualizadas' : ''}`);
    DB.commit(); await DB.persist();
    return pl;
  },

  /* Enlace de activación: el cliente solo toca el enlace que le enviaron.
     Cada enlace se aplica una sola vez en este navegador (abrirlo de nuevo no cambia la contraseña que el cliente ya haya cambiado). */
  async activateFromLink(code) {
    const d = DB.data, p = this.parse(code);
    const used = d.meta.linkCodes || (d.meta.linkCodes = []);
    if (p && used.includes(p.payload.id)) return { already: true };
    const pl = await this.activate(code);
    used.push(pl.id); DB.commit(); await DB.persist();
    return { pl };
  },

  /* Configura el negocio con los datos que trae el código (solo lo que aún no se ha personalizado) */
  applyBusiness(pl) {
    const d = DB.data, s = d.settings;
    if (pl.co && !d.meta.countryFromLicense && typeof applyCountry === 'function') { applyCountry(s, pl.co); d.meta.countryFromLicense = true; }
    if (pl.n && (!s.company.name || s.company.name === 'NOIR STORE')) s.company.name = pl.n;
    if (pl.cp && !s.company.phone) s.company.phone = pl.cp;
    if (pl.ca && !s.company.address) s.company.address = pl.ca;
    if (pl.vn || pl.vw) { s.vendorInfo = { vendor: pl.vn || LIC_CFG.vendor, whatsapp: pl.vw || LIC_CFG.whatsapp || '' }; Object.assign(LIC_CFG, s.vendorInfo); }
    s.setupDone = true;
    if (pl.u) { try { localStorage.setItem('noir-last-user', pl.u); } catch (e) { } }
  },

  /* Asigna el usuario y la contraseña del código al administrador correcto */
  applyCredentials(pl) {
    if (!(pl.u && pl.h && pl.s)) return false;
    const d = DB.data, admins = d.users.filter(u => u.role === 'admin');
    let admin = admins.find(u => norm(u.username) === norm(pl.u))       // el mismo usuario (restablecer acceso)
      || admins.find(u => u.id === 'u-admin')                            // el administrador original del sistema
      || admins.find(u => u.active !== false) || admins[0];
    if (!admin) { admin = { id: uid(), name: 'Administrador', role: 'admin', active: true }; d.users.push(admin); }
    const clash = d.users.find(u => u !== admin && norm(u.username) === norm(pl.u));
    if (clash) clash.username = clash.username + '-' + Math.random().toString(36).slice(2, 5);
    admin.username = pl.u; admin.passHash = pl.h; admin.salt = pl.s; admin.active = true; admin.role = 'admin'; delete admin.pin;
    if (pl.an) admin.name = pl.an;
    if (App.user && App.user.id === admin.id) App.user = admin;
    return true;
  },

  contactLink(extra = '') {
    if (!LIC_CFG.whatsapp) return '';
    const msg = `Hola ${LIC_CFG.vendor}, necesito ${extra || 'activar mi sistema NOIR STORE'}.\nNegocio: ${DB.data.settings.company.name}${this.key() ? `\nCódigo de licencia: ${this.key()}` : ''}`;
    return `https://wa.me/${LIC_CFG.whatsapp}?text=${encodeURIComponent(msg)}`;
  },
  planLabel(st) { return st.state === 'trial' ? 'Prueba gratis' : (st.plan || 'Suscripción'); },
};

/* Aplica (una sola vez) la configuración de entrega generada por el panel */
async function applyProvision() {
  const P = window.NOIR_PROVISION;
  if (!P || !P.id) return;
  const d = DB.data;
  if (d.meta.provisionId === P.id) return;
  if (P.country && typeof applyCountry === 'function') applyCountry(d.settings, P.country);
  if (P.company) Object.assign(d.settings.company, P.company);
  d.settings.setupDone = true;
  d.meta.provisionId = P.id;
  DB.commit();
  if (P.license) {
    await LIC.init();
    try { await LIC.activate(P.license); delete d.meta.provisionError; }
    catch (e) { d.meta.provisionError = e.message; console.warn('Licencia de entrega:', e.message); }
  }
  audit('Sistema configurado', `Entrega de ${LIC_CFG.vendor} para ${P.company?.name || ''}`);
  DB.commit();
}

/* ---------- Pantalla de activación (bloqueo) ---------- */
function activationScreen(onDone) {
  const st = LIC.status();
  const titles = {
    none: LIC_APP ? ['Activa tu licencia', `Escribe el número de licencia que te entregó ${LIC_CFG.vendor}. Es para siempre: solo lo haces una vez.`] : ['Activa tu sistema', LIC_CFG.trialDays > 0 ? `Tu periodo de prueba terminó. Ingresa el código de activación que te entregó ${LIC_CFG.vendor}.` : `Bienvenido a NOIR STORE. Pega el código de activación que te entregó ${LIC_CFG.vendor}; después entras con tu usuario y contraseña.`],
    expired: ['Suscripción vencida', `Tu suscripción venció el ${fmtDate(st.expires)}. Ingresa un código de renovación para continuar.`],
    clock: ['Revisa la fecha del equipo', 'La fecha de esta computadora es anterior a la última vez que se usó el sistema. Corrige la fecha y hora de Windows y vuelve a abrir el sistema.'],
    trial: ['Activa tu sistema', `Estás en periodo de prueba (${st.daysLeft} días restantes).`],
    active: ['Renovar suscripción', `Tu suscripción está activa hasta el ${fmtDate(st.expires)}.`],
    revoked: ['Licencia desactivada', `${LIC_CFG.vendor} desactivó esta licencia. Comunícate para reactivarla; tus datos están a salvo.`],
  };
  const [title, msg0] = titles[st.state];
  const msg = DB.data.meta.provisionError && st.state !== 'active' ? `${msg0}<br><br><span class="warn-text">${esc(DB.data.meta.provisionError)}</span>` : msg0;
  const wa = LIC.contactLink(st.state === 'expired' ? 'renovar mi suscripción' : '');
  $('#root').innerHTML = `
    <div class="login">
      <div class="login-art"><img src="assets/logo-principal.png" alt="NOIR"><div class="tagline">Sistema de gestión comercial</div></div>
      <div class="login-form"><div class="login-box" style="max-width:440px">
        <div class="badge ${['clock', 'expired', 'revoked'].includes(st.state) ? 'err' : 'warn'}" style="margin-bottom:14px">${icon('lock', 12)} ${{ clock: 'Fecha incorrecta', expired: 'Vencida', revoked: 'Desactivada' }[st.state] || 'Sin activar'}</div>
        <h2>${title}</h2><p>${msg}</p>
        ${st.state === 'clock' ? '' : `
        ${LIC.key() ? `<div class="field mb"><label>Tu código de licencia</label>
          <div class="input-group"><input id="ac-id" value="${esc(LIC.key())}" readonly style="font-family:monospace;letter-spacing:.08em"><button class="btn" id="ac-copy" title="Copiar">${icon('copy', 15)}</button></div>
          <span class="hint">Indícaselo a ${esc(LIC_CFG.vendor)} para renovar o reactivar.</span></div>` : ''}
        ${LIC_APP ? '<div class="field"><label>Número de licencia</label><input id="ac-code" placeholder="NOIR-A1B2-C3D4-E5F6" autocapitalize="characters" autocomplete="off" spellcheck="false" style="font-family:monospace;font-size:19px;letter-spacing:.08em;text-align:center"></div>' : '<div class="field"><label>Código de activación</label><textarea id="ac-code" rows="4" placeholder="NOIR1.xxxxxxxx…" style="font-family:monospace;font-size:12px;word-break:break-all"></textarea></div>'}
        <button class="btn chrome lg block mt" id="ac-go">${icon('unlock', 18)} Activar</button>`}
        <div class="row mt" style="justify-content:center">
          ${wa ? `<a class="btn ghost" href="${wa}" target="_blank" rel="noopener">${waIcon(15)} Contactar a ${esc(LIC_CFG.vendor)}</a>` : ''}
          <button class="btn ghost" id="ac-bk">${icon('download', 15)} Descargar mis datos</button>
          ${st.state === 'trial' || st.state === 'active' ? `<button class="btn ghost" id="ac-back">Volver</button>` : ''}
        </div>
      </div></div>
    </div>`;
  const cp = $('#ac-copy'); if (cp) cp.onclick = () => { navigator.clipboard?.writeText(LIC.key()); $('#ac-id').select(); document.execCommand?.('copy'); toast('Código de licencia copiado'); };
  $('#ac-bk').onclick = () => downloadFile(`noir-store-respaldo-${today()}.json`, JSON.stringify(DB.data), 'application/json');
  const back = $('#ac-back'); if (back) back.onclick = () => onDone(false);
  const go = $('#ac-go');
  if (go) go.onclick = async () => {
    go.disabled = true;
    try {
      const pl = await LIC.activate($('#ac-code').value);
      toast(pl.perpetual ? `¡${pl.p} activada!` : `¡Sistema activado hasta el ${fmtDate(pl.e)}!`, 'ok', 5000);
      onDone(true, pl);
    } catch (e) { toast(e.message, 'err', 6000); go.disabled = false; }
  };
}
