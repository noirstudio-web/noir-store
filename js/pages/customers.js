'use strict';
/* ==========================================================
   Clientes, créditos y cobros
   ========================================================== */

function customerForm(existing, onSaved) {
  const c = existing ? clone(existing) : { name: '', docId: '', phone: '', email: '', address: '', creditLimit: 0, creditDays: D.s.creditDefaultDays, notes: '', storeCredit: 0 };
  const canCredit = isAdmin() || can('credits');
  openModal({
    title: existing ? 'Editar cliente' : 'Nuevo cliente', size: 'md',
    body: `<div class="form-grid">
      <div class="field span-2"><label>Nombre o razón social *</label><input name="name" value="${esc(c.name)}"></div>
      <div class="field"><label>Cédula / RNC / NIT</label><input name="docId" value="${esc(c.docId)}"></div>
      <div class="field"><label>Teléfono / WhatsApp</label><input name="phone" type="tel" value="${esc(c.phone)}" placeholder="Ej. 809-555-1234"><span class="hint">Se usa para enviar notificaciones por WhatsApp</span></div>
      <div class="field"><label>Correo</label><input name="email" type="email" value="${esc(c.email)}"></div>
      <div class="field"><label>Dirección</label><input name="address" value="${esc(c.address)}"></div>
      <div class="field"><label>Límite de crédito</label><input name="creditLimit" type="number" min="0" step="0.01" value="${c.creditLimit || 0}" ${canCredit ? '' : 'readonly'}><span class="hint">0 = sin límite</span></div>
      <div class="field"><label>Plazo de crédito (días)</label><input name="creditDays" type="number" min="0" value="${c.creditDays ?? D.s.creditDefaultDays}" ${canCredit ? '' : 'readonly'}></div>
      <div class="field span-2"><label>Notas</label><textarea name="notes" rows="2">${esc(c.notes)}</textarea></div></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>${icon('check', 15)} Guardar</button>`,
    onOpen: m => m.$('[data-ok]').onclick = () => {
      const f = readForm(m.el);
      if (!f.name) return toast('El nombre es obligatorio', 'warn');
      if (f.docId && DB.data.customers.some(x => x.id !== c.id && x.docId && norm(x.docId) === norm(f.docId))) return toast('Ya existe un cliente con ese documento', 'err');
      Object.assign(c, f, { creditLimit: num(f.creditLimit), creditDays: num(f.creditDays) });
      if (existing) { const i = DB.data.customers.findIndex(x => x.id === c.id); DB.data.customers[i] = c; }
      else { c.id = uid(); c.createdAt = nowISO(); c.storeCredit = 0; DB.data.customers.push(c); }
      DB.commit(); m.close(); toast('Cliente guardado');
      onSaved && onSaved(c);
    },
  });
}

function customerDetail(id, onChange) {
  const c = D.customer(id);
  const invs = DB.data.invoices.filter(i => i.customerId === id).sort((a, b) => b.date.localeCompare(a.date));
  const valid = invs.filter(i => i.status !== 'anulada');
  const pays = DB.data.payments.filter(p => p.customerId === id).sort((a, b) => b.date.localeCompare(a.date));
  const bal = D.customerBalance(id);
  const m = openModal({
    title: esc(c.name), size: 'lg',
    body: `<div class="info-grid mb">
        <div><div class="ig-label">Documento</div><div class="ig-value">${esc(c.docId || '—')}</div></div>
        <div><div class="ig-label">Teléfono</div><div class="ig-value">${esc(c.phone || '—')}</div></div>
        <div><div class="ig-label">Correo</div><div class="ig-value">${esc(c.email || '—')}</div></div>
        <div><div class="ig-label">Límite / plazo</div><div class="ig-value">${c.creditLimit ? money(c.creditLimit) : 'Sin límite'} · ${c.creditDays || D.s.creditDefaultDays} días</div></div></div>
      <div class="grid g-4 mb">
        <div class="card kpi"><div class="k-label">Total comprado</div><div class="k-value" style="font-size:19px">${money(sum(valid, D.invoiceNet))}</div><div class="k-sub">${valid.length} compras</div></div>
        <div class="card kpi"><div class="k-label">Deuda</div><div class="k-value ${bal ? 'warn-text' : ''}" style="font-size:19px">${money(bal)}</div></div>
        <div class="card kpi"><div class="k-label">Disponible crédito</div><div class="k-value" style="font-size:19px">${c.creditLimit ? money(D.creditAvailable(c)) : '∞'}</div></div>
        <div class="card kpi"><div class="k-label">Saldo a favor</div><div class="k-value ok-text" style="font-size:19px">${money(c.storeCredit || 0)}</div>${D.loyaltyOn() ? `<div class="k-sub">⭐ ${c.points || 0} puntos = ${money(D.pointsMoney(c.points))}</div>` : ''}</div></div>
      <div class="label">Compras</div>
      <div style="max-height:260px;overflow:auto" class="card"><table class="tbl compact"><thead><tr><th>Factura</th><th>Fecha</th><th>Tipo</th><th class="num">Total</th><th class="num">Saldo</th><th>Estado</th></tr></thead><tbody>
        ${invs.map(i => `<tr class="clickable" data-inv="${i.id}"><td><b>${esc(i.number)}</b></td><td>${fmtDate(i.date)}</td><td>${i.type === 'credito' ? 'Crédito' : 'Contado'}</td><td class="num">${money(i.total)}</td><td class="num">${i.balance > 0 ? money(i.balance) : '—'}</td><td>${D.overdueDays(i) ? badge('vencida', 'Vencida') : badge(i.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted center">Sin compras</td></tr>'}
      </tbody></table></div>
      ${pays.length ? `<div class="label mt">Pagos recibidos</div><div style="max-height:200px;overflow:auto" class="card"><table class="tbl compact"><tbody>${pays.map(p => `<tr><td><b>${esc(p.number)}</b></td><td>${fmtDate(p.date)}</td><td>${payLabel(p.method)}</td><td class="num">${money(p.amount)}</td><td>${p.voided ? badge('anulada', 'Anulado') : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${c.notes ? `<div class="callout mt">${esc(c.notes)}</div>` : ''}`,
    footer: `${isAdmin() && c.id !== 'walkin' ? `<button class="btn ghost" id="cd-sc" style="margin-right:auto">${icon('gift', 15)} Ajustar saldo a favor</button>` : ''}
      ${bal > 0 && WA.eligible(id) ? `<button class="btn success" id="cd-wa" title="Enviar estado de cuenta por WhatsApp">${waIcon(15)} Estado por WhatsApp</button>` : ''}
      <button class="btn" id="cd-st">${icon('printer', 15)} Estado de cuenta</button>
      ${can('customers.edit') && c.id !== 'walkin' ? `<button class="btn" id="cd-ed">${icon('edit', 15)} Editar</button>` : ''}
      ${bal > 0 && can('credits') ? `<button class="btn primary" id="cd-pay">${icon('cash', 15)} Registrar abono</button>` : ''}`,
  });
  m.el.addEventListener('click', e => { const r = e.target.closest('[data-inv]'); if (r) invoiceDetail(r.dataset.inv, onChange); });
  m.$('#cd-st').onclick = () => PR.statement(id);
  const wa = m.$('#cd-wa'); if (wa) wa.onclick = () => WA.sendStatement(id);
  const ed = m.$('#cd-ed'); if (ed) ed.onclick = () => { m.close(); customerForm(c, () => onChange && onChange()); };
  const pb = m.$('#cd-pay'); if (pb) pb.onclick = () => { m.close(); paymentModal(id, null, onChange); };
  const sc = m.$('#cd-sc'); if (sc) sc.onclick = async () => {
    const v = await promptBox(`Saldo a favor actual: ${money(c.storeCredit || 0)}. Nuevo saldo:`, { type: 'number', value: c.storeCredit || 0, title: 'Saldo a favor' });
    if (v === null) return;
    audit('Ajuste de saldo a favor', `${c.name}: ${money(c.storeCredit || 0)} → ${money(num(v))}`);
    c.storeCredit = round2(Math.max(0, num(v))); DB.commit(); m.close(); toast('Saldo actualizado'); onChange && onChange();
  };
}

/* ---------- Registrar abono ---------- */
function paymentModal(customerId, invoiceId, onDone) {
  const c = D.customer(customerId);
  const open = D.openInvoices(customerId);
  if (!open.length) return toast('El cliente no tiene deudas pendientes', 'info');
  const total = round2(sum(open, i => i.balance));
  const defMethod = ((invoiceId && open.find(i => i.id === invoiceId)) || open[0])?.credit?.payMethod || 'efectivo';
  openModal({
    title: `Registrar abono · ${esc(c.name)}`, size: 'md',
    body: `<div class="big-total mb"><div class="bt-label">Deuda total</div><div class="bt-value">${money(total)}</div><div class="small muted">${open.length} factura(s) abierta(s)</div></div>
      <div class="field mb"><label>Aplicar a</label><select id="pm-inv">${opt('', 'Distribuir automáticamente (más antiguas primero)', invoiceId || '')}${open.map(i => { const nd = D.nextDue(i); return opt(i.id, `${i.number} · saldo ${money(i.balance)}${nd ? ' · vence ' + fmtDate(nd.date) : ''}${D.overdueDays(i) ? ' · VENCIDA' : ''}`, invoiceId); }).join('')}</select></div>
      <div class="form-grid">
        <div class="field"><label>Monto</label><div class="input-group"><input id="pm-amt" type="number" min="0" step="0.01" autofocus><button class="btn" id="pm-all" type="button">Todo</button></div></div>
        <div class="field"><label>Forma de pago</label><select id="pm-m">${opt('efectivo', 'Efectivo', defMethod)}${opt('tarjeta', 'Tarjeta', defMethod)}${opt('transferencia', 'Transferencia', defMethod)}${c.storeCredit > 0 ? opt('saldo', `Saldo a favor (${money(c.storeCredit)})`) : ''}</select></div>
        <div class="field span-2"><label>Nota / referencia</label><input id="pm-note"></div>
      </div>
      <div class="small muted mt" id="pm-info"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="pm-ok">${icon('check', 15)} Registrar abono</button>`,
    onOpen: m => {
      const maxFor = () => { const iv = m.$('#pm-inv').value; return iv ? open.find(i => i.id === iv).balance : total; };
      const info = () => { const a = num(m.$('#pm-amt').value); m.$('#pm-info').textContent = a ? `Saldo después del abono: ${money(Math.max(0, total - a))}` : ''; };
      m.$('#pm-all').onclick = () => { m.$('#pm-amt').value = maxFor(); info(); };
      m.$('#pm-amt').addEventListener('input', info);
      m.$('#pm-inv').onchange = info;
      const go = () => {
        try {
          const p = D.registerPayment({ customerId, amount: num(m.$('#pm-amt').value), method: m.$('#pm-m').value, invoiceId: m.$('#pm-inv').value || null, note: m.$('#pm-note').value.trim() });
          m.close();
          const waCust = WA.eligible(customerId), waAuto = waCust && WA.shouldAuto('payment');
          if (waAuto) WA.notifyPayment(p);
          openModal({
            title: 'Abono registrado', size: 'sm',
            body: `<div class="center"><div class="success-mark">${icon('check', 28)}</div><h3 style="margin:0">${esc(p.number)}</h3><p class="muted">Recibido ${money(p.amount)} · nuevo saldo ${money(p.newBalance)}</p>
              ${waAuto ? `<div class="small muted">${waIcon(13)} Notificación de WhatsApp ${D.s.whatsapp.mode === 'api' ? 'enviada' : 'abierta'}</div>` : ''}</div>`,
            footer: `${waCust ? `<button class="btn success" id="r-w">${waIcon(15)} WhatsApp</button>` : ''}<button class="btn" id="r-t">${icon('receipt', 15)} Ticket</button><button class="btn primary" id="r-c">${icon('printer', 15)} Recibo carta</button>`,
            onOpen: mm => {
              const w = mm.$('#r-w'); if (w) w.onclick = () => WA.notifyPayment(p, { manual: true });
              mm.$('#r-t').onclick = () => PR.receipt(p, 'ticket'); mm.$('#r-c').onclick = () => PR.receipt(p, 'carta');
            },
          });
          onDone && onDone(); App.updateChrome();
        } catch (e) { toast(e.message, 'err'); }
      };
      m.$('#pm-ok').onclick = go;
      m.$('#pm-amt').addEventListener('keydown', e => e.key === 'Enter' && go());
    },
  });
}

/* ---------- Página: Clientes ---------- */
Pages.customers = {
  title: 'Clientes',
  render(el) {
    const edit = can('customers.edit');
    const st = { f: '' };
    el.innerHTML = `<div class="page-head"><div class="muted">${DB.data.customers.length - 1} clientes registrados</div><span class="spacer"></span>
      <button class="btn" id="exp">${icon('download', 16)} Exportar</button>${edit ? `<button class="btn primary" id="new">${icon('plus', 16)} Nuevo cliente</button>` : ''}</div><div id="tbl"></div>`;
    const lastBuy = {};
    DB.data.invoices.forEach(i => { if (i.status !== 'anulada' && (!lastBuy[i.customerId] || i.date > lastBuy[i.customerId])) lastBuy[i.customerId] = i.date; });
    const dt = DataTable($('#tbl', el), {
      placeholder: 'Buscar nombre, documento, teléfono, correo…',
      toolbar: `<select id="f-f" style="width:auto">${opt('', 'Todos')}${opt('debt', 'Con deuda')}${opt('overdue', 'Con deuda vencida')}${opt('favor', 'Con saldo a favor')}</select>`,
      rows: () => DB.data.customers.filter(c => c.id !== 'walkin' && (!st.f || (st.f === 'debt' && D.customerBalance(c.id) > 0) || (st.f === 'favor' && c.storeCredit > 0) || (st.f === 'overdue' && D.openInvoices(c.id).some(i => D.overdueDays(i) > 0)))),
      searchText: c => `${c.name} ${c.docId} ${c.phone} ${c.email} ${c.address}`,
      sortKey: 'name', sortDir: 'asc',
      rowAttrs: c => `class="clickable" data-act="view" data-id="${c.id}"`,
      columns: [
        { label: 'Cliente', sort: 'name', html: c => `<div class="cell-main"><span class="avatar" style="width:34px;height:34px;font-size:12px">${initials(c.name)}</span><div><div class="t1">${esc(c.name)}</div><div class="t2">${esc(c.docId || '')}</div></div></div>` },
        { label: 'Contacto', html: c => `<div class="small">${esc(c.phone || '')}</div><div class="small muted">${esc(c.email || '')}</div>` },
        { label: 'Última compra', sort: 'last', sortValue: c => lastBuy[c.id] || '', html: c => lastBuy[c.id] ? fmtDate(lastBuy[c.id]) : '<span class="muted">—</span>' },
        { label: 'Límite', cls: 'num', html: c => c.creditLimit ? money(c.creditLimit) : '<span class="muted">—</span>' },
        { label: 'Deuda', cls: 'num', sort: 'debt', sortValue: c => D.customerBalance(c.id), html: c => { const b = D.customerBalance(c.id); return b ? `<b class="warn-text">${money(b)}</b>` : '<span class="muted">—</span>'; } },
        { label: 'A favor', cls: 'num', html: c => c.storeCredit ? `<span class="ok-text">${money(c.storeCredit)}</span>` : '<span class="muted">—</span>' },
        ...(D.loyaltyOn() ? [{ label: 'Puntos', cls: 'num', sort: 'points', sortValue: c => c.points || 0, html: c => c.points ? `⭐ ${c.points}` : '<span class="muted">—</span>' }] : []),
        { label: '', cls: 'actions', html: c => `${D.customerBalance(c.id) > 0 && can('credits') ? `<button class="btn sm" data-act="pay" data-id="${c.id}">Abonar</button>` : ''}
          ${edit ? `<button class="icon-btn" data-act="edit" data-id="${c.id}">${icon('edit', 15)}</button><button class="icon-btn danger" data-act="del" data-id="${c.id}">${icon('trash', 15)}</button>` : ''}` },
      ],
      empty: 'Aún no hay clientes', emptyIcon: 'users',
    });
    $('#f-f', el).onchange = e => { st.f = e.target.value; dt.refresh(); };
    if (edit) $('#new', el).onclick = () => customerForm(null, () => dt.refresh());
    $('#exp', el).onclick = () => downloadFile(`clientes-${today()}.csv`, toCSV(DB.data.customers.filter(c => c.id !== 'walkin'), [
      { label: 'Nombre', value: c => c.name }, { label: 'Documento', value: c => c.docId }, { label: 'Teléfono', value: c => c.phone }, { label: 'Correo', value: c => c.email },
      { label: 'Dirección', value: c => c.address }, { label: 'Límite crédito', value: c => c.creditLimit }, { label: 'Deuda', value: c => D.customerBalance(c.id) }, { label: 'Saldo a favor', value: c => c.storeCredit || 0 },
    ]), 'text/csv');
    onActions(el, {
      view: id => customerDetail(id, () => dt.refresh()),
      edit: id => customerForm(D.customer(id), () => dt.refresh()),
      pay: id => paymentModal(id, null, () => dt.refresh()),
      del: async id => {
        const c = D.customer(id);
        if (DB.data.invoices.some(i => i.customerId === id) || DB.data.quotes.some(q => q.customerId === id)) return toast('El cliente tiene facturas o cotizaciones; no puede eliminarse', 'warn');
        if (!(await confirmBox(`¿Eliminar a ${esc(c.name)}?`, { danger: true, ok: 'Eliminar' }))) return;
        DB.data.customers = DB.data.customers.filter(x => x.id !== id); DB.commit(); dt.refresh();
      },
    });
  },
};

/* ---------- Página: Créditos y cobros ---------- */
Pages.credits = {
  title: 'Créditos y cobros',
  tab: 'customers',
  render(el) {
    const open = DB.data.invoices.filter(i => i.status !== 'anulada' && i.balance > 0.004);
    const total = sum(open, i => i.balance);
    const overdueAmt = sum(open, i => D.overdueAmount(i));
    const monthStart = today().slice(0, 8) + '01';
    const collected = sum(DB.data.payments.filter(p => !p.voided && inRange(p.date, monthStart, today())), p => p.amount);
    const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
    open.forEach(i => { const d = D.overdueDays(i); const k = d <= 0 ? 'current' : d <= 30 ? 'd30' : d <= 60 ? 'd60' : d <= 90 ? 'd90' : 'd90p'; aging[k] += i.balance; });
    el.innerHTML = `<div class="grid g-4 mb">
        <div class="card kpi accent"><div class="k-label">Total por cobrar</div><div class="k-value">${money(total)}</div><div class="k-sub">${open.length} facturas · ${new Set(open.map(i => i.customerId)).size} clientes</div></div>
        <div class="card kpi"><div class="k-label">Cuotas vencidas</div><div class="k-value err-text">${money(overdueAmt)}</div></div>
        <div class="card kpi"><div class="k-label">Cobrado este mes</div><div class="k-value ok-text">${money(collected)}</div></div>
        <div class="card kpi"><div class="k-label">Antigüedad de saldos</div><div class="small" style="margin-top:8px;line-height:1.7">
          <div class="row between"><span>Al día</span><b>${money(aging.current)}</b></div><div class="row between"><span>1–30 días</span><b class="warn-text">${money(aging.d30)}</b></div>
          <div class="row between"><span>31–60</span><b class="err-text">${money(aging.d60)}</b></div><div class="row between"><span>61–90 / +90</span><b class="err-text">${money(aging.d90 + aging.d90p)}</b></div></div></div></div>
      <div class="tabs">${[['customers', 'Por cliente'], ['invoices', 'Facturas a crédito'], ['receipts', 'Recibos de pago']].map(([k, l]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="tbl"></div>`;
    $$('[data-tab]', el).forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(el); });
    const reload = () => this.render(el);
    const box = $('#tbl', el);
    if (this.tab === 'customers') {
      const byC = {};
      open.forEach(i => { (byC[i.customerId] = byC[i.customerId] || []).push(i); });
      const rows = Object.entries(byC).map(([cid, invs]) => {
        const nds = invs.map(i => D.nextDue(i)).filter(Boolean).map(x => x.date).sort();
        return { c: D.customer(cid) || { id: cid, name: invs[0].customerName }, invs, bal: sum(invs, i => i.balance), overdue: sum(invs, i => D.overdueAmount(i)), days: Math.max(0, ...invs.map(i => D.overdueDays(i))), next: nds[0] };
      });
      DataTable(box, {
        placeholder: 'Buscar cliente…',
        rows: () => rows, searchText: r => `${r.c.name} ${r.c.docId || ''} ${r.c.phone || ''}`,
        sortKey: 'bal', sortDir: 'desc',
        columns: [
          { label: 'Cliente', sort: 'name', sortValue: r => r.c.name, html: r => `<div class="strong">${esc(r.c.name)}</div><div class="small muted">${esc(r.c.phone || '')}</div>` },
          { label: 'Facturas', cls: 'num', html: r => r.invs.length },
          { label: 'Próximo venc.', sort: 'next', sortValue: r => r.next || '', html: r => r.next ? fmtDate(r.next) : '—' },
          { label: 'Atraso', sort: 'days', sortValue: r => r.days, html: r => r.days ? `<span class="badge err">${r.days} días</span>` : '<span class="badge ok">Al día</span>' },
          { label: 'Vencido', cls: 'num', html: r => r.overdue ? `<span class="err-text">${money(r.overdue)}</span>` : '—' },
          { label: 'Saldo', cls: 'num', sort: 'bal', sortValue: r => r.bal, html: r => `<b>${money(r.bal)}</b>` },
          { label: '', cls: 'actions', html: r => `${WA.eligible(r.c.id) ? `<button class="icon-btn" data-act="wast" data-id="${r.c.id}" title="Recordatorio por WhatsApp">${waIcon(15)}</button>` : ''}<button class="icon-btn" data-act="st" data-id="${r.c.id}" title="Estado de cuenta">${icon('printer', 15)}</button><button class="icon-btn" data-act="view" data-id="${r.c.id}" title="Ver">${icon('eye', 15)}</button><button class="btn sm primary" data-act="pay" data-id="${r.c.id}">Abonar</button>` },
        ],
        footer: rs => `<tr><td colspan="4">${rs.length} clientes</td><td class="num">${money(sum(rs, r => r.overdue))}</td><td class="num">${money(sum(rs, r => r.bal))}</td><td></td></tr>`,
        empty: 'No hay cuentas por cobrar 🎉', emptyIcon: 'credit',
      });
    } else if (this.tab === 'invoices') {
      DataTable(box, {
        placeholder: 'Buscar factura o cliente…',
        rows: () => open, searchText: i => `${i.number} ${i.customerName}`,
        sortKey: 'days', sortDir: 'desc',
        columns: [
          { label: 'Factura', html: i => `<b>${esc(i.number)}</b><div class="small muted">${fmtDate(i.date)}</div>` },
          { label: 'Cliente', html: i => esc(i.customerName) },
          { label: 'Plan', html: i => i.credit ? `${i.credit.installments} cuota(s) ${i.credit.frequency}${i.credit.interest ? `<div class="small muted">interés ${money(i.credit.interest)}</div>` : ''}` : '—' },
          { label: 'Forma de pago', html: i => { const by = D.paidByMethod(i); return `<span class="badge info">${payLabel(i.credit?.payMethod || 'efectivo')}</span>${Object.keys(by).length ? `<div class="small muted" style="margin-top:3px">Pagado: ${Object.entries(by).map(([k, v]) => `${payLabel(k)} ${money(v)}`).join(' · ')}</div>` : ''}`; } },
          { label: 'Próxima cuota', html: i => { const nd = D.nextDue(i); return nd ? `${fmtDate(nd.date)} · ${money(nd.pending)}` : '—'; } },
          { label: 'Atraso', sort: 'days', sortValue: i => D.overdueDays(i), html: i => D.overdueDays(i) ? `<span class="badge err">${D.overdueDays(i)} días</span>` : '<span class="badge ok">Al día</span>' },
          { label: 'Total', cls: 'num', html: i => money(i.total) },
          { label: 'Saldo', cls: 'num', sort: 'bal', sortValue: i => i.balance, html: i => `<b>${money(i.balance)}</b>` },
          { label: '', cls: 'actions', html: i => `<button class="icon-btn" data-act="inv" data-id="${i.id}">${icon('eye', 15)}</button><button class="btn sm primary" data-act="payinv" data-id="${i.id}">Abonar</button>` },
        ],
        footer: rs => `<tr><td colspan="6">${rs.length} facturas</td><td class="num">${money(sum(rs, i => i.balance))}</td><td></td></tr>`,
        empty: 'No hay facturas a crédito pendientes', emptyIcon: 'credit',
      });
    } else {
      const st = { from: rangeFor('month')[0], to: today() };
      const dt = DataTable(box, {
        placeholder: 'Buscar recibo o cliente…', toolbar: dateRangeToolbar(st),
        rows: () => DB.data.payments.filter(p => inRange(p.date, st.from, st.to)).sort((a, b) => b.date.localeCompare(a.date)),
        searchText: p => `${p.number} ${p.customerName} ${p.allocations.map(a => a.number).join(' ')}`,
        columns: [
          { label: 'Recibo', html: p => `<b>${esc(p.number)}</b>` },
          { label: 'Fecha', html: p => fmtDateTime(p.date) },
          { label: 'Cliente', html: p => esc(p.customerName) },
          { label: 'Aplicado a', html: p => `<span class="small">${p.allocations.map(a => esc(a.number)).join(', ')}</span>` },
          { label: 'Forma', html: p => payLabel(p.method) },
          { label: 'Monto', cls: 'num', html: p => `<span style="${p.voided ? 'text-decoration:line-through' : ''}">${money(p.amount)}</span> ${p.voided ? badge('anulada', 'Anulado') : ''}` },
          { label: '', cls: 'actions', html: p => `${!p.voided && WA.eligible(p.customerId) ? `<button class="icon-btn" data-act="rwa" data-id="${p.id}" title="Enviar por WhatsApp">${waIcon(15)}</button>` : ''}<button class="icon-btn" data-act="rprint" data-id="${p.id}">${icon('printer', 15)}</button>${!p.voided ? `<button class="icon-btn danger" data-act="rvoid" data-id="${p.id}" title="Anular">${icon('x', 15)}</button>` : ''}` },
        ],
        footer: rs => `<tr><td colspan="5">${rs.filter(p => !p.voided).length} recibos</td><td class="num">${money(sum(rs.filter(p => !p.voided), p => p.amount))}</td><td></td></tr>`,
        empty: 'Sin recibos en el periodo', emptyIcon: 'receipt',
      });
      bindRange(box, st, () => dt.refresh());
    }
    onActions(el, {
      pay: id => paymentModal(id, null, reload),
      payinv: id => { const i = DB.data.invoices.find(x => x.id === id); paymentModal(i.customerId, id, reload); },
      st: id => PR.statement(id),
      view: id => customerDetail(id, reload),
      inv: id => invoiceDetail(id, reload),
      rprint: id => PR.receipt(DB.data.payments.find(p => p.id === id)),
      rwa: id => WA.notifyPayment(DB.data.payments.find(p => p.id === id), { manual: true }),
      wast: id => WA.sendStatement(id),
      rvoid: async id => {
        if (!(await adminAuth('Anular un recibo requiere autorización.'))) return;
        const reason = await promptBox('Motivo de la anulación', { required: true, title: 'Anular recibo' });
        if (!reason) return;
        try { D.voidPayment(id, reason); toast('Recibo anulado. Saldos restaurados.'); reload(); } catch (e) { toast(e.message, 'err'); }
      },
    });
  },
};
