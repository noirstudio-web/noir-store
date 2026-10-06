'use strict';
/* ==========================================================
   NOIR STORE — Notificaciones por WhatsApp
   Modo "link": abre WhatsApp con el mensaje listo (gratis).
   Modo "api":  envío automático con WhatsApp Business Cloud API
                (requiere el servidor local server.js).
   ========================================================== */

const WA_DEFAULTS = () => ({
  enabled: true, mode: 'link', linkTarget: 'web', autoOpen: true,
  onSale: true, onPayment: true, countryCode: '1',
  token: '', phoneNumberId: '', templateLang: 'es', saleTemplate: '', paymentTemplate: '',
  saleMsg: 'Hola {cliente} 👋\nGracias por tu compra en *{negocio}*.\n\n🧾 Factura: {factura}\n📅 Fecha: {fecha}\n\n🛍️ Artículos:\n{articulos}\n\n💰 Total: *{total}*\nPagado: {pagado}{credito}\n\n¡Gracias por preferirnos! ✦',
  paymentMsg: 'Hola {cliente} 👋\nHemos recibido tu abono en *{negocio}*.\n\n🧾 Recibo: {recibo}\n📅 Fecha: {fecha}\n💵 Monto abonado: *{monto}*\nForma de pago: {forma}\n\nSaldo anterior: {saldo_anterior}\nSaldo actual: *{saldo}*\n{proxima_cuota}\n\n¡Gracias por tu pago! ✦',
});
const WA_VARS = {
  sale: ['cliente', 'negocio', 'factura', 'fecha', 'articulos', 'total', 'pagado', 'saldo', 'credito', 'proxima_cuota', 'telefono_negocio'],
  payment: ['cliente', 'negocio', 'recibo', 'fecha', 'monto', 'forma', 'saldo_anterior', 'saldo', 'facturas', 'proxima_cuota', 'telefono_negocio'],
};

const WA = {
  cfg() { return D.s.whatsapp; },

  /* Normaliza el teléfono al formato internacional sin "+" */
  phone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    else d = d.replace(/^0+/, '');
    const cc = String(this.cfg().countryCode || '').replace(/\D/g, '');
    if (cc && d.length <= 10) d = cc + d;
    return d.length >= 8 ? d : '';
  },
  fill(tpl, vars) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m).replace(/\n{3,}/g, '\n\n').trim(); },

  nextDueText(customerId) {
    const open = D.openInvoices(customerId);
    if (!open.length) return '✅ ¡Tu cuenta está saldada!';
    const next = open.map(i => D.nextDue(i)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))[0];
    return next ? `📌 Próxima cuota: ${fmtDate(next.date)} por ${money(next.pending)}` : '';
  },
  saleVars(inv) {
    const s = D.s;
    const next = inv.balance > 0 ? D.nextDue(inv) : null;
    return {
      cliente: inv.customerName.split(' ')[0], negocio: s.company.name, factura: inv.number, fecha: fmtDateTime(inv.date),
      articulos: inv.items.map(i => `• ${qtyFmt(i.qty)} x ${i.name}${i.variant ? ` (${i.variant})` : ''} — ${money(i.lineTotal)}`).join('\n'),
      total: money(inv.total), pagado: money(inv.paid), saldo: money(D.customerBalance(inv.customerId)),
      credito: inv.balance > 0 ? `\n\n📌 Saldo a crédito: *${money(inv.balance)}*${inv.credit && inv.credit.interest ? ` (incluye interés de ${money(inv.credit.interest)})` : ''}${inv.credit && inv.credit.installments > 1 ? ` en ${inv.credit.installments} cuotas de ${money(inv.credit.financed / inv.credit.installments)}` : ''}${next ? `\nPróximo vencimiento: ${fmtDate(next.date)}` : ''}` : '',
      proxima_cuota: next ? `Próxima cuota: ${fmtDate(next.date)} por ${money(next.pending)}` : '',
      telefono_negocio: s.company.phone || '',
    };
  },
  paymentVars(p) {
    return {
      cliente: p.customerName.split(' ')[0], negocio: D.s.company.name, recibo: p.number, fecha: fmtDateTime(p.date),
      monto: money(p.amount), forma: payLabel(p.method), saldo_anterior: money(p.prevBalance), saldo: money(p.newBalance),
      facturas: p.allocations.map(a => `${a.number}: ${money(a.amount)}`).join(', '), proxima_cuota: this.nextDueText(p.customerId),
      telefono_negocio: D.s.company.phone || '',
    };
  },
  saleText(inv) { return this.fill(this.cfg().saleMsg, this.saleVars(inv)); },
  paymentText(p) { return this.fill(this.cfg().paymentMsg, this.paymentVars(p)); },
  statementText(c) {
    const open = D.openInvoices(c.id);
    const bal = D.customerBalance(c.id), overdue = sum(open, i => D.overdueAmount(i));
    return this.fill(`Hola {cliente} 👋\nTe compartimos tu estado de cuenta en *{negocio}*:\n\n${open.map(i => `• ${i.number} (${fmtDate(i.date)}): saldo ${money(i.balance)}${D.overdueDays(i) ? ` ⚠️ vencida ${D.overdueDays(i)} días` : ''}`).join('\n')}\n\n💰 Saldo total: *${money(bal)}*${overdue ? `\n⚠️ Monto vencido: *${money(overdue)}*` : ''}\n{proxima_cuota}\n\nCualquier duda estamos a la orden. ✦`,
      { cliente: c.name.split(' ')[0], negocio: D.s.company.name, proxima_cuota: this.nextDueText(c.id) });
  },

  link(phone, text) {
    const t = encodeURIComponent(text);
    return this.cfg().linkTarget === 'app' ? `whatsapp://send?phone=${phone}&text=${t}` : `https://wa.me/${phone}?text=${t}`;
  },
  log(entry) {
    DB.data.notifications.push({ id: uid(), date: nowISO(), userName: App.user?.name, ...entry });
    if (DB.data.notifications.length > 2000) DB.data.notifications.splice(0, DB.data.notifications.length - 2000);
    DB.commit();
  },

  /* Envía un mensaje según el modo configurado */
  async send({ customer, text, type, ref, template = '', params = [] }) {
    const cfg = this.cfg();
    const phone = this.phone(customer.phone);
    if (!phone) { toast(`${customer.name} no tiene un teléfono válido para WhatsApp`, 'warn'); return { ok: false }; }
    const base = { type, ref, customerId: customer.id, customerName: customer.name, phone };
    if (cfg.mode === 'api') {
      if (DB.mode !== 'server') { toast('El envío automático requiere abrir el sistema con INICIAR NOIR STORE.bat', 'err'); this.log({ ...base, status: 'error', error: 'Sin servidor local' }); return { ok: false }; }
      try {
        const r = await fetch('api/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, text, template, lang: cfg.templateLang, params }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error?.message || j.error || 'HTTP ' + r.status);
        this.log({ ...base, status: 'enviado', mode: 'api' });
        toast(`WhatsApp enviado a ${customer.name}`, 'ok', 2200);
        return { ok: true };
      } catch (e) {
        this.log({ ...base, status: 'error', mode: 'api', error: e.message });
        toast(`No se pudo enviar el WhatsApp: ${e.message}`, 'err', 5000);
        return { ok: false, error: e.message };
      }
    }
    const w = window.open(this.link(phone, text), '_blank');
    if (!w && cfg.linkTarget !== 'app') { toast('El navegador bloqueó la ventana de WhatsApp. Permite las ventanas emergentes para este sitio.', 'warn', 6000); }
    this.log({ ...base, status: 'abierto', mode: 'link' });
    return { ok: true };
  },

  shouldAuto(kind) {
    const c = this.cfg();
    return c.enabled && (kind === 'sale' ? c.onSale : c.onPayment) && (c.mode === 'api' || c.autoOpen);
  },
  eligible(customerId) {
    if (typeof LIC !== 'undefined' && !LIC.has('whatsapp')) return null;
    const c = D.customer(customerId);
    return c && c.id !== 'walkin' && this.phone(c.phone) ? c : null;
  },
  notifySale(inv, { manual = false } = {}) {
    const c = this.eligible(inv.customerId);
    if (!c) { if (manual) toast('El cliente no tiene teléfono registrado', 'warn'); return null; }
    if (!manual && !this.shouldAuto('sale')) return null;
    const v = this.saleVars(inv);
    return this.send({ customer: c, text: this.saleText(inv), type: 'venta', ref: inv.number, template: this.cfg().saleTemplate, params: [v.cliente, v.factura, v.total, money(inv.balance)] });
  },
  notifyPayment(p, { manual = false } = {}) {
    const c = this.eligible(p.customerId);
    if (!c) { if (manual) toast('El cliente no tiene teléfono registrado', 'warn'); return null; }
    if (!manual && !this.shouldAuto('payment')) return null;
    const v = this.paymentVars(p);
    return this.send({ customer: c, text: this.paymentText(p), type: 'abono', ref: p.number, template: this.cfg().paymentTemplate, params: [v.cliente, v.monto, v.recibo, v.saldo] });
  },
  /* ---------- Resúmenes al dueño (beneficio Premium) ---------- */
  ownerReady() { return typeof LIC !== 'undefined' && LIC.has('ownerAlerts') && !!this.phone(D.s.ownerPhone); },
  toOwner(text, type) {
    if (!this.ownerReady()) return toast('Configura el WhatsApp del dueño en Configuración → WhatsApp', 'warn');
    return this.send({ customer: { id: 'owner', name: 'Dueño', phone: D.s.ownerPhone }, text, type, ref: '' });
  },
  cashCloseText(s) {
    const x = s.summary || D.sessionSummary(s);
    return `✦ *Cierre de caja ${s.number}* — ${D.s.company.name}\n📅 ${fmtDateTime(s.closedAt || nowISO())} · ${s.closedByName || App.user.name}\n\n🧾 Ventas: *${money(x.salesTotal)}* (${x.invoices} facturas)\n💵 Efectivo: ${money(x.cashSales)}\n💳 Tarjeta: ${money(x.card)}\n🏦 Transferencias: ${money(x.transfer)}\n📌 A crédito: ${money(x.creditSales)}\n💰 Cobros de crédito: ${money(x.abonosCash + x.abonosCard + x.abonosTransfer)}${x.layawayCash || x.layawayCard || x.layawayTransfer ? `\n🏷 Abonos de apartados: ${money(x.layawayCash + x.layawayCard + x.layawayTransfer)}` : ''}\n📉 Gastos: ${money(x.expenses)}\n\nEfectivo esperado: ${money(x.expected)}${s.status === 'cerrada' ? `\nContado: ${money(s.counted)}\n*Diferencia: ${money(s.difference)}*${Math.abs(s.difference) >= 0.01 ? ' ⚠️' : ' ✅'}` : ''}`;
  },
  dailyText() {
    const t = today(), invs = D.salesIn(t, t);
    const total = sum(invs, D.invoiceNet), profit = sum(invs, i => D.invoiceNetNoTax(i) - D.invoiceCost(i));
    const top = {}; invs.forEach(i => i.items.forEach(it => top[it.name] = (top[it.name] || 0) + it.qty - it.returnedQty));
    const best = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const cobros = sum(DB.data.payments.filter(p => !p.voided && dayKey(p.date) === t), p => p.amount);
    const low = DB.data.products.filter(p => p.active !== false && D.stockState(p) !== 'ok').length;
    const overdue = DB.data.invoices.filter(i => D.overdueDays(i) > 0).length;
    return `✦ *Resumen del día* — ${D.s.company.name}\n📅 ${fmtDate(t)}\n\n🧾 Ventas: *${money(total)}* (${invs.length} facturas)\n🎯 Ticket promedio: ${money(invs.length ? total / invs.length : 0)}\n📈 Ganancia bruta: ${money(profit)}\n💰 Cobros de crédito: ${money(cobros)}\n${best.length ? `\n🏆 Más vendidos:\n${best.map(([n, q]) => `• ${n} (${qtyFmt(q)})`).join('\n')}\n` : ''}\n📦 Productos con stock bajo: ${low}\n⚠️ Créditos vencidos: ${overdue}`;
  },
  lowStockText() {
    const list = DB.data.products.filter(p => p.active !== false && D.stockState(p) !== 'ok').sort((a, b) => D.stockOf(a) - D.stockOf(b));
    return `✦ *Alerta de inventario* — ${D.s.company.name}\n📅 ${fmtDate(today())}\n\n${list.length ? `Productos con stock bajo o agotado (${list.length}):\n${list.slice(0, 40).map(p => `• ${p.name}: ${qtyFmt(D.stockOf(p))} ${D.stockOf(p) <= 0 ? '❌ agotado' : `(mín. ${D.minStock(p)})`}`).join('\n')}${list.length > 40 ? `\n… y ${list.length - 40} más` : ''}` : '✅ Todo el inventario está en orden.'}`;
  },
  sendStatement(customerId) {
    const c = this.eligible(customerId);
    if (!c) return toast('El cliente no tiene teléfono registrado', 'warn');
    return this.send({ customer: c, text: this.statementText(c), type: 'estado de cuenta', ref: '' });
  },
};
const waIcon = (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.2-.6-.4zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.7 15.6 2.2 13.8 2.2 12 2.2 6.6 6.6 2.2 12 2.2c2.6 0 5.1 1 6.9 2.9 1.8 1.8 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8zm8.4-18.2C18.1 1.3 15.2.1 12 .1 5.5.1.2 5.4.2 11.9c0 2.1.5 4.1 1.6 5.9L.1 24l6.3-1.7c1.7.9 3.7 1.4 5.6 1.4 6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.4-8.3z"/></svg>`;
