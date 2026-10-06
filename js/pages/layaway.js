'use strict';
/* ==========================================================
   Apartados (plan separe) — beneficio Premium
   ========================================================== */

function layawayPayModal(l, onDone) {
  openModal({
    title: `Abonar al apartado ${esc(l.number)}`, size: 'sm',
    body: `<div class="big-total mb"><div class="bt-label">Saldo pendiente</div><div class="bt-value">${money(l.balance)}</div><div class="small muted">${esc(l.customerName)} · pagado ${money(l.paid)} de ${money(l.total)}</div></div>
      <div class="field mb"><label>Monto</label><div class="input-group"><input id="lp-amt" type="number" min="0" step="0.01" autofocus><button class="btn" id="lp-all" type="button">Todo</button></div></div>
      <div class="field"><label>Forma de pago</label><select id="lp-m">${opt('efectivo', 'Efectivo')}${opt('tarjeta', 'Tarjeta')}${opt('transferencia', 'Transferencia')}</select></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="lp-ok">Registrar abono</button>`,
    onOpen: m => {
      m.$('#lp-all').onclick = () => m.$('#lp-amt').value = l.balance;
      const go = async () => {
        if (D.s.requireCashSession && !D.currentSession() && m.$('#lp-m').value === 'efectivo') { if (!(await quickOpenCash())) return; }
        try {
          D.layawayPay(l.id, num(m.$('#lp-amt').value), m.$('#lp-m').value);
          m.close(); toast(l.balance > 0.004 ? `Abono registrado. Debe ${money(l.balance)}` : '¡Apartado pagado! Ya puedes entregarlo.');
          onDone && onDone();
          if (l.balance <= 0.004) setTimeout(() => layawayDetail(l.id, onDone), 300);
        } catch (e) { toast(e.message, 'err'); }
      };
      m.$('#lp-ok').onclick = go;
      m.$('#lp-amt').addEventListener('keydown', e => e.key === 'Enter' && go());
    },
  });
}

function layawayDetail(id, onChange) {
  const l = DB.data.layaways.find(x => x.id === id); if (!l) return;
  const st = D.layawayStatus(l);
  const m = openModal({
    title: `Apartado ${esc(l.number)} ${badge(st)}`, size: 'lg',
    body: `<div class="info-grid mb">
        <div><div class="ig-label">Cliente</div><div class="ig-value">${esc(l.customerName)}</div></div>
        <div><div class="ig-label">Fecha</div><div class="ig-value">${fmtDate(l.date)}</div></div>
        <div><div class="ig-label">Fecha límite</div><div class="ig-value ${st === 'vencido' ? 'err-text' : ''}">${fmtDate(l.dueDate)}</div></div>
        <div><div class="ig-label">Atendió</div><div class="ig-value">${esc(l.userName)}</div></div></div>
      <div class="card"><table class="tbl compact"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>
        ${l.items.map(i => `<tr><td><div class="strong">${esc(i.name)}</div><div class="small muted">${esc(i.variant || '')}</div></td><td class="num">${qtyFmt(i.qty)}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.lineTotal)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid g-2 mt">
        <div><div class="label">Abonos</div>${l.payments.map(p => `<div class="tot-row"><span>${fmtDateTime(p.date)} · ${payLabel(p.method)}</span><span>${money(p.amount)}</span></div>`).join('') || '<div class="small muted">Sin abonos</div>'}</div>
        <div><div class="tot-row grand"><span>TOTAL</span><span>${money(l.total)}</span></div><div class="tot-row"><span>Pagado</span><span class="ok-text">${money(l.paid)}</span></div><div class="tot-row strong"><span>Saldo</span><span class="${l.balance > 0 ? 'warn-text' : 'ok-text'}">${money(l.balance)}</span></div></div>
      </div>
      ${l.invoiceNumber ? `<div class="callout ok mt">Entregado el ${fmtDateTime(l.deliveredAt)} · Factura ${esc(l.invoiceNumber)}</div>` : ''}
      ${l.status === 'cancelado' ? `<div class="callout err mt">Cancelado el ${fmtDateTime(l.cancelledAt)}: ${esc(l.cancelReason || '')}${l.refund ? ` · ${l.refund.method === 'ninguno' ? 'sin devolución' : `devuelto ${money(l.refund.amount)} (${l.refund.method === 'saldo' ? 'saldo a favor' : 'efectivo'})`}` : ''}</div>` : ''}`,
    footer: `${l.status === 'activo' ? `<button class="btn danger" id="ld-cancel" style="margin-right:auto">Cancelar apartado</button>` : ''}
      <button class="btn" id="ld-print">${icon('printer', 15)} Comprobante</button>
      ${l.status === 'activo' && WA.eligible(l.customerId) ? `<button class="btn success" id="ld-wa">${waIcon(15)} Recordar</button>` : ''}
      ${l.status === 'activo' && l.balance > 0.004 ? `<button class="btn primary" id="ld-pay">${icon('cash', 15)} Abonar</button>` : ''}
      ${l.status === 'activo' && l.balance <= 0.004 ? `<button class="btn chrome" id="ld-deliver">${icon('check', 15)} Entregar y facturar</button>` : ''}`,
  });
  const on = (s, fn) => { const b = m.$(s); if (b) b.onclick = fn; };
  on('#ld-print', () => PR.layaway(l));
  on('#ld-pay', () => { m.close(); layawayPayModal(l, onChange); });
  on('#ld-wa', () => {
    const c = D.customer(l.customerId);
    WA.send({ customer: c, type: 'apartado', ref: l.number, text: `Hola ${c.name.split(' ')[0]} 👋\nTe recordamos tu apartado *${l.number}* en *${D.s.company.name}*.\n\n💰 Total: ${money(l.total)}\nAbonado: ${money(l.paid)}\nSaldo: *${money(l.balance)}*\n📅 Fecha límite: ${fmtDate(l.dueDate)}\n\n¡Te esperamos! ✦` });
  });
  on('#ld-deliver', () => {
    try { const inv = D.deliverLayaway(l.id); m.close(); onChange && onChange(); App.updateChrome(); saleDone(inv); }
    catch (e) { toast(e.message, 'err'); }
  });
  on('#ld-cancel', async () => {
    const mm = openModal({
      title: `Cancelar ${esc(l.number)}`, size: 'sm',
      body: `<p class="muted" style="margin-top:0">La mercancía vuelve al inventario. El cliente abonó <b>${money(l.paid)}</b>.</p>
        <div class="field mb"><label>¿Qué hacer con lo abonado?</label><select id="lc-m">${l.paid > 0 ? `${opt('saldo', 'Dejarlo como saldo a favor del cliente')}${opt('efectivo', 'Devolver en efectivo')}${opt('ninguno', 'No devolver (penalidad)')}` : opt('ninguno', 'No hay abonos')}</select></div>
        <div class="field"><label>Motivo</label><input id="lc-r" placeholder="Ej. no pagó a tiempo, el cliente desistió…"></div>`,
      footer: `<button class="btn ghost" data-close>Volver</button><button class="btn danger" id="lc-ok">Cancelar apartado</button>`,
    });
    mm.$('#lc-ok').onclick = async () => {
      if (!isAdmin() && !(await adminAuth('Cancelar un apartado requiere autorización.'))) return;
      try { D.cancelLayaway(l.id, mm.$('#lc-m').value, mm.$('#lc-r').value.trim()); mm.close(); m.close(); toast('Apartado cancelado. La mercancía volvió al inventario.'); onChange && onChange(); }
      catch (e) { toast(e.message, 'err'); }
    };
  });
}

Pages.layaway = {
  title: 'Apartados',
  render(el) {
    const all = DB.data.layaways;
    const act = all.filter(l => l.status === 'activo');
    const overdue = act.filter(l => D.layawayStatus(l) === 'vencido');
    const st = { status: 'activos' };
    el.innerHTML = `<div class="grid g-4 mb">
        <div class="card kpi accent"><div class="k-label">Apartados activos</div><div class="k-value">${act.length}</div><div class="k-sub">${qtyFmt(sum(act, l => sum(l.items, i => i.qty)))} prendas reservadas</div></div>
        <div class="card kpi"><div class="k-label">Saldo por cobrar</div><div class="k-value warn-text">${money(sum(act, l => l.balance))}</div></div>
        <div class="card kpi"><div class="k-label">Abonado (en reserva)</div><div class="k-value">${money(sum(act, l => l.paid))}</div></div>
        <div class="card kpi"><div class="k-label">Vencidos</div><div class="k-value ${overdue.length ? 'err-text' : ''}">${overdue.length}</div></div></div>
      <div class="page-head"><div class="muted">Para crear un apartado, agrega los productos en el <a href="#/pos">Punto de venta</a> y pulsa <b>Apartar</b>.</div><span class="spacer"></span><a class="btn primary" href="#/pos">${icon('plus', 16)} Nuevo apartado</a></div>
      <div id="tbl"></div>`;
    const reload = () => this.render(el);
    const dt = DataTable($('#tbl', el), {
      placeholder: 'Buscar número o cliente…',
      toolbar: `<select id="f-st" style="width:auto">${opt('activos', 'Activos')}${opt('vencido', 'Vencidos')}${opt('entregado', 'Entregados')}${opt('cancelado', 'Cancelados')}${opt('', 'Todos')}</select>`,
      rows: () => all.filter(l => !st.status || (st.status === 'activos' ? l.status === 'activo' : D.layawayStatus(l) === st.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      searchText: l => `${l.number} ${l.customerName} ${l.items.map(i => i.name).join(' ')}`,
      rowAttrs: l => `class="clickable" data-act="view" data-id="${l.id}"`,
      columns: [
        { label: 'Número', html: l => `<b>${esc(l.number)}</b><div class="small muted">${fmtDate(l.date)}</div>` },
        { label: 'Cliente', html: l => esc(l.customerName) },
        { label: 'Artículos', html: l => `<span class="small">${esc(l.items.map(i => i.name).join(', ')).slice(0, 60)}</span>` },
        { label: 'Total', cls: 'num', html: l => money(l.total) },
        { label: 'Pagado', cls: 'num', html: l => `<span class="ok-text">${money(l.paid)}</span><div class="hb-track" style="width:90px;margin-left:auto;margin-top:4px"><div class="hb-fill" style="width:${Math.min(100, l.paid / l.total * 100)}%"></div></div>` },
        { label: 'Saldo', cls: 'num', html: l => l.balance > 0.004 ? `<b class="warn-text">${money(l.balance)}</b>` : '<span class="badge ok">Pagado</span>' },
        { label: 'Fecha límite', html: l => fmtDate(l.dueDate) },
        { label: 'Estado', html: l => badge(D.layawayStatus(l)) },
        { label: '', cls: 'actions', html: l => l.status !== 'activo' ? '' : l.balance > 0.004 ? `<button class="btn sm primary" data-act="pay" data-id="${l.id}">Abonar</button>` : `<button class="btn sm success" data-act="view" data-id="${l.id}">Entregar</button>` },
      ],
      empty: 'No hay apartados', emptyIcon: 'tag',
    });
    $('#f-st', el).onchange = e => { st.status = e.target.value; dt.refresh(); };
    onActions(el, {
      view: id => layawayDetail(id, reload),
      pay: id => layawayPayModal(DB.data.layaways.find(l => l.id === id), reload),
    });
  },
};
