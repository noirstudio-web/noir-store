'use strict';
/* ==========================================================
   Caja y gastos
   ========================================================== */

function cashMoveModal(type, onDone) {
  openModal({
    title: type === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo', size: 'sm',
    body: `<div class="field mb"><label>Monto</label><input id="cm-amt" type="number" min="0" step="0.01" autofocus></div>
      <div class="field"><label>Motivo</label><input id="cm-r" placeholder="${type === 'entrada' ? 'Ej. Cambio adicional, aporte del dueño' : 'Ej. Retiro a banco, pago de mensajería'}"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Registrar</button>`,
    onOpen: m => m.$('[data-ok]').onclick = () => {
      const a = num(m.$('#cm-amt').value), r = m.$('#cm-r').value.trim();
      if (a <= 0 || !r) return toast('Indica monto y motivo', 'warn');
      try { D.cashMove(type, a, r); m.close(); toast('Movimiento registrado'); onDone && onDone(); } catch (e) { toast(e.message, 'err'); }
    },
  });
}

function closeCashModal(onDone) {
  const s = D.currentSession();
  const x = D.sessionSummary(s);
  const dens = D.s.denominations || [];
  openModal({
    title: `Cerrar caja ${esc(s.number)}`, size: 'md',
    body: `<div class="grid g-2 mb"><div class="card kpi"><div class="k-label">Efectivo esperado</div><div class="k-value">${money(x.expected)}</div></div>
        <div class="card kpi"><div class="k-label">Diferencia</div><div class="k-value" id="cc-diff">—</div></div></div>
      ${dens.length ? `<div class="label">Conteo por denominación (opcional)</div><div class="form-grid c4 mt" style="margin-bottom:14px">${dens.map((d, i) => `<div class="field"><label>${money(d)}</label><input type="number" min="0" step="1" data-den="${i}" placeholder="0"></div>`).join('')}</div>` : ''}
      <div class="field mb"><label>Efectivo contado *</label><input id="cc-count" type="number" min="0" step="0.01" autofocus></div>
      <div class="field"><label>Observaciones</label><input id="cc-note"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>${icon('lock', 15)} Cerrar caja</button>`,
    onOpen: m => {
      const diff = () => {
        const c = m.$('#cc-count').value; if (c === '') { m.$('#cc-diff').textContent = '—'; return; }
        const d = round2(num(c) - x.expected);
        m.$('#cc-diff').innerHTML = `<span class="${Math.abs(d) < 0.01 ? 'ok-text' : d > 0 ? 'warn-text' : 'err-text'}">${d > 0 ? '+' : ''}${money(d)}</span>`;
      };
      m.el.addEventListener('input', e => {
        if (e.target.dataset.den !== undefined) { m.$('#cc-count').value = round2(sum(m.$$('[data-den]'), i => num(i.value) * dens[+i.dataset.den])); }
        diff();
      });
      m.$('[data-ok]').onclick = async () => {
        if (m.$('#cc-count').value === '') return toast('Indica el efectivo contado', 'warn');
        const counted = num(m.$('#cc-count').value);
        const d = round2(counted - x.expected);
        if (Math.abs(d) >= 0.01 && !(await confirmBox(`Hay una diferencia de <b>${money(d)}</b>. ¿Cerrar de todas formas?`))) return;
        const closed = D.closeSession(counted, m.$('#cc-note').value.trim());
        m.close(); toast('Caja cerrada');
        if (WA.ownerReady() && D.s.ownerAutoClose) WA.toOwner(WA.cashCloseText(closed), 'cierre de caja');
        PR.cashClose(closed); onDone && onDone();
      };
    },
  });
}

Pages.cash = {
  title: 'Caja',
  render(el) {
    const s = D.currentSession();
    const reload = () => { this.render(el); App.updateChrome(); };
    const hist = [...DB.data.cashSessions].filter(x => x.status === 'cerrada').sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    let html = '';
    if (!s) {
      const last = hist[0];
      html = `<div class="card card-pad" style="max-width:560px">
        <div class="row" style="gap:14px"><span class="avatar" style="width:46px;height:46px">${icon('lock', 20)}</span><div><h3 style="margin:0;font:600 18px var(--display)">La caja está cerrada</h3><div class="muted">Ábrela con el fondo inicial para empezar a vender.</div></div></div>
        <div class="form-grid mt"><div class="field"><label>Fondo inicial (efectivo)</label><input id="op-amt" type="number" min="0" step="0.01" value="${last ? last.counted : 0}"></div>
        <div class="field"><label>Nota</label><input id="op-note" placeholder="Opcional"></div></div>
        <button class="btn chrome lg block mt" id="op-go">${icon('unlock', 18)} Abrir caja</button>
        ${last ? `<div class="small muted mt">Último cierre: ${fmtDateTime(last.closedAt)} · contado ${money(last.counted)}</div>` : ''}</div>`;
    } else {
      const x = D.sessionSummary(s);
      const moves = DB.data.cashMoves.filter(m => m.sessionId === s.id);
      const R = (l, v, cls = '') => `<div class="tot-row ${cls}"><span>${l}</span><span>${money(v)}</span></div>`;
      html = `<div class="page-head"><div><div class="row"><span class="badge ok">● Abierta</span><b>${esc(s.number)}</b></div><div class="muted small" style="margin-top:4px">Abierta ${fmtDateTime(s.openedAt)} por ${esc(s.openedByName)}</div></div><span class="spacer"></span>
          <button class="btn" id="b-in">${icon('down', 15)} Entrada</button><button class="btn" id="b-out">${icon('up', 15)} Salida</button>
          <button class="btn" id="b-cut">${icon('printer', 15)} Corte parcial</button>${WA.ownerReady() ? `<button class="btn success" id="b-wa">${waIcon(15)} Enviar al dueño</button>` : ''}<button class="btn primary" id="b-close">${icon('lock', 15)} Cerrar caja</button></div>
        <div class="grid g-4 mb">
          <div class="card kpi accent"><div class="k-label">Efectivo esperado en caja</div><div class="k-value">${money(x.expected)}</div></div>
          <div class="card kpi"><div class="k-label">Ventas del turno</div><div class="k-value">${money(x.salesTotal)}</div><div class="k-sub">${x.invoices} facturas</div></div>
          <div class="card kpi"><div class="k-label">Tarjeta</div><div class="k-value">${money(x.card + x.abonosCard)}</div></div>
          <div class="card kpi"><div class="k-label">Transferencias</div><div class="k-value">${money(x.transfer + x.abonosTransfer)}</div></div></div>
        <div class="grid g-2">
          <div class="card"><div class="card-head"><h3>Cuadre de efectivo</h3></div><div class="card-body">
            ${R('Fondo inicial', x.opening)}${R('+ Ventas en efectivo (neto de cambio)', x.cashSales)}${R('+ Cobros de crédito en efectivo', x.abonosCash)}${R('+ Entradas', x.ins)}
            ${R('− Salidas', x.outs)}${R('− Devoluciones en efectivo', x.refunds)}${R('− Gastos en efectivo', x.expenses)}${R('− Pagos a proveedores', x.supplierPayments)}
            <div class="divider"></div>${R('Efectivo esperado', x.expected, 'grand')}
            <div class="divider"></div>${R('Ventas a crédito (no ingresan a caja)', x.creditSales)}${x.storeCredit ? R('Pagado con saldo a favor', x.storeCredit) : ''}
          </div></div>
          <div class="card"><div class="card-head"><h3>Entradas y salidas</h3></div>
            ${moves.length ? moves.map(m => `<div class="list-item"><span class="badge ${m.type === 'entrada' ? 'ok' : 'err'}">${m.type}</span><div style="flex:1"><div>${esc(m.reason)}</div><div class="small muted">${fmtTime(m.date)} · ${esc(m.userName)}</div></div><b class="num">${money(m.amount)}</b></div>`).join('') : '<div class="empty">Sin movimientos manuales</div>'}
          </div></div>`;
    }
    el.innerHTML = html + `<h3 style="font:600 15px var(--display);margin:28px 0 12px">Historial de cierres</h3><div id="hist"></div>`;
    DataTable($('#hist', el), {
      search: false, rows: () => hist,
      columns: [
        { label: 'Caja', html: h => `<b>${esc(h.number)}</b>` },
        { label: 'Apertura', html: h => `${fmtDateTime(h.openedAt)}<div class="small muted">${esc(h.openedByName)}</div>` },
        { label: 'Cierre', html: h => `${fmtDateTime(h.closedAt)}<div class="small muted">${esc(h.closedByName)}</div>` },
        { label: 'Ventas', cls: 'num', html: h => money(h.summary?.salesTotal || 0) },
        { label: 'Esperado', cls: 'num', html: h => money(h.expected) },
        { label: 'Contado', cls: 'num', html: h => money(h.counted) },
        { label: 'Diferencia', cls: 'num', html: h => `<b class="${Math.abs(h.difference) < 0.01 ? 'ok-text' : h.difference > 0 ? 'warn-text' : 'err-text'}">${money(h.difference)}</b>` },
        { label: '', cls: 'actions', html: h => `${WA.ownerReady() ? `<button class="icon-btn" data-act="wa" data-id="${h.id}" title="Enviar al dueño">${waIcon(15)}</button>` : ''}<button class="icon-btn" data-act="print" data-id="${h.id}">${icon('printer', 15)}</button>` },
      ],
      empty: 'Aún no hay cierres de caja', emptyIcon: 'cash',
    });
    onActions(el, { print: id => PR.cashClose(DB.data.cashSessions.find(x => x.id === id)), wa: id => WA.toOwner(WA.cashCloseText(DB.data.cashSessions.find(x => x.id === id)), 'cierre de caja') });
    if (!s) {
      $('#op-go', el).onclick = () => { try { D.openSession(num($('#op-amt', el).value), $('#op-note', el).value.trim()); toast('Caja abierta'); reload(); } catch (e) { toast(e.message, 'err'); } };
    } else {
      $('#b-in', el).onclick = () => cashMoveModal('entrada', reload);
      $('#b-out', el).onclick = () => cashMoveModal('salida', reload);
      $('#b-cut', el).onclick = () => PR.cashClose(s);
      const bw = $('#b-wa', el); if (bw) bw.onclick = () => WA.toOwner(WA.cashCloseText(s), 'corte de caja');
      $('#b-close', el).onclick = () => closeCashModal(reload);
    }
  },
};

/* ---------- Gastos ---------- */
function expenseForm(onDone) {
  const s = D.s;
  openModal({
    title: 'Registrar gasto', size: 'md',
    body: `<div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" name="date" value="${today()}"></div>
      <div class="field"><label>Categoría</label><select name="category">${s.expenseCategories.map(c => opt(c, c)).join('')}</select></div>
      <div class="field span-2"><label>Descripción *</label><input name="description" placeholder="Ej. Factura de luz de septiembre"></div>
      <div class="field"><label>Monto *</label><input type="number" name="amount" min="0" step="0.01"></div>
      <div class="field"><label>Forma de pago</label><select name="method">${opt('efectivo', 'Efectivo (sale de caja)')}${opt('transferencia', 'Transferencia')}${opt('tarjeta', 'Tarjeta')}${opt('cheque', 'Cheque')}</select></div>
      <div class="field span-2"><label>Referencia / No. comprobante</label><input name="reference"></div></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Guardar gasto</button>`,
    onOpen: m => m.$('[data-ok]').onclick = () => {
      const f = readForm(m.el);
      if (!f.description || !(f.amount > 0)) return toast('Completa descripción y monto', 'warn');
      try { D.addExpense(f); m.close(); toast('Gasto registrado'); onDone && onDone(); } catch (e) { toast(e.message, 'err'); }
    },
  });
}

Pages.expenses = {
  title: 'Gastos',
  render(el) {
    const st = { from: rangeFor('month')[0], to: today(), cat: '' };
    el.innerHTML = `<div class="page-head"><div class="muted">Registra los gastos operativos para conocer tu utilidad real.</div><span class="spacer"></span><button class="btn primary" id="new">${icon('plus', 16)} Registrar gasto</button></div>
      <div class="grid g-main mb"><div id="tbl"></div><div class="card"><div class="card-head"><h3>Por categoría</h3></div><div class="card-body" id="bycat"></div></div></div>`;
    const reload = () => this.render(el);
    const dt = DataTable($('#tbl', el), {
      placeholder: 'Buscar descripción…',
      toolbar: `${dateRangeToolbar(st)}<select id="f-cat" style="width:auto"><option value="">Todas las categorías</option>${D.s.expenseCategories.map(c => opt(c, c)).join('')}</select>`,
      rows: () => DB.data.expenses.filter(e => !e.voided && inRange(e.date, st.from, st.to) && (!st.cat || e.category === st.cat)).sort((a, b) => b.date.localeCompare(a.date)),
      searchText: e => `${e.description} ${e.category} ${e.reference}`,
      columns: [
        { label: 'Fecha', html: e => fmtDate(e.date) },
        { label: 'Descripción', html: e => `<div class="strong">${esc(e.description)}</div><div class="small muted">${esc(e.reference || '')}</div>` },
        { label: 'Categoría', html: e => `<span class="badge">${esc(e.category)}</span>` },
        { label: 'Pago', html: e => payLabel(e.method) },
        { label: 'Monto', cls: 'num', html: e => `<b>${money(e.amount)}</b>` },
        { label: '', cls: 'actions', html: e => isAdmin() ? `<button class="icon-btn danger" data-act="del" data-id="${e.id}">${icon('trash', 15)}</button>` : '' },
      ],
      footer: rs => `<tr><td colspan="4">${rs.length} gastos</td><td class="num">${money(sum(rs, e => e.amount))}</td><td></td></tr>`,
      onDraw: rows => {
        const by = {}; rows.forEach(e => by[e.category] = (by[e.category] || 0) + e.amount);
        $('#bycat', el).innerHTML = hBars(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })));
      },
      empty: 'Sin gastos en el periodo', emptyIcon: 'wallet',
    });
    bindRange(el, st, () => dt.refresh());
    $('#f-cat', el).onchange = e => { st.cat = e.target.value; dt.refresh(); };
    $('#new', el).onclick = () => expenseForm(reload);
    onActions(el, {
      del: async id => {
        if (!(await confirmBox('¿Eliminar este gasto?', { danger: true, ok: 'Eliminar' }))) return;
        const e = DB.data.expenses.find(x => x.id === id); e.voided = true;
        audit('Gasto eliminado', `${e.description} · ${money(e.amount)}`); DB.commit(); reload();
      },
    });
  },
};
