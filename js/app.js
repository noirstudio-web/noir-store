'use strict';
/* ==========================================================
   NOIR STORE — Aplicación: sesión, menú y enrutador
   ========================================================== */

const NAV = [
  { section: 'General' },
  { id: 'dashboard', label: 'Panel', icon: 'dashboard' },
  { id: 'pos', label: 'Punto de venta', icon: 'pos', key: 'F1' },
  { section: 'Ventas' },
  { id: 'invoices', label: 'Facturas', icon: 'file' },
  { id: 'quotes', label: 'Cotizaciones', icon: 'quote' },
  { id: 'layaway', label: 'Apartados', icon: 'tag', badge: () => DB.data.layaways.filter(l => D.layawayStatus(l) === 'vencido').length },
  { id: 'customers', label: 'Clientes', icon: 'users' },
  { id: 'credits', label: 'Créditos y cobros', icon: 'credit', badge: () => DB.data.invoices.filter(i => D.overdueDays(i) > 0).length },
  { section: 'Inventario' },
  { id: 'products', label: 'Productos', icon: 'box' },
  { id: 'inventory', label: 'Inventario', icon: 'layers', badge: () => DB.data.products.filter(p => p.active !== false && D.stockState(p) !== 'ok').length },
  { id: 'purchases', label: 'Compras y proveedores', icon: 'truck' },
  { section: 'Finanzas' },
  { id: 'cash', label: 'Caja', icon: 'cash' },
  { id: 'expenses', label: 'Gastos', icon: 'wallet' },
  { id: 'reports', label: 'Reportes', icon: 'chart' },
  { section: 'Sistema' },
  { id: 'settings', label: 'Configuración', icon: 'settings' },
];

const COUNTRY_PRESETS = {
  DO: { name: 'República Dominicana', currencySymbol: 'RD$', taxName: 'ITBIS', taxRate: 18, decimals: 2, dial: '1', locale: 'en-US', demoScale: 1, denoms: [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1] },
  MX: { name: 'México', currencySymbol: '$', taxName: 'IVA', taxRate: 16, decimals: 2, dial: '52', locale: 'en-US', demoScale: 0.33, denoms: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] },
  CO: { name: 'Colombia', currencySymbol: 'COP', taxName: 'IVA', taxRate: 19, decimals: 0, dial: '57', locale: 'es-CO', demoScale: 47, denoms: [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50] },
  VE: { name: 'Venezuela', currencySymbol: 'Bs', taxName: 'IVA', taxRate: 16, decimals: 2, dial: '58', locale: 'es-VE', demoScale: 0.6, denoms: [500, 200, 100, 50, 20, 10, 5, 1] },
  PE: { name: 'Perú', currencySymbol: 'S/', taxName: 'IGV', taxRate: 18, decimals: 2, dial: '51', locale: 'en-US', demoScale: 0.06, denoms: [200, 100, 50, 20, 10, 5, 2, 1] },
  EC: { name: 'Ecuador', currencySymbol: '$', taxName: 'IVA', taxRate: 15, decimals: 2, dial: '593', locale: 'en-US', demoScale: 0.017, denoms: [100, 50, 20, 10, 5, 1] },
  GT: { name: 'Guatemala', currencySymbol: 'Q', taxName: 'IVA', taxRate: 12, decimals: 2, dial: '502', locale: 'en-US', demoScale: 0.13, denoms: [200, 100, 50, 20, 10, 5, 1] },
  HN: { name: 'Honduras', currencySymbol: 'L', taxName: 'ISV', taxRate: 15, decimals: 2, dial: '504', locale: 'en-US', demoScale: 0.42, denoms: [500, 100, 50, 20, 10, 5, 2, 1] },
  SV: { name: 'El Salvador', currencySymbol: '$', taxName: 'IVA', taxRate: 13, decimals: 2, dial: '503', locale: 'en-US', demoScale: 0.017, denoms: [100, 50, 20, 10, 5, 1] },
  NI: { name: 'Nicaragua', currencySymbol: 'C$', taxName: 'IVA', taxRate: 15, decimals: 2, dial: '505', locale: 'en-US', demoScale: 0.6, denoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1] },
  CR: { name: 'Costa Rica', currencySymbol: '₡', taxName: 'IVA', taxRate: 13, decimals: 0, dial: '506', locale: 'es-CR', demoScale: 8.5, denoms: [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5] },
  PA: { name: 'Panamá', currencySymbol: 'B/.', taxName: 'ITBMS', taxRate: 7, decimals: 2, dial: '507', locale: 'en-US', demoScale: 0.017, denoms: [100, 50, 20, 10, 5, 1] },
  CL: { name: 'Chile', currencySymbol: '$', taxName: 'IVA', taxRate: 19, decimals: 0, dial: '56', locale: 'es-CL', demoScale: 16, denoms: [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 10] },
  AR: { name: 'Argentina', currencySymbol: '$', taxName: 'IVA', taxRate: 21, decimals: 2, dial: '549', locale: 'es-AR', demoScale: 18, denoms: [20000, 10000, 2000, 1000, 500, 200, 100] },
  ES: { name: 'España', currencySymbol: '€', taxName: 'IVA', taxRate: 21, decimals: 2, dial: '34', locale: 'es-ES', demoScale: 0.016, denoms: [500, 200, 100, 50, 20, 10, 5, 2, 1] },
  US: { name: 'Estados Unidos', currencySymbol: '$', taxName: 'Sales tax', taxRate: 0, decimals: 2, dial: '1', locale: 'en-US', demoScale: 0.017, denoms: [100, 50, 20, 10, 5, 1] },
  XX: { name: 'Otro / sin impuesto', currencySymbol: '$', taxName: 'Impuesto', taxRate: 0, decimals: 2, dial: '', locale: 'en-US', demoScale: 1, denoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1] },
};
/* Aplica moneda, formato, impuesto, código telefónico y denominaciones de un país */
function applyCountry(s, code) {
  const p = COUNTRY_PRESETS[code]; if (!p) return;
  Object.assign(s, { country: code, currencySymbol: p.currencySymbol, decimals: p.decimals, locale: p.locale, taxName: p.taxName, taxRate: p.taxRate, denominations: p.denoms });
  s.whatsapp.countryCode = p.dial;
}

const App = {
  user: null,
  cleanup: null,
  current: null,

  async start() {
    let linkResult = null;
    try {
      await DB.load(); await applyProvision(); await LIC.init();
      const linkCode = new URLSearchParams(location.search).get('activar');
      if (linkCode) {
        history.replaceState(null, '', location.pathname + location.hash);   // el código no queda en la barra de direcciones
        try { linkResult = await LIC.activateFromLink(linkCode); } catch (e) { linkResult = { error: e.message }; }
      }
    }
    catch (e) { console.error(e); document.body.innerHTML = `<div style="padding:40px;color:#fff">Error al cargar los datos: ${esc(e.message)}</div>`; return; }
    const uidSaved = sessionStorage.getItem('noir-user');
    this.user = DB.data.users.find(u => u.id === uidSaved && u.active) || null;
    $('#boot').remove();
    NumMask.init();
    window.addEventListener('hashchange', () => this.route());
    document.addEventListener('keydown', e => {
      if (!this.user) return;
      if (e.key === 'F1') { e.preventDefault(); location.hash = '#/pos'; }
    });
    // revisa la suscripción cada 30 minutos (por si vence con el sistema abierto)
    setInterval(() => { if (!LIC.usable() && !$('#ac-code')) this.gate(); }, 30 * 60 * 1000);
    // lista de licencias desactivadas: al iniciar y cada 6 horas (si hay internet)
    const rev = () => LIC.checkRevocation().then(() => { if (!LIC.usable() && !$('#ac-code')) this.gate(); });
    setInterval(rev, 6 * 3600 * 1000);
    this.gate();
    if (linkResult?.pl) toast(`¡Listo! Tu sistema quedó activado hasta el ${fmtDate(linkResult.pl.e)}.${linkResult.pl.u && !this.user ? ' Ahora entra con tu usuario y contraseña.' : ''}`, 'ok', 8000);
    else if (linkResult?.error) toast(linkResult.error, 'err', 9000);
    rev();
  },
  /* Bloquea con la pantalla de activación si la suscripción no está vigente */
  gate() {
    if (!LIC.usable()) { this.user = null; sessionStorage.removeItem('noir-user'); activationScreen(() => this.gate()); return; }
    if (LIC.payload?.perpetual && needsOwner()) { ownerScreen(() => this.gate()); return; }
    this.user ? this.shell() : this.login();
  },

  /* ---------- Login ---------- */
  login(mode) {
    this.user = null;
    const st = LIC.status();
    const pl = DB.data.settings.pinLogin;
    const pinUsers = DB.data.users.filter(u => u.active !== false && u.pinHash);
    const pinOn = pl.enabled;
    if (!mode) { try { mode = localStorage.getItem('noir-login-mode'); } catch (e) { } }
    if (!mode) mode = pl.defaultMode;
    if (!pinOn) mode = 'password';
    const defaultCreds = DB.data.users.some(u => u.username === 'admin' && checkPassword(u, '1234'));
    const last = (() => { try { return localStorage.getItem('noir-last-user') || ''; } catch (e) { return ''; } })();
    let sel = (pinUsers.find(u => u.username === last) || (pinUsers.length === 1 ? pinUsers[0] : null))?.id || null;
    $('#root').innerHTML = `
      <div class="login">
        <div class="login-art"><img src="assets/logo-principal.png" alt="NOIR"><div class="tagline">Sistema de gestión comercial</div></div>
        <div class="login-form"><div class="login-box">
          <h2>Bienvenido</h2>
          <p>${esc(DB.data.settings.company.name)} · ${mode === 'pin' ? 'Elige tu usuario y escribe tu PIN.' : 'Ingresa con tu usuario y contraseña.'}</p>
          ${pinOn ? `<div class="seg mb" style="display:flex"><button style="flex:1" data-mode="password" class="${mode === 'password' ? 'on' : ''}">${icon('lock', 14)} Contraseña</button><button style="flex:1" data-mode="pin" class="${mode === 'pin' ? 'on' : ''}">${icon('cash', 14)} PIN</button></div>` : ''}
          ${mode === 'pin' ? (pinUsers.length ? `
            <div class="user-pick">${pinUsers.map(u => `<button data-u="${u.id}" class="${u.id === sel ? 'on' : ''}"><span class="avatar">${initials(u.name)}</span><span>${esc(u.name.split(' ')[0])}</span><span class="small muted">${ROLES[u.role]?.label || ''}</span></button>`).join('')}</div>
            <input id="lg-pin" type="password" class="pin-input" placeholder="••••" inputmode="numeric" autocomplete="off" maxlength="8">
            <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '←'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
            <button class="btn chrome lg block" id="go">Entrar</button>`
            : `<div class="callout">Aún ningún usuario tiene PIN. Entra con tu contraseña y crea tu PIN en <b>Mi cuenta</b>.</div>`)
          : `
          <div class="field mb"><label>Usuario</label><input id="lg-user" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="usuario"></div>
          <div class="field mb"><label>Contraseña</label><div class="input-group"><input id="lg-pass" type="password" autocomplete="current-password" placeholder="••••••"><button class="btn" id="lg-eye" type="button" title="Mostrar">${icon('eye', 16)}</button></div></div>
          <button class="btn chrome lg block mt" id="go">Entrar</button>
          ${defaultCreds ? '<p class="small muted center" style="margin-top:16px">Primer acceso: usuario <b>admin</b>, contraseña <b>1234</b>. Cámbiala en Mi cuenta.</p>' : ''}`}
          ${DB.data.meta.provisionError && st.state !== 'active' ? `<div class="callout warn small" style="margin-top:14px">${esc(DB.data.meta.provisionError)}</div>` : ''}
          <div class="small muted center" style="margin-top:18px">${st.state === 'trial' ? `<span class="badge warn">Prueba gratis · ${st.daysLeft} día(s)</span> <a href="#" id="lg-act">Activar ahora</a>` : st.state === 'active' ? (st.perpetual ? `${esc(st.plan)} · permanente` : `Suscripción activa hasta ${fmtDate(st.expires)}`) : ''}</div>
          <p class="small muted center" style="margin-top:10px">${LIC.payload?.perpetual ? `<a href="#" id="lg-forgot">¿Olvidaste tu contraseña?</a>` : `¿Olvidaste tu ${mode === 'pin' ? 'PIN' : 'contraseña'}? Pide a un administrador que la restablezca${LIC_CFG.vendor ? ` o contacta a ${esc(LIC_CFG.vendor)}` : ''}.`}</p>
        </div></div>
      </div>`;
    $$('[data-mode]').forEach(b => b.onclick = () => { try { localStorage.setItem('noir-login-mode', b.dataset.mode); } catch (e) { } this.login(b.dataset.mode); });
    const act = $('#lg-act'); if (act) act.onclick = e => { e.preventDefault(); activationScreen(() => this.gate()); };
    const forgot = $('#lg-forgot'); if (forgot) forgot.onclick = e => { e.preventDefault(); forgotModal(() => this.login()); };
    const enter = (u, how) => {
      try { localStorage.setItem('noir-last-user', u.username); } catch (e) { }
      this.user = u; sessionStorage.setItem('noir-user', u.id);
      audit('Inicio de sesión', `${u.name} (${u.username}) · ${how}`); DB.commit();
      this.shell();
    };
    // bloqueo temporal tras varios intentos fallidos (compartido entre ambos modos)
    const fail = (msg, input) => {
      this._fails = (this._fails || 0) + 1; toast(msg, 'err'); input.value = ''; input.focus();
      if (this._fails >= 5) { this._lockUntil = Date.now() + 30000; this._fails = 0; toast('Demasiados intentos. Espera 30 segundos.', 'warn'); }
    };
    const locked = () => { if (this._lockUntil > Date.now()) { toast(`Espera ${Math.ceil((this._lockUntil - Date.now()) / 1000)} s para volver a intentar`, 'warn'); return true; } return false; };
    if (mode === 'pin') {
      if (!pinUsers.length) return;
      const pIn = $('#lg-pin');
      $$('[data-u]').forEach(b => b.onclick = () => { sel = b.dataset.u; $$('[data-u]').forEach(x => x.classList.toggle('on', x === b)); pIn.focus(); });
      $$('[data-k]').forEach(b => b.onclick = () => {
        const k = b.dataset.k;
        if (k === 'C') pIn.value = ''; else if (k === '←') pIn.value = pIn.value.slice(0, -1); else if (pIn.value.length < 8) pIn.value += k;
        pIn.focus();
      });
      const go = () => {
        if (locked()) return;
        if (!sel) return toast('Selecciona tu usuario', 'warn');
        const u = DB.data.users.find(x => x.id === sel);
        if (!u || !checkPin(u, pIn.value.trim())) return fail('PIN incorrecto', pIn);
        enter(u, 'PIN');
      };
      $('#go').onclick = go;
      pIn.addEventListener('keydown', e => e.key === 'Enter' && go());
      pIn.focus();
      return;
    }
    const uIn = $('#lg-user'), pIn = $('#lg-pass');
    if (last) uIn.value = last;
    $('#lg-eye').onclick = () => { pIn.type = pIn.type === 'password' ? 'text' : 'password'; pIn.focus(); };
    const go = () => {
      if (locked()) return;
      if (!uIn.value.trim()) { toast('Escribe tu usuario', 'warn'); uIn.focus(); return; }
      const u = findUserByLogin(uIn.value);
      if (!u) {
        const inactive = DB.data.users.find(x => x.active === false && credentialVariants(uIn.value).some(v => norm(v) === norm(x.username)));
        return fail(inactive ? `El usuario "${uIn.value.trim()}" está desactivado. Pide a un administrador que lo active.` : `No existe el usuario "${uIn.value.trim()}". Revisa cómo está escrito.`, uIn);
      }
      if (!checkPasswordLoose(u, pIn.value)) return fail('Contraseña incorrecta. Revisa mayúsculas y que no tenga espacios.', pIn);
      enter(u, 'contraseña');
    };
    $('#go').onclick = go;
    uIn.addEventListener('keydown', e => e.key === 'Enter' && pIn.focus());
    pIn.addEventListener('keydown', e => e.key === 'Enter' && go());
    (uIn.value ? pIn : uIn).focus();
  },
  logout() {
    sessionStorage.removeItem('noir-user');
    this.cleanup && this.cleanup(); this.cleanup = null;
    this.login();
  },
  /* ---------- Estructura ---------- */
  shell() {
    const u = this.user;
    $('#root').innerHTML = `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><img src="assets/logo-nav.png" alt="NOIR"></div>
          <nav class="nav" id="nav"></nav>
          <div class="side-foot"><div class="user-card"><span class="avatar">${initials(u.name)}</span><div><div class="u-name">${esc(u.name)}</div><div class="u-role">${ROLES[u.role]?.label} · @${esc(u.username)}</div></div><button class="icon-btn" id="myAcc" title="Mi cuenta: usuario y contraseña" style="margin-left:auto">${icon('user')}</button><button class="icon-btn" id="logout" title="Cerrar sesión" style="margin-left:0">${icon('logout')}</button></div></div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn menu-btn" id="menuBtn">${icon('menu')}</button>
            <h1 id="pageTitle"></h1>
            <div class="top-right">
              <button class="pill hide-sm hidden" id="licPill"></button>
              <button class="pill hide-sm" id="cashPill"></button>
              <span class="pill hide-sm" title="${DB.mode === 'server' ? 'Datos guardados en el servidor local (carpeta data)' : 'Datos guardados en este navegador. Haz respaldos frecuentes.'}">${icon('database', 14)} ${DB.mode === 'server' ? 'Servidor' : 'Local'}</span>
              <span class="pill hide-sm" id="clock"></span>
            </div>
          </header>
          <main class="content" id="main"></main>
        </div>
      </div>`;
    $('#logout').onclick = () => this.logout();
    $('#myAcc').onclick = () => accountModal();
    this.licPill();
    $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
    $('#cashPill').onclick = () => location.hash = '#/cash';
    const tick = () => { const c = $('#clock'); if (c) c.textContent = `${fmtDate(new Date())} · ${fmtTime(new Date())}`; };
    tick(); clearInterval(this._clock); this._clock = setInterval(tick, 20000);
    this.route();
    if (!DB.data.settings.setupDone && isAdmin()) setupWizard();
  },
  navHTML() {
    let html = '', pendingSection = null;
    NAV.forEach(n => {
      if (n.section) { pendingSection = n.section; return; }
      if (!can(n.id)) return;
      if (pendingSection) { html += `<div class="nav-section">${pendingSection}</div>`; pendingSection = null; }
      const b = n.badge ? n.badge() : 0;
      html += `<a href="#/${n.id}" data-nav="${n.id}" class="${this.current === n.id ? 'active' : ''}">${icon(n.icon)}<span>${n.label}</span>${b ? `<span class="nav-badge">${b}</span>` : ''}</a>`;
    });
    return html;
  },
  /* Aviso de prueba o de suscripción próxima a vencer */
  licPill() {
    const p = $('#licPill'); if (!p) return;
    const st = LIC.status();
    const show = st.state === 'trial' || (st.state === 'active' && st.daysLeft <= LIC_CFG.warnDays);
    p.classList.toggle('hidden', !show);
    if (!show) return;
    p.innerHTML = `<span class="dot ${st.daysLeft <= 2 ? 'err' : ''}" style="${st.daysLeft > 2 ? 'background:var(--warn)' : ''}"></span>${st.state === 'trial' ? `Prueba: ${st.daysLeft} día(s)` : st.daysLeft === 0 ? 'Suscripción vence hoy' : `Suscripción vence en ${st.daysLeft} día(s)`}`;
    p.onclick = () => isAdmin() ? (Pages.settings.tab = 'license', location.hash = '#/settings', App.route()) : toast('Pide a un administrador que renueve la suscripción', 'warn');
  },
  updateChrome() {
    const nav = $('#nav'); if (nav) nav.innerHTML = this.navHTML();
    const s = D.currentSession(), cp = $('#cashPill');
    if (cp) cp.innerHTML = `<span class="dot ${s ? 'ok' : 'err'}"></span>${s ? 'Caja abierta' : 'Caja cerrada'}`;
  },
  route() {
    if (!this.user) return;
    const [id, ...params] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    let pid = Pages[id] && can(id) ? id : null;
    if (!pid) { pid = NAV.find(n => n.id && can(n.id))?.id || 'dashboard'; if (id !== pid) { location.hash = '#/' + pid; return; } }
    this.cleanup && this.cleanup(); this.cleanup = null;
    this.current = pid;
    const page = Pages[pid];
    $('#pageTitle').textContent = page.title;
    document.title = `${page.title} · NOIR STORE`;
    const main = $('#main');
    main.innerHTML = '';
    main._act = null;
    main.scrollTop = 0; window.scrollTo(0, 0);
    $('#sidebar').classList.remove('open');
    this.updateChrome();
    try { this.cleanup = page.render(main, params.map(decodeURIComponent)) || null; }
    catch (e) { console.error(e); main.innerHTML = `<div class="callout err">Error al mostrar la página: ${esc(e.message)}</div>`; }
  },
  /* Vuelve a pintar la página actual (p. ej. tras sincronizar) */
  refresh() { if (this.user && !modalStack.length && this.current !== 'pos') this.route(); else this.updateChrome(); },
};

/* ---------- Asistente de configuración inicial ---------- */
/* Olvidé mi contraseña: el proveedor envía un código firmado que restablece el usuario del dueño */
function forgotModal(onDone) {
  const wa = LIC.contactLink('restablecer mi contraseña');
  openModal({
    title: '¿Olvidaste tu contraseña?', size: 'sm',
    body: `<p class="muted small" style="margin-top:0">Si eres empleado, pide al administrador que te la cambie en Configuración → Usuarios.<br><br>Si eres el dueño, pide a ${esc(LIC_CFG.vendor)} un <b>código para restablecer</b> y pégalo aquí${LIC.key() ? ` (tu número de licencia es <b class="mono">${esc(LIC.key())}</b>)` : ''}.</p>
      <div class="field"><label>Código para restablecer</label><textarea id="fg-code" rows="4" placeholder="NOIR1.xxxxxxxx…" style="font-family:monospace;font-size:12px;word-break:break-all"></textarea></div>`,
    footer: `${wa ? `<a class="btn ghost" href="${wa}" target="_blank" rel="noopener">${waIcon(15)} Pedir código</a>` : ''}<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Restablecer</button>`,
    onOpen: m => {
      m.$('[data-ok]').onclick = async () => {
        try {
          const pl = await LIC.activate(m.$('#fg-code').value);
          if (!pl.u) throw new Error('Ese código no trae usuario ni contraseña.');
          try { localStorage.setItem('noir-last-user', pl.u); } catch (e) { }
          m.close(); toast(`Listo. Entra con el usuario "${pl.u}" y la contraseña que te enviaron.`, 'ok', 7000); onDone();
        } catch (e) { toast(e.message, 'err', 7000); }
      };
    },
  });
}

/* App: después de activar la licencia, el dueño crea su propio usuario y contraseña */
function needsOwner() { return !DB.data.meta.ownerSet && DB.data.users.some(u => u.username === 'admin' && checkPassword(u, '1234')); }
function ownerScreen(onDone) {
  const s = DB.data.settings;
  $('#root').innerHTML = `
    <div class="login">
      <div class="login-art"><img src="assets/logo-principal.png" alt="NOIR"><div class="tagline">Sistema de gestión comercial</div></div>
      <div class="login-form"><div class="login-box" style="max-width:440px">
        <div class="badge ok" style="margin-bottom:14px">${icon('check', 12)} ${esc(LIC.payload.p)} activada</div>
        <h2>Crea tu acceso</h2><p>Con este usuario y contraseña entrarás a tu sistema. Anótalos en un lugar seguro.</p>
        <div class="field mb"><label>Nombre del negocio</label><input id="ow-biz" value="${esc(s.company.name === 'NOIR STORE' ? '' : s.company.name)}" placeholder="Mi tienda"></div>
        <div class="field mb"><label>Tu nombre</label><input id="ow-name" placeholder="Nombre y apellido"></div>
        <div class="field mb"><label>Usuario</label><input id="ow-user" autocapitalize="off" autocomplete="username" spellcheck="false" placeholder="ej. maria"></div>
        <div class="field mb"><label>Contraseña</label><input id="ow-pass" type="password" autocomplete="new-password" placeholder="Mínimo 4 caracteres"></div>
        <div class="field mb"><label>Repite la contraseña</label><input id="ow-pass2" type="password" autocomplete="new-password"></div>
        <button class="btn chrome lg block mt" id="ow-go">Guardar y entrar</button>
      </div></div>
    </div>`;
  $('#ow-go').onclick = async () => {
    const biz = $('#ow-biz').value.trim(), name = $('#ow-name').value.trim(), user = $('#ow-user').value.trim(), p1 = $('#ow-pass').value, p2 = $('#ow-pass2').value;
    if (!biz || !user) return toast('Escribe el nombre del negocio y el usuario', 'warn');
    if (/\s/.test(user)) return toast('El usuario no puede tener espacios', 'warn');
    if (p1.length < 4) return toast('La contraseña debe tener al menos 4 caracteres', 'warn');
    if (p1 !== p2) return toast('Las contraseñas no coinciden', 'warn');
    const d = DB.data, admin = d.users.find(u => u.username === 'admin' && checkPassword(u, '1234'));
    admin.username = user; if (name) admin.name = name; setPassword(admin, p1); clearPin(admin);   // sin el PIN 1234 de fábrica
    s.company.name = biz; LIC.payload.n = biz; d.meta.ownerSet = true;
    audit('Acceso del dueño creado', `Usuario ${user}`);
    DB.commit(); await DB.persist();
    try { localStorage.setItem('noir-last-user', user); } catch (e) { }
    App.user = admin; sessionStorage.setItem('noir-user', admin.id);
    toast(`¡Bienvenido, ${name || user}!`);
    onDone();
  };
}

function setupWizard() {
  const s = DB.data.settings;
  openModal({
    title: 'Configuración inicial', size: 'md',
    body: `<p class="muted" style="margin-top:0">Configura los datos básicos de tu negocio. Podrás cambiarlos luego en Configuración.</p>
      <div class="form-grid">
        <div class="field span-2"><label>Nombre del negocio</label><input name="name" value="${esc(s.company.name)}"></div>
        <div class="field span-2"><label>País (moneda e impuesto)</label><select name="country">${Object.entries(COUNTRY_PRESETS).map(([k, v]) => opt(k, `${v.name} — ${v.currencySymbol} · ${v.taxName} ${v.taxRate}%`, s.country || 'CO')).join('')}</select></div>
        <div class="field"><label>Símbolo de moneda</label><input name="currencySymbol" value="${esc(s.currencySymbol)}"></div>
        <div class="field"><label>Impuesto</label><div class="input-group"><input name="taxName" value="${esc(s.taxName)}" style="flex:1.4"><input name="taxRate" type="number" step="0.01" value="${s.taxRate}" style="flex:1"></div></div>
        <div class="field span-2"><label class="check"><input type="checkbox" name="pricesIncludeTax" ${s.pricesIncludeTax ? 'checked' : ''}> Los precios de venta ya incluyen el impuesto</label></div>
      </div>
      ${DB.data.meta.ownerSet ? '' : `<div class="callout warn mt">${icon('lock', 15)} El PIN del administrador es <b>1234</b>. Cámbialo en Configuración → Usuarios.</div>`}`,
    footer: `<button class="btn primary" data-ok>Comenzar</button>`,
    onOpen: m => {
      const apply = () => { const p = COUNTRY_PRESETS[m.$('[name=country]').value]; m.$('[name=currencySymbol]').value = p.currencySymbol; m.$('[name=taxName]').value = p.taxName; m.$('[name=taxRate]').value = p.taxRate; };
      if (!s.country) apply();
      m.$('[name=country]').onchange = apply;
      m.$('[data-ok]').onclick = () => {
        const f = readForm(m.el);
        s.company.name = f.name || 'NOIR STORE';
        applyCountry(s, f.country);
        s.currencySymbol = f.currencySymbol || '$';
        s.taxName = f.taxName || 'Impuesto'; s.taxRate = +f.taxRate || 0; s.pricesIncludeTax = f.pricesIncludeTax;
        s.setupDone = true;
        DB.commit(); m.close(); App.route();
        toast('¡Listo! Tu sistema está configurado');
      };
    },
    // si se cierra sin completar, queda configurado para Colombia (se puede cambiar en Configuración)
    onClose: () => { if (!s.setupDone) { if (!s.country) applyCountry(s, 'CO'); s.setupDone = true; DB.commit(); App.route(); } },
  });
}

window.addEventListener('DOMContentLoaded', () => App.start());
