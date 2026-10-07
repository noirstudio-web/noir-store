'use strict';
/* ==========================================================
   Configuración
   ========================================================== */

const validUsername = s => /^[a-zA-Z0-9._-]{3,30}$/.test(s);
const usernameTaken = (name, exceptId) => DB.data.users.some(x => x.id !== exceptId && norm(x.username) === norm(name));

function userForm(existing, onSaved) {
  const u = existing ? clone(existing) : { name: '', username: '', role: 'cajero', active: true };
  openModal({
    title: existing ? 'Editar usuario' : 'Nuevo usuario', size: 'sm',
    body: `<div class="stack">
      <div class="field"><label>Nombre completo *</label><input name="name" value="${esc(u.name)}"></div>
      <div class="field"><label>Usuario para entrar *</label><input name="username" value="${esc(u.username)}" autocapitalize="off" spellcheck="false" placeholder="ej. maria"><span class="hint">Letras, números, punto o guion. Mínimo 3.</span></div>
      <div class="field"><label>Rol</label><select name="role">${Object.entries(ROLES).map(([k, r]) => opt(k, r.label, u.role)).join('')}</select>
        <span class="hint" id="uf-hint"></span></div>
      <div class="field"><label>Contraseña ${existing ? '<span class="muted">— vacío para no cambiarla</span>' : '*'}</label><input name="password" type="password" autocomplete="new-password" placeholder="Mínimo 4 caracteres"></div>
      <div class="field"><label>PIN de acceso rápido <span class="muted">— opcional, 4 a 8 dígitos${u.pinHash ? ' · ya tiene PIN' : ''}</span></label><input name="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="${u.pinHash ? 'Vacío para no cambiarlo' : 'Ej. 4821'}">
        ${u.pinHash ? '<label class="check small" style="margin-top:4px"><input type="checkbox" name="removePin"> Quitar el PIN de este usuario</label>' : ''}</div>
      ${LIC.has('commissions') ? `<div class="field"><label>Comisión sobre ventas (%)</label><input name="commission" type="number" min="0" max="100" step="0.1" value="${u.commission || ''}" placeholder="0"><span class="hint">Se calcula sobre la venta sin impuestos, en Reportes.</span></div>` : ''}
      <label class="check"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}> Activo</label></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Guardar</button>`,
    onOpen: m => {
      const hint = { admin: 'Acceso total al sistema.', cajero: 'Ventas, facturas, cotizaciones, clientes, cobros, caja y gastos.', vendedor: 'Punto de venta, cotizaciones y clientes.', almacen: 'Productos, inventario y compras.' };
      const sh = () => m.$('#uf-hint').textContent = hint[m.$('[name=role]').value];
      sh(); m.$('[name=role]').onchange = sh;
      m.$('[data-ok]').onclick = () => {
        const f = readForm(m.el);
        if (!f.name) return toast('El nombre es obligatorio', 'warn');
        if (!validUsername(f.username)) return toast('Usuario inválido: mínimo 3 caracteres, sin espacios', 'warn');
        if (usernameTaken(f.username, u.id)) return toast('Ese usuario ya existe', 'warn');
        if ((!existing || f.password) && String(f.password).length < 4) return toast('La contraseña debe tener al menos 4 caracteres', 'warn');
        const lim = LIC.limits().users;
        const activeOthers = DB.data.users.filter(x => x.id !== u.id && x.active !== false).length;
        if (f.active && activeOthers + 1 > lim && !(existing && existing.active !== false)) return toast(`Tu plan ${LIC.limits().name} permite máximo ${lim} usuario(s) activo(s). Mejora a Premium para agregar más.`, 'warn', 6000);
        if (f.pin && !validPin(f.pin)) return toast('El PIN debe tener entre 4 y 8 números', 'warn');
        if (f.pin && pinTaken(f.pin, u.id)) return toast('Ese PIN ya lo usa otro usuario. Elige otro.', 'warn');
        if (f.pin) setPin(u, f.pin); else if (f.removePin) clearPin(u);
        const admins = DB.data.users.filter(x => x.role === 'admin' && x.active && x.id !== u.id);
        if (existing && existing.role === 'admin' && (f.role !== 'admin' || !f.active) && !admins.length) return toast('Debe existir al menos un administrador activo', 'err');
        Object.assign(u, { name: f.name, username: f.username, role: f.role, active: f.active });
        if (f.commission !== undefined) u.commission = Math.min(100, Math.max(0, num(f.commission)));
        if (f.password) setPassword(u, f.password);
        if (existing) { const i = DB.data.users.findIndex(x => x.id === u.id); DB.data.users[i] = u; if (App.user.id === u.id) App.user = u; }
        else { u.id = uid(); u.createdAt = nowISO(); DB.data.users.push(u); }
        audit(existing ? 'Usuario editado' : 'Usuario creado', `${u.name} @${u.username} (${ROLES[u.role].label})${f.password && existing ? ' · contraseña cambiada' : ''}`);
        DB.commit(); m.close(); toast('Usuario guardado'); onSaved && onSaved();
      };
    },
  });
}

/* "Mi cuenta": cada usuario cambia su propio usuario y contraseña */
function accountFormHTML(u) {
  return `<div class="stack">
    <div class="field"><label>Nombre</label><input name="name" value="${esc(u.name)}"></div>
    <div class="field"><label>Usuario para entrar</label><input name="username" value="${esc(u.username)}" autocapitalize="off" spellcheck="false"></div>
    <div class="divider" style="margin:4px 0"></div>
    <div class="field"><label>Contraseña actual *</label><input name="current" type="password" autocomplete="current-password"><span class="hint">Necesaria para guardar cualquier cambio.</span></div>
    <div class="field"><label>Nueva contraseña</label><input name="pass1" type="password" autocomplete="new-password" placeholder="Vacío para no cambiarla"></div>
    <div class="field"><label>Confirmar nueva contraseña</label><input name="pass2" type="password" autocomplete="new-password"></div>
    ${DB.data.settings.pinLogin.enabled ? `<div class="divider" style="margin:4px 0"></div>
    <div class="field"><label>PIN de acceso rápido ${u.pinHash ? '<span class="badge ok">Activo</span>' : '<span class="badge">Sin PIN</span>'}</label>
      <input name="pin1" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="${u.pinHash ? 'Nuevo PIN (vacío para no cambiarlo)' : 'Crea tu PIN de 4 a 8 números'}"><span class="hint">Te permite entrar escribiendo solo tu PIN.</span></div>
    <div class="field"><label>Confirmar PIN</label><input name="pin2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></div>
    ${u.pinHash ? '<label class="check small"><input type="checkbox" name="removePin"> Quitar mi PIN</label>' : ''}` : ''}</div>`;
}
function saveAccount(root, onDone) {
  const u = DB.data.users.find(x => x.id === App.user.id);
  const f = readForm(root);
  if (!checkPassword(u, f.current)) return toast('La contraseña actual no es correcta', 'err');
  if (!f.name) return toast('El nombre es obligatorio', 'warn');
  if (!validUsername(f.username)) return toast('Usuario inválido: mínimo 3 caracteres, sin espacios', 'warn');
  if (usernameTaken(f.username, u.id)) return toast('Ese usuario ya lo tiene otra persona', 'warn');
  // validar todo antes de aplicar cambios
  if (f.pass1 || f.pass2) {
    if (String(f.pass1).length < 4) return toast('La nueva contraseña debe tener al menos 4 caracteres', 'warn');
    if (f.pass1 !== f.pass2) return toast('Las contraseñas nuevas no coinciden', 'warn');
  }
  if (f.pin1 || f.pin2) {
    if (!validPin(f.pin1)) return toast('El PIN debe tener entre 4 y 8 números', 'warn');
    if (f.pin1 !== f.pin2) return toast('Los PIN no coinciden', 'warn');
    if (pinTaken(f.pin1, u.id)) return toast('Ese PIN ya lo usa otro usuario. Elige otro.', 'warn');
  }
  if (f.pass1) setPassword(u, f.pass1);
  if (f.pin1) setPin(u, f.pin1); else if (f.removePin) clearPin(u);
  const changed = [u.username !== f.username && 'usuario', f.pass1 && 'contraseña', f.pin1 && 'PIN', !f.pin1 && f.removePin && 'PIN (quitado)'].filter(Boolean).join(', ');
  u.name = f.name; u.username = f.username; App.user = u;
  audit('Mi cuenta', changed ? `Cambió ${changed}` : 'Actualizó sus datos');
  DB.commit();
  try { localStorage.setItem('noir-last-user', u.username); } catch (e) { }
  toast(changed ? `Listo: ${changed} actualizado(s). Úsalos la próxima vez que entres.` : 'Datos guardados');
  onDone && onDone();
}
function accountModal() {
  openModal({
    title: 'Mi cuenta', size: 'sm', body: accountFormHTML(App.user),
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Guardar</button>`,
    onOpen: m => m.$('[data-ok]').onclick = () => saveAccount(m.el, () => { m.close(); App.shell(); }),
  });
}

Pages.settings = {
  title: 'Configuración',
  tab: 'company',
  render(el) {
    const s = D.s;
    const tabs = [['company', 'Empresa'], ['sales', 'Ventas e impuestos'], ['docs', 'Documentos'], ['loyalty', 'Puntos y apartados'], ['whatsapp', 'WhatsApp'], ['account', 'Mi cuenta'], ['users', 'Usuarios'], ['license', 'Suscripción'], ['catalogs', 'Catálogos'], ['backup', 'Respaldo y datos'], ['legal', 'Términos y privacidad'], ['sql', 'Base de datos SQL'], ['audit', 'Bitácora']];
    el.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="body"></div>`;
    $$('[data-tab]', el).forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(el); });
    const body = $('#body', el);
    const reload = () => this.render(el);
    const saveBar = `<div class="row end mt"><button class="btn primary" id="save">${icon('check', 16)} Guardar cambios</button></div>`;

    if (this.tab === 'company') {
      const c = s.company;
      body.innerHTML = `<div class="grid g-main"><div class="card card-pad"><div class="form-grid">
          <div class="field span-2"><label>Nombre comercial</label><input name="name" value="${esc(c.name)}"></div>
          <div class="field"><label>Razón social</label><input name="legalName" value="${esc(c.legalName)}"></div>
          <div class="field"><label>RNC / NIT / RUC</label><input name="taxId" value="${esc(c.taxId)}"></div>
          <div class="field span-2"><label>Dirección</label><input name="address" value="${esc(c.address)}"></div>
          <div class="field"><label>Teléfono</label><input name="phone" value="${esc(c.phone)}"></div>
          <div class="field"><label>Correo</label><input name="email" value="${esc(c.email)}"></div>
          <div class="field"><label>Sitio web / redes</label><input name="website" value="${esc(c.website)}"></div>
          <div class="field"><label>Eslogan</label><input name="slogan" value="${esc(c.slogan)}"></div></div>${saveBar}</div>
        <div class="card card-pad"><div class="label">Logo para documentos impresos</div>
          <div style="background:#fff;border-radius:10px;padding:18px;margin:10px 0;text-align:center"><img id="logo-prev" src="${PR.logo()}" style="max-height:70px"></div>
          ${LIC.has('branding') ? `<div class="row"><button class="btn sm" id="logo-up">${icon('upload', 14)} Subir logo</button>${s.customLogo ? `<button class="btn sm ghost" id="logo-rm">Usar logo NOIR</button>` : ''}</div>` : `<div class="callout warn small">${esc(LIC.upgradeMsg(PLAN_FEATURES.branding))}</div>`}
          <p class="small muted">Se usa en facturas, cotizaciones y tickets. Recomendado: PNG en negro con fondo transparente.</p></div></div>`;
      $('#save', body).onclick = () => { Object.assign(s.company, readForm(body.querySelector('.form-grid'))); DB.commit(); toast('Datos de la empresa guardados'); };
      if ($('#logo-up', body)) $('#logo-up', body).onclick = async () => {
        const f = await pickFile('image/*'); if (!f) return;
        s.customLogo = f.type === 'image/svg+xml' ? await readFileAsDataURL(f) : await (async () => { const src = await readFileAsDataURL(f); return src.length > 400000 ? resizeImage(f, 600, .9) : src; })();
        DB.commit(); reload();
      };
      const rm = $('#logo-rm', body); if (rm) rm.onclick = () => { s.customLogo = null; DB.commit(); reload(); };
    }

    else if (this.tab === 'sales') {
      body.innerHTML = `<div class="grid g-2">
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">Moneda e impuestos</h3><div class="form-grid">
          <div class="field span-2"><label>Aplicar país</label><select id="country"><option value="">— Elegir para autocompletar —</option>${Object.entries(COUNTRY_PRESETS).map(([k, v]) => opt(k, `${v.name} (${v.currencySymbol}, ${v.taxName} ${v.taxRate}%)`, s.country)).join('')}</select></div>
          <div class="field"><label>Símbolo de moneda</label><input name="currencySymbol" value="${esc(s.currencySymbol)}"></div>
          <div class="field"><label>Decimales</label><select name="decimals">${opt(2, '2 (0.00)', s.decimals)}${opt(0, '0 (sin centavos)', s.decimals)}</select></div>
          <div class="field span-2"><label>Formato de números</label><select name="locale">${opt('en-US', '1,234,567.89 (coma para miles)', s.locale)}${opt('es-CO', '1.234.567,89 (punto para miles)', s.locale)}</select></div>
          <div class="field"><label>Nombre del impuesto</label><input name="taxName" value="${esc(s.taxName)}"></div>
          <div class="field"><label>Tasa (%)</label><input name="taxRate" type="number" min="0" step="0.01" value="${s.taxRate}"></div>
          <div class="field span-2"><label class="check"><input type="checkbox" name="pricesIncludeTax" ${s.pricesIncludeTax ? 'checked' : ''}> Los precios de venta incluyen el impuesto</label></div></div></div>
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">Reglas de venta</h3><div class="form-grid">
          <div class="field"><label>Plazo de crédito por defecto (días)</label><input name="creditDefaultDays" type="number" min="0" value="${s.creditDefaultDays}"></div>
          <div class="field"><label>Interés por defecto en ventas a crédito (%)</label><input name="ciRate" type="number" min="0" max="100" step="0.1" value="${s.creditInterest.rate}"><span class="hint">0 = sin interés. Se puede cambiar en cada venta.</span></div>
          <div class="field"><label>Tipo de interés</label><select name="ciType">${opt('mensual', '% mensual (según el número de cuotas)', s.creditInterest.type)}${opt('total', '% total (una sola vez)', s.creditInterest.type)}</select></div>
          <div class="field"><label>Vigencia de cotizaciones (días)</label><input name="quoteValidityDays" type="number" min="1" value="${s.quoteValidityDays}"></div>
          <div class="field"><label>Stock mínimo por defecto</label><input name="lowStockDefault" type="number" min="0" value="${s.lowStockDefault}"></div>
          <div class="field"><label>Descuento máx. sin autorización (%)</label><input name="maxDiscountNonAdmin" type="number" min="0" max="100" value="${s.maxDiscountNonAdmin}"></div>
          <div class="field span-2"><label class="check"><input type="checkbox" name="requireCashSession" ${s.requireCashSession ? 'checked' : ''}> Exigir caja abierta para vender</label></div>
          <div class="field span-2"><label class="check"><input type="checkbox" name="allowNegativeStock" ${s.allowNegativeStock ? 'checked' : ''}> Permitir vender sin stock (inventario negativo)</label></div>
          <div class="field span-2"><label class="check"><input type="checkbox" name="sellerCanEditPrice" ${s.sellerCanEditPrice ? 'checked' : ''}> Cajeros y vendedores pueden cambiar precios en el POS</label></div></div></div>
        <div class="card card-pad span-all" style="grid-column:1/-1"><h3 style="margin:0 0 14px;font:600 15px var(--display)">Listas</h3><div class="form-grid">
          <div class="field"><label>Tallas (separadas por coma)</label><input name="sizes" value="${esc(s.sizes.join(', '))}"></div>
          <div class="field"><label>Colores</label><input name="colors" value="${esc(s.colors.join(', '))}"></div>
          <div class="field"><label>Unidades de medida</label><input name="units" value="${esc(s.units.join(', '))}"></div>
          <div class="field"><label>Denominaciones para arqueo</label><input name="denominations" value="${esc((s.denominations || []).join(', '))}"></div>
          <div class="field span-2"><label>Categorías de gastos</label><input name="expenseCategories" value="${esc(s.expenseCategories.join(', '))}"></div></div></div>
        </div>${saveBar}`;
      $('#country', body).onchange = e => { const p = COUNTRY_PRESETS[e.target.value]; if (!p) return; ['currencySymbol', 'taxName', 'taxRate', 'decimals'].forEach(k => $(`[name=${k}]`, body).value = p[k]); $('[name=locale]', body).value = p.locale === 'en-US' ? 'en-US' : 'es-CO'; $('[name=denominations]', body).value = p.denoms.join(', '); };
      $('#save', body).onclick = () => {
        const f = readForm(body);
        const list = v => String(v).split(',').map(x => x.trim()).filter(Boolean);
        const ctry = $('#country', body).value;
        if (ctry && ctry !== s.country && COUNTRY_PRESETS[ctry]) s.whatsapp.countryCode = COUNTRY_PRESETS[ctry].dial;
        Object.assign(s, {
          country: $('#country', body).value || s.country, currencySymbol: f.currencySymbol || '$', decimals: +f.decimals, locale: f.locale, taxName: f.taxName || 'Impuesto', taxRate: num(f.taxRate),
          pricesIncludeTax: f.pricesIncludeTax, creditDefaultDays: num(f.creditDefaultDays), creditInterest: { rate: Math.min(100, Math.max(0, num(f.ciRate))), type: f.ciType || 'mensual' }, quoteValidityDays: num(f.quoteValidityDays) || 15, lowStockDefault: num(f.lowStockDefault),
          maxDiscountNonAdmin: num(f.maxDiscountNonAdmin), requireCashSession: f.requireCashSession, allowNegativeStock: f.allowNegativeStock, sellerCanEditPrice: f.sellerCanEditPrice,
          sizes: list(f.sizes), colors: list(f.colors), units: list(f.units).length ? list(f.units) : ['und'], expenseCategories: list(f.expenseCategories).length ? list(f.expenseCategories) : ['Otros'],
          denominations: list(f.denominations).map(num).filter(x => x > 0).sort((a, b) => b - a),
        });
        audit('Configuración', 'Ventas e impuestos actualizados'); DB.commit(); toast('Configuración guardada');
      };
    }

    else if (this.tab === 'docs') {
      const P = s.prefixes, Q = s.seq;
      const docs = [['invoice', 'Facturas'], ['quote', 'Cotizaciones'], ['receipt', 'Recibos de pago'], ['return', 'Devoluciones'], ['purchase', 'Órdenes de compra'], ['session', 'Cajas']];
      body.innerHTML = `<div class="grid g-2">
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">Numeración</h3>
          <table class="tbl compact"><thead><tr><th>Documento</th><th>Prefijo</th><th class="num">Próximo número</th></tr></thead><tbody>
          ${docs.map(([k, l]) => `<tr><td>${l}</td><td><input data-pre="${k}" value="${esc(P[k])}" style="width:90px"></td><td class="num"><input type="number" min="1" data-seq="${k}" value="${Q[k]}" style="width:110px;text-align:right"></td></tr>`).join('')}
          </tbody></table></div>
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">Impresión</h3><div class="form-grid">
          <div class="field"><label>Formato por defecto</label><select name="defaultPrint">${opt('ticket', 'Ticket térmico', s.defaultPrint)}${opt('carta', 'Hoja carta', s.defaultPrint)}</select></div>
          <div class="field"><label>Ancho del ticket</label><select name="ticketWidth">${opt(80, '80 mm', s.ticketWidth)}${opt(58, '58 mm', s.ticketWidth)}</select></div>
          <div class="field span-2"><label class="check"><input type="checkbox" name="autoPrint" ${s.autoPrint ? 'checked' : ''}> Imprimir automáticamente al completar una venta</label></div>
          <div class="field span-2"><label>Pie del ticket</label><textarea name="ticketFooter" rows="3">${esc(s.ticketFooter)}</textarea></div></div></div>
        <div class="card card-pad"><div class="field"><label>Términos en facturas</label><textarea name="invoiceTerms" rows="4">${esc(s.invoiceTerms)}</textarea></div></div>
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">${icon('check', 16)} Garantía</h3><div class="form-grid">
          <div class="field"><label>Garantía general (días)</label><input name="warrantyDays" type="number" min="0" step="1" value="${s.warrantyDays ?? 0}"><span class="hint">Para productos sin garantía propia. 0 = sin garantía.</span></div>
          <div class="field span-2"><label>Condiciones de la garantía (salen en la factura y en el comprobante)</label><textarea name="warrantyTerms" rows="4">${esc(s.warrantyTerms || '')}</textarea></div></div></div>
        <div class="card card-pad"><div class="field"><label>Términos en cotizaciones</label><textarea name="quoteTerms" rows="4">${esc(s.quoteTerms)}</textarea></div></div>
        </div>${saveBar}`;
      $('#save', body).onclick = () => {
        const f = readForm(body);
        $$('[data-pre]', body).forEach(i => P[i.dataset.pre] = i.value.trim() || P[i.dataset.pre]);
        $$('[data-seq]', body).forEach(i => Q[i.dataset.seq] = Math.max(1, Math.round(num(i.value))));
        Object.assign(s, { defaultPrint: f.defaultPrint, ticketWidth: +f.ticketWidth, autoPrint: f.autoPrint, ticketFooter: f.ticketFooter, invoiceTerms: f.invoiceTerms, quoteTerms: f.quoteTerms, warrantyDays: Math.max(0, Math.round(num(f.warrantyDays))), warrantyTerms: f.warrantyTerms });
        audit('Configuración', 'Documentos actualizados'); DB.commit(); toast('Configuración guardada');
      };
    }

    else if (this.tab === 'loyalty') {
      const L = s.loyalty, A = s.layaway;
      const lock = f => LIC.has(f) ? '' : `<div class="callout warn mb">${esc(LIC.upgradeMsg(PLAN_FEATURES[f]))}</div>`;
      body.innerHTML = `<div class="grid g-2">
        <div class="card card-pad"><h3 style="margin:0 0 6px;font:600 15px var(--display)">${icon('spark', 17)} Programa de puntos</h3>
          <p class="muted small" style="margin-top:0">Tus clientes registrados acumulan puntos en cada compra y los usan como forma de pago.</p>${lock('loyalty')}
          <div class="form-grid">
            <label class="check span-2"><input type="checkbox" name="lEnabled" ${L.enabled ? 'checked' : ''}> Activar el programa de puntos</label>
            <div class="field"><label>1 punto por cada</label><input name="earnEvery" type="number" min="1" value="${L.earnEvery}"><span class="hint">de compra</span></div>
            <div class="field"><label>Cada punto vale</label><input name="pointValue" type="number" min="0" step="0.01" value="${L.pointValue}"><span class="hint">al pagar con puntos</span></div>
            <div class="field"><label>Mínimo de puntos para canjear</label><input name="minRedeem" type="number" min="0" value="${L.minRedeem}"></div>
            <div class="field"><label>Equivale a devolver</label><input id="lPct" readonly></div>
          </div></div>
        <div class="card card-pad"><h3 style="margin:0 0 6px;font:600 15px var(--display)">${icon('tag', 17)} Apartados (plan separe)</h3>
          <p class="muted small" style="margin-top:0">El cliente separa la mercancía con un abono y la retira cuando termina de pagar.</p>${lock('layaway')}
          <div class="form-grid">
            <div class="field"><label>Abono inicial mínimo (%)</label><input name="minDepositPct" type="number" min="0" max="100" value="${A.minDepositPct}"></div>
            <div class="field"><label>Plazo para pagar y retirar (días)</label><input name="days" type="number" min="1" value="${A.days}"></div>
          </div></div></div>${saveBar}`;
      const pct = () => { const e = num($('[name=earnEvery]', body).value), v = num($('[name=pointValue]', body).value); $('#lPct', body).value = e ? `${(v / e * 100).toFixed(2)}% de cada compra` : ''; };
      pct(); body.addEventListener('input', pct);
      $('#save', body).onclick = () => {
        const f = readForm(body);
        Object.assign(L, { enabled: f.lEnabled, earnEvery: Math.max(1, num(f.earnEvery)), pointValue: Math.max(0, num(f.pointValue)), minRedeem: Math.max(0, num(f.minRedeem)) });
        Object.assign(A, { minDepositPct: Math.min(100, Math.max(0, num(f.minDepositPct))), days: Math.max(1, num(f.days)) });
        audit('Configuración', 'Puntos y apartados'); DB.commit(); toast('Configuración guardada');
      };
    }

    else if (this.tab === 'whatsapp') {
      const w = s.whatsapp;
      const chips = kind => WA_VARS[kind].map(v => `<span class="chip" data-ins="${kind}" data-v="{${v}}" title="Insertar">{${v}}</span>`).join('');
      if (!LIC.has('whatsapp')) { body.innerHTML = `<div class="callout warn">${waIcon(16)} ${esc(LIC.upgradeMsg('Las notificaciones por WhatsApp'))}</div>`; return; }
      body.innerHTML = `<div class="grid g-2">
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">${waIcon(17)} Notificaciones a clientes</h3><div class="stack" style="gap:12px">
          <label class="check"><input type="checkbox" name="enabled" ${w.enabled ? 'checked' : ''}> Activar notificaciones por WhatsApp</label>
          <label class="check"><input type="checkbox" name="onSale" ${w.onSale ? 'checked' : ''}> Al realizar una compra (clientes registrados con teléfono)</label>
          <label class="check"><input type="checkbox" name="onPayment" ${w.onPayment ? 'checked' : ''}> Al registrar un abono a crédito</label>
          <div class="form-grid"><div class="field"><label>Código de país</label><input name="countryCode" value="${esc(w.countryCode)}" placeholder="1"><span class="hint">Se agrega a los teléfonos de 10 dígitos o menos</span></div>
          <div class="field"><label>Modo de envío</label><select name="mode">${opt('link', 'Abrir WhatsApp con el mensaje listo (gratis)', w.mode)}${opt('api', 'Automático — WhatsApp Business API', w.mode)}</select></div></div>
          <div id="wa-link" class="form-grid">
            <div class="field"><label>Abrir en</label><select name="linkTarget">${opt('web', 'WhatsApp Web / navegador', w.linkTarget)}${opt('app', 'App de WhatsApp para PC', w.linkTarget)}</select></div>
            <div class="field" style="justify-content:flex-end"><label class="check"><input type="checkbox" name="autoOpen" ${w.autoOpen ? 'checked' : ''}> Abrir automáticamente al cobrar</label></div>
            <div class="callout small span-2">Al completar la venta o el abono se abre WhatsApp con el mensaje escrito para el cliente; solo presionas <b>Enviar</b>. Si usas WhatsApp Web, permite las ventanas emergentes de este sitio.</div></div>
          <div id="wa-api" class="form-grid">
            <div class="field span-2"><label>Phone Number ID</label><input name="phoneNumberId" value="${esc(w.phoneNumberId)}" placeholder="Ej. 123456789012345"></div>
            <div class="field span-2"><label>Token de acceso permanente</label><input name="token" type="password" value="${esc(w.token)}" autocomplete="off"></div>
            <div class="field"><label>Plantilla de compra</label><input name="saleTemplate" value="${esc(w.saleTemplate)}" placeholder="Opcional"></div>
            <div class="field"><label>Plantilla de abono</label><input name="paymentTemplate" value="${esc(w.paymentTemplate)}" placeholder="Opcional"></div>
            <div class="field"><label>Idioma de plantillas</label><input name="templateLang" value="${esc(w.templateLang)}"></div>
            <div class="callout small span-2">Requiere una cuenta de <b>WhatsApp Business Platform</b> (Meta) y abrir el sistema con <b>INICIAR NOIR STORE.bat</b>. Meta solo permite mensajes libres si el cliente te escribió en las últimas 24 h; para avisos automáticos crea plantillas aprobadas con 4 variables:
              compra → {{1}} cliente, {{2}} factura, {{3}} total, {{4}} saldo · abono → {{1}} cliente, {{2}} monto, {{3}} recibo, {{4}} saldo. Si dejas la plantilla vacía se envía el texto de abajo.</div></div>
          <div class="divider" style="margin:4px 0"></div>
          <div class="field"><label>WhatsApp del dueño (resúmenes de caja, ventas e inventario)</label><input name="ownerPhoneX" value="${esc(s.ownerPhone || '')}" placeholder="Ej. 3001234567" ${LIC.has('ownerAlerts') ? '' : 'disabled'}>
            <span class="hint">${LIC.has('ownerAlerts') ? 'Recibe el cierre de caja, el resumen del día y las alertas de stock bajo.' : esc(LIC.upgradeMsg(PLAN_FEATURES.ownerAlerts))}</span></div>
          <label class="check"><input type="checkbox" name="ownerAutoX" ${s.ownerAutoClose ? 'checked' : ''} ${LIC.has('ownerAlerts') ? '' : 'disabled'}> Enviar el cierre de caja al dueño automáticamente</label>
          <div class="field"><label>Probar envío al número</label><div class="input-group"><input id="wa-test" type="tel" placeholder="Tu número de WhatsApp"><button class="btn" id="wa-send">Enviar prueba</button></div></div>
        </div></div>
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">Mensajes</h3>
          <div class="field"><label>Mensaje de compra</label><textarea name="saleMsg" rows="9">${esc(w.saleMsg)}</textarea><div class="chips" style="margin-top:6px">${chips('sale')}</div></div>
          <div class="field mt"><label>Mensaje de abono</label><textarea name="paymentMsg" rows="9">${esc(w.paymentMsg)}</textarea><div class="chips" style="margin-top:6px">${chips('payment')}</div></div>
          <div class="row mt"><button class="btn sm ghost" id="wa-reset">Restaurar mensajes</button><span class="spacer"></span><button class="btn sm" id="wa-prev">${icon('eye', 14)} Vista previa</button></div></div>
        </div>${saveBar}
        <h3 style="font:600 15px var(--display);margin:24px 0 12px">Historial de notificaciones</h3><div id="wa-log"></div>`;
      const modeSync = () => { const api = $('[name=mode]', body).value === 'api'; $('#wa-link', body).classList.toggle('hidden', api); $('#wa-api', body).classList.toggle('hidden', !api); };
      modeSync(); $('[name=mode]', body).onchange = modeSync;
      const apply = () => {
        const f = readForm(body); delete f.undefined;
        s.ownerPhone = f.ownerPhoneX || ''; s.ownerAutoClose = f.ownerAutoX; delete f.ownerPhoneX; delete f.ownerAutoX;
        Object.assign(w, f, { countryCode: String(f.countryCode).replace(/\D/g, '') });
      };
      body.addEventListener('click', e => {
        const ch = e.target.closest('[data-ins]'); if (!ch) return;
        const ta = $(`[name=${ch.dataset.ins === 'sale' ? 'saleMsg' : 'paymentMsg'}]`, body);
        const p = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, p) + ch.dataset.v + ta.value.slice(ta.selectionEnd ?? p); ta.focus();
      });
      $('#wa-reset', body).onclick = () => { const d0 = WA_DEFAULTS(); $('[name=saleMsg]', body).value = d0.saleMsg; $('[name=paymentMsg]', body).value = d0.paymentMsg; };
      $('#wa-prev', body).onclick = () => {
        const prev = clone(w); apply();
        const inv = [...DB.data.invoices].reverse().find(i => i.status !== 'anulada' && i.customerId !== 'walkin');
        const pay = [...DB.data.payments].reverse().find(p => !p.voided);
        const box = t => `<div style="white-space:pre-wrap;background:#0b141a;color:#e9edef;border-radius:10px;padding:12px 14px;font-size:13px;margin-bottom:14px;border:1px solid #1f2c33">${esc(t).replace(/\*(.+?)\*/g, '<b>$1</b>')}</div>`;
        openModal({ title: 'Vista previa', size: 'md', body: `${inv ? `<div class="label">Compra (${esc(inv.number)})</div>${box(WA.saleText(inv))}` : '<p class="muted">Aún no hay ventas a clientes registrados para la vista previa.</p>'}${pay ? `<div class="label">Abono (${esc(pay.number)})</div>${box(WA.paymentText(pay))}` : ''}` });
        Object.assign(w, prev);
      };
      $('#wa-send', body).onclick = async () => {
        apply(); DB.commit();
        const ph = $('#wa-test', body).value.trim(); if (!ph) return toast('Escribe un número', 'warn');
        await WA.send({ customer: { id: 'test', name: 'Prueba', phone: ph }, text: `✦ ${s.company.name}\nMensaje de prueba de notificaciones por WhatsApp. ¡Funciona! ✅`, type: 'prueba', ref: '' });
        logTable.refresh();
      };
      $('#save', body).onclick = () => { apply(); audit('Configuración', 'WhatsApp actualizado'); DB.commit(); toast('Configuración de WhatsApp guardada'); };
      const logTable = DataTable($('#wa-log', body), {
        placeholder: 'Buscar cliente o documento…', pageSize: 15,
        rows: () => [...DB.data.notifications].reverse(), searchText: n => `${n.customerName} ${n.ref} ${n.phone} ${n.type}`,
        columns: [
          { label: 'Fecha', html: n => `<span class="nowrap">${fmtDateTime(n.date)}</span>` },
          { label: 'Cliente', html: n => `${esc(n.customerName)}<div class="small muted">+${esc(n.phone)}</div>` },
          { label: 'Tipo', html: n => `${esc(n.type)} ${esc(n.ref || '')}` },
          { label: 'Estado', html: n => n.status === 'error' ? `<span class="badge err" title="${esc(n.error)}">Error</span><div class="small muted">${esc(n.error || '')}</div>` : n.status === 'enviado' ? '<span class="badge ok">Enviado</span>' : '<span class="badge info">Abierto en WhatsApp</span>' },
        ],
        empty: 'Aún no se han enviado notificaciones', emptyIcon: 'receipt',
      });
    }

    else if (this.tab === 'account') {
      body.innerHTML = `<div class="grid g-2"><div class="card card-pad"><h3 style="margin:0 0 4px;font:600 15px var(--display)">${icon('user', 17)} Mi usuario y contraseña</h3>
        <p class="muted small" style="margin-top:0">Cambia los datos con los que entras al sistema.</p>${accountFormHTML(App.user)}${saveBar}</div>
        <div class="card card-pad"><h3 style="margin:0 0 6px;font:600 15px var(--display)">Consejos</h3><ul class="muted" style="padding-left:18px;line-height:1.8;margin:0">
          <li>Usa una contraseña que no uses en otros sitios.</li><li>Cada empleado debe tener su propio usuario (pestaña Usuarios).</li>
          <li>Si un empleado olvida su contraseña, un administrador le asigna una nueva desde Usuarios.</li>
          <li>Si el administrador olvida la suya, ${esc(LIC_CFG.vendor)} puede enviarte un código para restablecerla.</li></ul></div></div>`;
      $('#save', body).onclick = () => saveAccount(body, () => { Pages.settings.tab = 'account'; App.shell(); });
    }

    else if (this.tab === 'license') {
      const st = LIC.status(), pl = LIC.payload;
      const stBadge = { active: '<span class="badge ok">Activa</span>', trial: '<span class="badge warn">Prueba gratis</span>', expired: '<span class="badge err">Vencida</span>', none: '<span class="badge err">Sin activar</span>', clock: '<span class="badge err">Fecha incorrecta</span>', revoked: '<span class="badge err">Desactivada</span>' }[st.state];
      const lim = LIC.limits();
      const wa = st.perpetual ? '' : LIC.contactLink('renovar mi suscripción');
      body.innerHTML = `<div class="grid g-2">
        <div class="card card-pad"><h3 style="margin:0 0 14px;font:600 15px var(--display)">${icon('lock', 17)} ${st.perpetual ? 'Tu licencia' : 'Estado de la suscripción'} ${stBadge}</h3>
          <div class="info-grid">
            <div><div class="ig-label">Plan</div><div class="ig-value">${esc(LIC.planLabel(st))}</div></div>
            ${st.perpetual ? '<div><div class="ig-label">Vigencia</div><div class="ig-value">Permanente</div></div>' : `<div><div class="ig-label">${st.state === 'trial' ? 'Prueba termina' : 'Vence'}</div><div class="ig-value">${st.expires ? fmtDate(st.expires) : '—'}</div></div>
            <div><div class="ig-label">Días restantes</div><div class="ig-value ${(st.daysLeft ?? 0) <= LIC_CFG.warnDays ? 'warn-text' : ''}">${st.daysLeft ?? 0}</div></div>`}
            <div><div class="ig-label">Licenciado a</div><div class="ig-value">${esc(pl?.n || DB.data.settings.company.name)}</div></div>
            <div><div class="ig-label">Número de licencia</div><div class="ig-value" style="font-family:monospace">${esc(LIC.key() || '—')}</div></div>
            <div><div class="ig-label">Proveedor</div><div class="ig-value">${esc(LIC_CFG.vendor)}</div></div>
          </div>
          <div class="divider"></div>
          <div class="label" style="margin-bottom:8px">Tu plan ${esc(lim.name)} incluye</div>
          <div class="info-grid" style="gap:8px">
            <div>${icon('users', 14)} ${lim.users === Infinity ? 'Usuarios ilimitados' : `Hasta ${lim.users} usuario(s) · usas ${DB.data.users.filter(u => u.active !== false).length}`}</div>
            <div>${icon('box', 14)} ${lim.products === Infinity ? 'Productos ilimitados' : `Hasta ${lim.products} productos · usas ${DB.data.products.length}`}</div>
            ${Object.entries(PLAN_FEATURES).map(([k, n]) => `<div class="${LIC.has(k) ? '' : 'muted'}">${LIC.has(k) ? '<span class="ok-text">✓</span>' : '✗'} ${n}</div>`).join('')}
          </div>
          <div class="row mt">${wa ? `<a class="btn success" href="${wa}" target="_blank" rel="noopener">${waIcon(15)} Pedir renovación por WhatsApp</a>` : ''}
          ${lim.tier === 'basic' && LIC_CFG.whatsapp ? `<a class="btn" href="${LIC.contactLink('mejorar mi plan a Premium')}" target="_blank" rel="noopener">${icon('up', 15)} Mejorar a Premium</a>` : ''}</div></div>
        <div class="card card-pad"><h3 style="margin:0 0 6px;font:600 15px var(--display)">${LIC.payload?.short ? 'Cambiar de plan o restablecer acceso' : 'Ingresar código de activación'}</h3>
          <p class="muted small" style="margin-top:0">${LIC.payload?.short ? `Las renovaciones se aplican solas cuando hay internet. ¿Te pasaste a ${lim.tier === 'basic' ? 'Premium' : 'otro plan'}? Escribe aquí el número nuevo que te entregó ${esc(LIC_CFG.vendor)}. Si te enviaron un código para restablecer tu contraseña, pégalo aquí.` : 'Pega el código de renovación o de restablecimiento de acceso que te enviaron.'}</p>
          <textarea id="lic-code" rows="${LIC.payload?.short ? 2 : 5}" placeholder="${LIC.payload?.short ? 'NOIR-A1B2-C3D4-E5F6' : 'NOIR1.xxxxxxxx…'}" style="font-family:monospace;font-size:${LIC.payload?.short ? 16 : 12}px;word-break:break-all"></textarea>
          <div class="row mt"><button class="btn primary" id="lic-go">${icon('unlock', 15)} Activar código</button>${LIC.payload?.short ? `<button class="btn ghost" id="lic-check">${icon('undo', 15)} Verificar suscripción ahora</button>` : ''}</div></div></div>`;
      const lc = $('#lic-check', body); if (lc) lc.onclick = async () => { lc.disabled = true; const ch = await LIC.refreshState(); toast(ch ? 'Suscripción actualizada' : navigator.onLine ? `Tu suscripción está al día: vence el ${fmtDate(LIC.status().expires)}` : 'Sin conexión a internet', ch ? 'ok' : 'info', 5000); reload(); App.licPill(); };
      $('#lic-go', body).onclick = async () => {
        try {
          const pl2 = await LIC.activate($('#lic-code', body).value);
          toast(pl2.credsOnly ? 'Usuario y contraseña restablecidos' : pl2.short ? `¡${pl2.p} activado!` : `Suscripción activa hasta el ${fmtDate(pl2.e)}`, 'ok', 5000);
          if (pl2.u) { toast('Se actualizaron las credenciales del administrador. Vuelve a iniciar sesión.', 'info', 6000); setTimeout(() => App.logout(), 1500); }
          else { reload(); App.licPill(); }
        } catch (e) { toast(e.message, 'err', 6000); }
      };
    }

    else if (this.tab === 'legal') {
      const acc = DB.data.meta.legalAccepted;
      body.innerHTML = `<div class="card card-pad">
        <div class="row mb"><div class="seg" id="lg-seg"><button data-lg="terms" class="on">Términos y condiciones</button><button data-lg="privacy">Política de privacidad</button></div><span class="spacer"></span>
          <span class="small muted">${acc ? `Aceptados el ${fmtDate(acc.at)} · versión ${esc(acc.version)}` : `Versión ${esc(LEGAL.version)}`}</span></div>
        <div class="legal-doc" id="lg-doc">${LEGAL.terms}</div></div>`;
      $('#lg-seg', body).onclick = e => { const b = e.target.closest('[data-lg]'); if (!b) return; $('#lg-doc', body).innerHTML = LEGAL[b.dataset.lg]; $$('#lg-seg button', body).forEach(x => x.classList.toggle('on', x === b)); };
    }

    else if (this.tab === 'users') {
      const pl = s.pinLogin;
      body.innerHTML = `<div class="card card-pad mb">
          <div class="row" style="align-items:flex-start;gap:18px">
            <div style="flex:1;min-width:240px"><h3 style="margin:0 0 4px;font:600 15px var(--display)">${icon('lock', 16)} Acceso con PIN</h3>
              <p class="muted small" style="margin:0">Permite entrar eligiendo el usuario y escribiendo un PIN de 4 a 8 números, sin escribir la contraseña. Ideal para cajeros. Cada persona crea su PIN en <b>Mi cuenta</b>, o se lo asignas tú al editar el usuario.</p></div>
            <div class="stack" style="gap:10px;min-width:260px">
              <label class="check"><input type="checkbox" id="pin-on" ${pl.enabled ? 'checked' : ''}> Permitir entrar con PIN</label>
              <div class="field"><label>Al abrir el sistema mostrar</label><select id="pin-def" ${pl.enabled ? '' : 'disabled'}>${opt('password', 'Usuario y contraseña', pl.defaultMode)}${opt('pin', 'Acceso con PIN', pl.defaultMode)}</select></div>
            </div>
          </div></div><div id="utbl"></div>`;
      const savePin = () => {
        pl.enabled = $('#pin-on', body).checked; pl.defaultMode = $('#pin-def', body).value;
        $('#pin-def', body).disabled = !pl.enabled;
        try { localStorage.removeItem('noir-login-mode'); } catch (e) { }
        audit('Configuración', `Acceso con PIN ${pl.enabled ? 'activado' : 'desactivado'} · predeterminado: ${pl.defaultMode === 'pin' ? 'PIN' : 'contraseña'}`);
        DB.commit(); toast(`Acceso con PIN ${pl.enabled ? 'activado' : 'desactivado'}`); dt.refresh();
      };
      $('#pin-on', body).onchange = savePin; $('#pin-def', body).onchange = savePin;
      const dt = DataTable($('#utbl', body), {
        search: false, toolbar: `<span class="muted small">Cada usuario entra con su usuario y contraseña${pl.enabled ? ' o con su PIN' : ''}. Las acciones quedan registradas en la bitácora.</span><span class="spacer"></span><button class="btn sm primary" id="new">${icon('plus', 14)} Nuevo usuario</button>`,
        rows: () => DB.data.users,
        columns: [
          { label: 'Usuario', html: u => `<div class="cell-main"><span class="avatar" style="width:34px;height:34px;font-size:12px">${initials(u.name)}</span><div><div class="t1">${esc(u.name)} ${u.id === App.user.id ? '<span class="badge info">Tú</span>' : ''}</div><div class="t2">@${esc(u.username || '')}</div></div></div>` },
          { label: 'Rol', html: u => `<span class="badge ${u.role === 'admin' ? 'silver' : ''}">${ROLES[u.role]?.label}</span>` },
          { label: 'PIN', html: u => u.pinHash ? (s.pinLogin.enabled ? '<span class="badge ok">Con PIN</span>' : '<span class="badge">Con PIN (desactivado)</span>') : '<span class="muted small">Sin PIN</span>' },
          { label: 'Estado', html: u => u.active !== false ? badge('abierta', 'Activo') : badge('cerrada', 'Inactivo') },
          { label: 'Ventas', cls: 'num', html: u => DB.data.invoices.filter(i => i.userId === u.id && i.status !== 'anulada').length },
          { label: '', cls: 'actions', html: u => `<button class="icon-btn" data-act="edit" data-id="${u.id}">${icon('edit', 15)}</button>${u.id !== App.user.id ? `<button class="icon-btn danger" data-act="del" data-id="${u.id}">${icon('trash', 15)}</button>` : ''}` },
        ],
      });
      $('#new', body).onclick = () => userForm(null, () => dt.refresh());
      onActions(body, {
        edit: id => userForm(DB.data.users.find(u => u.id === id), () => dt.refresh()),
        del: async id => {
          const u = DB.data.users.find(x => x.id === id);
          if (u.role === 'admin' && DB.data.users.filter(x => x.role === 'admin' && x.active).length <= 1) return toast('No puedes eliminar el único administrador', 'err');
          if (DB.data.invoices.some(i => i.userId === id)) { if (await confirmBox(`${esc(u.name)} tiene ventas registradas. ¿Desactivarlo?`, { ok: 'Desactivar' })) { u.active = false; DB.commit(); dt.refresh(); } return; }
          if (!(await confirmBox(`¿Eliminar a ${esc(u.name)}?`, { danger: true, ok: 'Eliminar' }))) return;
          DB.data.users = DB.data.users.filter(x => x.id !== id); DB.commit(); dt.refresh();
        },
      });
    }

    else if (this.tab === 'catalogs') {
      const block = (kind, title, field) => `<div class="card"><div class="card-head"><h3>${title}</h3><span class="spacer"></span><button class="btn sm primary" data-act="add" data-id="${kind}">${icon('plus', 14)} Agregar</button></div>
        ${DB.data[kind].map(x => { const n = DB.data.products.filter(p => p[field] === x.id).length; return `<div class="list-item"><div style="flex:1">${esc(x.name)}</div><span class="small muted">${n} producto(s)</span><button class="icon-btn" data-act="ren" data-id="${kind}:${x.id}">${icon('edit', 14)}</button><button class="icon-btn danger" data-act="rm" data-id="${kind}:${x.id}">${icon('trash', 14)}</button></div>`; }).join('') || '<div class="empty">Vacío</div>'}</div>`;
      body.innerHTML = `<div class="grid g-2">${block('categories', 'Categorías', 'categoryId')}${block('brands', 'Marcas', 'brandId')}</div>`;
      onActions(body, {
        add: async kind => { const n = await promptBox('Nombre', { title: 'Agregar', required: true }); if (n) { DB.data[kind].push({ id: uid(), name: n.trim() }); DB.commit(); reload(); } },
        ren: async ref => { const [kind, id] = ref.split(':'); const x = DB.data[kind].find(y => y.id === id); const n = await promptBox('Nuevo nombre', { value: x.name, required: true }); if (n) { x.name = n.trim(); DB.commit(); reload(); } },
        rm: async ref => {
          const [kind, id] = ref.split(':'); const field = kind === 'categories' ? 'categoryId' : 'brandId';
          const n = DB.data.products.filter(p => p[field] === id).length;
          if (!(await confirmBox(n ? `${n} producto(s) quedarán sin ${kind === 'categories' ? 'categoría' : 'marca'}. ¿Eliminar?` : '¿Eliminar?', { danger: true, ok: 'Eliminar' }))) return;
          DB.data.products.forEach(p => { if (p[field] === id) p[field] = ''; });
          DB.data[kind] = DB.data[kind].filter(x => x.id !== id); DB.commit(); reload();
        },
      });
    }

    else if (this.tab === 'backup') {
      const size = new Blob([JSON.stringify(DB.data)]).size;
      body.innerHTML = `<div class="grid g-2">
        <div class="card card-pad"><h3 style="margin:0 0 6px;font:600 15px var(--display)">${icon('database', 17)} Almacenamiento</h3>
          <p class="muted" style="margin-top:0">${DB.mode === 'server'
            ? 'Los datos se guardan en una <b>base de datos SQL (SQLite)</b> en la carpeta <b>data</b> del sistema (<b>noir-store.sqlite</b>), con copias diarias automáticas en <b>data/backups</b>. Puedes usar el sistema desde varias computadoras de la misma red.'
            : 'Los datos se guardan en <b>este navegador</b>. Si borras los datos del navegador se perderán: descarga respaldos con frecuencia o usa <b>INICIAR NOIR STORE.bat</b> para guardar en archivos.'}</p>
          <div class="info-grid"><div><div class="ig-label">Modo</div><div class="ig-value">${DB.mode === 'server' ? 'Servidor local' : 'Navegador'}</div></div><div><div class="ig-label">Tamaño</div><div class="ig-value">${(size / 1024).toFixed(0)} KB</div></div><div><div class="ig-label">Último guardado</div><div class="ig-value">${fmtDateTime(DB.data.meta.savedAt)}</div></div></div></div>
        <div class="card card-pad"><h3 style="margin:0 0 6px;font:600 15px var(--display)">Respaldo</h3><p class="muted" style="margin-top:0">Descarga una copia completa de toda la información (productos, ventas, clientes, configuración) o restaura una copia anterior.</p>
          <div class="row"><button class="btn primary" id="bk-dl">${icon('download', 16)} Descargar respaldo</button><button class="btn" id="bk-up">${icon('upload', 16)} Restaurar respaldo</button></div></div>
        ${isAdmin() ? `${LIC_APP ? '' : `<div class="card card-pad"><h3 style="margin:0 0 6px;font:600 15px var(--display)">Datos de demostración</h3><p class="muted" style="margin-top:0">Agrega productos, clientes y ventas de ejemplo para practicar.</p><button class="btn" id="bk-demo">${icon('spark', 15)} Cargar demo</button></div>`}
        <div class="card card-pad" style="border-color:rgba(255,97,97,.3)"><h3 style="margin:0 0 6px;font:600 15px var(--display)" class="err-text">Zona peligrosa</h3><p class="muted" style="margin-top:0">Borra movimientos (ventas, compras, caja…) conservando productos y clientes, o deja todo en ceros (se conservan la licencia, los usuarios y la configuración).</p>
          <div class="row"><button class="btn danger" id="bk-tx">Borrar transacciones</button><button class="btn danger" id="bk-all">Borrar todo</button></div></div>` : ''}</div>`;
      $('#bk-dl', body).onclick = () => { downloadFile(`noir-store-respaldo-${today()}.json`, JSON.stringify(DB.data), 'application/json'); s.lastBackup = nowISO(); DB.commit(); };
      $('#bk-up', body).onclick = async () => {
        const f = await pickFile('.json,application/json'); if (!f) return;
        let data; try { data = JSON.parse(await readFileAsText(f)); } catch (e) { return toast('Archivo inválido', 'err'); }
        if (!data || !data.meta || !Array.isArray(data.products)) return toast('El archivo no es un respaldo de NOIR STORE', 'err');
        if (!(await confirmBox(`Se reemplazarán TODOS los datos actuales por el respaldo del ${fmtDateTime(data.meta.savedAt)}. ¿Continuar?`, { danger: true, ok: 'Restaurar' }))) return;
        data.meta.rev = DB.data.meta.rev;
        DB.replaceAll(data); await DB.persist(); toast('Respaldo restaurado'); setTimeout(() => location.reload(), 700);
      };
      if (isAdmin()) {
        if ($('#bk-demo', body)) $('#bk-demo', body).onclick = async () => { if (await confirmBox('¿Agregar datos de demostración?')) { loadDemoData(); toast('Datos de demostración cargados'); App.route(); } };
        const wipe = async all => {
          const w = await promptBox(`Escribe <b>BORRAR</b> para confirmar.`.replace(/<\/?b>/g, ''), { title: all ? 'Borrar todo' : 'Borrar transacciones', required: true });
          if (w !== 'BORRAR') return w !== null && toast('Confirmación incorrecta', 'warn');
          downloadFile(`noir-store-antes-de-borrar-${today()}.json`, JSON.stringify(DB.data), 'application/json');
          if (all) { const old = DB.data, fresh = seedData(); fresh.meta = { ...old.meta }; fresh.settings = old.settings; fresh.users = old.users; if (old.license) fresh.license = old.license; fresh.brands = []; DB.replaceAll(fresh); }   // conserva licencia, usuarios y configuración
          else {
            ['movements', 'purchases', 'supplierPayments', 'quotes', 'invoices', 'payments', 'returns', 'cashSessions', 'cashMoves', 'expenses', 'held'].forEach(k => DB.data[k] = []);
            DB.data.products.forEach(p => p.variants.forEach(v => v.stock = 0));
            DB.data.customers.forEach(c => c.storeCredit = 0);
            DB.commit();
          }
          audit('Borrado de datos', all ? 'Todo' : 'Transacciones'); await DB.persist();
          toast('Datos borrados. Se descargó un respaldo previo.'); setTimeout(() => location.reload(), 900);
        };
        $('#bk-tx', body).onclick = () => wipe(false);
        $('#bk-all', body).onclick = () => wipe(true);
      }
    }

    else if (this.tab === 'sql') {
      if (DB.mode !== 'server') { body.innerHTML = `<div class="callout warn">${icon('database', 16)} La base de datos SQL funciona cuando abres el sistema con <b>INICIAR NOIR STORE.bat</b> (servidor local con Node.js). Ahora mismo los datos están en este navegador.</div>`; return; }
      body.innerHTML = '<div class="empty">Cargando información de la base de datos…</div>';
      const EXAMPLES = [
        ['Ventas por día', 'SELECT * FROM v_sales_by_day LIMIT 30'],
        ['Productos más vendidos', "SELECT name, sum(qty - returned_qty) AS unidades, round(sum(line_total), 0) AS ventas\nFROM v_invoice_items WHERE status <> 'anulada'\nGROUP BY name ORDER BY unidades DESC LIMIT 20"],
        ['Créditos y forma de pago', 'SELECT number, date, customer_name, financed, credit_interest, credit_pay_method, installments, balance, status\nFROM v_credit_invoices ORDER BY date DESC'],
        ['Pagos por forma de pago', "SELECT method AS forma_pago, kind AS tipo, count(*) AS pagos, round(sum(amount), 0) AS total\nFROM v_invoice_payments GROUP BY method, tipo ORDER BY total DESC"],
        ['Clientes que deben', 'SELECT name, phone, credit_limit, debt, store_credit, points\nFROM v_customer_balances WHERE debt > 0 ORDER BY debt DESC'],
        ['Inventario por variante', 'SELECT name, category, size, color, sku, stock, price, cost\nFROM v_stock ORDER BY CAST(stock AS REAL) ASC LIMIT 100'],
        ['Abonos del mes', "SELECT number, date, customer_name, method, amount FROM payments\nWHERE coalesce(voided, 0) = 0 AND date >= date('now', 'start of month') ORDER BY date DESC"],
        ['Gastos por categoría', 'SELECT category, count(*) AS cantidad, round(sum(amount), 0) AS total FROM expenses\nWHERE coalesce(voided, 0) = 0 GROUP BY category ORDER BY total DESC'],
      ];
      fetch('api/info', { cache: 'no-store' }).then(r => r.json()).then(info => {
        if (info.storage !== 'sqlite') { body.innerHTML = `<div class="callout warn">El servidor está usando un archivo JSON (${esc(info.file)}). Actualiza Node.js a la versión 22.13 o superior para usar la base de datos SQL.</div>`; return; }
        const tables = info.tables.filter(t => t.type === 'table'), views = info.tables.filter(t => t.type === 'view');
        body.innerHTML = `<div class="grid g-4 mb">
            <div class="card kpi"><div class="k-label">Motor</div><div class="k-value" style="font-size:19px">${esc(info.engine)}</div></div>
            <div class="card kpi"><div class="k-label">Tablas / vistas</div><div class="k-value">${tables.length} / ${views.length}</div></div>
            <div class="card kpi"><div class="k-label">Registros</div><div class="k-value">${qtyFmt(sum(tables, t => t.rows))}</div></div>
            <div class="card kpi"><div class="k-label">Tamaño</div><div class="k-value">${(info.size / 1048576).toFixed(2)} MB</div><div class="k-sub" style="word-break:break-all">${esc(info.file)}</div></div></div>
          <div class="grid" style="grid-template-columns:minmax(0,260px) minmax(0,1fr)">
            <div class="card"><div class="card-head"><h3>Tablas</h3></div><div style="max-height:520px;overflow:auto">
              ${tables.map(t => `<div class="list-item" style="cursor:pointer;padding:8px 14px" data-tbl="${t.name}" title="${esc(t.columns.join(', '))}"><span class="mono small" style="flex:1">${t.name}</span><span class="badge">${t.rows}</span></div>`).join('')}
              <div class="nav-section" style="padding:12px 14px 4px">Vistas para reportes</div>
              ${views.map(t => `<div class="list-item" style="cursor:pointer;padding:8px 14px" data-tbl="${t.name}" title="${esc(t.columns.join(', '))}"><span class="mono small" style="flex:1">${t.name}</span><span class="badge info">vista</span></div>`).join('')}
            </div></div>
            <div class="stack">
              <div class="card card-pad">
                <div class="row mb"><span class="label">Consultas de ejemplo:</span>${EXAMPLES.map((e, i) => `<span class="chip" data-ex="${i}">${e[0]}</span>`).join('')}</div>
                <textarea id="sql-q" rows="6" class="mono" style="font-family:Consolas,monospace;font-size:13px" spellcheck="false">${EXAMPLES[0][1]}</textarea>
                <div class="row mt"><button class="btn primary" id="sql-run">${icon('arrow', 15)} Ejecutar <span class="kbd">Ctrl+Enter</span></button><button class="btn" id="sql-csv">${icon('download', 15)} Exportar CSV</button>
                  <span class="spacer"></span><a class="btn" href="api/sql/backup">${icon('database', 15)} Descargar archivo .sqlite</a></div>
                <p class="small muted" style="margin-bottom:0">Solo lectura: se permiten consultas SELECT. Las columnas principales están listas para usar (por ejemplo <span class="mono">number, total, balance</span>) y el registro completo está en la columna <span class="mono">data</span> (JSON). También puedes abrir el archivo .sqlite con programas como DB Browser for SQLite.</p>
              </div>
              <div class="card"><div class="card-head"><h3>Resultado</h3><span class="spacer"></span><span class="small muted" id="sql-meta"></span></div><div class="table-wrap" style="max-height:440px;overflow:auto" id="sql-out"><div class="empty">Ejecuta una consulta</div></div></div>
            </div></div>`;
        let last = null;
        const run = async () => {
          const q = $('#sql-q', body).value;
          $('#sql-meta', body).textContent = 'Ejecutando…';
          try {
            const r = await fetch('api/sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error);
            last = j;
            $('#sql-meta', body).textContent = `${j.rows.length} fila(s)${j.truncated ? ' (primeras 1000)' : ''} · ${j.ms} ms`;
            $('#sql-out', body).innerHTML = j.rows.length ? `<table class="tbl compact"><thead><tr>${j.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${j.rows.map(r => `<tr>${r.map(v => `<td class="${typeof v === 'number' ? 'num' : ''}">${v === null ? '<span class="muted">null</span>' : esc(String(v).length > 120 ? String(v).slice(0, 120) + '…' : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty">La consulta no devolvió filas</div>';
          } catch (e) { last = null; $('#sql-meta', body).textContent = ''; $('#sql-out', body).innerHTML = `<div class="callout err" style="margin:14px">${esc(e.message)}</div>`; }
        };
        $('#sql-run', body).onclick = run;
        $('#sql-q', body).addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
        $('#sql-csv', body).onclick = () => { if (!last || !last.rows.length) return toast('Primero ejecuta una consulta con resultados', 'warn'); downloadFile(`consulta-${today()}.csv`, toCSV(last.rows, last.columns.map((c, i) => ({ label: c, value: r => r[i] }))), 'text/csv'); };
        body.addEventListener('click', e => {
          const ex = e.target.closest('[data-ex]'), tb = e.target.closest('[data-tbl]');
          if (ex) { $('#sql-q', body).value = EXAMPLES[+ex.dataset.ex][1]; run(); }
          if (tb) { const t = info.tables.find(x => x.name === tb.dataset.tbl); $('#sql-q', body).value = `SELECT ${t.columns.filter(c => c !== 'id').slice(0, 10).join(', ') || '*'}\nFROM ${t.name}\nLIMIT 100`; run(); }
        });
        run();
      }).catch(e => { body.innerHTML = `<div class="callout err">No se pudo leer la base de datos: ${esc(e.message)}</div>`; });
    }

    else if (this.tab === 'audit') {
      DataTable(body, {
        placeholder: 'Buscar acción, usuario o detalle…',
        rows: () => [...DB.data.audit].reverse(),
        searchText: a => `${a.action} ${a.userName} ${a.detail}`,
        pageSize: 50,
        columns: [
          { label: 'Fecha', html: a => `<span class="nowrap">${fmtDateTime(a.date)}</span>` },
          { label: 'Usuario', html: a => esc(a.userName || '—') },
          { label: 'Acción', html: a => `<b>${esc(a.action)}</b>` },
          { label: 'Detalle', html: a => `<span class="small">${esc(a.detail || '')}</span>` },
        ],
        empty: 'Sin registros', emptyIcon: 'clock',
      });
    }
  },
};
