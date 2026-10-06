'use strict';
/* Panel principal */
Pages.dashboard = {
  title: 'Panel',
  render(el) {
    const t = today();
    const monthStart = t.slice(0, 8) + '01';
    const salesToday = D.salesIn(t, t);
    const salesMonth = D.salesIn(monthStart, t);
    const totToday = sum(salesToday, D.invoiceNet);
    const profitToday = sum(salesToday, i => D.invoiceNetNoTax(i) - D.invoiceCost(i));
    const totMonth = sum(salesMonth, D.invoiceNet);
    const yest = addDays(t, -1);
    const totYest = sum(D.salesIn(yest, yest), D.invoiceNet);
    const diff = totYest ? (totToday - totYest) / totYest * 100 : 0;
    const openCredits = DB.data.invoices.filter(i => i.status !== 'anulada' && i.balance > 0.004);
    const receivable = sum(openCredits, i => i.balance);
    const overdue = openCredits.filter(i => D.overdueDays(i) > 0);
    const lowStock = DB.data.products.filter(p => p.active !== false && D.stockState(p) !== 'ok');
    const sess = D.currentSession();

    const days = [];
    for (let k = 13; k >= 0; k--) {
      const d = addDays(t, -k);
      const tot = sum(DB.data.invoices.filter(i => i.status !== 'anulada' && dayKey(i.date) === d), D.invoiceNet);
      const dd = parseDate(d);
      days.push({ label: `${dd.getDate()} ${MONTHS[dd.getMonth()]}`, value: tot });
    }
    const top = {};
    salesMonth.forEach(i => i.items.forEach(it => { const k = it.name; top[k] = (top[k] || 0) + (it.qty - it.returnedQty); }));
    const topList = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
    const recent = [...DB.data.invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

    el.innerHTML = `
      <div class="page-head">
        <div><div class="muted small">${fmtDate(new Date())}</div><h2 style="margin:4px 0 0;font:600 24px var(--display)">${greet}, ${esc(App.user.name.split(' ')[0])}</h2></div>
        <span class="spacer"></span>
        ${can('pos') ? `<a class="btn chrome" href="#/pos">${icon('pos', 17)} Nueva venta <span class="kbd">F1</span></a>` : ''}
        ${can('quotes') ? `<a class="btn" href="#/quotes/new">${icon('quote', 17)} Cotizar</a>` : ''}
        ${WA.ownerReady() && isAdmin() ? `<button class="btn success" id="dayWa">${waIcon(16)} Resumen al dueño</button>` : ''}
      </div>
      ${!sess && can('cash') ? `<div class="callout warn mb row">${icon('alert', 16)} La caja está cerrada. <span class="spacer"></span><a class="btn sm" href="#/cash">Abrir caja</a></div>` : ''}
      <div class="grid g-4">
        <div class="card kpi accent"><div class="k-label">${icon('pos', 14)} Ventas de hoy</div><div class="k-value">${money(totToday)}</div><div class="k-sub">${salesToday.length} factura${salesToday.length === 1 ? '' : 's'} · ${totYest ? `<span class="${diff >= 0 ? 'ok-text' : 'err-text'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(0)}%</span> vs ayer` : 'sin ventas ayer'}</div></div>
        <div class="card kpi"><div class="k-label">${icon('up', 14)} Ganancia bruta hoy</div><div class="k-value">${money(profitToday)}</div><div class="k-sub">Ticket promedio ${money(salesToday.length ? totToday / salesToday.length : 0)}</div></div>
        <div class="card kpi"><div class="k-label">${icon('calendar', 14)} Ventas del mes</div><div class="k-value">${money(totMonth)}</div><div class="k-sub">${salesMonth.length} facturas</div></div>
        <div class="card kpi"><div class="k-label">${icon('credit', 14)} Por cobrar</div><div class="k-value">${money(receivable)}</div><div class="k-sub">${overdue.length ? `<span class="err-text">${overdue.length} vencida${overdue.length === 1 ? '' : 's'}</span>` : 'Sin vencimientos'}</div></div>
      </div>

      <div class="grid g-main mt">
        <div class="card"><div class="card-head"><h3>Ventas · últimos 14 días</h3><span class="spacer"></span>${can('reports') ? '<a class="btn sm ghost" href="#/reports">Ver reportes</a>' : ''}</div><div class="card-body">${barChart(days)}</div></div>
        <div class="card"><div class="card-head"><h3>Más vendidos del mes</h3></div><div class="card-body">${hBars(topList, v => qtyFmt(v) + ' und')}</div></div>
      </div>

      <div class="grid g-3 mt">
        <div class="card"><div class="card-head"><h3>Últimas ventas</h3><span class="spacer"></span>${can('invoices') ? '<a class="btn sm ghost" href="#/invoices">Todas</a>' : ''}</div>
          ${recent.length ? recent.map(i => `<div class="list-item"><div style="flex:1;min-width:0"><div class="strong">${esc(i.number)}</div><div class="small muted">${esc(i.customerName)} · ${fmtTime(i.date)} ${dayKey(i.date) !== t ? fmtDate(i.date) : ''}</div></div><div class="right"><div class="strong num">${money(i.total)}</div>${badge(i.status)}</div></div>`).join('') : '<div class="empty">Aún no hay ventas</div>'}
        </div>
        <div class="card"><div class="card-head"><h3>Stock bajo</h3><span class="badge ${lowStock.length ? 'warn' : 'ok'}">${lowStock.length}</span><span class="spacer"></span>${can('inventory') ? '<a class="btn sm ghost" href="#/inventory">Inventario</a>' : ''}</div>
          ${lowStock.slice(0, 7).map(p => `<div class="list-item"><div style="flex:1;min-width:0"><div class="strong">${esc(p.name)}</div><div class="small muted">Mínimo ${D.minStock(p)}</div></div><span class="badge ${D.stockState(p) === 'out' ? 'err' : 'warn'}">${qtyFmt(D.stockOf(p))} und</span></div>`).join('') || '<div class="empty">Todo en orden</div>'}
        </div>
        <div class="card"><div class="card-head"><h3>Créditos vencidos</h3><span class="badge ${overdue.length ? 'err' : 'ok'}">${overdue.length}</span><span class="spacer"></span>${can('credits') ? '<a class="btn sm ghost" href="#/credits">Cobros</a>' : ''}</div>
          ${overdue.sort((a, b) => D.overdueDays(b) - D.overdueDays(a)).slice(0, 7).map(i => `<div class="list-item"><div style="flex:1;min-width:0"><div class="strong">${esc(i.customerName)}</div><div class="small muted">${esc(i.number)} · ${D.overdueDays(i)} días</div></div><div class="strong num err-text">${money(i.balance)}</div></div>`).join('') || '<div class="empty">Sin créditos vencidos</div>'}
        </div>
      </div>`;
    const dw = $('#dayWa', el); if (dw) dw.onclick = () => WA.toOwner(WA.dailyText(), 'resumen del día');
  },
};
