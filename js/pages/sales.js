'use strict';
/* ==========================================================
   Facturas, devoluciones y cotizaciones
   ========================================================== */

function dateRangeToolbar(st) {
  return `<select id="f-range" style="width:auto">${opt('today', 'Hoy')}${opt('7', 'Últimos 7 días')}${opt('month', 'Este mes', 'month')}${opt('lastmonth', 'Mes anterior')}${opt('year', 'Este año')}${opt('all', 'Todo')}${opt('custom', 'Personalizado')}</select>
    <input type="date" id="f-from" value="${st.from || ''}" style="width:auto"><input type="date" id="f-to" value="${st.to || ''}" style="width:auto">`;
}
function rangeFor(key) {
  const t = today(), d = parseDate(t);
  switch (key) {
    case 'today': return [t, t];
    case '7': return [addDays(t, -6), t];
    case 'month': return [t.slice(0, 8) + '01', t];
    case 'lastmonth': { const f = new Date(d.getFullYear(), d.getMonth() - 1, 1), l = new Date(d.getFullYear(), d.getMonth(), 0); return [dayKey(f), dayKey(l)]; }
    case 'year': return [t.slice(0, 4) + '-01-01', t];
    case 'all': return ['', ''];
    default: return null;
  }
}
function bindRange(root, st, onChange) {
  const r = $('#f-range', root), f = $('#f-from', root), t = $('#f-to', root);
  r.onchange = () => { const v = rangeFor(r.value); if (v) { [st.from, st.to] = v; f.value = st.from; t.value = st.to; } onChange(); };
  f.onchange = t.onchange = () => { st.from = f.value; st.to = t.value; r.value = 'custom'; onChange(); };
}

/* ---------- Detalle de factura ---------- */
function invoiceDetail(id, onChange) {
  const inv = DB.data.invoices.find(i => i.id === id); if (!inv) return;
  const rets = DB.data.returns.filter(r => r.invoiceId === id);
  const pays = DB.data.payments.filter(p => p.allocations.some(a => a.invoiceId === id));
  const sch = D.schedule(inv);
  const canReturn = can('returns') && inv.status !== 'anulada' && inv.items.some(i => i.returnedQty < i.qty);
  const m = openModal({
    title: `Factura ${esc(inv.number)} ${badge(inv.status)}`, size: 'lg',
    body: `<div class="info-grid mb">
        <div><div class="ig-label">Fecha</div><div class="ig-value">${fmtDateTime(inv.date)}</div></div>
        <div><div class="ig-label">Cliente</div><div class="ig-value">${esc(inv.customerName)}</div></div>
        <div><div class="ig-label">Condición</div><div class="ig-value">${inv.type === 'credito' ? 'Crédito' : 'Contado'}</div></div>
        <div><div class="ig-label">Vendedor</div><div class="ig-value">${esc(inv.userName)}</div></div>
      </div>
      ${inv.status === 'anulada' ? `<div class="callout err mb">Anulada el ${fmtDateTime(inv.voidedAt)} por ${esc(inv.voidedBy)}. Motivo: ${esc(inv.voidReason)}</div>` : ''}
      <div class="card"><table class="tbl compact"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Desc.</th><th class="num">Importe</th></tr></thead><tbody>
        ${inv.items.map(i => `<tr><td><div class="strong">${esc(i.name)}</div><div class="small muted">${esc([i.variant, i.sku].filter(Boolean).join(' · '))}${i.returnedQty ? ` · <span class="warn-text">devuelto ${qtyFmt(i.returnedQty)}</span>` : ''}</div></td><td class="num">${qtyFmt(i.qty)}</td><td class="num">${money(i.price)}</td><td class="num">${i.discount ? i.discount + '%' : ''}</td><td class="num">${money(i.lineTotal)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid g-2 mt">
        <div>
          <div class="label">Pagos</div>
          ${inv.payments.map(p => `<div class="tot-row"><span>${payLabel(p.method)}${p.ref ? ` · ${esc(p.ref)}` : ''}</span><span>${money(p.amount)}</span></div>`).join('') || '<div class="small muted">—</div>'}
          ${inv.change ? `<div class="tot-row"><span>Cambio</span><span>${money(inv.change)}</span></div>` : ''}
          ${inv.credit ? `<div class="tot-row"><span>Cuotas pagaderas en</span><b>${payLabel(inv.credit.payMethod || 'efectivo')}</b></div><div class="small muted" style="margin-top:4px">Pagado por forma de pago: ${Object.entries(D.paidByMethod(inv)).map(([k, v]) => `${payLabel(k)} ${money(v)}`).join(' · ') || '—'}</div>` : ''}
          ${inv.notes ? `<div class="small muted mt">Notas: ${esc(inv.notes)}</div>` : ''}
        </div>
        <div>
          <div class="tot-row"><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
          ${inv.discount ? `<div class="tot-row"><span>Descuento</span><span>- ${money(inv.discount)}</span></div>` : ''}
          ${inv.taxRate ? `<div class="tot-row"><span>${esc(inv.taxName)} ${inv.pricesIncludeTax ? 'incl.' : ''} ${inv.taxRate}%</span><span>${money(inv.tax)}</span></div>` : ''}
          <div class="tot-row grand"><span>TOTAL</span><span>${money(inv.total)}</span></div>
          ${inv.credit?.interest ? `<div class="tot-row"><span>Interés ${inv.credit.interestRate}% ${inv.credit.interestType === 'mensual' ? 'mensual' : 'total'}</span><span>${money(inv.credit.interest)}</span></div><div class="tot-row"><span>Total a crédito</span><span>${money(inv.credit.financed)}</span></div>` : ''}
          ${inv.type === 'credito' ? `<div class="tot-row strong" style="color:var(--warn)"><span>Saldo pendiente</span><span>${money(inv.balance)}</span></div>` : ''}
        </div>
      </div>
      ${sch.length ? `<div class="label mt">Plan de pagos</div><table class="tbl compact"><thead><tr><th>Cuota</th><th>Vence</th><th class="num">Monto</th><th class="num">Pagado</th><th>Estado</th></tr></thead><tbody>${sch.map(c => `<tr><td>${c.n}</td><td>${fmtDate(c.date)}</td><td class="num">${money(c.amount)}</td><td class="num">${money(c.paid)}</td><td>${badge(c.status)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${pays.length ? `<div class="label mt">Abonos</div>${pays.map(p => `<div class="tot-row"><span>${esc(p.number)} · ${fmtDate(p.date)} · ${payLabel(p.method)} ${p.voided ? '<span class="badge err">Anulado</span>' : ''}</span><span>${money(p.allocations.find(a => a.invoiceId === id).amount)}</span></div>`).join('')}` : ''}
      ${rets.length ? `<div class="label mt">Devoluciones</div>${rets.map(r => `<div class="tot-row"><span>${esc(r.number)} · ${fmtDate(r.date)} · ${esc(r.reason || '')}</span><span>${money(r.amount)}</span></div>`).join('')}` : ''}`,
    footer: `${inv.status !== 'anulada' && (isAdmin() || can('invoices')) ? `<button class="btn danger" id="iv-void" style="margin-right:auto">${icon('x', 15)} Anular</button>` : ''}
      ${canReturn ? `<button class="btn" id="iv-ret">${icon('undo', 15)} Devolución</button>` : ''}
      ${inv.balance > 0 && can('credits') ? `<button class="btn" id="iv-pay">${icon('cash', 15)} Abonar</button>` : ''}
      ${inv.status !== 'anulada' && WA.eligible(inv.customerId) ? `<button class="btn success" id="iv-wa">${waIcon(15)} WhatsApp</button>` : ''}
      <button class="btn" id="iv-t">${icon('receipt', 15)} Ticket</button><button class="btn primary" id="iv-c">${icon('printer', 15)} Carta</button>`,
  });
  m.$('#iv-t').onclick = () => PR.invoice(inv, 'ticket');
  const wb = m.$('#iv-wa'); if (wb) wb.onclick = () => WA.notifySale(inv, { manual: true });
  m.$('#iv-c').onclick = () => PR.invoice(inv, 'carta');
  const rb = m.$('#iv-ret'); if (rb) rb.onclick = () => { m.close(); returnModal(inv, onChange); };
  const pb = m.$('#iv-pay'); if (pb) pb.onclick = () => { m.close(); paymentModal(inv.customerId, inv.id, onChange); };
  const vb = m.$('#iv-void'); if (vb) vb.onclick = async () => {
    if (!(await adminAuth('Anular una factura requiere autorización de un administrador.'))) return;
    const reason = await promptBox('Motivo de la anulación', { title: `Anular ${inv.number}`, required: true, ok: 'Anular factura' });
    if (!reason) return;
    try { D.voidInvoice(inv.id, reason); m.close(); toast('Factura anulada. El inventario fue restituido.'); onChange && onChange(); App.updateChrome(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

/* ---------- Devolución ---------- */
function returnModal(inv, onDone) {
  const lines = inv.items.map((it, idx) => ({ idx, it, qty: 0, restock: !!it.variantId, max: round2(it.qty - it.returnedQty) })).filter(l => l.max > 0);
  const walk = inv.customerId === 'walkin';
  openModal({
    title: `Devolución · ${esc(inv.number)}`, size: 'lg',
    body: `<table class="tbl compact"><thead><tr><th>Artículo</th><th class="num">Disponible</th><th class="num">Devolver</th><th class="center">Reingresa a stock</th><th class="num">Importe</th></tr></thead><tbody>
      ${lines.map((l, i) => `<tr><td><div class="strong">${esc(l.it.name)}</div><div class="small muted">${esc(l.it.variant || '')}</div></td><td class="num">${qtyFmt(l.max)}</td>
        <td class="num"><input type="number" min="0" max="${l.max}" step="any" value="0" data-q="${i}" style="width:80px;text-align:right"></td>
        <td class="center">${l.it.variantId ? `<input type="checkbox" data-r="${i}" checked title="Desmarca si la prenda está dañada">` : '—'}</td><td class="num" data-amt="${i}">${money(0)}</td></tr>`).join('')}
      </tbody></table>
      <div class="row mt"><button class="btn sm ghost" id="rt-all">Devolver todo</button></div>
      <div class="form-grid mt">
        <div class="field"><label>Reembolso</label><select id="rt-m">${opt('efectivo', 'Efectivo')}${walk ? '' : opt('saldo', 'Saldo a favor del cliente (cambio)')}${opt('tarjeta', 'Reverso a tarjeta')}${opt('transferencia', 'Transferencia')}</select></div>
        <div class="field"><label>Motivo</label><input id="rt-reason" placeholder="Talla incorrecta, defecto, cambio…"></div>
      </div>
      ${inv.balance > 0 ? `<div class="callout warn mt">Esta factura tiene saldo pendiente de ${money(inv.balance)}. El monto devuelto se aplicará primero a la deuda.</div>` : ''}
      <div class="big-total mt"><div class="bt-label">Total a devolver</div><div class="bt-value" id="rt-tot">${money(0)}</div><div class="small muted" id="rt-sub"></div></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="rt-save">${icon('undo', 16)} Registrar devolución</button>`,
    onOpen: m => {
      const upd = () => {
        let tot = 0;
        lines.forEach((l, i) => { const a = l.it.lineTotal / l.it.qty * l.qty; tot += a; m.$(`[data-amt="${i}"]`).textContent = money(a); });
        tot = round2(tot);
        m.$('#rt-tot').textContent = money(tot);
        const debt = Math.min(inv.balance, tot);
        m.$('#rt-sub').textContent = debt > 0 ? `${money(debt)} a la deuda · ${money(tot - debt)} reembolso` : '';
      };
      m.el.addEventListener('input', e => {
        if (e.target.dataset.q !== undefined) { const l = lines[+e.target.dataset.q]; l.qty = Math.min(l.max, Math.max(0, num(e.target.value))); upd(); }
        if (e.target.dataset.r !== undefined) lines[+e.target.dataset.r].restock = e.target.checked;
      });
      m.$('#rt-all').onclick = () => { lines.forEach((l, i) => { l.qty = l.max; m.$(`[data-q="${i}"]`).value = l.max; }); upd(); };
      m.$('#rt-save').onclick = async () => {
        if (!lines.some(l => l.qty > 0)) return toast('Indica las cantidades a devolver', 'warn');
        if (!isAdmin() && !(await adminAuth('Las devoluciones requieren autorización.'))) return;
        try {
          const r = D.registerReturn({ invoiceId: inv.id, lines: lines.filter(l => l.qty > 0).map(l => ({ idx: l.idx, qty: l.qty, restock: l.restock })), method: m.$('#rt-m').value, reason: m.$('#rt-reason').value.trim() });
          m.close();
          openModal({
            title: 'Devolución registrada', size: 'sm',
            body: `<div class="center"><div class="success-mark">${icon('undo', 28)}</div><h3 style="margin:0">${esc(r.number)}</h3><p class="muted">Total ${money(r.amount)}${r.appliedToDebt ? ` · ${money(r.appliedToDebt)} aplicado a la deuda` : ''}${r.refund ? ` · Reembolso ${payLabel(r.method)} ${money(r.refund)}` : ''}</p></div>`,
            footer: `<button class="btn ghost" data-close>Cerrar</button><button class="btn primary" id="rp">${icon('printer', 15)} Imprimir nota</button>`,
            onOpen: mm => mm.$('#rp').onclick = () => PR.returnDoc(r),
          });
          onDone && onDone(); App.updateChrome();
        } catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

/* ---------- Página: Facturas ---------- */
Pages.invoices = {
  title: 'Facturas',
  tab: 'list',
  render(el) {
    const st = { from: rangeFor('month')[0], to: today(), status: '', type: '' };
    el.innerHTML = `<div class="tabs">${[['list', 'Facturas'], ['returns', 'Devoluciones']].map(([k, l]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="kpis" class="grid g-4 mb"></div><div id="tbl"></div>`;
    $$('[data-tab]', el).forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(el); });
    if (this.tab === 'returns') {
      $('#kpis', el).remove();
      const dt = DataTable($('#tbl', el), {
        placeholder: 'Buscar número, factura o cliente…',
        toolbar: dateRangeToolbar(st),
        rows: () => DB.data.returns.filter(r => inRange(r.date, st.from, st.to)).sort((a, b) => b.date.localeCompare(a.date)),
        searchText: r => `${r.number} ${r.invoiceNumber} ${r.customerName} ${r.reason}`,
        columns: [
          { label: 'Número', html: r => `<b>${esc(r.number)}</b>` },
          { label: 'Fecha', html: r => fmtDateTime(r.date) },
          { label: 'Factura', html: r => esc(r.invoiceNumber) },
          { label: 'Cliente', html: r => esc(r.customerName) },
          { label: 'Motivo', html: r => `<span class="small">${esc(r.reason || '—')}</span>` },
          { label: 'Reembolso', html: r => `${r.refund ? payLabel(r.method) : '—'}${r.appliedToDebt ? '<div class="small muted">aplicado a deuda</div>' : ''}` },
          { label: 'Total', cls: 'num', html: r => money(r.amount) },
          { label: '', cls: 'actions', html: r => `<button class="icon-btn" data-act="print" data-id="${r.id}">${icon('printer', 15)}</button>` },
        ],
        footer: rows => `<tr><td colspan="6">${rows.length} devoluciones</td><td class="num">${money(sum(rows, r => r.amount))}</td><td></td></tr>`,
        empty: 'Sin devoluciones en el periodo', emptyIcon: 'undo',
      });
      bindRange(el, st, () => dt.refresh());
      onActions(el, { print: id => PR.returnDoc(DB.data.returns.find(r => r.id === id)) });
      return;
    }
    const rowsFn = () => DB.data.invoices.filter(i => inRange(i.date, st.from, st.to) && (!st.status || i.status === st.status || (st.status === 'vencida' && D.overdueDays(i) > 0)) && (!st.type || i.type === st.type)).sort((a, b) => b.date.localeCompare(a.date));
    const kpis = rows => {
      const ok = rows.filter(i => i.status !== 'anulada');
      $('#kpis', el).innerHTML = `<div class="card kpi"><div class="k-label">Total facturado</div><div class="k-value">${money(sum(ok, D.invoiceNet))}</div><div class="k-sub">${ok.length} facturas</div></div>
        <div class="card kpi"><div class="k-label">Contado</div><div class="k-value">${money(sum(ok.filter(i => i.type === 'contado'), i => i.total))}</div></div>
        <div class="card kpi"><div class="k-label">Crédito (saldo)</div><div class="k-value">${money(sum(ok, i => i.balance))}</div></div>
        <div class="card kpi"><div class="k-label">Anuladas</div><div class="k-value">${rows.length - ok.length}</div></div>`;
    };
    const dt = DataTable($('#tbl', el), {
      placeholder: 'Buscar número, cliente, producto…',
      toolbar: `${dateRangeToolbar(st)}<select id="f-st" style="width:auto">${opt('', 'Todos los estados')}${['pagada', 'pendiente', 'parcial', 'vencida', 'anulada'].map(s => opt(s, s[0].toUpperCase() + s.slice(1))).join('')}</select>
        <select id="f-ty" style="width:auto">${opt('', 'Contado y crédito')}${opt('contado', 'Contado')}${opt('credito', 'Crédito')}</select><span class="spacer"></span><button class="btn sm" id="b-csv">${icon('download', 14)} CSV</button>`,
      rows: rowsFn,
      searchText: i => `${i.number} ${i.customerName} ${i.userName} ${i.items.map(x => x.name + ' ' + x.sku).join(' ')}`,
      rowAttrs: i => `class="clickable" data-act="view" data-id="${i.id}"`,
      columns: [
        { label: 'Número', html: i => `<b>${esc(i.number)}</b>` },
        { label: 'Fecha', html: i => `<span class="nowrap">${fmtDateTime(i.date)}</span>` },
        { label: 'Cliente', html: i => esc(i.customerName) },
        { label: 'Tipo', html: i => i.type === 'credito' ? '<span class="badge info">Crédito</span>' : '<span class="badge">Contado</span>' },
        { label: 'Vendedor', html: i => `<span class="small muted">${esc(i.userName)}</span>` },
        { label: 'Total', cls: 'num', html: i => `<span class="${i.status === 'anulada' ? 'muted' : ''}" style="${i.status === 'anulada' ? 'text-decoration:line-through' : ''}">${money(i.total)}</span>` },
        { label: 'Saldo', cls: 'num', html: i => i.balance > 0 ? `<span class="warn-text">${money(i.balance)}</span>` : '<span class="muted">—</span>' },
        { label: 'Estado', html: i => D.overdueDays(i) > 0 ? badge('vencida', `Vencida ${D.overdueDays(i)}d`) : badge(i.status) },
        { label: '', cls: 'actions', html: i => `<button class="icon-btn" data-act="print" data-id="${i.id}" title="Imprimir">${icon('printer', 15)}</button>` },
      ],
      onDraw: kpis,
      empty: 'Sin facturas en el periodo', emptyIcon: 'file',
    });
    bindRange(el, st, () => dt.refresh());
    $('#f-st', el).onchange = e => { st.status = e.target.value; dt.refresh(); };
    $('#f-ty', el).onchange = e => { st.type = e.target.value; dt.refresh(); };
    $('#b-csv', el).onclick = () => downloadFile(`facturas-${st.from || 'todo'}-${st.to || ''}.csv`, toCSV(dt.rows(), [
      { label: 'Número', value: i => i.number }, { label: 'Fecha', value: i => fmtDateTime(i.date) }, { label: 'Cliente', value: i => i.customerName }, { label: 'Documento', value: i => i.customerDoc },
      { label: 'Tipo', value: i => i.type }, { label: 'Estado', value: i => i.status }, { label: 'Subtotal', value: i => i.subtotal }, { label: 'Descuento', value: i => i.discount },
      { label: D.s.taxName, value: i => i.tax }, { label: 'Total', value: i => i.total }, { label: 'Saldo', value: i => i.balance },
      { label: 'Pagos', value: i => i.payments.map(p => `${payLabel(p.method)} ${p.amount}`).join(' | ') }, { label: 'Vendedor', value: i => i.userName },
    ]), 'text/csv');
    onActions(el, {
      view: id => invoiceDetail(id, () => dt.refresh()),
      print: id => PR.invoice(DB.data.invoices.find(i => i.id === id)),
    });
  },
};

/* ---------- Cotizaciones ---------- */
function quoteForm(existing, onSaved, template = null) {
  const q = existing ? clone(existing) : template ? clone(template) : { customerId: 'walkin', items: [], gd: 0, gdType: 'percent', validUntil: addDays(today(), D.s.quoteValidityDays), notes: '' };
  const m = openModal({
    title: existing ? `Editar cotización ${esc(q.number)}` : 'Nueva cotización', size: 'xl',
    body: `<div class="form-grid c4 mb">
        <div class="field span-2"><label>Cliente</label><div class="input-group"><input id="qf-cust" readonly style="cursor:pointer"><button class="btn" id="qf-pick">${icon('users', 15)} Elegir</button></div></div>
        <div class="field"><label>Válida hasta</label><input type="date" id="qf-valid" value="${q.validUntil}"></div>
        <div class="field"><label>Descuento general</label><div class="input-group"><input type="number" id="qf-gd" min="0" step="0.01" value="${q.gd || ''}"><select id="qf-gdt" style="width:70px">${opt('percent', '%', q.gdType)}${opt('amount', '$', q.gdType)}</select></div></div>
      </div>
      <div class="row mb"><button class="btn sm primary" id="qf-add">${icon('plus', 14)} Agregar productos</button><button class="btn sm" id="qf-free">${icon('plus', 14)} Línea libre</button>
        <span class="spacer"></span><label class="check small"><input type="checkbox" id="qf-may"> Usar precio mayoreo al agregar</label></div>
      <div class="card"><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Desc. %</th><th class="num">Importe</th><th></th></tr></thead><tbody id="qf-rows"></tbody></table></div></div>
      <div class="grid g-2 mt"><div class="field"><label>Observaciones</label><textarea id="qf-notes" rows="3">${esc(q.notes)}</textarea></div><div id="qf-tot"></div></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="qf-save">${icon('check', 15)} Guardar</button><button class="btn primary" id="qf-saveprint">${icon('printer', 15)} Guardar e imprimir</button>`,
  });
  const drawCust = () => { m.$('#qf-cust').value = D.customer(q.customerId)?.name || 'Consumidor final'; };
  const draw = () => {
    q.gd = num(m.$('#qf-gd').value); q.gdType = m.$('#qf-gdt').value;
    const t = D.totals(q.items, q.gd, q.gdType);
    m.$('#qf-rows').innerHTML = q.items.map((it, i) => `<tr><td><input data-f="name" data-i="${i}" value="${esc(it.name)}" style="min-width:200px">${it.variant ? `<div class="small muted">${esc(it.variant)} · ${esc(it.sku)}</div>` : ''}</td>
      <td class="num"><input type="number" min="0" step="any" data-f="qty" data-i="${i}" value="${it.qty}" style="width:80px;text-align:right"></td>
      <td class="num"><input type="number" min="0" step="0.01" data-f="price" data-i="${i}" value="${it.price}" style="width:110px;text-align:right"></td>
      <td class="num"><input type="number" min="0" max="100" step="0.5" data-f="discount" data-i="${i}" value="${it.discount || ''}" style="width:70px;text-align:right"></td>
      <td class="num strong">${money(t.lines[i].total)}</td><td class="actions"><button class="icon-btn danger" data-rm="${i}">${icon('trash', 14)}</button></td></tr>`).join('')
      || '<tr><td colspan="6"><div class="empty">Agrega productos a la cotización</div></td></tr>';
    m.$('#qf-tot').innerHTML = `<div class="tot-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.discount ? `<div class="tot-row"><span>Descuento</span><span>- ${money(t.discount)}</span></div>` : ''}
      ${D.s.taxRate ? `<div class="tot-row"><span>${esc(D.s.taxName)} ${D.s.pricesIncludeTax ? 'incluido' : ''}</span><span>${money(t.tax)}</span></div>` : ''}<div class="tot-row grand"><span>TOTAL</span><span>${money(t.total)}</span></div>`;
  };
  drawCust(); draw();
  const pick = () => chooseCustomer(id => { q.customerId = id; drawCust(); });
  m.$('#qf-pick').onclick = pick; m.$('#qf-cust').onclick = pick;
  m.$('#qf-gd').onchange = draw; m.$('#qf-gdt').onchange = draw;
  m.$('#qf-add').onclick = () => pickVariantModal((p, v) => {
    const ex = q.items.find(i => i.variantId === v.id);
    if (ex) ex.qty++;
    else q.items.push({ variantId: v.id, productId: p.id, name: p.name, variant: D.vLabel(v), sku: v.sku, qty: 1, price: m.$('#qf-may').checked && +p.price2 > 0 ? +p.price2 : D.vPrice(p, v), discount: 0, cost: D.vCost(p, v), taxable: p.taxable !== false });
    draw();
  });
  m.$('#qf-free').onclick = () => freeItemModal(it => { const { key, ...rest } = it; q.items.push(rest); draw(); });
  m.el.addEventListener('change', e => {
    const f = e.target.dataset.f; if (!f) return;
    const it = q.items[+e.target.dataset.i];
    it[f] = f === 'name' ? e.target.value : num(e.target.value);
    if (f === 'qty' && it.qty <= 0) q.items.splice(+e.target.dataset.i, 1);
    draw();
  });
  m.el.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { q.items.splice(+r.dataset.rm, 1); draw(); } });
  const save = print => {
    if (!q.items.length) return toast('Agrega al menos un artículo', 'warn');
    q.validUntil = m.$('#qf-valid').value; q.notes = m.$('#qf-notes').value.trim();
    q.gd = num(m.$('#qf-gd').value); q.gdType = m.$('#qf-gdt').value;
    const saved = D.saveQuote(q);
    m.close(); toast(`Cotización ${saved.number} guardada`);
    if (print) PR.quote(saved);
    onSaved && onSaved(saved);
  };
  m.$('#qf-save').onclick = () => save(false);
  m.$('#qf-saveprint').onclick = () => save(true);
}

Pages.quotes = {
  title: 'Cotizaciones',
  render(el, params) {
    const st = { status: '' };
    el.innerHTML = `<div class="page-head"><div class="muted">Crea cotizaciones, imprímelas y conviértelas en venta con un clic.</div><span class="spacer"></span><button class="btn primary" id="new">${icon('plus', 16)} Nueva cotización</button></div><div id="tbl"></div>`;
    const dt = DataTable($('#tbl', el), {
      placeholder: 'Buscar número o cliente…',
      toolbar: `<select id="f-st" style="width:auto">${opt('', 'Todos los estados')}${['pendiente', 'aceptada', 'facturada', 'rechazada', 'vencida'].map(s => opt(s, s[0].toUpperCase() + s.slice(1))).join('')}</select>`,
      rows: () => DB.data.quotes.filter(q => !st.status || D.quoteStatus(q) === st.status).sort((a, b) => b.date.localeCompare(a.date)),
      searchText: q => `${q.number} ${q.customerName} ${q.items.map(i => i.name).join(' ')}`,
      columns: [
        { label: 'Número', html: q => `<b>${esc(q.number)}</b>` },
        { label: 'Fecha', html: q => fmtDate(q.date) },
        { label: 'Cliente', html: q => esc(q.customerName) },
        { label: 'Artículos', cls: 'num', html: q => qtyFmt(sum(q.items, i => i.qty)) },
        { label: 'Total', cls: 'num', html: q => `<b>${money(q.total)}</b>` },
        { label: 'Válida hasta', html: q => fmtDate(q.validUntil) },
        { label: 'Estado', html: q => { const s = D.quoteStatus(q); return badge(s) + (q.invoiceNumber ? `<div class="small muted">${esc(q.invoiceNumber)}</div>` : ''); } },
        { label: '', cls: 'actions', html: q => { const s = D.quoteStatus(q); return `
          ${s !== 'facturada' && can('pos') ? `<button class="btn sm success" data-act="sell" data-id="${q.id}" title="Convertir en venta">${icon('pos', 14)} Facturar</button>` : ''}
          <button class="icon-btn" data-act="print" data-id="${q.id}" title="Imprimir">${icon('printer', 15)}</button>
          <button class="icon-btn" data-act="dup" data-id="${q.id}" title="Duplicar">${icon('copy', 15)}</button>
          ${s !== 'facturada' ? `<button class="icon-btn" data-act="edit" data-id="${q.id}" title="Editar">${icon('edit', 15)}</button><button class="icon-btn" data-act="status" data-id="${q.id}" title="Cambiar estado">${icon('check', 15)}</button><button class="icon-btn danger" data-act="del" data-id="${q.id}" title="Eliminar">${icon('trash', 15)}</button>` : ''}`; } },
      ],
      empty: 'No hay cotizaciones', emptyIcon: 'quote',
    });
    $('#f-st', el).onchange = e => { st.status = e.target.value; dt.refresh(); };
    $('#new', el).onclick = () => quoteForm(null, () => dt.refresh());
    if (params[0] === 'new') { history.replaceState(null, '', '#/quotes'); quoteForm(null, () => dt.refresh()); }
    onActions(el, {
      sell: id => { location.hash = `#/pos/quote/${id}`; },
      print: id => PR.quote(DB.data.quotes.find(q => q.id === id)),
      edit: id => quoteForm(DB.data.quotes.find(q => q.id === id), () => dt.refresh()),
      dup: id => {
        const c = clone(DB.data.quotes.find(q => q.id === id));
        ['id', 'number', 'date', 'status', 'invoiceId', 'invoiceNumber', 'userId', 'userName'].forEach(k => delete c[k]);
        c.validUntil = addDays(today(), D.s.quoteValidityDays);
        quoteForm(null, () => dt.refresh(), c);
      },
      status: id => {
        const q = DB.data.quotes.find(x => x.id === id);
        openModal({
          title: `Estado de ${esc(q.number)}`, size: 'sm',
          body: `<div class="stack">${['pendiente', 'aceptada', 'rechazada'].map(s => `<button class="btn block ${q.status === s ? 'primary' : ''}" data-s="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>`,
          onOpen: m => m.el.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { q.status = b.dataset.s; DB.commit(); m.close(); dt.refresh(); } }),
        });
      },
      del: async id => {
        if (!(await confirmBox('¿Eliminar esta cotización?', { danger: true, ok: 'Eliminar' }))) return;
        DB.data.quotes = DB.data.quotes.filter(q => q.id !== id); DB.commit(); dt.refresh();
      },
    });
  },
};
