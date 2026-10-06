'use strict';
/* ==========================================================
   Reportes
   ========================================================== */
Pages.reports = {
  title: 'Reportes',
  st: null,
  render(el) {
    const st = this.st || (this.st = { from: rangeFor('month')[0], to: today(), key: 'month' });
    el.innerHTML = `<div class="page-head"><div class="row">${dateRangeToolbar(st)}</div><span class="spacer"></span>
      <button class="btn" id="csv">${icon('download', 16)} Detalle CSV</button><button class="btn primary" id="prn">${icon('printer', 16)} Imprimir</button></div><div id="rep"></div>`;
    $('#f-range', el).value = st.key || 'custom';
    bindRange(el, st, () => { st.key = $('#f-range', el).value; draw(); });
    const draw = () => { $('#rep', el).innerHTML = this.build(st); };
    draw();
    $('#prn', el).onclick = () => PR.report('REPORTE DE VENTAS', `${st.from ? fmtDate(st.from) : 'Inicio'} — ${st.to ? fmtDate(st.to) : 'Hoy'}`, this.printable(st));
    $('#csv', el).onclick = () => {
      const rows = [];
      D.salesIn(st.from, st.to).forEach(i => i.items.forEach(it => rows.push({ i, it })));
      downloadFile(`ventas-detalle-${st.from || 'todo'}-${st.to || ''}.csv`, toCSV(rows, [
        { label: 'Factura', value: r => r.i.number }, { label: 'Fecha', value: r => fmtDateTime(r.i.date) }, { label: 'Cliente', value: r => r.i.customerName },
        { label: 'Vendedor', value: r => r.i.userName }, { label: 'Producto', value: r => r.it.name }, { label: 'Variante', value: r => r.it.variant }, { label: 'SKU', value: r => r.it.sku },
        { label: 'Cantidad', value: r => r.it.qty }, { label: 'Devuelto', value: r => r.it.returnedQty }, { label: 'Precio', value: r => r.it.price }, { label: 'Desc %', value: r => r.it.discount },
        { label: 'Importe', value: r => r.it.lineTotal }, { label: 'Costo unit', value: r => r.it.cost }, { label: 'Tipo', value: r => r.i.type },
      ]), 'text/csv');
    };
  },
  data(st) {
    const invs = D.salesIn(st.from, st.to);
    const gross = sum(invs, D.invoiceNet);
    const netNoTax = sum(invs, D.invoiceNetNoTax);
    const cost = sum(invs, D.invoiceCost);
    const tax = gross - netNoTax;
    const discount = sum(invs, i => i.discount);
    const rets = D.returnsIn(st.from, st.to);
    const expenses = sum(DB.data.expenses.filter(e => !e.voided && inRange(e.date, st.from, st.to)), e => e.amount);
    const profit = netNoTax - cost;
    const interest = sum(invs, i => i.credit?.interest || 0);
    const prods = {}, cats = {}, sellers = {}, methods = {}, hours = Array(24).fill(0), days = {};
    invs.forEach(i => {
      const net = D.invoiceNet(i);
      const s = sellers[i.userName] = sellers[i.userName] || { n: 0, total: 0, profit: 0 };
      s.n++; s.total += net; s.profit += D.invoiceNetNoTax(i) - D.invoiceCost(i);
      hours[new Date(i.date).getHours()] += net;
      const dk = dayKey(i.date); days[dk] = (days[dk] || 0) + net;
      i.payments.forEach(p => { methods[p.method] = (methods[p.method] || 0) + p.amount - (p.method === 'efectivo' ? i.change || 0 : 0); });
      if (i.credit) methods.credito = (methods.credito || 0) + i.credit.financed;
      i.items.forEach(it => {
        const q = it.qty - it.returnedQty; if (q <= 0) return;
        const rev = it.lineTotal / it.qty * q;
        const k = it.name + (it.productId ? '' : ' (libre)');
        const pr = prods[k] = prods[k] || { name: k, qty: 0, rev: 0, cost: 0 };
        pr.qty += q; pr.rev += rev; pr.cost += it.cost * q;
        const p = it.productId && D.product(it.productId);
        const cn = p ? (D.category(p.categoryId)?.name || 'Sin categoría') : 'Artículos libres';
        cats[cn] = (cats[cn] || 0) + rev;
      });
    });
    return { invs, gross, netNoTax, cost, tax, discount, rets, expenses, profit, interest, prods, cats, sellers, methods, hours, days };
  },
  series(st, days) {
    const from = st.from || (Object.keys(days).sort()[0] || today()), to = st.to || today();
    const span = daysBetween(from, to);
    const out = [];
    if (span <= 62) {
      for (let d = from; d <= to; d = addDays(d, 1)) { const dd = parseDate(d); out.push({ label: `${dd.getDate()}/${dd.getMonth() + 1}`, value: days[d] || 0 }); }
    } else {
      const months = {};
      Object.entries(days).forEach(([d, v]) => { const k = d.slice(0, 7); months[k] = (months[k] || 0) + v; });
      let x = parseDate(from.slice(0, 8) + '01');
      while (dayKey(x) <= to) { const k = dayKey(x).slice(0, 7); out.push({ label: `${MONTHS[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`, value: months[k] || 0 }); x = new Date(x.getFullYear(), x.getMonth() + 1, 1); }
    }
    return out;
  },
  build(st) {
    const r = this.data(st);
    const n = r.invs.length;
    const margin = r.netNoTax ? r.profit / r.netNoTax * 100 : 0;
    const topProds = Object.values(r.prods).sort((a, b) => b.rev - a.rev);
    const kpi = (l, v, sub = '', cls = '') => `<div class="card kpi"><div class="k-label">${l}</div><div class="k-value ${cls}">${v}</div>${sub ? `<div class="k-sub">${sub}</div>` : ''}</div>`;
    return `<div class="grid g-4">
        ${kpi('Ventas netas', money(r.gross), `${n} facturas · ticket prom. ${money(n ? r.gross / n : 0)}`)}
        ${kpi('Costo de lo vendido', money(r.cost), `Ventas sin impuesto ${money(r.netNoTax)}`)}
        ${kpi('Utilidad bruta', money(r.profit), `Margen ${margin.toFixed(1)}%`, 'ok-text')}
        ${kpi('Utilidad neta', money(r.profit + r.interest - r.expenses), `Gastos ${money(r.expenses)}${r.interest ? ` · Intereses ${money(r.interest)}` : ''}`, r.profit + r.interest - r.expenses >= 0 ? '' : 'err-text')}
      </div>
      <div class="grid g-4 mt">
        ${kpi(`${esc(D.s.taxName)} cobrado`, money(r.tax))}
        ${kpi('Descuentos otorgados', money(r.discount))}
        ${kpi('Devoluciones', money(sum(r.rets, x => x.amount)), `${r.rets.length} notas`)}
        ${kpi('Unidades vendidas', qtyFmt(sum(topProds, p => p.qty)))}
      </div>
      <div class="card mt"><div class="card-head"><h3>Ventas en el periodo</h3></div><div class="card-body">${barChart(this.series(st, r.days), { highlightLast: false })}</div></div>
      <div class="grid g-3 mt">
        <div class="card"><div class="card-head"><h3>Por categoría</h3></div><div class="card-body">${hBars(Object.entries(r.cats).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })))}</div></div>
        <div class="card"><div class="card-head"><h3>Por forma de pago</h3></div><div class="card-body">${hBars(Object.entries(r.methods).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(([k, value]) => ({ label: payLabel(k), value })))}</div></div>
        <div class="card"><div class="card-head"><h3>Por hora del día</h3></div><div class="card-body">${hBars(r.hours.map((v, h) => ({ label: `${pad(h)}:00 – ${pad(h)}:59`, value: v })).filter(x => x.value > 0))}</div></div>
      </div>
      <div class="grid g-main mt">
        <div class="card"><div class="card-head"><h3>Productos más vendidos</h3><span class="spacer"></span><span class="small muted">${topProds.length} productos</span></div>
          <div class="table-wrap" style="max-height:440px;overflow:auto"><table class="tbl compact"><thead><tr><th>Producto</th><th class="num">Unid.</th><th class="num">Ventas</th><th class="num">Costo</th><th class="num">Margen</th></tr></thead><tbody>
          ${topProds.slice(0, 50).map(p => `<tr><td>${esc(p.name)}</td><td class="num">${qtyFmt(p.qty)}</td><td class="num">${money(p.rev)}</td><td class="num">${money(p.cost)}</td><td class="num">${p.rev ? ((p.rev - p.cost) / p.rev * 100).toFixed(0) + '%' : '—'}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Sin ventas</div></td></tr>'}
          </tbody></table></div></div>
        <div class="stack">${this.commissions(r)}<div class="card"><div class="card-head"><h3>Por vendedor</h3></div><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Vendedor</th><th class="num">Fact.</th><th class="num">Ventas</th><th class="num">Utilidad</th></tr></thead><tbody>
          ${Object.entries(r.sellers).sort((a, b) => b[1].total - a[1].total).map(([k, s]) => `<tr><td>${esc(k)}</td><td class="num">${s.n}</td><td class="num">${money(s.total)}</td><td class="num">${money(s.profit)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Sin datos</div></td></tr>'}
          </tbody></table></div></div></div>
      </div>`;
  },
  commissions(r) {
    if (!LIC.has('commissions')) return '';
    const by = {};
    r.invs.forEach(i => { const k = i.userId; by[k] = by[k] || { name: i.userName, base: 0 }; by[k].base += D.invoiceNetNoTax(i); });
    const rows = Object.entries(by).map(([id, x]) => { const u = DB.data.users.find(us => us.id === id); const pct = +(u?.commission || 0); return { ...x, pct, amount: x.base * pct / 100 }; }).sort((a, b) => b.amount - a.amount);
    return `<div class="card"><div class="card-head"><h3>Comisiones de vendedores</h3><span class="spacer"></span><span class="small muted">% en Configuración → Usuarios</span></div><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Vendedor</th><th class="num">Ventas sin imp.</th><th class="num">%</th><th class="num">Comisión</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${money(x.base)}</td><td class="num">${x.pct ? x.pct + '%' : '<span class="muted">—</span>'}</td><td class="num"><b>${money(x.amount)}</b></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Sin ventas</div></td></tr>'}
      </tbody>${rows.length ? `<tfoot><tr><td colspan="3">Total a pagar</td><td class="num">${money(sum(rows, x => x.amount))}</td></tr></tfoot>` : ''}</table></div></div>`;
  },
  printable(st) {
    const r = this.data(st);
    const topProds = Object.values(r.prods).sort((a, b) => b.rev - a.rev).slice(0, 40);
    return `<div class="kpis"><div><span>Ventas netas</span><b>${money(r.gross)}</b></div><div><span>Utilidad bruta</span><b>${money(r.profit)}</b></div><div><span>Utilidad neta</span><b>${money(r.profit - r.expenses)}</b></div>
      <div><span>Facturas</span><b>${r.invs.length}</b></div><div><span>${esc(D.s.taxName)}</span><b>${money(r.tax)}</b></div><div><span>Gastos</span><b>${money(r.expenses)}</b></div></div>
      <h3 class="sec">Formas de pago</h3><table class="items"><tbody>${Object.entries(r.methods).map(([k, v]) => `<tr><td>${payLabel(k)}</td><td class="r">${money(v)}</td></tr>`).join('')}</tbody></table>
      <h3 class="sec">Categorías</h3><table class="items"><tbody>${Object.entries(r.cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${money(v)}</td></tr>`).join('')}</tbody></table>
      <h3 class="sec">Productos más vendidos</h3><table class="items"><thead><tr><th>Producto</th><th class="r">Unid.</th><th class="r">Ventas</th><th class="r">Utilidad</th></tr></thead><tbody>${topProds.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${qtyFmt(p.qty)}</td><td class="r">${money(p.rev)}</td><td class="r">${money(p.rev - p.cost)}</td></tr>`).join('')}</tbody></table>
      <h3 class="sec">Vendedores</h3><table class="items"><tbody>${Object.entries(r.sellers).map(([k, s]) => `<tr><td>${esc(k)}</td><td class="r">${s.n} fact.</td><td class="r">${money(s.total)}</td></tr>`).join('')}</tbody></table>`;
  },
};
