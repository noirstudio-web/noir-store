'use strict';
/* ==========================================================
   NOIR STORE — Lógica de negocio
   ========================================================== */

const PAY_METHODS = {
  efectivo: { label: 'Efectivo', icon: 'cash' },
  tarjeta: { label: 'Tarjeta', icon: 'card' },
  transferencia: { label: 'Transferencia', icon: 'bank' },
  saldo: { label: 'Saldo a favor', icon: 'gift' },
  puntos: { label: 'Puntos', icon: 'spark' },
  apartado: { label: 'Abonos de apartado', icon: 'tag' },
};
const payLabel = m => (PAY_METHODS[m] || { label: m === 'credito' ? 'Crédito' : m }).label;

const STATUS_BADGE = {
  pagada: 'ok', pendiente: 'warn', parcial: 'info', anulada: 'err', vencida: 'err',
  aceptada: 'ok', facturada: 'silver', rechazada: 'err', borrador: '', recibida: 'ok',
  abierta: 'ok', cerrada: '', activo: 'info', entregado: 'ok', cancelado: '', vencido: 'err',
};
const badge = (status, label) => `<span class="badge ${STATUS_BADGE[status] ?? ''}">${esc(label || status.charAt(0).toUpperCase() + status.slice(1))}</span>`;

const D = {
  get s() { return DB.data.settings; },

  nextNo(type) {
    const s = this.s; const n = s.seq[type] || 1; s.seq[type] = n + 1;
    return `${s.prefixes[type] || type.toUpperCase()}-${pad(n, 6)}`;
  },
  peekNo(type) { const s = this.s; return `${s.prefixes[type]}-${pad(s.seq[type] || 1, 6)}`; },

  /* ---------- Catálogo ---------- */
  _vcache: null, _vrev: -1,
  vmap() {
    if (this._vrev !== DB.rev || !this._vcache) {
      const m = new Map();
      DB.data.products.forEach(p => p.variants.forEach(v => m.set(v.id, { p, v })));
      this._vcache = m; this._vrev = DB.rev;
    }
    return this._vcache;
  },
  findVariant(vid) { return this.vmap().get(vid) || null; },
  product: id => DB.data.products.find(p => p.id === id),
  customer: id => DB.data.customers.find(c => c.id === id),
  supplier: id => DB.data.suppliers.find(c => c.id === id),
  category: id => DB.data.categories.find(c => c.id === id),
  brand: id => DB.data.brands.find(c => c.id === id),
  userName: id => (DB.data.users.find(u => u.id === id) || {}).name || '—',
  vLabel: v => v ? [v.size, v.color].filter(Boolean).join(' / ') : '',
  vPrice: (p, v) => (v && v.price !== null && v.price !== '' && v.price !== undefined) ? +v.price : +p.price,
  vCost: (p, v) => (v && v.cost !== null && v.cost !== '' && v.cost !== undefined) ? +v.cost : +p.cost,
  stockOf: p => round2(sum(p.variants, v => v.stock)),
  minStock(p) { return p.minStock !== '' && p.minStock != null ? +p.minStock : this.s.lowStockDefault; },
  stockState(p, v) {
    const st = v ? v.stock : this.stockOf(p);
    if (st <= 0) return 'out';
    const min = v ? Math.max(1, Math.ceil(this.minStock(p) / Math.max(1, p.variants.length))) : this.minStock(p);
    return st <= min ? 'low' : 'ok';
  },
  findByCode(code) {
    const c = norm(code).trim(); if (!c) return null;
    for (const { p, v } of this.vmap().values()) {
      if (p.active === false) continue;
      if (norm(v.barcode) === c || norm(v.sku) === c) return { p, v };
    }
    return null;
  },
  newSku(name) {
    const base = norm(name).replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'PRD';
    return `${base}-${pad(this.s.seq.sku++, 4)}`;
  },
  /* Código interno EAN-13 (prefijo 200 = uso interno de tienda) */
  newBarcode() {
    const body = '200' + pad(this.s.seq.barcode++, 9);
    let t = 0; for (let i = 0; i < 12; i++) t += +body[i] * (i % 2 ? 3 : 1);
    return body + ((10 - t % 10) % 10);
  },

  /* ---------- Movimientos de inventario ---------- */
  move(vid, qty, type, ref = '', note = '') {
    const f = this.findVariant(vid); if (!f) return;
    f.v.stock = round2((+f.v.stock || 0) + qty);
    DB.data.movements.push({
      id: uid(), date: nowISO(), productId: f.p.id, variantId: vid, name: f.p.name, variant: this.vLabel(f.v),
      type, qty, balance: f.v.stock, ref, note, userId: App.user?.id,
    });
  },

  /* ---------- Totales ---------- */
  totals(items, gd = 0, gdType = 'percent') {
    const incl = this.s.pricesIncludeTax, r = (+this.s.taxRate || 0) / 100;
    let subtotal = 0, lineDisc = 0;
    const lines = items.map(it => {
      const gross = (+it.qty || 0) * (+it.price || 0);
      const ld = gross * (+it.discount || 0) / 100;
      subtotal += gross; lineDisc += ld;
      return { net: gross - ld, taxable: it.taxable !== false };
    });
    const netSum = sum(lines, l => l.net);
    const g = gdType === 'percent' ? netSum * (+gd || 0) / 100 : Math.min(+gd || 0, netSum);
    let tax = 0, total = 0;
    lines.forEach(l => {
      const after = netSum ? l.net - g * (l.net / netSum) : 0;
      let lt, tx;
      if (!l.taxable || !r) { lt = after; tx = 0; }
      else if (incl) { lt = after; tx = after - after / (1 + r); }
      else { tx = after * r; lt = after + tx; }
      l.total = round2(lt); l.tax = round2(tx);
      tax += tx; total += lt;
    });
    return { subtotal: round2(subtotal), discount: round2(lineDisc + g), globalDiscount: round2(g), tax: round2(tax), total: round2(total), base: round2(total - tax), lines };
  },

  /* ---------- Clientes / créditos ---------- */
  openInvoices(customerId) {
    return DB.data.invoices.filter(i => i.customerId === customerId && i.status !== 'anulada' && i.balance > 0.004)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  customerBalance(customerId) { return round2(sum(this.openInvoices(customerId), i => i.balance)); },
  creditAvailable(c) { return c.creditLimit > 0 ? round2(c.creditLimit - this.customerBalance(c.id)) : Infinity; },
  invStatus(inv) {
    if (inv.status === 'anulada') return 'anulada';
    if (inv.balance <= 0.004) return 'pagada';
    return inv.balance < inv.total - 0.004 ? 'parcial' : 'pendiente';
  },
  /* Interés de financiación: % total o % mensual según la duración del plan de cuotas */
  creditMonths(c) { const n = Math.max(1, +c.installments || 1); return c.frequency === 'quincenal' ? n / 2 : c.frequency === 'semanal' ? n * 7 / 30 : n; },
  creditInterest(principal, c = {}) {
    const rate = Math.max(0, +c.interestRate || 0);
    if (!rate || principal <= 0) return 0;
    const v = principal * rate / 100 * (c.interestType === 'mensual' ? this.creditMonths(c) : 1);
    return this.s.decimals === 0 ? Math.round(v) : round2(v);
  },
  schedule(inv) {
    const c = inv.credit; if (!c) return [];
    const n = Math.max(1, +c.installments || 1);
    const amt = c.financed / n;
    let paid = Math.max(0, c.financed - inv.balance);
    const t = today();
    const out = [];
    for (let k = 0; k < n; k++) {
      const date = c.frequency === 'semanal' ? addDays(c.firstDue, 7 * k) : c.frequency === 'quincenal' ? addDays(c.firstDue, 15 * k) : addMonths(c.firstDue, k);
      const p = Math.min(amt, paid); paid -= p;
      const status = p >= amt - 0.01 ? 'pagada' : date < t ? 'vencida' : (p > 0 ? 'parcial' : 'pendiente');
      out.push({ n: k + 1, date, amount: round2(amt), paid: round2(p), pending: round2(amt - p), status });
    }
    return out;
  },
  /* Todo lo pagado de una factura (inicial + abonos) agrupado por forma de pago */
  paidByMethod(inv) {
    const by = {};
    inv.payments.forEach(p => { if (p.method !== 'apartado') by[p.method] = (by[p.method] || 0) + p.amount; });
    if (inv.change) by.efectivo = (by.efectivo || 0) - inv.change;
    DB.data.payments.forEach(p => { if (p.voided) return; const a = p.allocations.find(x => x.invoiceId === inv.id); if (a) by[p.method] = (by[p.method] || 0) + a.amount; });
    Object.keys(by).forEach(k => { by[k] = round2(by[k]); if (by[k] <= 0.004) delete by[k]; });
    return by;
  },
  abonosOf(inv) {
    return DB.data.payments.filter(p => !p.voided && p.allocations.some(a => a.invoiceId === inv.id))
      .map(p => ({ number: p.number, date: p.date, method: p.method, amount: p.allocations.find(a => a.invoiceId === inv.id).amount }));
  },
  nextDue(inv) { return this.schedule(inv).find(x => x.status !== 'pagada') || null; },
  overdueDays(inv) {
    if (inv.status === 'anulada' || inv.balance <= 0.004) return 0;
    const nd = this.nextDue(inv); if (!nd) return 0;
    const d = daysBetween(nd.date, today()); return d > 0 ? d : 0;
  },
  overdueAmount(inv) { return round2(sum(this.schedule(inv).filter(x => x.status === 'vencida'), x => x.pending)); },

  /* ---------- Caja ---------- */
  currentSession() { return DB.data.cashSessions.find(s => s.status === 'abierta') || null; },
  openSession(amount, note = '') {
    if (this.currentSession()) throw new Error('Ya hay una caja abierta');
    const s = { id: uid(), number: this.nextNo('session'), openedAt: nowISO(), openedBy: App.user.id, openedByName: App.user.name, openingAmount: round2(amount), status: 'abierta', note };
    DB.data.cashSessions.push(s); audit('Apertura de caja', `${s.number} · ${money(amount)}`); DB.commit(); return s;
  },
  sessionSummary(s) {
    const d = DB.data;
    const invs = d.invoices.filter(i => i.sessionId === s.id && i.status !== 'anulada');
    const by = { efectivo: 0, tarjeta: 0, transferencia: 0, saldo: 0 };
    let change = 0, creditSales = 0;
    invs.forEach(i => { i.payments.forEach(p => by[p.method] = (by[p.method] || 0) + p.amount); change += i.change || 0; creditSales += i.credit ? i.credit.financed : 0; });
    const pays = d.payments.filter(p => p.sessionId === s.id && !p.voided);
    const ab = { efectivo: 0, tarjeta: 0, transferencia: 0, saldo: 0 };
    pays.forEach(p => ab[p.method] = (ab[p.method] || 0) + p.amount);
    const refunds = sum(d.returns.filter(r => r.sessionId === s.id && r.method === 'efectivo'), r => r.refund);
    const moves = d.cashMoves.filter(m => m.sessionId === s.id);
    const ins = sum(moves.filter(m => m.type === 'entrada'), m => m.amount);
    const outs = sum(moves.filter(m => m.type === 'salida'), m => m.amount);
    const expenses = sum(d.expenses.filter(e => e.sessionId === s.id && e.method === 'efectivo' && !e.voided), e => e.amount);
    const supPays = sum(d.supplierPayments.filter(p => p.sessionId === s.id && p.method === 'efectivo'), p => p.amount);
    const lay = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    (d.layaways || []).forEach(l => l.payments.forEach(p => { if (p.sessionId === s.id) lay[p.method] = (lay[p.method] || 0) + p.amount; }));
    const layRefunds = sum((d.layaways || []).filter(l => l.refund && l.refund.sessionId === s.id && l.refund.method === 'efectivo'), l => l.refund.amount);
    const cashSales = round2(by.efectivo - change);
    const expected = round2(s.openingAmount + cashSales + ab.efectivo + lay.efectivo + ins - outs - refunds - layRefunds - expenses - supPays);
    const salesTotal = round2(sum(invs, i => i.total));
    return {
      opening: s.openingAmount, invoices: invs.length, salesTotal, cashSales, card: round2(by.tarjeta), transfer: round2(by.transferencia),
      storeCredit: round2(by.saldo), creditSales: round2(creditSales), abonosCash: round2(ab.efectivo), abonosCard: round2(ab.tarjeta),
      abonosTransfer: round2(ab.transferencia), ins: round2(ins), outs: round2(outs), refunds: round2(refunds), expenses: round2(expenses),
      supplierPayments: round2(supPays), expected,
      layawayCash: round2(lay.efectivo), layawayCard: round2(lay.tarjeta), layawayTransfer: round2(lay.transferencia), layawayRefunds: round2(layRefunds),
      points: round2(by.puntos || 0),
    };
  },
  closeSession(counted, note = '') {
    const s = this.currentSession(); if (!s) throw new Error('No hay caja abierta');
    s.summary = this.sessionSummary(s);
    s.expected = s.summary.expected; s.counted = round2(counted); s.difference = round2(counted - s.expected);
    s.closedAt = nowISO(); s.closedBy = App.user.id; s.closedByName = App.user.name; s.closeNote = note; s.status = 'cerrada';
    audit('Cierre de caja', `${s.number} · diferencia ${money(s.difference)}`); DB.commit(); return s;
  },
  cashMove(type, amount, reason) {
    const s = this.currentSession(); if (!s) throw new Error('Abre la caja primero');
    const m = { id: uid(), sessionId: s.id, date: nowISO(), type, amount: round2(amount), reason, userId: App.user.id, userName: App.user.name };
    DB.data.cashMoves.push(m); DB.commit(); return m;
  },

  /* ---------- Ventas ---------- */
  createSale({ customerId = 'walkin', items, gd = 0, gdType = 'percent', payments = [], credit = null, notes = '', quoteId = null, overrideLimit = false, fromLayaway = null }) {
    const d = DB.data, s = this.s;
    if (!items.length) throw new Error('El carrito está vacío');
    const cust = this.customer(customerId) || this.customer('walkin');
    // validación de stock (un apartado ya descontó su mercancía)
    if (!s.allowNegativeStock && !fromLayaway) {
      const need = {};
      items.forEach(it => { if (it.variantId) need[it.variantId] = (need[it.variantId] || 0) + +it.qty; });
      for (const vid in need) {
        const f = this.findVariant(vid);
        if (!f) throw new Error('Un producto del carrito ya no existe');
        if (f.v.stock < need[vid]) throw new Error(`Stock insuficiente: ${f.p.name} ${this.vLabel(f.v)} (disponible ${qtyFmt(f.v.stock)})`);
      }
    }
    const t = this.totals(items, gd, gdType);
    const pays = payments.filter(p => +p.amount > 0).map(p => ({ method: p.method, amount: round2(p.amount), ref: p.ref || '' }));
    const paidTotal = round2(sum(pays, p => p.amount));
    const storeUse = round2(sum(pays.filter(p => p.method === 'saldo'), p => p.amount));
    if (storeUse > 0 && storeUse > (cust.storeCredit || 0) + 0.004) throw new Error('El cliente no tiene suficiente saldo a favor');
    const L = s.loyalty, pointsPay = round2(sum(pays.filter(p => p.method === 'puntos'), p => p.amount));
    const pointsNeeded = pointsPay > 0 ? Math.ceil(pointsPay / L.pointValue - 1e-9) : 0;
    if (pointsPay > 0 && (!this.loyaltyOn() || cust.id === 'walkin')) throw new Error('El programa de puntos no está disponible');
    if (pointsNeeded > (cust.points || 0)) throw new Error(`Puntos insuficientes: el cliente tiene ${cust.points || 0}`);
    let change = 0, balance = 0, interest = 0;
    if (paidTotal >= t.total - 0.004) {
      change = round2(paidTotal - t.total);
      const cash = sum(pays.filter(p => p.method === 'efectivo'), p => p.amount);
      if (change > cash + 0.004) throw new Error('El cambio solo puede entregarse en efectivo. Ajusta los montos.');
    } else {
      balance = round2(t.total - paidTotal);
      if (cust.id === 'walkin') throw new Error('Para vender a crédito selecciona un cliente registrado');
      if (typeof LIC !== 'undefined' && !LIC.has('credits')) throw new Error(LIC.upgradeMsg('Ventas a crédito'));
      interest = this.creditInterest(balance, credit || {});
      if (!overrideLimit && cust.creditLimit > 0 && this.customerBalance(cust.id) + balance + interest > cust.creditLimit + 0.004)
        throw Object.assign(new Error(`Excede el límite de crédito del cliente (${money(cust.creditLimit)}). Disponible: ${money(this.creditAvailable(cust))}`), { code: 'LIMIT' });
    }
    const session = this.currentSession();
    const inv = {
      id: uid(), number: this.nextNo('invoice'), date: nowISO(),
      customerId: cust.id, customerName: cust.name, customerDoc: cust.docId || '',
      userId: App.user.id, userName: App.user.name,
      items: items.map((it, i) => ({
        variantId: it.variantId || null, productId: it.productId || null, name: it.name, variant: it.variant || '', sku: it.sku || '',
        qty: +it.qty, price: round2(it.price), discount: +it.discount || 0, cost: round2(it.cost || 0), taxable: it.taxable !== false,
        lineTotal: t.lines[i].total, lineTax: t.lines[i].tax, returnedQty: 0,
      })),
      subtotal: t.subtotal, discount: t.discount, gd: +gd || 0, gdType, tax: t.tax, total: t.total,
      taxRate: s.taxRate, taxName: s.taxName, pricesIncludeTax: s.pricesIncludeTax,
      payments: pays, change, paid: round2(t.total - balance), balance,
      type: balance > 0 ? 'credito' : 'contado', status: 'pagada', notes, quoteId, sessionId: session ? session.id : null,
      credit: null,
    };
    if (balance > 0) {
      const c = credit || {};
      const n = Math.max(1, +c.installments || 1);
      const freq = c.frequency || 'mensual';
      const firstDue = c.firstDue || addDays(today(), cust.creditDays || s.creditDefaultDays);
      const rate = Math.max(0, +c.interestRate || 0);
      const payMethod = ['efectivo', 'tarjeta', 'transferencia'].includes(c.payMethod) ? c.payMethod : 'efectivo';
      inv.credit = { installments: n, frequency: freq, firstDue, principal: balance, interest, interestRate: rate, interestType: rate ? (c.interestType || 'mensual') : null, financed: round2(balance + interest), payMethod };
      inv.balance = round2(balance + interest);
      const sch = this.schedule(inv);
      inv.dueDate = sch[sch.length - 1].date;
    }
    inv.status = this.invStatus(inv);
    if (storeUse > 0) cust.storeCredit = round2((cust.storeCredit || 0) - storeUse);
    // programa de puntos
    if (pointsNeeded) { cust.points = (cust.points || 0) - pointsNeeded; inv.pointsUsed = pointsNeeded; }
    if (this.loyaltyOn() && cust.id !== 'walkin') {
      const earned = Math.floor((t.total - pointsPay) / L.earnEvery);
      if (earned > 0) { cust.points = (cust.points || 0) + earned; inv.pointsEarned = earned; }
      inv.pointsBalance = cust.points || 0;
    }
    if (fromLayaway) inv.layawayId = fromLayaway;
    else inv.items.forEach(it => { if (it.variantId) this.move(it.variantId, -it.qty, 'venta', inv.number); });
    if (quoteId) { const q = d.quotes.find(x => x.id === quoteId); if (q) { q.status = 'facturada'; q.invoiceId = inv.id; q.invoiceNumber = inv.number; } }
    d.invoices.push(inv);
    DB.commit();
    return inv;
  },

  voidInvoice(id, reason) {
    const inv = DB.data.invoices.find(i => i.id === id);
    if (!inv || inv.status === 'anulada') throw new Error('La factura ya está anulada');
    if (DB.data.payments.some(p => !p.voided && p.allocations.some(a => a.invoiceId === id))) throw new Error('La factura tiene abonos registrados. Anula los abonos primero.');
    if (inv.items.some(it => it.returnedQty > 0)) throw new Error('La factura tiene devoluciones. No se puede anular.');
    if (inv.layawayId) throw new Error('Esta factura es la entrega de un apartado. Usa una devolución.');
    inv.items.forEach(it => { if (it.variantId && this.findVariant(it.variantId)) this.move(it.variantId, it.qty, 'anulacion', inv.number, reason); });
    const cust = this.customer(inv.customerId);
    const storeUse = sum(inv.payments.filter(p => p.method === 'saldo'), p => p.amount);
    if (cust && storeUse) cust.storeCredit = round2((cust.storeCredit || 0) + storeUse);
    if (cust && inv.pointsEarned) cust.points = Math.max(0, (cust.points || 0) - inv.pointsEarned);
    if (cust && inv.pointsUsed) cust.points = (cust.points || 0) + inv.pointsUsed;
    // si la venta pertenece a otra sesión de caja, registrar la salida del efectivo en la caja actual
    const cur = this.currentSession();
    const cashNet = round2(sum(inv.payments.filter(p => p.method === 'efectivo'), p => p.amount) - (inv.change || 0));
    if (cashNet > 0 && cur && inv.sessionId !== cur.id) {
      DB.data.cashMoves.push({ id: uid(), sessionId: cur.id, date: nowISO(), type: 'salida', amount: cashNet, reason: `Anulación ${inv.number}`, userId: App.user.id, userName: App.user.name });
    }
    if (inv.quoteId) { const q = DB.data.quotes.find(x => x.id === inv.quoteId); if (q) { q.status = 'aceptada'; q.invoiceId = null; } }
    inv.status = 'anulada'; inv.voidReason = reason; inv.voidedAt = nowISO(); inv.voidedBy = App.user.name; inv.balance = 0;
    audit('Anulación de factura', `${inv.number} · ${reason}`);
    DB.commit();
  },

  /* ---------- Programa de puntos ---------- */
  loyaltyOn() { return this.s.loyalty.enabled && typeof LIC !== 'undefined' && LIC.has('loyalty'); },
  pointsMoney(points) { return round2((points || 0) * this.s.loyalty.pointValue); },

  /* ---------- Promociones automáticas ---------- */
  promoFor(p) {
    if (typeof LIC === 'undefined' || !LIC.has('promos') || !p) return null;
    const t = today(); let best = null;
    (DB.data.promos || []).forEach(pr => {
      if (!pr.active || (pr.from && t < pr.from) || (pr.to && t > pr.to)) return;
      const ok = pr.scope === 'all' || (pr.scope === 'category' && pr.targetId === p.categoryId) || (pr.scope === 'product' && pr.targetId === p.id);
      if (ok && (!best || +pr.value > +best.value)) best = pr;
    });
    return best;
  },

  /* ---------- Apartados (plan separe) ---------- */
  layawayStatus(l) { return l.status === 'activo' && l.dueDate < today() ? 'vencido' : l.status; },
  createLayaway({ customerId, items, gd = 0, gdType = 'percent', deposit, method = 'efectivo', dueDate, notes = '' }) {
    const s = this.s;
    if (!LIC.has('layaway')) throw new Error(LIC.upgradeMsg('Apartados'));
    if (!items.length) throw new Error('El carrito está vacío');
    const cust = this.customer(customerId);
    if (!cust || cust.id === 'walkin') throw new Error('Para apartar selecciona un cliente registrado');
    if (!s.allowNegativeStock) {
      const need = {};
      items.forEach(it => { if (it.variantId) need[it.variantId] = (need[it.variantId] || 0) + +it.qty; });
      for (const vid in need) { const f = this.findVariant(vid); if (!f || f.v.stock < need[vid]) throw new Error(`Stock insuficiente: ${f ? f.p.name + ' ' + this.vLabel(f.v) : 'producto'}`); }
    }
    const t = this.totals(items, gd, gdType);
    deposit = round2(deposit);
    const min = round2(t.total * s.layaway.minDepositPct / 100);
    if (deposit < min - 0.004) throw new Error(`El abono inicial mínimo es ${money(min)} (${s.layaway.minDepositPct}%)`);
    if (deposit > t.total + 0.004) throw new Error('El abono no puede superar el total');
    const session = this.currentSession();
    if (method === 'efectivo' && deposit > 0 && s.requireCashSession && !session) throw new Error('Abre la caja para recibir efectivo');
    const l = {
      id: uid(), number: this.nextNo('layaway'), date: nowISO(), customerId: cust.id, customerName: cust.name,
      userId: App.user.id, userName: App.user.name,
      items: items.map((it, i) => ({ variantId: it.variantId || null, productId: it.productId || null, name: it.name, variant: it.variant || '', sku: it.sku || '', qty: +it.qty, price: round2(it.price), discount: +it.discount || 0, cost: round2(it.cost || 0), taxable: it.taxable !== false, lineTotal: t.lines[i].total })),
      gd: +gd || 0, gdType, subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
      payments: [], paid: 0, balance: t.total, dueDate: dueDate || addDays(today(), s.layaway.days), status: 'activo', notes,
    };
    if (deposit > 0) l.payments.push({ id: uid(), date: nowISO(), amount: deposit, method, userId: App.user.id, userName: App.user.name, sessionId: session ? session.id : null });
    l.paid = deposit; l.balance = round2(t.total - deposit);
    l.items.forEach(it => { if (it.variantId) this.move(it.variantId, -it.qty, 'apartado', l.number); });
    DB.data.layaways.push(l);
    audit('Apartado creado', `${l.number} · ${cust.name} · ${money(l.total)}`);
    DB.commit();
    return l;
  },
  layawayPay(id, amount, method) {
    const l = DB.data.layaways.find(x => x.id === id);
    if (!l || l.status !== 'activo') throw new Error('El apartado no está activo');
    amount = round2(amount);
    if (amount <= 0 || amount > l.balance + 0.004) throw new Error(`Monto inválido. Saldo pendiente: ${money(l.balance)}`);
    const session = this.currentSession();
    if (method === 'efectivo' && this.s.requireCashSession && !session) throw new Error('Abre la caja para recibir efectivo');
    const p = { id: uid(), date: nowISO(), amount, method, userId: App.user.id, userName: App.user.name, sessionId: session ? session.id : null };
    l.payments.push(p); l.paid = round2(l.paid + amount); l.balance = round2(l.total - l.paid);
    DB.commit();
    return p;
  },
  deliverLayaway(id) {
    const l = DB.data.layaways.find(x => x.id === id);
    if (!l || l.status !== 'activo') throw new Error('El apartado no está activo');
    if (l.balance > 0.004) throw new Error(`Aún debe ${money(l.balance)}`);
    const t = this.totals(l.items, l.gd, l.gdType);
    const inv = this.createSale({ customerId: l.customerId, items: l.items.map(({ lineTotal, ...it }) => it), gd: l.gd, gdType: l.gdType, payments: [{ method: 'apartado', amount: t.total }], notes: `Entrega del apartado ${l.number}`, fromLayaway: l.id });
    l.status = 'entregado'; l.invoiceId = inv.id; l.invoiceNumber = inv.number; l.deliveredAt = nowISO();
    audit('Apartado entregado', `${l.number} → ${inv.number}`);
    DB.commit();
    return inv;
  },
  cancelLayaway(id, refundMethod, reason) {
    const l = DB.data.layaways.find(x => x.id === id);
    if (!l || l.status !== 'activo') throw new Error('El apartado no está activo');
    const cust = this.customer(l.customerId);
    if (l.paid > 0) {
      if (refundMethod === 'saldo') cust.storeCredit = round2((cust.storeCredit || 0) + l.paid);
      if (refundMethod === 'efectivo') {
        const session = this.currentSession();
        if (!session) throw new Error('Abre la caja para devolver efectivo');
        l.refund = { amount: l.paid, method: 'efectivo', sessionId: session.id, date: nowISO() };
      }
      if (refundMethod === 'saldo' || refundMethod === 'ninguno') l.refund = { amount: refundMethod === 'saldo' ? l.paid : 0, method: refundMethod, date: nowISO() };
    }
    l.items.forEach(it => { if (it.variantId && this.findVariant(it.variantId)) this.move(it.variantId, it.qty, 'anulacion', l.number, 'Apartado cancelado'); });
    l.status = 'cancelado'; l.cancelReason = reason; l.cancelledAt = nowISO();
    audit('Apartado cancelado', `${l.number} · ${reason}`);
    DB.commit();
  },

  /* ---------- Devoluciones ---------- */
  registerReturn({ invoiceId, lines, method, reason }) {
    const inv = DB.data.invoices.find(i => i.id === invoiceId);
    if (!inv || inv.status === 'anulada') throw new Error('Factura no válida');
    const items = [];
    let amount = 0;
    lines.forEach(l => {
      const it = inv.items[l.idx]; const q = +l.qty;
      if (!q) return;
      if (q > it.qty - it.returnedQty + 1e-9) throw new Error(`Cantidad mayor a la disponible para devolver: ${it.name}`);
      const unit = it.lineTotal / it.qty;
      const tot = round2(unit * q);
      it.returnedQty = round2(it.returnedQty + q);
      amount += tot;
      items.push({ name: it.name, variant: it.variant, qty: q, unit: round2(unit), total: tot, variantId: it.variantId, restock: l.restock !== false });
    });
    if (!items.length) throw new Error('Indica al menos un artículo a devolver');
    amount = round2(amount);
    const number = this.nextNo('return');
    items.forEach(i => { if (i.variantId && i.restock && this.findVariant(i.variantId)) this.move(i.variantId, i.qty, 'devolucion', number, reason); });
    let toDebt = 0, refund = amount;
    if (inv.balance > 0) {
      toDebt = round2(Math.min(inv.balance, amount));
      inv.balance = round2(inv.balance - toDebt); refund = round2(amount - toDebt);
      inv.status = this.invStatus(inv);
    }
    const cust = this.customer(inv.customerId);
    if (refund > 0) {
      if (method === 'saldo') {
        if (!cust || cust.id === 'walkin') throw new Error('Saldo a favor requiere un cliente registrado');
        cust.storeCredit = round2((cust.storeCredit || 0) + refund);
      } else if (method === 'efectivo' && this.s.requireCashSession && !this.currentSession()) {
        throw new Error('Abre la caja para devolver efectivo');
      }
    }
    const session = this.currentSession();
    const ret = {
      id: uid(), number, date: nowISO(), invoiceId: inv.id, invoiceNumber: inv.number, customerId: inv.customerId, customerName: inv.customerName,
      items, amount, appliedToDebt: toDebt, refund, method: refund > 0 ? method : 'deuda', reason,
      userId: App.user.id, userName: App.user.name, sessionId: session ? session.id : null,
    };
    DB.data.returns.push(ret);
    audit('Devolución', `${number} sobre ${inv.number} · ${money(amount)}`);
    DB.commit();
    return ret;
  },

  /* ---------- Abonos / cobros ---------- */
  registerPayment({ customerId, amount, method, invoiceId = null, note = '' }) {
    amount = round2(amount);
    if (amount <= 0) throw new Error('Monto inválido');
    const cust = this.customer(customerId); if (!cust) throw new Error('Cliente no encontrado');
    let open = this.openInvoices(customerId);
    if (invoiceId) open = open.filter(i => i.id === invoiceId);
    const debt = round2(sum(open, i => i.balance));
    if (amount > debt + 0.004) throw new Error(`El monto supera la deuda (${money(debt)})`);
    if (method === 'saldo' && amount > (cust.storeCredit || 0) + 0.004) throw new Error('Saldo a favor insuficiente');
    if (method === 'efectivo' && this.s.requireCashSession && !this.currentSession()) throw new Error('Abre la caja para recibir efectivo');
    const prev = this.customerBalance(customerId);
    let rest = amount; const allocations = [];
    for (const inv of open) {
      if (rest <= 0.004) break;
      const a = round2(Math.min(rest, inv.balance));
      inv.balance = round2(inv.balance - a); inv.status = this.invStatus(inv);
      allocations.push({ invoiceId: inv.id, number: inv.number, amount: a });
      rest = round2(rest - a);
    }
    if (method === 'saldo') cust.storeCredit = round2(cust.storeCredit - amount);
    const session = this.currentSession();
    const p = {
      id: uid(), number: this.nextNo('receipt'), date: nowISO(), customerId, customerName: cust.name, amount, method, allocations, note,
      userId: App.user.id, userName: App.user.name, sessionId: session ? session.id : null, prevBalance: prev, newBalance: round2(prev - amount),
    };
    DB.data.payments.push(p);
    DB.commit();
    return p;
  },
  voidPayment(id, reason) {
    const p = DB.data.payments.find(x => x.id === id);
    if (!p || p.voided) throw new Error('Recibo no válido');
    p.allocations.forEach(a => {
      const inv = DB.data.invoices.find(i => i.id === a.invoiceId);
      if (inv && inv.status !== 'anulada') { inv.balance = round2(inv.balance + a.amount); inv.status = this.invStatus(inv); }
    });
    if (p.method === 'saldo') { const c = this.customer(p.customerId); if (c) c.storeCredit = round2((c.storeCredit || 0) + p.amount); }
    const cur = this.currentSession();
    if (p.method === 'efectivo' && cur && p.sessionId !== cur.id)
      DB.data.cashMoves.push({ id: uid(), sessionId: cur.id, date: nowISO(), type: 'salida', amount: p.amount, reason: `Anulación recibo ${p.number}`, userId: App.user.id, userName: App.user.name });
    p.voided = true; p.voidReason = reason; p.voidedAt = nowISO();
    audit('Anulación de recibo', `${p.number} · ${reason}`);
    DB.commit();
  },

  /* ---------- Cotizaciones ---------- */
  saveQuote(q) {
    const t = this.totals(q.items, q.gd, q.gdType);
    Object.assign(q, { subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total });
    q.items.forEach((it, i) => { it.lineTotal = t.lines[i].total; it.lineTax = t.lines[i].tax; });
    const c = this.customer(q.customerId); q.customerName = c ? c.name : (q.customerName || 'Consumidor final');
    if (!q.id) {
      Object.assign(q, { id: uid(), number: this.nextNo('quote'), date: nowISO(), userId: App.user.id, userName: App.user.name, status: q.status || 'pendiente' });
      DB.data.quotes.push(q);
    } else {
      const i = DB.data.quotes.findIndex(x => x.id === q.id); DB.data.quotes[i] = q;
    }
    DB.commit();
    return q;
  },
  quoteStatus(q) { return q.status === 'pendiente' && q.validUntil && q.validUntil < today() ? 'vencida' : q.status; },

  /* ---------- Compras ---------- */
  savePurchase(po) {
    po.total = round2(sum(po.items, i => i.qty * i.cost));
    const sup = this.supplier(po.supplierId); po.supplierName = sup ? sup.name : '';
    if (!po.id) {
      Object.assign(po, { id: uid(), number: this.nextNo('purchase'), createdAt: nowISO(), userId: App.user.id, status: 'borrador', paid: 0 });
      DB.data.purchases.push(po);
    } else { const i = DB.data.purchases.findIndex(x => x.id === po.id); DB.data.purchases[i] = po; }
    DB.commit(); return po;
  },
  receivePurchase(id, updateCosts = true) {
    const po = DB.data.purchases.find(p => p.id === id);
    if (!po || po.status !== 'borrador') throw new Error('La orden no se puede recibir');
    po.items.forEach(it => {
      const f = this.findVariant(it.variantId); if (!f) return;
      this.move(it.variantId, +it.qty, 'compra', po.number, po.supplierName);
      if (updateCosts && it.cost > 0) { f.v.cost = round2(it.cost); if (f.p.variants.length === 1) f.p.cost = round2(it.cost); }
    });
    po.status = 'recibida'; po.receivedAt = nowISO(); po.receivedBy = App.user.name;
    audit('Recepción de compra', `${po.number} · ${money(po.total)}`);
    DB.commit();
  },
  voidPurchase(id, reason) {
    const po = DB.data.purchases.find(p => p.id === id);
    if (!po || po.status === 'anulada') return;
    if (DB.data.supplierPayments.some(p => p.purchaseId === id)) throw new Error('La compra tiene pagos registrados');
    if (po.status === 'recibida') po.items.forEach(it => { if (this.findVariant(it.variantId)) this.move(it.variantId, -it.qty, 'anulacion', po.number, reason); });
    po.status = 'anulada'; po.voidReason = reason;
    audit('Anulación de compra', `${po.number} · ${reason}`);
    DB.commit();
  },
  paySupplier({ purchaseId, amount, method, note }) {
    const po = DB.data.purchases.find(p => p.id === purchaseId);
    amount = round2(amount);
    if (!po) throw new Error('Compra no encontrada');
    const due = round2(po.total - (po.paid || 0));
    if (amount <= 0 || amount > due + 0.004) throw new Error(`Monto inválido. Pendiente: ${money(due)}`);
    const session = this.currentSession();
    if (method === 'efectivo' && !session) throw new Error('Abre la caja para pagar en efectivo');
    const p = { id: uid(), number: this.nextNo('supplierPayment'), date: nowISO(), purchaseId, purchaseNumber: po.number, supplierId: po.supplierId, supplierName: po.supplierName, amount, method, note, userId: App.user.id, sessionId: method === 'efectivo' ? session.id : null };
    po.paid = round2((po.paid || 0) + amount);
    DB.data.supplierPayments.push(p); DB.commit(); return p;
  },

  /* ---------- Gastos ---------- */
  addExpense(e) {
    const session = this.currentSession();
    if (e.method === 'efectivo' && !session) throw new Error('Abre la caja para registrar un gasto en efectivo');
    const x = { id: uid(), date: e.date ? new Date(e.date + 'T12:00:00').toISOString() : nowISO(), category: e.category, description: e.description, amount: round2(e.amount), method: e.method, reference: e.reference || '', userId: App.user.id, userName: App.user.name, sessionId: e.method === 'efectivo' ? session.id : null };
    DB.data.expenses.push(x); DB.commit(); return x;
  },

  /* ---------- Métricas ---------- */
  salesIn(from, to) { return DB.data.invoices.filter(i => i.status !== 'anulada' && inRange(i.date, from, to)); },
  returnsIn(from, to) { return DB.data.returns.filter(r => inRange(r.date, from, to)); },
  /* costo de lo vendido (descontando devoluciones) */
  invoiceCost(inv) { return sum(inv.items, it => it.cost * (it.qty - it.returnedQty)); },
  invoiceNet(inv) { return round2(inv.total - sum(inv.items, it => it.lineTotal / it.qty * it.returnedQty)); },
  invoiceNetNoTax(inv) {
    const r = (+inv.taxRate || 0) / 100;
    return sum(inv.items, it => { const unit = it.lineTotal / it.qty; const net = unit * (it.qty - it.returnedQty); return it.taxable && r ? net - (it.lineTax / it.qty) * (it.qty - it.returnedQty) : net; });
  },
};
