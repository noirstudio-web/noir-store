'use strict';
/* ==========================================================
   NOIR STORE — Impresión de documentos y códigos de barras
   ========================================================== */

/* ---------- Code 128 (subconjunto B) ---------- */
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
function code128Svg(text, { height = 42, showText = true, fontSize = 9 } = {}) {
  const codes = [104];
  for (const ch of String(text)) { const c = ch.charCodeAt(0); if (c >= 32 && c <= 126) codes.push(c - 32); }
  let chk = 104; for (let i = 1; i < codes.length; i++) chk += codes[i] * i;
  codes.push(chk % 103, 106);
  let x = 10, bars = '';
  codes.forEach(code => {
    const p = C128[code];
    for (let j = 0; j < p.length; j++) { const w = +p[j]; if (j % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`; x += w; }
  });
  x += 10;
  const th = showText ? fontSize + 4 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${height + th}" preserveAspectRatio="none" class="bc">
    <g fill="#000">${bars}</g>${showText ? `<text x="${x / 2}" y="${height + fontSize + 2}" font-family="Arial, sans-serif" font-size="${fontSize}" text-anchor="middle" fill="#000">${esc(text)}</text>` : ''}</svg>`;
}

/* ---------- Motor de impresión ---------- */
const PRINT_CSS = `
*{box-sizing:border-box} body{margin:0;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#111;font-size:12px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.r{text-align:right} .c{text-align:center} .b{font-weight:700} .mut{color:#666} .sm{font-size:10.5px}
table{width:100%;border-collapse:collapse}
`;
const CARTA_CSS = `
@page{size:letter;margin:13mm 14mm}
.doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:14px;border-bottom:2px solid #111}
.doc-logo{height:46px;max-width:220px;object-fit:contain;object-position:left}
.co{margin-top:8px;font-size:11px;color:#444;line-height:1.5}
.doc-title{text-align:right} .doc-title h1{font-size:20px;letter-spacing:.24em;margin:0;font-weight:700}
.doc-title .no{font-size:14px;font-weight:600;margin-top:4px} .doc-title .mut{font-size:11px}
.parties{display:grid;grid-template-columns:1.3fr 1fr;gap:24px;margin:18px 0}
.box h4{font-size:9.5px;letter-spacing:.18em;color:#777;margin:0 0 6px;text-transform:uppercase;font-weight:600}
.box .nm{font-size:14px;font-weight:600}
table.items th{background:#111;color:#fff;font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;padding:8px;text-align:left;font-weight:600}
table.items td{padding:8px;border-bottom:1px solid #e3e3e3;vertical-align:top}
table.items th.r,table.items td.r{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:300px;margin-top:14px}
.totals div{display:flex;justify-content:space-between;padding:4px 0}
.totals .grand{border-top:2px solid #111;font-size:17px;font-weight:700;padding-top:9px;margin-top:4px}
.notes{margin-top:24px;font-size:11px;color:#444;white-space:pre-line}
.foot{margin-top:28px;font-size:10px;color:#666;border-top:1px solid #ddd;padding-top:10px;white-space:pre-line}
.sign{display:flex;gap:60px;margin-top:70px} .sign div{flex:1;border-top:1px solid #111;text-align:center;padding-top:6px;font-size:11px}
.stamp{display:inline-block;border:2px solid #c00;color:#c00;padding:4px 14px;font-weight:700;letter-spacing:.2em;transform:rotate(-4deg);margin-top:8px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.kpis div{border:1px solid #ddd;border-radius:6px;padding:10px} .kpis span{display:block;font-size:9.5px;color:#777;text-transform:uppercase;letter-spacing:.1em} .kpis b{font-size:15px}
h3.sec{font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin:22px 0 8px;border-bottom:1px solid #111;padding-bottom:5px}
`;
const TICKET_CSS = w => `
@page{size:${w}mm auto;margin:0}
body{width:${w - 8}mm;margin:0 auto;padding:4mm 0 8mm;font-size:${w < 70 ? 10 : 11}px}
.t-logo{display:block;margin:0 auto 6px;max-width:70%;max-height:22mm;object-fit:contain}
.t-co{text-align:center;font-size:.92em;line-height:1.35}
.t-sep{border-top:1px dashed #000;margin:7px 0}
.t-row{display:flex;justify-content:space-between;gap:8px}
.t-item{margin:4px 0} .t-item .n{font-weight:600}
.t-tot{font-size:1.35em;font-weight:700}
.t-center{text-align:center}
.t-title{text-align:center;font-weight:700;letter-spacing:.15em;margin:4px 0}
`;
const LABEL_CSS = (fmt) => fmt === 'rollo' ? `
@page{size:50mm 30mm;margin:0}
.lbl{width:50mm;height:30mm;padding:1.6mm 2.4mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}
` : `
@page{size:letter;margin:10mm 8mm}
.sheet{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm}
.lbl{height:30mm;padding:1.6mm 2.4mm;border:1px dashed #bbb;overflow:hidden;display:flex;flex-direction:column;page-break-inside:avoid}
` + `
.lbl .st{font-size:6.5px;letter-spacing:.25em;font-weight:700}
.lbl .nm{font-size:8.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl .row{display:flex;justify-content:space-between;align-items:baseline}
.lbl .vr{font-size:8px} .lbl .pr{font-size:12px;font-weight:700}
.lbl .bc{width:100%;height:12mm;margin-top:auto}
`;

function baseHref() { return location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''); }

function printHTML(html, kind = 'carta', extraCss = '') {
  const s = D.s;
  const css = PRINT_CSS + (kind === 'ticket' ? TICKET_CSS(s.ticketWidth || 80) : kind.startsWith('labels') ? LABEL_CSS(kind.split(':')[1]) : CARTA_CSS) + extraCss;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${baseHref()}"><title>NOIR STORE</title><style>${css}</style></head><body>${html}</body></html>`);
  doc.close();
  const imgs = [...doc.images];
  Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => {
    setTimeout(() => {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('No se pudo imprimir', 'err'); }
      setTimeout(() => f.remove(), 1500);
    }, 80);
  });
}

const PR = {
  customLogo() { return D.s.customLogo && (typeof LIC === 'undefined' || LIC.has('branding')) ? D.s.customLogo : null; },
  logo() { return this.customLogo() || 'assets/wordmark-negro.png'; },
  coLines(sep = '<br>') {
    const c = D.s.company;
    return [c.legalName, c.taxId ? `RNC/NIT: ${esc(c.taxId)}` : '', c.address, [c.phone, c.email].filter(Boolean).join(' · '), c.website]
      .filter(Boolean).map(x => x.startsWith('RNC') ? x : esc(x)).join(sep);
  },
  head(title, number, extra = '') {
    return `<div class="doc-head">
      <div><img class="doc-logo" src="${this.logo()}"><div class="co"><b>${esc(D.s.company.name)}</b><br>${this.coLines()}</div></div>
      <div class="doc-title"><h1>${title}</h1><div class="no">${esc(number || '')}</div>${extra}</div>
    </div>`;
  },
  itemsTable(items, { showDisc = true } = {}) {
    const hasDisc = showDisc && items.some(i => +i.discount);
    return `<table class="items"><thead><tr><th>Código</th><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th>${hasDisc ? '<th class="r">Desc.</th>' : ''}<th class="r">Importe</th></tr></thead><tbody>
      ${items.map(i => `<tr><td class="sm">${esc(i.sku || '')}</td><td>${esc(i.name)}${i.variant ? `<div class="mut sm">${esc(i.variant)}</div>` : ''}</td><td class="r">${qtyFmt(i.qty)}</td><td class="r">${money(i.price)}</td>${hasDisc ? `<td class="r">${i.discount ? i.discount + '%' : ''}</td>` : ''}<td class="r">${money(i.lineTotal ?? i.qty * i.price)}</td></tr>`).join('')}
    </tbody></table>`;
  },
  totalsBlock(d) {
    const incl = d.pricesIncludeTax ?? D.s.pricesIncludeTax;
    const tn = d.taxName || D.s.taxName;
    const rate = d.taxRate ?? D.s.taxRate;
    return `<div class="totals">
      <div><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
      ${d.discount ? `<div><span>Descuento</span><span>- ${money(d.discount)}</span></div>` : ''}
      ${rate ? (incl ? `<div class="mut"><span>${esc(tn)} incluido (${rate}%)</span><span>${money(d.tax)}</span></div>` : `<div><span>${esc(tn)} (${rate}%)</span><span>${money(d.tax)}</span></div>`) : ''}
      <div class="grand"><span>TOTAL</span><span>${money(d.total)}</span></div>
    </div>`;
  },

  /* Factura en formato carta o ticket */
  invoice(inv, format) {
    format = format || D.s.defaultPrint;
    if (format === 'ticket') return printHTML(this.invoiceTicket(inv), 'ticket');
    const cust = D.customer(inv.customerId) || {};
    const sch = inv.credit ? D.schedule(inv) : [];
    const html = `${this.head('FACTURA', inv.number, `<div class="mut">Fecha: ${fmtDateTime(inv.date)}</div><div class="mut">Condición: ${inv.type === 'credito' ? 'Crédito' : 'Contado'}</div>${inv.status === 'anulada' ? '<div class="stamp">ANULADA</div>' : ''}`)}
      <div class="parties">
        <div class="box"><h4>Cliente</h4><div class="nm">${esc(inv.customerName)}</div><div class="mut">${[cust.docId && 'Doc: ' + cust.docId, cust.phone, cust.email, cust.address].filter(Boolean).map(esc).join('<br>')}</div></div>
        <div class="box"><h4>Detalle</h4><div>Atendido por: ${esc(inv.userName)}</div>${inv.dueDate ? `<div>Vence: ${fmtDate(inv.dueDate)}</div>` : ''}<div>Pago: ${inv.payments.map(p => `${payLabel(p.method)} ${money(p.amount)}`).join(', ') || (inv.credit ? 'Sin cuota inicial' : '—')}${inv.credit ? ` · Crédito ${money(inv.credit.financed)}` : ''}</div>${inv.credit ? `<div>Cuotas pagaderas en: <b>${payLabel(inv.credit.payMethod || 'efectivo')}</b></div>` : ''}</div>
      </div>
      ${this.itemsTable(inv.items)}
      ${this.totalsBlock(inv)}
      ${inv.change ? `<div class="totals" style="margin-top:0"><div class="mut"><span>Cambio</span><span>${money(inv.change)}</span></div></div>` : ''}
      ${inv.type === 'credito' ? `<div class="totals" style="margin-top:0">${inv.credit?.interest ? `<div><span>Financiado</span><span>${money(inv.credit.principal)}</span></div><div><span>Interés ${inv.credit.interestRate}% ${inv.credit.interestType === 'mensual' ? 'mensual' : 'total'}</span><span>${money(inv.credit.interest)}</span></div><div class="b"><span>Total a crédito</span><span>${money(inv.credit.financed)}</span></div>` : ''}<div class="b"><span>Saldo pendiente</span><span>${money(inv.balance)}</span></div></div>` : ''}
      ${inv.credit ? (() => { const ab = D.abonosOf(inv), by = D.paidByMethod(inv); return `<h3 class="sec">Pagos recibidos</h3><table class="items"><thead><tr><th>Fecha</th><th>Concepto</th><th>Forma de pago</th><th class="r">Monto</th></tr></thead><tbody>
        ${inv.payments.filter(p => p.method !== 'apartado').map(p => `<tr><td>${fmtDate(inv.date)}</td><td>Cuota inicial</td><td>${payLabel(p.method)}</td><td class="r">${money(p.amount)}</td></tr>`).join('')}
        ${ab.map(a => `<tr><td>${fmtDate(a.date)}</td><td>Abono ${esc(a.number)}</td><td>${payLabel(a.method)}</td><td class="r">${money(a.amount)}</td></tr>`).join('')}
        ${!inv.payments.length && !ab.length ? '<tr><td colspan="4" class="c mut">Aún sin pagos</td></tr>' : ''}</tbody></table>
        <div class="mut sm" style="margin-top:6px">Total por forma de pago: ${Object.entries(by).map(([k, v]) => `${payLabel(k)} ${money(v)}`).join(' · ') || '—'}</div>`; })() : ''}
      ${sch.length > 1 ? `<h3 class="sec">Plan de pagos</h3><table class="items"><thead><tr><th>Cuota</th><th>Vencimiento</th><th class="r">Monto</th></tr></thead><tbody>${sch.map(c => `<tr><td>${c.n}</td><td>${fmtDate(c.date)}</td><td class="r">${money(c.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${inv.notes ? `<div class="notes"><b>Notas:</b> ${esc(inv.notes)}</div>` : ''}
      ${inv.type === 'credito' ? '<div class="sign"><div>Firma del cliente</div><div>Entregado por</div></div>' : ''}
      <div class="foot">${esc(D.s.invoiceTerms)}</div>`;
    printHTML(html, 'carta');
  },
  ticketHead() {
    const c = D.s.company;
    return `<img class="t-logo" src="${this.customLogo() || 'assets/mono-negro.png'}">
      <div class="t-co"><b style="font-size:1.25em;letter-spacing:.12em">${esc(c.name)}</b><br>${this.coLines()}</div>`;
  },
  invoiceTicket(inv) {
    const s = D.s;
    const rate = inv.taxRate ?? s.taxRate;
    return `${this.ticketHead()}
      <div class="t-sep"></div>
      <div class="t-title">${inv.status === 'anulada' ? 'ANULADA · ' : ''}FACTURA ${inv.type === 'credito' ? 'A CRÉDITO' : ''}</div>
      <div class="t-row"><span>No.</span><b>${esc(inv.number)}</b></div>
      <div class="t-row"><span>Fecha</span><span>${fmtDateTime(inv.date)}</span></div>
      <div class="t-row"><span>Cliente</span><span>${esc(inv.customerName)}</span></div>
      ${inv.customerDoc ? `<div class="t-row"><span>Doc.</span><span>${esc(inv.customerDoc)}</span></div>` : ''}
      <div class="t-row"><span>Cajero</span><span>${esc(inv.userName)}</span></div>
      <div class="t-sep"></div>
      ${inv.items.map(i => `<div class="t-item"><div class="n">${esc(i.name)}${i.variant ? ' · ' + esc(i.variant) : ''}</div>
        <div class="t-row"><span>${qtyFmt(i.qty)} x ${money(i.price, false)}${i.discount ? ` (-${i.discount}%)` : ''}</span><span>${money(i.lineTotal, false)}</span></div></div>`).join('')}
      <div class="t-sep"></div>
      <div class="t-row"><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
      ${inv.discount ? `<div class="t-row"><span>Descuento</span><span>-${money(inv.discount)}</span></div>` : ''}
      ${rate ? `<div class="t-row"><span>${esc(inv.taxName || s.taxName)} ${inv.pricesIncludeTax ? 'incl.' : ''} ${rate}%</span><span>${money(inv.tax)}</span></div>` : ''}
      <div class="t-row t-tot"><span>TOTAL</span><span>${money(inv.total)}</span></div>
      <div class="t-sep"></div>
      ${inv.payments.map(p => `<div class="t-row"><span>${payLabel(p.method)}</span><span>${money(p.amount)}</span></div>`).join('')}
      ${inv.change ? `<div class="t-row b"><span>Cambio</span><span>${money(inv.change)}</span></div>` : ''}
      ${inv.type === 'credito' ? `${inv.credit.interest ? `<div class="t-row"><span>Financiado</span><span>${money(inv.credit.principal)}</span></div><div class="t-row"><span>Interés ${inv.credit.interestRate}% ${inv.credit.interestType === 'mensual' ? 'mens.' : 'total'}</span><span>${money(inv.credit.interest)}</span></div>` : ''}<div class="t-row b"><span>A crédito</span><span>${money(inv.credit.financed)}</span></div>
        <div class="t-row"><span>Saldo actual</span><span>${money(inv.balance)}</span></div>
        <div class="t-row"><span>Cuotas en</span><span>${payLabel(inv.credit.payMethod || 'efectivo')}</span></div>
        ${D.schedule(inv).map(c => `<div class="t-row sm"><span>Cuota ${c.n} · ${fmtDate(c.date)}</span><span>${money(c.amount)}</span></div>`).join('')}
        <br><br><div class="t-center">______________________<br>Firma del cliente</div>` : ''}
      ${inv.pointsEarned || inv.pointsUsed ? `<div class="t-sep"></div>${inv.pointsUsed ? `<div class="t-row"><span>Puntos usados</span><span>${inv.pointsUsed}</span></div>` : ''}${inv.pointsEarned ? `<div class="t-row"><span>Puntos ganados</span><span>+${inv.pointsEarned}</span></div>` : ''}<div class="t-row b"><span>Tus puntos</span><span>${inv.pointsBalance ?? ''}</span></div>` : ''}
      <div class="t-sep"></div>
      <div class="t-center">${esc(s.ticketFooter).replace(/\n/g, '<br>')}</div>
      <div class="t-center" style="margin-top:6px">${code128Svg(inv.number, { height: 30, fontSize: 8 }).replace('class="bc"', 'class="bc" style="width:80%;height:12mm"')}</div>`;
  },

  quote(q) {
    const cust = D.customer(q.customerId) || {};
    const html = `${this.head('COTIZACIÓN', q.number, `<div class="mut">Fecha: ${fmtDate(q.date)}</div><div class="mut">Válida hasta: ${fmtDate(q.validUntil)}</div>`)}
      <div class="parties">
        <div class="box"><h4>Preparada para</h4><div class="nm">${esc(q.customerName)}</div><div class="mut">${[cust.docId && 'Doc: ' + cust.docId, cust.phone, cust.email, cust.address].filter(Boolean).map(esc).join('<br>')}</div></div>
        <div class="box"><h4>Asesor</h4><div>${esc(q.userName)}</div></div>
      </div>
      ${this.itemsTable(q.items)}
      ${this.totalsBlock(q)}
      ${q.notes ? `<div class="notes"><b>Observaciones:</b> ${esc(q.notes)}</div>` : ''}
      <div class="foot">${esc(D.s.quoteTerms)}</div>
      <div class="sign"><div>Aceptado por</div><div>${esc(D.s.company.name)}</div></div>`;
    printHTML(html, 'carta');
  },

  receipt(p, format) {
    format = format || D.s.defaultPrint;
    const rows = p.allocations.map(a => `<tr><td>${esc(a.number)}</td><td class="r">${money(a.amount)}</td></tr>`).join('');
    if (format === 'ticket') {
      return printHTML(`${this.ticketHead()}<div class="t-sep"></div><div class="t-title">${p.voided ? 'ANULADO · ' : ''}RECIBO DE PAGO</div>
        <div class="t-row"><span>No.</span><b>${esc(p.number)}</b></div><div class="t-row"><span>Fecha</span><span>${fmtDateTime(p.date)}</span></div>
        <div class="t-row"><span>Cliente</span><span>${esc(p.customerName)}</span></div><div class="t-row"><span>Forma de pago</span><span>${payLabel(p.method)}</span></div>
        <div class="t-sep"></div>${p.allocations.map(a => `<div class="t-row"><span>Abono a ${esc(a.number)}</span><span>${money(a.amount)}</span></div>`).join('')}
        <div class="t-sep"></div><div class="t-row t-tot"><span>RECIBIDO</span><span>${money(p.amount)}</span></div>
        <div class="t-row"><span>Saldo anterior</span><span>${money(p.prevBalance)}</span></div><div class="t-row b"><span>Saldo actual</span><span>${money(p.newBalance)}</span></div>
        <div class="t-sep"></div><div class="t-center">Recibido por: ${esc(p.userName)}</div>`, 'ticket');
    }
    printHTML(`${this.head('RECIBO DE PAGO', p.number, `<div class="mut">Fecha: ${fmtDateTime(p.date)}</div>${p.voided ? '<div class="stamp">ANULADO</div>' : ''}`)}
      <div class="parties"><div class="box"><h4>Recibimos de</h4><div class="nm">${esc(p.customerName)}</div></div><div class="box"><h4>Forma de pago</h4><div>${payLabel(p.method)}</div>${p.note ? `<div class="mut">${esc(p.note)}</div>` : ''}</div></div>
      <table class="items"><thead><tr><th>Aplicado a factura</th><th class="r">Monto</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div class="grand"><span>RECIBIDO</span><span>${money(p.amount)}</span></div><div><span>Saldo anterior</span><span>${money(p.prevBalance)}</span></div><div class="b"><span>Saldo actual</span><span>${money(p.newBalance)}</span></div></div>
      <div class="sign"><div>Recibido por: ${esc(p.userName)}</div><div>Cliente</div></div>`, 'carta');
  },

  returnDoc(r) {
    printHTML(`${this.ticketHead()}<div class="t-sep"></div><div class="t-title">NOTA DE DEVOLUCIÓN</div>
      <div class="t-row"><span>No.</span><b>${esc(r.number)}</b></div><div class="t-row"><span>Factura</span><span>${esc(r.invoiceNumber)}</span></div>
      <div class="t-row"><span>Fecha</span><span>${fmtDateTime(r.date)}</span></div><div class="t-row"><span>Cliente</span><span>${esc(r.customerName)}</span></div>
      <div class="t-sep"></div>${r.items.map(i => `<div class="t-item"><div class="n">${esc(i.name)}${i.variant ? ' · ' + esc(i.variant) : ''}</div><div class="t-row"><span>${qtyFmt(i.qty)} x ${money(i.unit, false)}</span><span>${money(i.total, false)}</span></div></div>`).join('')}
      <div class="t-sep"></div><div class="t-row t-tot"><span>TOTAL</span><span>${money(r.amount)}</span></div>
      ${r.appliedToDebt ? `<div class="t-row"><span>Aplicado a deuda</span><span>${money(r.appliedToDebt)}</span></div>` : ''}
      ${r.refund ? `<div class="t-row b"><span>Reembolso (${payLabel(r.method)})</span><span>${money(r.refund)}</span></div>` : ''}
      <div class="t-sep"></div><div class="sm">Motivo: ${esc(r.reason || '—')}</div><div class="sm">Atendido por: ${esc(r.userName)}</div>`, 'ticket');
  },

  purchase(po) {
    const sup = D.supplier(po.supplierId) || {};
    printHTML(`${this.head('ORDEN DE COMPRA', po.number, `<div class="mut">Fecha: ${fmtDate(po.date)}</div><div class="mut">Estado: ${esc(po.status)}</div>`)}
      <div class="parties"><div class="box"><h4>Proveedor</h4><div class="nm">${esc(sup.name || po.supplierName || '—')}</div><div class="mut">${[sup.taxId, sup.contact, sup.phone, sup.email, sup.address].filter(Boolean).map(esc).join('<br>')}</div></div>
      <div class="box"><h4>Entregar en</h4><div>${esc(D.s.company.name)}</div><div class="mut">${esc(D.s.company.address)}</div></div></div>
      <table class="items"><thead><tr><th>Código</th><th>Descripción</th><th class="r">Cant.</th><th class="r">Costo</th><th class="r">Importe</th></tr></thead><tbody>
      ${po.items.map(i => `<tr><td class="sm">${esc(i.sku)}</td><td>${esc(i.name)}${i.variant ? `<div class="mut sm">${esc(i.variant)}</div>` : ''}</td><td class="r">${qtyFmt(i.qty)}</td><td class="r">${money(i.cost)}</td><td class="r">${money(i.qty * i.cost)}</td></tr>`).join('')}
      </tbody></table>
      <div class="totals"><div class="grand"><span>TOTAL</span><span>${money(po.total)}</span></div>${po.paid ? `<div><span>Pagado</span><span>${money(po.paid)}</span></div><div class="b"><span>Pendiente</span><span>${money(po.total - po.paid)}</span></div>` : ''}</div>
      ${po.notes ? `<div class="notes"><b>Notas:</b> ${esc(po.notes)}</div>` : ''}
      <div class="sign"><div>Autorizado por</div><div>Recibido por</div></div>`, 'carta');
  },

  statement(customerId) {
    const c = D.customer(customerId);
    const invs = DB.data.invoices.filter(i => i.customerId === customerId && i.status !== 'anulada' && i.type === 'credito').sort((a, b) => a.date.localeCompare(b.date));
    const pays = DB.data.payments.filter(p => p.customerId === customerId && !p.voided).sort((a, b) => a.date.localeCompare(b.date));
    const open = invs.filter(i => i.balance > 0.004);
    const bal = D.customerBalance(customerId);
    const overdue = sum(open, i => D.overdueAmount(i));
    printHTML(`${this.head('ESTADO DE CUENTA', '', `<div class="mut">Emitido: ${fmtDateTime(nowISO())}</div>`)}
      <div class="parties"><div class="box"><h4>Cliente</h4><div class="nm">${esc(c.name)}</div><div class="mut">${[c.docId && 'Doc: ' + c.docId, c.phone, c.email, c.address].filter(Boolean).map(esc).join('<br>')}</div></div>
      <div class="box"><h4>Crédito</h4><div>Límite: ${c.creditLimit ? money(c.creditLimit) : 'Sin límite'}</div><div>Plazo: ${c.creditDays || D.s.creditDefaultDays} días</div>${c.storeCredit ? `<div>Saldo a favor: ${money(c.storeCredit)}</div>` : ''}</div></div>
      <div class="kpis"><div><span>Saldo total</span><b>${money(bal)}</b></div><div><span>Vencido</span><b>${money(overdue)}</b></div><div><span>Facturas abiertas</span><b>${open.length}</b></div></div>
      <h3 class="sec">Facturas a crédito</h3>
      <table class="items"><thead><tr><th>Factura</th><th>Fecha</th><th>Próx. venc.</th><th class="r">Total</th><th class="r">Saldo</th></tr></thead><tbody>
      ${invs.map(i => { const nd = D.nextDue(i); return `<tr><td>${esc(i.number)}</td><td>${fmtDate(i.date)}</td><td>${i.balance > 0 && nd ? fmtDate(nd.date) + (D.overdueDays(i) ? ` <b style="color:#c00">(${D.overdueDays(i)} días vencida)</b>` : '') : 'Pagada'}</td><td class="r">${money(i.total)}</td><td class="r">${money(i.balance)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="c mut">Sin facturas a crédito</td></tr>'}
      </tbody></table>
      <h3 class="sec">Pagos recibidos</h3>
      <table class="items"><thead><tr><th>Recibo</th><th>Fecha</th><th>Forma</th><th>Aplicado a</th><th class="r">Monto</th></tr></thead><tbody>
      ${pays.map(p => `<tr><td>${esc(p.number)}</td><td>${fmtDate(p.date)}</td><td>${payLabel(p.method)}</td><td class="sm">${p.allocations.map(a => esc(a.number)).join(', ')}</td><td class="r">${money(p.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="c mut">Sin pagos</td></tr>'}
      </tbody></table>
      <div class="totals"><div class="grand"><span>SALDO</span><span>${money(bal)}</span></div></div>`, 'carta');
  },

  cashClose(s) {
    const x = s.summary || D.sessionSummary(s);
    const L = (l, v, b) => `<div class="t-row ${b ? 'b' : ''}"><span>${l}</span><span>${money(v)}</span></div>`;
    printHTML(`${this.ticketHead()}<div class="t-sep"></div><div class="t-title">${s.status === 'abierta' ? 'CORTE PARCIAL' : 'CIERRE DE CAJA'}</div>
      <div class="t-row"><span>Caja</span><b>${esc(s.number)}</b></div>
      <div class="t-row"><span>Apertura</span><span>${fmtDateTime(s.openedAt)}</span></div><div class="t-row"><span>Por</span><span>${esc(s.openedByName)}</span></div>
      ${s.closedAt ? `<div class="t-row"><span>Cierre</span><span>${fmtDateTime(s.closedAt)}</span></div><div class="t-row"><span>Por</span><span>${esc(s.closedByName)}</span></div>` : ''}
      <div class="t-sep"></div><div class="b">VENTAS (${x.invoices})</div>
      ${L('Total vendido', x.salesTotal, true)}${L('Efectivo (neto)', x.cashSales)}${L('Tarjeta', x.card)}${L('Transferencia', x.transfer)}${x.storeCredit ? L('Saldo a favor', x.storeCredit) : ''}${L('A crédito', x.creditSales)}
      <div class="t-sep"></div><div class="b">COBROS DE CRÉDITO</div>
      ${L('Efectivo', x.abonosCash)}${L('Tarjeta', x.abonosCard)}${L('Transferencia', x.abonosTransfer)}
      ${x.layawayCash || x.layawayCard || x.layawayTransfer ? `<div class="t-sep"></div><div class="b">ABONOS DE APARTADOS</div>${L('Efectivo', x.layawayCash)}${L('Tarjeta', x.layawayCard)}${L('Transferencia', x.layawayTransfer)}` : ''}
      <div class="t-sep"></div><div class="b">EFECTIVO EN CAJA</div>
      ${L('Fondo inicial', x.opening)}${L('+ Ventas efectivo', x.cashSales)}${L('+ Cobros efectivo', x.abonosCash)}${x.layawayCash ? L('+ Apartados efectivo', x.layawayCash) : ''}${x.layawayRefunds ? L('- Devol. apartados', x.layawayRefunds) : ''}${L('+ Entradas', x.ins)}${L('- Salidas', x.outs)}${L('- Devoluciones', x.refunds)}${L('- Gastos', x.expenses)}${L('- Pagos proveedores', x.supplierPayments)}
      <div class="t-sep"></div>${L('ESPERADO', x.expected, true)}
      ${s.status === 'cerrada' ? `${L('CONTADO', s.counted, true)}<div class="t-row t-tot"><span>DIFERENCIA</span><span>${money(s.difference)}</span></div>${s.closeNote ? `<div class="sm">Nota: ${esc(s.closeNote)}</div>` : ''}` : ''}
      <br><br><div class="t-center">______________________<br>Firma</div>`, 'ticket');
  },

  labels(list, { format = 'hoja', showPrice = true } = {}) {
    const one = ({ p, v }) => `<div class="lbl"><div class="st">${esc(D.s.company.name)}</div><div class="nm">${esc(p.name)}</div>
      <div class="row"><span class="vr">${esc(D.vLabel(v))}</span>${showPrice ? `<span class="pr">${money(D.vPrice(p, v))}</span>` : ''}</div>${code128Svg(v.barcode || v.sku, { height: 34, fontSize: 9 })}</div>`;
    const all = []; list.forEach(it => { for (let i = 0; i < it.copies; i++) all.push(one(it)); });
    if (!all.length) return toast('No hay etiquetas para imprimir', 'warn');
    printHTML(format === 'rollo' ? all.join('') : `<div class="sheet">${all.join('')}</div>`, 'labels:' + format);
  },

  layaway(l) {
    printHTML(`${this.ticketHead()}<div class="t-sep"></div><div class="t-title">${l.status === 'cancelado' ? 'CANCELADO · ' : ''}APARTADO</div>
      <div class="t-row"><span>No.</span><b>${esc(l.number)}</b></div><div class="t-row"><span>Fecha</span><span>${fmtDateTime(l.date)}</span></div>
      <div class="t-row"><span>Cliente</span><span>${esc(l.customerName)}</span></div><div class="t-row b"><span>Fecha límite</span><span>${fmtDate(l.dueDate)}</span></div>
      <div class="t-sep"></div>${l.items.map(i => `<div class="t-item"><div class="n">${esc(i.name)}${i.variant ? ' · ' + esc(i.variant) : ''}</div><div class="t-row"><span>${qtyFmt(i.qty)} x ${money(i.price, false)}</span><span>${money(i.lineTotal, false)}</span></div></div>`).join('')}
      <div class="t-sep"></div><div class="t-row t-tot"><span>TOTAL</span><span>${money(l.total)}</span></div>
      <div class="t-sep"></div><div class="b">ABONOS</div>${l.payments.map(p => `<div class="t-row"><span>${fmtDate(p.date)} ${payLabel(p.method)}</span><span>${money(p.amount)}</span></div>`).join('') || '<div class="sm">Sin abonos</div>'}
      <div class="t-row b"><span>Pagado</span><span>${money(l.paid)}</span></div><div class="t-row t-tot"><span>SALDO</span><span>${money(l.balance)}</span></div>
      <div class="t-sep"></div><div class="sm t-center">La mercancía se reserva hasta la fecha límite. Presente este comprobante para abonar o retirar.</div>
      <br><div class="t-center">______________________<br>Firma del cliente</div>`, 'ticket');
  },

  /* Reporte genérico en carta */
  report(title, subtitle, body) {
    printHTML(`${this.head(title, '', `<div class="mut">${esc(subtitle)}</div><div class="mut">Generado: ${fmtDateTime(nowISO())}</div>`)}${body}`, 'carta',
      'table.items td,table.items th{font-size:10.5px;padding:6px}');
  },
};
