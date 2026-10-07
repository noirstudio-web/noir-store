'use strict';
/* ==========================================================
   NOIR STORE — Garantías
   Cada producto puede tener días de garantía (o se usa el general de
   Configuración → Documentos). Aquí se registran los reclamos: se busca
   la factura, se ve si el artículo sigue en garantía y se sigue el caso.
   ========================================================== */
const WARRANTY_STATES = { recibida: ['Recibida', 'info'], revision: ['En revisión', 'warn'], resuelta: ['Resuelta', 'ok'], rechazada: ['Rechazada', ''] };
const WARRANTY_SOLUTIONS = { '': '— Pendiente —', cambio: 'Cambio por otro igual', reparacion: 'Reparación', devolucion: 'Devolución del dinero', credito: 'Saldo a favor del cliente', ninguna: 'No aplica (fuera de garantía o mal uso)' };

Pages.warranty = {
  title: 'Garantías',
  filter: 'abiertas', q: '',
  render(el) {
    const all = DB.data.warranties || [];
    const open = all.filter(w => ['recibida', 'revision'].includes(w.status));
    el.innerHTML = `
      <div class="grid g-4 mb">
        <div class="card kpi"><div class="kpi-label">${icon('alert', 15)} Abiertas</div><div class="kpi-value">${open.length}</div></div>
        <div class="card kpi"><div class="kpi-label">${icon('clock', 15)} En revisión</div><div class="kpi-value">${all.filter(w => w.status === 'revision').length}</div></div>
        <div class="card kpi"><div class="kpi-label">${icon('check', 15)} Resueltas</div><div class="kpi-value">${all.filter(w => w.status === 'resuelta').length}</div></div>
        <div class="card kpi"><div class="kpi-label">${icon('x', 15)} Rechazadas</div><div class="kpi-value">${all.filter(w => w.status === 'rechazada').length}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Reclamos de garantía</h3><span class="spacer"></span>
          <input class="search" id="wq" placeholder="Buscar factura, cliente, producto…" value="${esc(this.q)}" style="max-width:260px">
          <select id="wf">${opt('abiertas', 'Abiertas', this.filter)}${opt('todas', 'Todas', this.filter)}${Object.entries(WARRANTY_STATES).map(([k, [l]]) => opt(k, l, this.filter)).join('')}</select>
          <button class="btn primary" id="w-new">${icon('plus', 15)} Nueva garantía</button></div>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Factura</th><th>Cobertura</th><th>Estado</th><th></th></tr></thead><tbody id="wrows"></tbody></table></div>
      </div>`;
    const draw = () => {
      const words = norm(this.q).split(/\s+/).filter(Boolean);
      const rows = all.filter(w => (this.filter === 'todas' || (this.filter === 'abiertas' ? ['recibida', 'revision'].includes(w.status) : w.status === this.filter))
        && words.every(x => norm(`${w.number} ${w.invoiceNumber} ${w.customerName} ${w.itemName} ${w.reason}`).includes(x))).slice().reverse();
      $('#wrows', el).innerHTML = rows.map(w => `<tr>
        <td class="mono">${esc(w.number)}</td><td>${fmtDate(w.date)}</td><td>${esc(w.customerName || '—')}</td>
        <td class="strong">${esc(w.itemName)}<div class="small muted">${esc(w.reason)}</div></td><td class="mono">${esc(w.invoiceNumber || '—')}</td>
        <td>${w.inWarranty ? `<span class="badge ok">En garantía</span><div class="small muted">hasta ${fmtDate(w.until)}</div>` : `<span class="badge err">Fuera de garantía</span>${w.until ? `<div class="small muted">venció ${fmtDate(w.until)}</div>` : ''}`}</td>
        <td><span class="badge ${WARRANTY_STATES[w.status][1]}">${WARRANTY_STATES[w.status][0]}</span>${w.solution ? `<div class="small muted">${esc(WARRANTY_SOLUTIONS[w.solution])}</div>` : ''}</td>
        <td class="actions"><button class="btn sm" data-act="wed" data-id="${w.id}">${icon('edit', 14)} Seguimiento</button><button class="btn sm" data-act="wpr" data-id="${w.id}">${icon('printer', 14)}</button></td></tr>`).join('')
        || `<tr><td colspan="8"><div class="empty">${icon('check', 34)}<div>${all.length ? 'Sin resultados' : 'Aún no hay reclamos de garantía. Regístralos con “Nueva garantía”.'}</div></div></td></tr>`;
    };
    draw();
    $('#wq', el).oninput = e => { this.q = e.target.value; draw(); };
    $('#wf', el).onchange = e => { this.filter = e.target.value; draw(); };
    $('#w-new', el).onclick = () => warrantyNew(() => this.render(el));
    onActions(el, {
      wed: id => warrantyEdit(DB.data.warranties.find(w => w.id === id), () => this.render(el)),
      wpr: id => printWarranty(DB.data.warranties.find(w => w.id === id)),
    });
  },
};

/* Nueva garantía: buscar la factura y elegir el artículo */
function warrantyNew(onDone) {
  let inv = null;
  const m = openModal({
    title: 'Nueva garantía', size: 'md',
    body: `<div class="field mb"><label>Número de factura</label><div class="input-group"><input id="wn-inv" placeholder="Ej. ${esc(D.s.prefixes.invoice)}-000123" autocomplete="off"><button class="btn" id="wn-find">${icon('search', 15)} Buscar</button></div>
        <span class="hint">También puedes escribir el nombre o teléfono del cliente.</span></div>
      <div id="wn-res"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok disabled>Registrar garantía</button>`,
  });
  const find = () => {
    const q = norm(m.$('#wn-inv').value.trim()); if (!q) return;
    const list = DB.data.invoices.filter(i => i.status !== 'anulada' && (norm(i.number).includes(q) || norm(D.customer(i.customerId)?.name || '').includes(q) || norm(D.customer(i.customerId)?.phone || '').includes(q))).slice(-8).reverse();
    m.$('#wn-res').innerHTML = list.length ? `<div class="stack">${list.map(i => `<button class="btn block" style="justify-content:space-between" data-pick="${i.id}"><span class="mono">${esc(i.number)}</span><span>${esc(D.customer(i.customerId)?.name || '')}</span><span class="muted">${fmtDate(i.date)} · ${money(i.total)}</span></button>`).join('')}</div>`
      : '<div class="callout warn">No se encontró ninguna factura.</div>';
  };
  const pick = id => {
    inv = DB.data.invoices.find(i => i.id === id);
    const cust = D.customer(inv.customerId);
    m.$('#wn-res').innerHTML = `<div class="callout mb"><b class="mono">${esc(inv.number)}</b> · ${fmtDate(inv.date)} · ${esc(cust?.name || 'Consumidor final')}</div>
      <div class="field mb"><label>Artículo</label><select id="wn-item">${inv.items.map((it, i) => { const w = D.warrantyOf(inv, it); return opt(i, `${it.name}${it.variant ? ' · ' + it.variant : ''} — ${w.days ? (w.valid ? `en garantía hasta ${fmtDate(w.until)}` : `garantía vencida el ${fmtDate(w.until)}`) : 'sin garantía'}`); }).join('')}</select></div>
      <div id="wn-cov" class="mb"></div>
      <div class="form-grid">
        <div class="field"><label>Cantidad</label><input id="wn-qty" type="number" min="1" step="1" value="1"></div>
        <div class="field"><label>Teléfono de contacto</label><input id="wn-ph" value="${esc(cust?.phone || '')}"></div>
        <div class="field span-2"><label>Falla o motivo del reclamo *</label><textarea id="wn-reason" rows="3" placeholder="Ej. se descosió la costura, no enciende, cremallera dañada…"></textarea></div>
      </div>`;
    const cov = () => { const it = inv.items[+m.$('#wn-item').value], w = D.warrantyOf(inv, it); m.$('#wn-cov').innerHTML = w.days ? (w.valid ? `<div class="callout ok">${icon('check', 14)} En garantía: ${w.days} días desde la compra, hasta el <b>${fmtDate(w.until)}</b> (quedan ${daysBetween(today(), w.until)} días).</div>` : `<div class="callout warn">${icon('alert', 14)} La garantía de ${w.days} días venció el <b>${fmtDate(w.until)}</b>. Puedes registrarlo igual.</div>`) : '<div class="callout warn">Este artículo no tiene garantía configurada. Puedes registrarlo igual.</div>'; m.$('#wn-qty').max = it.qty; };
    cov(); m.$('#wn-item').onchange = cov;
    m.$('[data-ok]').disabled = false;
  };
  m.$('#wn-find').onclick = find;
  m.$('#wn-inv').addEventListener('keydown', e => e.key === 'Enter' && find());
  m.el.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) pick(b.dataset.pick); });
  m.$('[data-ok]').onclick = () => {
    if (!inv) return;
    const it = inv.items[+m.$('#wn-item').value], w = D.warrantyOf(inv, it), reason = m.$('#wn-reason').value.trim();
    if (!reason) return toast('Describe la falla o el motivo', 'warn');
    const qty = Math.min(it.qty, Math.max(1, Math.round(num(m.$('#wn-qty').value))));
    const cust = D.customer(inv.customerId);
    DB.data.warranties = DB.data.warranties || [];
    const seq = (D.s.seq.warranty = (D.s.seq.warranty || 1));
    const wr = { id: uid(), number: `${D.s.prefixes.warranty || 'GAR'}-${String(seq).padStart(5, '0')}`, date: nowISO(), invoiceId: inv.id, invoiceNumber: inv.number, invoiceDate: inv.date,
      customerId: inv.customerId, customerName: cust?.name || 'Consumidor final', phone: m.$('#wn-ph').value.trim(), itemName: `${it.name}${it.variant ? ' · ' + it.variant : ''}`, sku: it.sku || '', qty,
      reason, days: w.days, until: w.until, inWarranty: w.valid, status: 'recibida', solution: '', notes: '', userId: App.user.id, history: [{ date: nowISO(), status: 'recibida', note: 'Reclamo recibido', user: App.user.name }] };
    D.s.seq.warranty = seq + 1;
    DB.data.warranties.push(wr); audit('Garantía registrada', `${wr.number} · ${wr.itemName}`); DB.commit();
    m.close(); toast(`Garantía ${wr.number} registrada`); onDone && onDone();
    printWarranty(wr);
  };
}

/* Seguimiento: estado, solución y notas */
function warrantyEdit(w, onDone) {
  const m = openModal({
    title: `Garantía ${esc(w.number)}`, size: 'md',
    body: `<div class="callout mb"><b>${esc(w.itemName)}</b> × ${w.qty} · Factura <span class="mono">${esc(w.invoiceNumber)}</span> del ${fmtDate(w.invoiceDate)} · ${esc(w.customerName)}
        <div class="small" style="margin-top:4px">${w.inWarranty ? `En garantía hasta ${fmtDate(w.until)}` : 'Fuera de garantía'} · Motivo: ${esc(w.reason)}</div></div>
      <div class="form-grid">
        <div class="field"><label>Estado</label><select id="we-st">${Object.entries(WARRANTY_STATES).map(([k, [l]]) => opt(k, l, w.status)).join('')}</select></div>
        <div class="field"><label>Solución</label><select id="we-sol">${Object.entries(WARRANTY_SOLUTIONS).map(([k, l]) => opt(k, l, w.solution)).join('')}</select></div>
        <div class="field span-2"><label>Nota de seguimiento</label><textarea id="we-note" rows="2" placeholder="Ej. se envió al proveedor, se entregó prenda nueva…"></textarea></div>
      </div>
      <div class="label" style="margin:14px 0 6px">Historial</div>
      ${(w.history || []).slice().reverse().map(h => `<div class="small" style="padding:5px 0;border-bottom:1px solid var(--line)">${fmtDate(h.date)} ${fmtTime(h.date)} · <b>${esc(WARRANTY_STATES[h.status]?.[0] || h.status)}</b> ${esc(h.note || '')} <span class="muted">· ${esc(h.user || '')}</span></div>`).join('')}`,
    footer: `${w.phone && typeof WA !== 'undefined' ? `<button class="btn ghost" id="we-wa">${waIcon(15)} Avisar al cliente</button>` : ''}<button class="btn ghost" data-close>Cerrar</button><button class="btn primary" data-ok>Guardar</button>`,
  });
  const wa = m.$('#we-wa'); if (wa) wa.onclick = () => {
    const st = WARRANTY_STATES[m.$('#we-st').value][0], sol = m.$('#we-sol').value;
    WA.send({ customer: { id: w.customerId, name: w.customerName, phone: w.phone }, type: 'garantia', ref: w.number, text: `Hola ${w.customerName} 👋\nTu garantía *${w.number}* (${w.itemName}) está: *${st}*.${sol ? `\nSolución: ${WARRANTY_SOLUTIONS[sol]}.` : ''}\n\n${D.s.company.name}` });
  };
  m.$('[data-ok]').onclick = () => {
    const st = m.$('#we-st').value, sol = m.$('#we-sol').value, note = m.$('#we-note').value.trim();
    if (st === 'resuelta' && !sol) return toast('Elige la solución para marcarla como resuelta', 'warn');
    if (st === w.status && sol === w.solution && !note) return m.close();
    w.history = w.history || [];
    w.history.push({ date: nowISO(), status: st, note: [sol !== w.solution && sol ? WARRANTY_SOLUTIONS[sol] : '', note].filter(Boolean).join(' · '), user: App.user.name });
    w.status = st; w.solution = sol; if (['resuelta', 'rechazada'].includes(st)) w.closedAt = nowISO();
    audit('Garantía actualizada', `${w.number} · ${WARRANTY_STATES[st][0]}`); DB.commit();
    m.close(); toast('Garantía actualizada'); onDone && onDone();
  };
}

/* Comprobante de garantía (para entregar al cliente) */
function printWarranty(w) {
  const s = D.s;
  printHTML(`${PR.head('Comprobante de garantía', w.number, `<div>${fmtDate(w.date)}</div>`)}
    <table class="items"><tbody>
      <tr><td><b>Cliente</b></td><td>${esc(w.customerName)}${w.phone ? ' · ' + esc(w.phone) : ''}</td></tr>
      <tr><td><b>Factura</b></td><td>${esc(w.invoiceNumber)} del ${fmtDate(w.invoiceDate)}</td></tr>
      <tr><td><b>Artículo</b></td><td>${esc(w.itemName)} × ${w.qty}${w.sku ? ` (${esc(w.sku)})` : ''}</td></tr>
      <tr><td><b>Cobertura</b></td><td>${w.inWarranty ? `En garantía (${w.days} días, hasta ${fmtDate(w.until)})` : 'Fuera de garantía'}</td></tr>
      <tr><td><b>Motivo</b></td><td>${esc(w.reason)}</td></tr>
      <tr><td><b>Estado</b></td><td>${WARRANTY_STATES[w.status][0]}${w.solution ? ' · ' + WARRANTY_SOLUTIONS[w.solution] : ''}</td></tr>
    </tbody></table>
    ${s.warrantyTerms ? `<div class="notes"><b>Condiciones de la garantía:</b> ${esc(s.warrantyTerms)}</div>` : ''}
    <div class="sign"><div>Firma del cliente</div><div>Recibido por</div></div>`, 'carta');
}
