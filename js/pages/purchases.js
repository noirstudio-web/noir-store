'use strict';
/* ==========================================================
   Compras, proveedores y cuentas por pagar
   ========================================================== */

function supplierForm(existing, onSaved) {
  const s = existing ? clone(existing) : { name: '', taxId: '', contact: '', phone: '', email: '', address: '', notes: '' };
  openModal({
    title: existing ? 'Editar proveedor' : 'Nuevo proveedor', size: 'md',
    body: `<div class="form-grid">
      <div class="field span-2"><label>Nombre / razón social *</label><input name="name" value="${esc(s.name)}"></div>
      <div class="field"><label>RNC / NIT</label><input name="taxId" value="${esc(s.taxId)}"></div>
      <div class="field"><label>Persona de contacto</label><input name="contact" value="${esc(s.contact)}"></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${esc(s.phone)}"></div>
      <div class="field"><label>Correo</label><input name="email" value="${esc(s.email)}"></div>
      <div class="field span-2"><label>Dirección</label><input name="address" value="${esc(s.address)}"></div>
      <div class="field span-2"><label>Notas</label><textarea name="notes" rows="2">${esc(s.notes)}</textarea></div></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Guardar</button>`,
    onOpen: m => m.$('[data-ok]').onclick = () => {
      const f = readForm(m.el);
      if (!f.name) return toast('El nombre es obligatorio', 'warn');
      Object.assign(s, f);
      if (existing) { const i = DB.data.suppliers.findIndex(x => x.id === s.id); DB.data.suppliers[i] = s; }
      else { s.id = uid(); s.createdAt = nowISO(); DB.data.suppliers.push(s); }
      DB.commit(); m.close(); toast('Proveedor guardado'); onSaved && onSaved(s);
    },
  });
}

function purchaseForm(existing, onSaved, preset = null) {
  const po = existing ? clone(existing) : { supplierId: preset?.supplierId || '', date: today(), supplierInvoice: '', items: preset?.items || [], notes: '' };
  const m = openModal({
    title: existing ? `Orden ${esc(po.number)}` : 'Nueva orden de compra', size: 'xl',
    body: `<div class="form-grid c4 mb">
        <div class="field span-2"><label>Proveedor *</label><div class="input-group"><select id="po-sup"><option value="">— Seleccionar —</option>${DB.data.suppliers.map(s => opt(s.id, s.name, po.supplierId)).join('')}</select><button class="btn" id="po-newsup" title="Nuevo proveedor">${icon('plus', 15)}</button></div></div>
        <div class="field"><label>Fecha</label><input type="date" id="po-date" value="${po.date}"></div>
        <div class="field"><label>No. factura del proveedor</label><input id="po-inv" value="${esc(po.supplierInvoice || '')}"></div></div>
      <div class="row mb"><button class="btn sm primary" id="po-add">${icon('plus', 14)} Agregar productos</button><button class="btn sm" id="po-low">${icon('alert', 14)} Agregar productos con stock bajo</button>
        <span class="spacer"></span><span class="small muted">Al recibir, el costo de cada producto se actualiza con el de esta compra.</span></div>
      <div class="card"><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Producto</th><th class="num">Stock actual</th><th class="num">Cantidad</th><th class="num">Costo unit.</th><th class="num">Importe</th><th></th></tr></thead><tbody id="po-rows"></tbody>
        <tfoot><tr><td colspan="4" class="right">TOTAL</td><td class="num" id="po-tot"></td><td></td></tr></tfoot></table></div></div>
      <div class="field mt"><label>Notas</label><textarea id="po-notes" rows="2">${esc(po.notes)}</textarea></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="po-save">${icon('check', 15)} Guardar borrador</button><button class="btn primary" id="po-recv">${icon('down', 15)} Guardar y recibir mercancía</button>`,
  });
  const add = (p, v, qty = 1) => {
    const ex = po.items.find(i => i.variantId === v.id);
    if (ex) ex.qty += qty;
    else po.items.push({ variantId: v.id, productId: p.id, name: p.name, variant: D.vLabel(v), sku: v.sku, qty, cost: D.vCost(p, v) });
  };
  const draw = () => {
    m.$('#po-rows').innerHTML = po.items.map((it, i) => { const f = D.findVariant(it.variantId); return `<tr><td><div class="strong">${esc(it.name)}</div><div class="small muted">${esc([it.variant, it.sku].filter(Boolean).join(' · '))}</div></td>
      <td class="num">${f ? qtyFmt(f.v.stock) : '—'}</td>
      <td class="num"><input type="number" min="0" step="any" data-f="qty" data-i="${i}" value="${it.qty}" style="width:90px;text-align:right"></td>
      <td class="num"><input type="number" min="0" step="0.01" data-f="cost" data-i="${i}" value="${it.cost}" style="width:110px;text-align:right"></td>
      <td class="num strong">${money(it.qty * it.cost)}</td><td class="actions"><button class="icon-btn danger" data-rm="${i}">${icon('trash', 14)}</button></td></tr>`; }).join('')
      || '<tr><td colspan="6"><div class="empty">Agrega productos a la orden</div></td></tr>';
    m.$('#po-tot').textContent = money(sum(po.items, i => i.qty * i.cost));
  };
  draw();
  m.$('#po-newsup').onclick = () => supplierForm(null, s => { m.$('#po-sup').insertAdjacentHTML('beforeend', opt(s.id, s.name)); m.$('#po-sup').value = s.id; });
  m.$('#po-add').onclick = () => pickVariantModal((p, v) => { add(p, v); draw(); }, { showCost: true });
  m.$('#po-low').onclick = () => {
    const sid = m.$('#po-sup').value; let n = 0;
    DB.data.products.filter(p => p.active !== false && (!sid || !p.supplierId || p.supplierId === sid)).forEach(p => {
      const per = Math.max(1, Math.ceil(D.minStock(p) / Math.max(1, p.variants.length)));
      p.variants.forEach(v => { if (v.stock <= per && !po.items.some(i => i.variantId === v.id)) { add(p, v, Math.max(1, per * 2 - v.stock)); n++; } });
    });
    draw(); toast(n ? `${n} producto(s) agregados` : 'No hay productos con stock bajo' + (sid ? ' de este proveedor' : ''), n ? 'ok' : 'info');
  };
  m.el.addEventListener('change', e => { const f = e.target.dataset.f; if (!f) return; po.items[+e.target.dataset.i][f] = Math.max(0, num(e.target.value)); draw(); });
  m.el.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { po.items.splice(+r.dataset.rm, 1); draw(); } });
  const save = async receive => {
    po.supplierId = m.$('#po-sup').value; po.date = m.$('#po-date').value || today(); po.supplierInvoice = m.$('#po-inv').value.trim(); po.notes = m.$('#po-notes').value.trim();
    po.items = po.items.filter(i => i.qty > 0);
    if (!po.supplierId) return toast('Selecciona el proveedor', 'warn');
    if (!po.items.length) return toast('Agrega productos', 'warn');
    if (receive && !(await confirmBox(`Se sumarán ${qtyFmt(sum(po.items, i => i.qty))} unidades al inventario. ¿Confirmar recepción?`))) return;
    const saved = D.savePurchase(po);
    if (receive) D.receivePurchase(saved.id);
    m.close(); toast(receive ? 'Mercancía recibida e inventario actualizado' : 'Orden guardada');
    onSaved && onSaved(saved);
  };
  m.$('#po-save').onclick = () => save(false);
  m.$('#po-recv').onclick = () => save(true);
}

function supplierPayModal(po, onDone) {
  const due = round2(po.total - (po.paid || 0));
  openModal({
    title: `Pagar ${esc(po.number)} · ${esc(po.supplierName)}`, size: 'sm',
    body: `<div class="big-total mb"><div class="bt-label">Pendiente</div><div class="bt-value">${money(due)}</div></div>
      <div class="field mb"><label>Monto</label><div class="input-group"><input id="sp-amt" type="number" min="0" step="0.01" value="${due}"><button class="btn" id="sp-all">Todo</button></div></div>
      <div class="field mb"><label>Forma de pago</label><select id="sp-m">${opt('transferencia', 'Transferencia')}${opt('efectivo', 'Efectivo (sale de caja)')}${opt('tarjeta', 'Tarjeta')}${opt('cheque', 'Cheque')}</select></div>
      <div class="field"><label>Referencia / nota</label><input id="sp-note"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Registrar pago</button>`,
    onOpen: m => {
      m.$('#sp-all').onclick = () => m.$('#sp-amt').value = due;
      m.$('[data-ok]').onclick = () => {
        try { D.paySupplier({ purchaseId: po.id, amount: num(m.$('#sp-amt').value), method: m.$('#sp-m').value, note: m.$('#sp-note').value.trim() }); m.close(); toast('Pago registrado'); onDone && onDone(); }
        catch (e) { toast(e.message, 'err'); }
      };
    },
  });
}

Pages.purchases = {
  title: 'Compras y proveedores',
  tab: 'orders',
  render(el) {
    const pend = DB.data.purchases.filter(p => p.status === 'recibida' && p.total - (p.paid || 0) > 0.004);
    const monthStart = today().slice(0, 8) + '01';
    el.innerHTML = `<div class="grid g-4 mb">
        <div class="card kpi"><div class="k-label">Compras del mes</div><div class="k-value">${money(sum(DB.data.purchases.filter(p => p.status === 'recibida' && inRange(p.receivedAt, monthStart, today())), p => p.total))}</div></div>
        <div class="card kpi"><div class="k-label">Órdenes en borrador</div><div class="k-value">${DB.data.purchases.filter(p => p.status === 'borrador').length}</div></div>
        <div class="card kpi"><div class="k-label">Cuentas por pagar</div><div class="k-value warn-text">${money(sum(pend, p => p.total - (p.paid || 0)))}</div><div class="k-sub">${pend.length} compras</div></div>
        <div class="card kpi"><div class="k-label">Proveedores</div><div class="k-value">${DB.data.suppliers.length}</div></div></div>
      <div class="tabs">${[['orders', 'Órdenes de compra'], ['payables', 'Cuentas por pagar'], ['suppliers', 'Proveedores']].map(([k, l]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="tbl"></div>`;
    $$('[data-tab]', el).forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(el); });
    const reload = () => this.render(el);
    const box = $('#tbl', el);
    const poActions = po => `<button class="icon-btn" data-act="print" data-id="${po.id}" title="Imprimir">${icon('printer', 15)}</button>
      ${po.status === 'borrador' ? `<button class="icon-btn" data-act="edit" data-id="${po.id}" title="Editar">${icon('edit', 15)}</button><button class="btn sm success" data-act="recv" data-id="${po.id}">${icon('down', 13)} Recibir</button>` : ''}
      ${po.status === 'recibida' && po.total - (po.paid || 0) > 0.004 ? `<button class="btn sm" data-act="pay" data-id="${po.id}">Pagar</button>` : ''}
      ${po.status !== 'anulada' ? `<button class="icon-btn danger" data-act="void" data-id="${po.id}" title="Anular">${icon('x', 15)}</button>` : ''}`;
    if (this.tab === 'orders') {
      const st = { status: '' };
      const dt = DataTable(box, {
        placeholder: 'Buscar número, proveedor, producto…',
        toolbar: `<select id="f-st" style="width:auto">${opt('', 'Todos')}${opt('borrador', 'Borrador')}${opt('recibida', 'Recibida')}${opt('anulada', 'Anulada')}</select><span class="spacer"></span><button class="btn primary sm" id="new">${icon('plus', 14)} Nueva orden</button>`,
        rows: () => DB.data.purchases.filter(p => !st.status || p.status === st.status).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        searchText: p => `${p.number} ${p.supplierName} ${p.supplierInvoice} ${p.items.map(i => i.name).join(' ')}`,
        columns: [
          { label: 'Orden', html: p => `<b>${esc(p.number)}</b>${p.supplierInvoice ? `<div class="small muted">Fact. ${esc(p.supplierInvoice)}</div>` : ''}` },
          { label: 'Fecha', html: p => fmtDate(p.date) },
          { label: 'Proveedor', html: p => esc(p.supplierName) },
          { label: 'Unidades', cls: 'num', html: p => qtyFmt(sum(p.items, i => i.qty)) },
          { label: 'Total', cls: 'num', html: p => `<b>${money(p.total)}</b>` },
          { label: 'Pagado', cls: 'num', html: p => p.status === 'recibida' ? (p.paid >= p.total - 0.004 ? '<span class="badge ok">Pagada</span>' : money(p.paid || 0)) : '—' },
          { label: 'Estado', html: p => badge(p.status) },
          { label: '', cls: 'actions', html: poActions },
        ],
        empty: 'No hay órdenes de compra', emptyIcon: 'truck',
      });
      $('#f-st', box).onchange = e => { st.status = e.target.value; dt.refresh(); };
      $('#new', box).onclick = () => purchaseForm(null, reload);
    } else if (this.tab === 'payables') {
      DataTable(box, {
        placeholder: 'Buscar proveedor…',
        rows: () => pend, searchText: p => `${p.number} ${p.supplierName}`,
        columns: [
          { label: 'Orden', html: p => `<b>${esc(p.number)}</b>` },
          { label: 'Recibida', html: p => fmtDate(p.receivedAt) },
          { label: 'Proveedor', html: p => esc(p.supplierName) },
          { label: 'Total', cls: 'num', html: p => money(p.total) },
          { label: 'Pagado', cls: 'num', html: p => money(p.paid || 0) },
          { label: 'Pendiente', cls: 'num', html: p => `<b class="warn-text">${money(p.total - (p.paid || 0))}</b>` },
          { label: '', cls: 'actions', html: p => `<button class="btn sm primary" data-act="pay" data-id="${p.id}">Pagar</button>` },
        ],
        footer: rs => `<tr><td colspan="5">${rs.length} compras</td><td class="num">${money(sum(rs, p => p.total - (p.paid || 0)))}</td><td></td></tr>`,
        empty: 'No hay cuentas por pagar', emptyIcon: 'truck',
      });
    } else {
      const dt = DataTable(box, {
        placeholder: 'Buscar proveedor…',
        toolbar: `<span class="spacer"></span><button class="btn primary sm" id="new">${icon('plus', 14)} Nuevo proveedor</button>`,
        rows: () => DB.data.suppliers, searchText: s => `${s.name} ${s.taxId} ${s.contact} ${s.phone} ${s.email}`,
        sortKey: 'name', sortDir: 'asc',
        columns: [
          { label: 'Proveedor', sort: 'name', html: s => `<div class="strong">${esc(s.name)}</div><div class="small muted">${esc(s.taxId || '')}</div>` },
          { label: 'Contacto', html: s => `<div>${esc(s.contact || '')}</div><div class="small muted">${esc([s.phone, s.email].filter(Boolean).join(' · '))}</div>` },
          { label: 'Productos', cls: 'num', html: s => DB.data.products.filter(p => p.supplierId === s.id).length },
          { label: 'Comprado', cls: 'num', html: s => money(sum(DB.data.purchases.filter(p => p.supplierId === s.id && p.status === 'recibida'), p => p.total)) },
          { label: 'Por pagar', cls: 'num', html: s => { const v = sum(DB.data.purchases.filter(p => p.supplierId === s.id && p.status === 'recibida'), p => p.total - (p.paid || 0)); return v > 0 ? `<span class="warn-text">${money(v)}</span>` : '—'; } },
          { label: '', cls: 'actions', html: s => `<button class="btn sm" data-act="newpo" data-id="${s.id}">Nueva orden</button><button class="icon-btn" data-act="sedit" data-id="${s.id}">${icon('edit', 15)}</button><button class="icon-btn danger" data-act="sdel" data-id="${s.id}">${icon('trash', 15)}</button>` },
        ],
        empty: 'No hay proveedores', emptyIcon: 'truck',
      });
      $('#new', box).onclick = () => supplierForm(null, () => dt.refresh());
    }
    const findPo = id => DB.data.purchases.find(p => p.id === id);
    onActions(el, {
      print: id => PR.purchase(findPo(id)),
      edit: id => purchaseForm(findPo(id), reload),
      recv: async id => {
        const po = findPo(id);
        if (!(await confirmBox(`¿Recibir la orden ${po.number}? Se sumarán ${qtyFmt(sum(po.items, i => i.qty))} unidades al inventario.`))) return;
        try { D.receivePurchase(id); toast('Mercancía recibida'); reload(); } catch (e) { toast(e.message, 'err'); }
      },
      pay: id => supplierPayModal(findPo(id), reload),
      void: async id => {
        const po = findPo(id);
        if (!(await adminAuth())) return;
        const reason = await promptBox(po.status === 'recibida' ? 'Se restará la mercancía del inventario. Motivo:' : 'Motivo de la anulación', { required: true, title: `Anular ${po.number}` });
        if (!reason) return;
        try { D.voidPurchase(id, reason); toast('Orden anulada'); reload(); } catch (e) { toast(e.message, 'err'); }
      },
      newpo: id => purchaseForm(null, () => { this.tab = 'orders'; reload(); }, { supplierId: id }),
      sedit: id => supplierForm(D.supplier(id), reload),
      sdel: async id => {
        if (DB.data.purchases.some(p => p.supplierId === id)) return toast('El proveedor tiene compras registradas', 'warn');
        if (!(await confirmBox('¿Eliminar este proveedor?', { danger: true, ok: 'Eliminar' }))) return;
        DB.data.suppliers = DB.data.suppliers.filter(s => s.id !== id);
        DB.data.products.forEach(p => { if (p.supplierId === id) p.supplierId = ''; });
        DB.commit(); reload();
      },
    });
  },
};
