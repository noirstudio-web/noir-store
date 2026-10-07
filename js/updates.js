'use strict';
/* ==========================================================
   NOIR STORE — Actualizaciones del programa para computador
   El programa busca solo (al abrir y cada 4 horas), descarga en segundo
   plano y se instala al cerrarlo. Aquí se muestra el aviso y el estado.
   Solo existe dentro del programa de Windows (window.noirApp).
   ========================================================== */
const Updates = {
  state: { state: 'idle' }, version: '', shownReady: false,
  available() { return !!window.noirApp; },
  async init() {
    if (!this.available()) return;
    try { this.version = await noirApp.version(); this.state = await noirApp.updateState(); } catch (e) { }
    noirApp.onUpdate(st => { this.state = st; this.changed(); });
  },
  changed() {
    if (!this.available()) return;
    if (this.state.state === 'ready' && !this.shownReady && App.user && !modalStack.length) { this.shownReady = true; this.readyModal(); }
    const box = document.getElementById('upd-box'); if (box) box.innerHTML = this.statusHtml();
  },
  statusHtml() {
    const s = this.state;
    const notes = s.notes ? `<div class="small muted" style="margin-top:8px;white-space:pre-line">${esc(s.notes)}</div>` : '';
    switch (s.state) {
      case 'checking': return `<div class="callout">${icon('clock', 15)} Buscando actualizaciones…</div>`;
      case 'latest': return `<div class="callout ok">${icon('check', 15)} Tienes la versión más reciente (${esc(this.version)}).</div>`;
      case 'downloading': return `<div class="callout">${icon('download', 15)} Descargando la versión <b>${esc(s.version || '')}</b>… ${s.percent || 0}%<div class="bar" style="margin-top:8px;height:6px;border-radius:4px;background:var(--line);overflow:hidden"><div style="height:100%;width:${s.percent || 0}%;background:var(--ok,#3ecf8e)"></div></div></div>${notes}`;
      case 'ready': return `<div class="callout ok">${icon('check', 15)} La versión <b>${esc(s.version || '')}</b> está lista. Se instalará sola cuando cierres el programa, o ahora mismo con “Reiniciar y actualizar”.</div>${notes}`;
      case 'error': return `<div class="callout warn">${icon('alert', 15)} No se pudo buscar actualizaciones${navigator.onLine ? '' : ' (sin internet)'}. Se intentará de nuevo más tarde.</div>`;
      case 'dev': return `<div class="callout">Modo de prueba: las actualizaciones solo funcionan en el programa instalado.</div>`;
      default: return `<div class="callout">${icon('clock', 15)} El programa busca actualizaciones solo al abrir y cada 4 horas.</div>`;
    }
  },
  readyModal() {
    const s = this.state;
    openModal({
      title: 'Actualización lista', size: 'sm',
      body: `<p style="margin-top:0">Hay una nueva versión de <b>NOIR STORE</b> (${esc(s.version || '')}) lista para instalar.</p>${s.notes ? `<div class="callout small" style="white-space:pre-line">${esc(s.notes)}</div>` : ''}<p class="muted small" style="margin-bottom:0">Tus datos no se tocan. Si prefieres, se instalará sola la próxima vez que cierres el programa.</p>`,
      footer: `<button class="btn ghost" data-close>Después</button><button class="btn primary" id="upd-now">${icon('download', 15)} Reiniciar y actualizar</button>`,
      onOpen: m => { m.$('#upd-now').onclick = () => this.installNow(); },
    });
  },
  async installNow() {
    if (this.state.state !== 'ready') return toast('La actualización todavía no está lista', 'warn');
    toast('Guardando y actualizando…');
    try { await DB.persist(); } catch (e) { }
    await noirApp.installUpdate();
  },
  async check() { if (!this.available()) return; this.state = await noirApp.checkUpdates(); this.changed(); },
};
