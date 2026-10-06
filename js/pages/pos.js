'use strict';
/* ==========================================================
   Punto de venta
   ========================================================== */
const POS = {
  cart: null, cat: '', q: '',
  newCart() { return { items: [], customerId: 'walkin', gd: 0, gdType: 'percent', notes: '', quoteId: null, priceMode: 'detal' }; },
  cartQty(vid) { return sum(this.cart.items.filter(i => i.variantId === vid), i => i.qty); },
  canEditPrice() { return isAdmin() || D.s.sellerCanEditPrice; },
  priceFor(p, v) { return this.cart.priceMode === 'mayoreo' && +p.price2 > 0 ? +p.price2 : D.vPrice(p, v); },

  add(p, v, qty = 1) {
    if (p.active === false) return toast('Producto inactivo', 'warn');
    const avail = v.stock - this.cartQty(v.id);
    if (!D.s.allowNegativeStock && avail < qty) { toast(`Sin stock suficiente de ${p.name} ${D.vLabel(v)} (disp. ${qtyFmt(Math.max(0, avail))})`, 'err'); return false; }
    const ex = this.cart.items.find(i => i.variantId === v.id);
    if (ex) ex.qty = round2(ex.qty + qty);
    else {
      const promo = D.promoFor(p);
      this.cart.items.push({
        key: uid(), variantId: v.id, productId: p.id, name: p.name, variant: D.vLabel(v), sku: v.sku,
        qty, price: this.priceFor(p, v), discount: promo ? +promo.value : 0, promo: promo ? promo.name : '', cost: D.vCost(p, v), taxable: p.taxable !== false,
      });
    }
    return true;
  },
  loadQuote(id) {
    const q = DB.data.quotes.find(x => x.id === id); if (!q) return;
    this.cart = this.newCart();
    this.cart.customerId = q.customerId || 'walkin'; this.cart.gd = q.gd || 0; this.cart.gdType = q.gdType || 'percent';
    this.cart.quoteId = q.id; this.cart.notes = `Según cotización ${q.number}`;
    let missing = 0;
    q.items.forEach(it => {
      const f = it.variantId ? D.findVariant(it.variantId) : null;
      if (it.variantId && !f) { missing++; return; }
      this.cart.items.push({ key: uid(), variantId: it.variantId, productId: it.productId, name: it.name, variant: it.variant, sku: it.sku, qty: it.qty, price: it.price, discount: it.discount || 0, cost: it.cost || 0, taxable: it.taxable !== false });
    });
    toast(`Cotización ${q.number} cargada${missing ? ` (${missing} artículo(s) ya no existen)` : ''}`, missing ? 'warn' : 'ok');
  },
};

Pages.pos = {
  title: 'Punto de venta',
  render(el, params) {
    if (!POS.cart) POS.cart = POS.newCart();
    if (params[0] === 'quote' && params[1]) { POS.loadQuote(params[1]); history.replaceState(null, '', '#/pos'); }
    const c = () => POS.cart;
    el.innerHTML = `<div class="pos">
      <section class="pos-left">
        <div class="pos-search">
          <div class="search-box">${icon('search', 18)}<input id="pq" type="search" placeholder="Buscar producto, SKU o escanear código…  (F3)" autocomplete="off" value="${esc(POS.q)}"></div>
          <button class="btn" id="freeItem" title="Artículo o servicio sin inventario">${icon('plus', 16)} Artículo libre</button>
        </div>
        <div class="chips pos-cats" id="pcats"></div>
        <div class="pos-grid" id="pgrid"></div>
      </section>
      <aside class="pos-right">
        <div class="cart-head">
          <button class="cust-sel" id="custSel" title="Cambiar cliente (F4)"></button>
          <div class="row between">
            <div class="seg" id="priceMode"><button data-m="detal">Detal</button><button data-m="mayoreo">Mayoreo</button></div>
            <button class="btn sm ghost" id="heldBtn">${icon('clock', 14)} En espera <span class="badge" id="heldN">0</span></button>
          </div>
        </div>
        <div class="cart-items" id="citems"></div>
        <div class="cart-foot">
          <div class="row"><span class="small muted">Descuento general</span><span class="spacer"></span>
            <div class="input-group" style="width:160px"><input id="gd" type="number" min="0" step="0.01" value="${c().gd || ''}" placeholder="0"><button class="btn sm" id="gdType" style="width:44px"></button></div></div>
          <div id="ctot"></div>
          <div class="cash-panel" id="cashPanel">
            <div class="cp-head"><span>${icon('cash', 14)} Pago en efectivo</span><button class="cp-clear" id="recvClear" type="button">Limpiar</button></div>
            <div class="cp-grid">
              <label class="cp-in"><span class="cp-l">Recibido</span>
                <span class="cp-field"><span class="cp-cur">${esc(D.s.currencySymbol)}</span><input id="recv" type="number" min="0" step="0.01" placeholder="0" title="Escribe cuánto te entregó el cliente (Enter para cobrar)"></span></label>
              <div class="cp-out" id="chgBox"><span class="cp-l" id="chgL">Cambio</span><div class="cp-val" id="chg">—</div></div>
            </div>
            <div class="cp-quick" id="quickRecv"></div>
          </div>
          <div class="cart-actions">
            <button class="btn sm" id="hold">${icon('pause', 14)} Espera</button>
            <button class="btn sm" id="toQuote" ${can('quotes') ? '' : `disabled title="${esc(LIC.upgradeMsg('Cotizaciones'))}"`}>${icon('quote', 14)} Cotizar</button>
            <button class="btn sm" id="layBtn" ${can('layaway') ? '' : `disabled title="${esc(LIC.upgradeMsg('Apartados'))}"`}>${icon('tag', 14)} Apartar</button>
            <button class="btn sm danger" id="clear">${icon('trash', 14)} Vaciar</button>
          </div>
          <button class="btn chrome lg block" id="pay">${icon('cash', 18)} Cobrar <span class="kbd">F2</span></button>
          <button class="btn block hidden" id="payCredit" style="border-color:rgba(242,184,75,.45);color:#f5ca78">${icon('credit', 17)} Vender a crédito</button>
        </div>
      </aside></div>`;

    const pq = $('#pq', el), grid = $('#pgrid', el), citems = $('#citems', el);

    /* ----- Catálogo ----- */
    const drawCats = () => {
      const used = new Set(DB.data.products.filter(p => p.active !== false).map(p => p.categoryId));
      const cats = DB.data.categories.filter(x => used.has(x.id));
      $('#pcats', el).innerHTML = `<span class="chip ${!POS.cat ? 'on' : ''}" data-cat="">Todo</span>` + cats.map(x => `<span class="chip ${POS.cat === x.id ? 'on' : ''}" data-cat="${x.id}">${esc(x.name)}</span>`).join('');
    };
    const filtered = () => {
      const words = norm(POS.q).split(/\s+/).filter(Boolean);
      return DB.data.products.filter(p => p.active !== false && (!POS.cat || p.categoryId === POS.cat) &&
        (!words.length || words.every(w => norm([p.name, p.description, D.category(p.categoryId)?.name, D.brand(p.brandId)?.name, ...p.variants.map(v => `${v.sku} ${v.barcode} ${v.size} ${v.color}`)].join(' ')).includes(w))));
    };
    const drawGrid = () => {
      const list = filtered().slice(0, 120);
      grid.innerHTML = list.map(p => {
        const st = D.stockOf(p) - sum(p.variants, v => POS.cartQty(v.id));
        const state = st <= 0 ? 'out' : D.stockState(p) === 'low' ? 'low' : '';
        const prices = p.variants.map(v => POS.priceFor(p, v));
        const min = Math.min(...prices), max = Math.max(...prices);
        return `<button class="p-card ${state === 'out' ? 'out' : ''}" data-p="${p.id}">
          <div class="p-img">${p.image ? `<img src="${p.image}" alt="">` : `<span class="p-ini">${esc(initials(p.name))}</span>`}</div>
          <div class="p-info"><div class="p-name">${esc(p.name)}</div>
          <div class="p-meta"><span class="p-price">${min !== max ? 'desde ' : ''}${money(min)}</span><span class="p-stock ${state}">${qtyFmt(Math.max(0, st))} ${p.variants.length > 1 ? `· ${p.variants.length} var.` : esc(p.unit || '')}</span></div></div>
        </button>`;
      }).join('') || `<div class="empty" style="grid-column:1/-1">${icon('box', 34)}<div>${DB.data.products.length ? 'Sin resultados' : 'Aún no hay productos. Créalos en <a href="#/products">Productos</a>.'}</div></div>`;
    };

    /* ----- Carrito ----- */
    const drawCart = () => {
      const cart = c();
      const cust = D.customer(cart.customerId) || D.customer('walkin');
      const bal = cust.id !== 'walkin' ? D.customerBalance(cust.id) : 0;
      $('#custSel', el).innerHTML = `<span class="avatar" style="width:32px;height:32px">${cust.id === 'walkin' ? icon('user', 16) : initials(cust.name)}</span>
        <div style="flex:1;min-width:0"><div class="c-name">${esc(cust.name)}</div><div class="c-sub">${cust.id === 'walkin' ? 'Toca para elegir cliente · F4' : [cust.docId, bal ? `Debe ${money(bal)}` : 'Sin deuda', cust.storeCredit ? `A favor ${money(cust.storeCredit)}` : ''].filter(Boolean).map(esc).join(' · ')}</div></div>${icon('edit', 15)}`;
      $$('#priceMode button', el).forEach(b => b.classList.toggle('on', b.dataset.m === cart.priceMode));
      $('#heldN', el).textContent = DB.data.held.length;
      $('#gdType', el).textContent = cart.gdType === 'percent' ? '%' : '$';
      const t = D.totals(cart.items, cart.gd, cart.gdType);
      const editPrice = POS.canEditPrice();
      citems.innerHTML = cart.items.length ? cart.items.map((it, i) => {
        const f = it.variantId ? D.findVariant(it.variantId) : null;
        return `<div class="cart-item">
          <div style="min-width:0"><div class="ci-name">${esc(it.name)}</div><div class="ci-sub">${[it.variant, it.sku, f ? `stock ${qtyFmt(f.v.stock)}` : 'libre'].filter(Boolean).map(esc).join(' · ')}${it.promo ? ` · <span class="ok-text">🏷 ${esc(it.promo)}</span>` : ''}</div></div>
          <div class="ci-total">${money(t.lines[i].total)}${it.discount ? `<div class="small muted" style="text-decoration:line-through">${money(it.qty * it.price)}</div>` : ''}</div>
          <div class="ci-ctrl">
            <div class="qty"><button data-q="-1" data-i="${i}">${icon('minus', 14)}</button><input type="number" min="0" step="any" value="${it.qty}" data-f="qty" data-i="${i}"><button data-q="1" data-i="${i}">${icon('plus', 14)}</button></div>
            <input class="mini" type="number" min="0" step="0.01" value="${it.price}" data-f="price" data-i="${i}" title="Precio unitario" ${editPrice || !it.variantId ? '' : 'readonly'}>
            <input class="mini" style="width:66px" type="number" min="0" max="100" step="0.5" value="${it.discount || ''}" placeholder="% d" data-f="discount" data-i="${i}" title="Descuento %">
            <span class="spacer"></span><button class="icon-btn danger" data-del="${i}" title="Quitar">${icon('trash', 15)}</button>
          </div></div>`;
      }).join('') : `<div class="empty">${icon('pos', 36)}<div>Carrito vacío</div><div class="small">Busca o escanea un producto para empezar</div></div>`;
      const rate = D.s.taxRate;
      $('#ctot', el).innerHTML = `
        <div class="tot-row"><span>Subtotal · ${qtyFmt(sum(cart.items, i => i.qty))} art.</span><span>${money(t.subtotal)}</span></div>
        ${t.discount ? `<div class="tot-row"><span>Descuento</span><span class="ok-text">- ${money(t.discount)}</span></div>` : ''}
        ${rate ? `<div class="tot-row"><span>${esc(D.s.taxName)} ${D.s.pricesIncludeTax ? 'incluido' : ''} (${rate}%)</span><span>${money(t.tax)}</span></div>` : ''}
        <div class="tot-row grand"><span>TOTAL</span><span>${money(t.total)}</span></div>
        ${cart.quoteId ? `<div class="small muted">${icon('quote', 12)} Desde cotización</div>` : ''}`;
      $('#pay', el).disabled = !cart.items.length;
      const pc = $('#payCredit', el);
      pc.classList.toggle('hidden', cust.id === 'walkin' || !can('credits'));
      pc.disabled = !cart.items.length;
      if (cust.id !== 'walkin') { const av = D.creditAvailable(cust); pc.title = av === Infinity ? 'Sin límite de crédito' : `Crédito disponible: ${money(av)}`; }
      const recvIn = $('#recv', el);
      if (document.activeElement !== recvIn) recvIn.value = cart.received || '';
      drawChange(t.total);
    };
    /* Cambio a devolver según lo recibido */
    const drawChange = total => {
      const rec = num(c().received), has = c().items.length > 0;
      const panel = $('#cashPanel', el), L = $('#chgL', el), V = $('#chg', el);
      panel.classList.remove('ok', 'err');
      panel.classList.toggle('off', !has);
      // botones rápidos: exacto + billetes que cubren el total
      const q = $('#quickRecv', el);
      if (has && total > 0) {
        const opts = [total];
        [...(D.s.denominations || [])].sort((a, b) => a - b).forEach(d => { const v = Math.ceil(total / d) * d; if (v > total && !opts.includes(v) && v <= total * 3 + d) opts.push(v); });
        q.innerHTML = opts.sort((a, b) => a - b).slice(0, 4).map((v, i) => `<button type="button" class="cp-chip ${round2(v) === round2(rec) ? 'on' : ''}" data-recv="${v}">${i === 0 ? 'Exacto' : money(v, false)}</button>`).join('');
      } else q.innerHTML = '';
      if (!rec || !has) { L.textContent = 'Cambio'; V.textContent = '—'; return; }
      const diff = round2(rec - total);
      if (diff >= 0) { L.textContent = diff ? 'Devolver al cliente' : 'Pago exacto'; V.textContent = money(diff); panel.classList.add('ok'); }
      else { L.textContent = 'Falta'; V.textContent = money(-diff); panel.classList.add('err'); }
    };
    const refresh = () => { drawCart(); drawGrid(); };

    /* ----- Eventos ----- */
    drawCats(); refresh();
    $('#pcats', el).onclick = e => { const ch = e.target.closest('[data-cat]'); if (!ch) return; POS.cat = ch.dataset.cat; drawCats(); drawGrid(); };
    pq.addEventListener('input', () => { POS.q = pq.value; drawGrid(); });
    pq.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const code = pq.value.trim(); if (!code) return;
      // permite "3*CODIGO" para agregar varias unidades
      const m = code.match(/^(\d+(?:\.\d+)?)\*(.+)$/);
      const qty = m ? +m[1] : 1, term = m ? m[2] : code;
      const hit = D.findByCode(term);
      if (hit) { if (POS.add(hit.p, hit.v, qty)) { toast(`${hit.p.name} ${D.vLabel(hit.v)} agregado`, 'ok', 1400); } pq.value = ''; POS.q = ''; refresh(); return; }
      const list = filtered();
      if (list.length === 1) { pickProduct(list[0]); pq.value = ''; POS.q = ''; return; }
      toast(list.length ? 'Varios resultados: selecciona uno' : 'Producto no encontrado', 'warn');
    });
    const pickProduct = p => {
      if (p.variants.length === 1) { POS.add(p, p.variants[0]); refresh(); pq.focus(); return; }
      openModal({
        title: esc(p.name), size: 'md',
        body: `<div class="variant-grid">${p.variants.map(v => { const av = v.stock - POS.cartQty(v.id); return `<button data-v="${v.id}" ${av <= 0 && !D.s.allowNegativeStock ? 'disabled' : ''}><div class="vg-name">${esc(D.vLabel(v) || 'Única')}</div><div class="vg-sub">${money(POS.priceFor(p, v))}</div><div class="vg-sub ${av <= 0 ? 'err-text' : av <= 2 ? 'warn-text' : ''}">${qtyFmt(Math.max(0, av))} disponibles</div></button>`; }).join('')}</div>`,
        onOpen: m => m.el.addEventListener('click', e => {
          const b = e.target.closest('[data-v]'); if (!b) return;
          const v = p.variants.find(x => x.id === b.dataset.v);
          if (POS.add(p, v)) { m.close(); refresh(); pq.focus(); }
        }),
      });
    };
    grid.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) pickProduct(D.product(b.dataset.p)); });

    citems.addEventListener('click', e => {
      const q = e.target.closest('[data-q]'), d = e.target.closest('[data-del]');
      if (q) {
        const it = c().items[+q.dataset.i]; const delta = +q.dataset.q;
        if (delta > 0 && it.variantId && !D.s.allowNegativeStock) { const f = D.findVariant(it.variantId); if (f && POS.cartQty(it.variantId) + 1 > f.v.stock) return toast('No hay más stock disponible', 'warn'); }
        it.qty = round2(it.qty + delta);
        if (it.qty <= 0) c().items.splice(+q.dataset.i, 1);
        refresh();
      }
      if (d) { c().items.splice(+d.dataset.del, 1); refresh(); }
    });
    citems.addEventListener('change', async e => {
      const inp = e.target.closest('[data-f]'); if (!inp) return;
      const it = c().items[+inp.dataset.i]; const f = inp.dataset.f; let v = num(inp.value);
      if (f === 'qty') {
        if (v <= 0) { c().items.splice(+inp.dataset.i, 1); return refresh(); }
        if (it.variantId && !D.s.allowNegativeStock) { const fv = D.findVariant(it.variantId); const other = POS.cartQty(it.variantId) - it.qty; if (fv && other + v > fv.v.stock) { toast(`Máximo disponible: ${qtyFmt(fv.v.stock - other)}`, 'warn'); v = fv.v.stock - other; } }
        it.qty = v;
      } else if (f === 'discount') {
        v = Math.min(100, Math.max(0, v));
        if (!isAdmin() && v > D.s.maxDiscountNonAdmin && !(await adminAuth(`Descuento mayor a ${D.s.maxDiscountNonAdmin}% requiere autorización.`))) v = 0;
        it.discount = v;
      } else if (f === 'price') {
        if (v < it.cost && it.cost > 0 && !(await confirmBox(`El precio ${money(v)} está por debajo del costo (${money(it.cost)}). ¿Continuar?`))) v = it.price;
        it.price = round2(v);
      }
      refresh();
    });
    $('#gd', el).addEventListener('change', async e => {
      let v = Math.max(0, num(e.target.value));
      const cart = c();
      const pctEq = cart.gdType === 'percent' ? v : (D.totals(cart.items).total ? v / D.totals(cart.items).total * 100 : 0);
      if (!isAdmin() && pctEq > D.s.maxDiscountNonAdmin && !(await adminAuth(`Descuento mayor a ${D.s.maxDiscountNonAdmin}% requiere autorización.`))) v = 0;
      cart.gd = v; e.target.value = v || ''; drawCart();
    });
    $('#recv', el).addEventListener('input', e => { c().received = num(e.target.value); drawChange(D.totals(c().items, c().gd, c().gdType).total); });
    $('#recv', el).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkout(refresh); } });
    $('#quickRecv', el).onclick = e => {
      const b = e.target.closest('[data-recv]'); if (!b) return;
      c().received = +b.dataset.recv; $('#recv', el).value = c().received;
      drawChange(D.totals(c().items, c().gd, c().gdType).total);
    };
    $('#recvClear', el).onclick = () => { c().received = 0; $('#recv', el).value = ''; drawChange(D.totals(c().items, c().gd, c().gdType).total); $('#recv', el).focus(); };
    $('#gdType', el).onclick =() => { c().gdType = c().gdType === 'percent' ? 'amount' : 'percent'; drawCart(); };
    $('#priceMode', el).onclick = e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      c().priceMode = b.dataset.m;
      c().items.forEach(it => { const f = it.variantId && D.findVariant(it.variantId); if (f) it.price = POS.priceFor(f.p, f.v); });
      refresh();
    };
    $('#custSel', el).onclick = () => chooseCustomer(id => { c().customerId = id; drawCart(); });
    $('#freeItem', el).onclick = () => freeItemModal(it => { c().items.push(it); refresh(); });
    $('#clear', el).onclick = async () => { if (c().items.length && !(await confirmBox('¿Vaciar el carrito?', { danger: true, ok: 'Vaciar' }))) return; POS.cart = POS.newCart(); $('#gd', el).value = ''; refresh(); };
    $('#hold', el).onclick = () => {
      if (!c().items.length) return toast('El carrito está vacío', 'warn');
      DB.data.held.push({ id: uid(), date: nowISO(), user: App.user.name, cart: clone(c()) });
      DB.commit(); POS.cart = POS.newCart(); $('#gd', el).value = ''; refresh(); toast('Venta puesta en espera');
    };
    $('#heldBtn', el).onclick = () => heldModal(() => { $('#gd', el).value = c().gd || ''; refresh(); });
    $('#toQuote', el).onclick = () => {
      if (!c().items.length) return toast('El carrito está vacío', 'warn');
      const cart = c();
      const q = D.saveQuote({ customerId: cart.customerId, items: cart.items.map(({ key, ...it }) => it), gd: cart.gd, gdType: cart.gdType, validUntil: addDays(today(), D.s.quoteValidityDays), notes: cart.notes || '' });
      POS.cart = POS.newCart(); $('#gd', el).value = ''; refresh();
      openModal({
        title: 'Cotización creada', size: 'sm', body: `<div class="center"><div class="success-mark">${icon('quote', 28)}</div><h3 style="margin:0">${esc(q.number)}</h3><p class="muted">Total ${money(q.total)} · válida hasta ${fmtDate(q.validUntil)}</p></div>`,
        footer: `<button class="btn ghost" data-close>Cerrar</button><button class="btn primary" id="pq1">${icon('printer', 16)} Imprimir</button>`,
        onOpen: m => m.$('#pq1').onclick = () => { PR.quote(q); m.close(); },
      });
    };
    $('#pay', el).onclick = () => checkout(refresh);
    $('#payCredit', el).onclick = () => checkout(refresh, { credit: true });
    $('#layBtn', el).onclick = () => layawayModal(refresh);

    const onKey = e => {
      if (modalStack.length) return;
      if (e.key === 'F2') { e.preventDefault(); checkout(refresh); }
      else if (e.key === 'F3') { e.preventDefault(); pq.focus(); pq.select(); }
      else if (e.key === 'F4') { e.preventDefault(); $('#custSel', el).click(); }
    };
    document.addEventListener('keydown', onKey);
    setTimeout(() => pq.focus(), 50);
    return () => document.removeEventListener('keydown', onKey);
  },
};

/* ---------- Selección de cliente ---------- */
function chooseCustomer(onPick) {
  const m = openModal({
    title: 'Seleccionar cliente', size: 'md',
    body: `<div class="row mb"><div class="search-box" style="flex:1">${icon('search', 16)}<input id="cs-q" type="search" placeholder="Nombre, documento o teléfono" autofocus></div>
      ${can('customers.edit') ? `<button class="btn primary" id="cs-new">${icon('plus', 16)} Nuevo</button>` : ''}</div><div id="cs-list" style="max-height:52vh;overflow:auto"></div>`,
    onOpen: m => {
      const draw = () => {
        const q = norm(m.$('#cs-q').value);
        const list = DB.data.customers.filter(c => !c.inactive && (!q || norm(`${c.name} ${c.docId} ${c.phone} ${c.email}`).includes(q))).slice(0, 60);
        m.$('#cs-list').innerHTML = list.map(c => {
          const bal = c.id !== 'walkin' ? D.customerBalance(c.id) : 0;
          return `<div class="list-item" style="cursor:pointer" data-c="${c.id}"><span class="avatar">${c.id === 'walkin' ? icon('user', 16) : initials(c.name)}</span>
          <div style="flex:1;min-width:0"><div class="strong">${esc(c.name)}</div><div class="small muted">${[c.docId, c.phone].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div></div>
          <div class="right small">${bal ? `<div class="warn-text">Debe ${money(bal)}</div>` : ''}${c.creditLimit ? `<div class="muted">Límite ${money(c.creditLimit)}</div>` : ''}${c.storeCredit ? `<div class="ok-text">A favor ${money(c.storeCredit)}</div>` : ''}</div></div>`;
        }).join('') || '<div class="empty">Sin resultados</div>';
      };
      draw();
      m.$('#cs-q').addEventListener('input', draw);
      m.$('#cs-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = m.$('[data-c]'); f && f.click(); } });
      m.$('#cs-list').addEventListener('click', e => { const r = e.target.closest('[data-c]'); if (r) { onPick(r.dataset.c); m.close(); } });
      const nb = m.$('#cs-new'); if (nb) nb.onclick = () => customerForm(null, c => { onPick(c.id); m.close(); });
    },
  });
  return m;
}

/* ---------- Artículo libre ---------- */
function freeItemModal(onAdd) {
  openModal({
    title: 'Artículo libre', size: 'sm',
    body: `<div class="form-grid"><div class="field span-2"><label>Descripción</label><input name="name" placeholder="Ej. Arreglo de ruedo, bolsa de regalo…"></div>
      <div class="field"><label>Cantidad</label><input name="qty" type="number" value="1" min="0" step="any"></div>
      <div class="field"><label>Precio unitario</label><input name="price" type="number" min="0" step="0.01"></div>
      <div class="field span-2"><label class="check"><input type="checkbox" name="taxable" checked> Aplica ${esc(D.s.taxName)}</label></div></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Agregar</button>`,
    onOpen: m => {
      const go = () => {
        const f = readForm(m.el);
        if (!f.name || !(f.price > 0) || !(f.qty > 0)) return toast('Completa descripción, cantidad y precio', 'warn');
        onAdd({ key: uid(), variantId: null, productId: null, name: f.name, variant: '', sku: '', qty: f.qty, price: f.price, discount: 0, cost: 0, taxable: f.taxable });
        m.close();
      };
      m.$('[data-ok]').onclick = go;
      m.el.addEventListener('keydown', e => e.key === 'Enter' && go());
    },
  });
}

/* ---------- Ventas en espera ---------- */
function heldModal(onRestore) {
  openModal({
    title: 'Ventas en espera', size: 'md',
    body: `<div class="held-list" id="hl"></div>`,
    onOpen: m => {
      const draw = () => {
        m.$('#hl').innerHTML = DB.data.held.map(h => {
          const t = D.totals(h.cart.items, h.cart.gd, h.cart.gdType);
          return `<div class="list-item" data-h="${h.id}"><div style="flex:1"><div class="strong">${esc(D.customer(h.cart.customerId)?.name || 'Consumidor final')}</div><div class="small muted">${fmtDateTime(h.date)} · ${h.cart.items.length} artículos · ${esc(h.user)}</div></div><div class="strong num">${money(t.total)}</div><button class="icon-btn danger" data-hdel="${h.id}">${icon('trash', 15)}</button></div>`;
        }).join('') || '<div class="empty">No hay ventas en espera</div>';
      };
      draw();
      m.el.addEventListener('click', async e => {
        const del = e.target.closest('[data-hdel]');
        if (del) { DB.data.held = DB.data.held.filter(h => h.id !== del.dataset.hdel); DB.commit(); draw(); return; }
        const r = e.target.closest('[data-h]'); if (!r) return;
        if (POS.cart.items.length && !(await confirmBox('El carrito actual se pondrá en espera. ¿Continuar?'))) return;
        if (POS.cart.items.length) DB.data.held.push({ id: uid(), date: nowISO(), user: App.user.name, cart: clone(POS.cart) });
        const h = DB.data.held.find(x => x.id === r.dataset.h);
        DB.data.held = DB.data.held.filter(x => x !== h);
        POS.cart = h.cart; DB.commit(); m.close(); onRestore();
      });
    },
  });
}

/* ---------- Apertura rápida de caja ---------- */
function quickOpenCash() {
  return new Promise(res => {
    let ok = false;
    if (!can('cash')) { toast('La caja está cerrada. Pide a un cajero o administrador que la abra.', 'err'); return res(false); }
    openModal({
      title: 'Abrir caja', size: 'sm',
      body: `<p class="muted" style="margin-top:0">Para registrar ventas debes abrir la caja con el fondo inicial.</p><div class="field"><label>Fondo inicial (efectivo)</label><input id="qo-amt" type="number" min="0" step="0.01" value="0"></div>`,
      footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Abrir caja</button>`,
      onClose: () => res(ok),
      onOpen: m => {
        const go = () => { try { D.openSession(num(m.$('#qo-amt').value)); ok = true; App.updateChrome(); toast('Caja abierta'); m.close(); } catch (e) { toast(e.message, 'err'); } };
        m.$('[data-ok]').onclick = go; m.$('#qo-amt').addEventListener('keydown', e => e.key === 'Enter' && go());
      },
    });
  });
}

/* ---------- Cobro ---------- */
async function checkout(after, opts = {}) {
  const cart = POS.cart;
  if (!cart.items.length) return toast('Agrega productos al carrito', 'warn');
  if (D.s.requireCashSession && !D.currentSession()) { if (!(await quickOpenCash())) return; }
  const t = D.totals(cart.items, cart.gd, cart.gdType);
  const cust = D.customer(cart.customerId) || D.customer('walkin');
  const isWalk = cust.id === 'walkin';
  const received = num(cart.received);
  const canCredit = !isWalk && can('credits');
  let credit = !!opts.credit && canCredit;
  let lines = credit ? [] : [{ method: 'efectivo', amount: received > 0 ? round2(received) : t.total, ref: '' }];
  const CI = D.s.creditInterest;
  const sc = cust.storeCredit || 0;
  const L = D.s.loyalty;
  const ptsMoney = D.loyaltyOn() && !isWalk && (cust.points || 0) >= L.minRedeem ? D.pointsMoney(cust.points) : 0;

  const m = openModal({
    title: credit ? 'Venta a crédito' : 'Cobrar venta', size: 'md',
    body: `<div class="big-total"><div class="bt-label">Total a pagar</div><div class="bt-value">${money(t.total)}</div><div class="small muted">${esc(cust.name)} · ${cart.items.length} línea(s)</div></div>
      <div class="label mt">Agregar forma de pago</div>
      <div class="pay-methods" style="margin-top:8px">
        ${['efectivo', 'tarjeta', 'transferencia'].map(k => `<button data-add="${k}">${icon(PAY_METHODS[k].icon, 20)}${PAY_METHODS[k].label}</button>`).join('')}
        ${sc > 0 ? `<button data-add="saldo">${icon('gift', 20)}A favor (${money(sc)})</button>` : ''}
        ${ptsMoney > 0 ? `<button data-add="puntos">${icon('spark', 20)}Puntos (${cust.points} = ${money(ptsMoney)})</button>` : ''}
        ${canCredit ? `<button data-add="credito" style="border-color:rgba(242,184,75,.4)">${icon('credit', 20)}Crédito</button>` : ''}
      </div>
      <div class="small muted" id="credHint" style="margin-top:6px;${credit ? '' : 'display:none'}">Si el cliente deja una cuota inicial hoy, agrégala con Efectivo, Tarjeta o Transferencia.</div>
      <div id="plines" class="mt"></div>
      <div id="quick" class="quick-cash mt"></div>
      <div id="creditBox" class="mt"></div>
      <div class="grid g-2 mt"><div class="card kpi"><div class="k-label">Pagado</div><div class="k-value" id="kPaid"></div></div><div class="card kpi"><div class="k-label" id="kRestL"></div><div class="k-value" id="kRest"></div></div></div>
      <div class="field mt"><label>Notas (opcional)</label><input id="pnotes" value="${esc(cart.notes)}"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn chrome lg" id="finish">${icon('check', 18)} Completar venta</button>`,
  });
  const paid = () => round2(sum(lines, l => l.amount));
  const drawLines = () => {
    m.$('#plines').innerHTML = lines.map((l, i) => `<div class="pay-line">
      <div class="row" style="gap:8px">${icon(PAY_METHODS[l.method].icon, 18)}<span class="strong">${PAY_METHODS[l.method].label}</span>
        ${l.method === 'tarjeta' || l.method === 'transferencia' ? `<input data-ref="${i}" placeholder="Referencia" value="${esc(l.ref)}" style="flex:1;min-width:90px;padding:6px 9px">` : ''}</div>
      <input type="number" min="0" step="0.01" data-amt="${i}" value="${l.amount || ''}" placeholder="0.00" style="text-align:right;font-weight:600">
      <button class="icon-btn danger" data-rm="${i}">${icon('x', 15)}</button></div>`).join('') || '<div class="muted small">Sin pagos. Agrega una forma de pago' + (isWalk ? '.' : ' o deja la venta a crédito.') + '</div>';
    const cashI = lines.findIndex(l => l.method === 'efectivo');
    const others = round2(sum(lines.filter((_, i) => i !== cashI), l => l.amount));
    const need = Math.max(0, round2(t.total - others));
    if (cashI >= 0 && need > 0) {
      const opts = new Set([need]);
      [50, 100, 200, 500, 1000, 2000, 5000].forEach(d => { const v = Math.ceil(need / d) * d; if (v > need && v <= need * 3 + 100) opts.add(v); });
      m.$('#quick').innerHTML = `<span class="small muted" style="align-self:center">Efectivo recibido:</span>` + [...opts].sort((a, b) => a - b).slice(0, 6).map(v => `<button class="chip" data-cash="${v}">${v === need ? 'Exacto' : money(v)}</button>`).join('');
    } else m.$('#quick').innerHTML = '';
    update();
  };
  const update = () => {
    const p = paid(); const rest = round2(t.total - p);
    m.$('#kPaid').textContent = money(p);
    if (rest > 0.004) {
      const tot = credit ? rest + D.creditInterest(rest, creditArgs()) : rest;
      m.$('#kRestL').textContent = credit ? 'Total a crédito' : 'Falta'; m.$('#kRest').innerHTML = `<span class="${credit ? 'warn-text' : 'err-text'}">${money(tot)}</span>`;
    }
    else { m.$('#kRestL').textContent = 'Cambio'; m.$('#kRest').innerHTML = `<span class="ok-text">${money(-rest)}</span>`; }
    drawCredit(rest);
  };
  const creditArgs = () => m.$('#cInst') ? { installments: Math.max(1, num(m.$('#cInst').value) || 1), frequency: m.$('#cFreq').value, firstDue: m.$('#cFirst').value, interestRate: Math.max(0, num(m.$('#cRate').value)), interestType: m.$('#cType').value, payMethod: m.$('#cPay').value } : { installments: 1, frequency: 'mensual', interestRate: CI.rate, interestType: CI.type, payMethod: 'efectivo' };
  const drawCredit = rest => {
    const box = m.$('#creditBox');
    if (!LIC.has('credits')) { box.innerHTML = rest > 0.004 ? `<div class="callout">${esc(LIC.upgradeMsg('Vender a crédito'))}</div>` : ''; return; }
    if (isWalk) { box.innerHTML = rest > 0.004 ? '<div class="callout">Para vender a crédito selecciona un cliente registrado (F4).</div>' : ''; return; }
    if (!box.dataset.init) {
      box.dataset.init = 1;
      box.innerHTML = `<div class="credit-panel">
        <label class="check strong" style="color:var(--text)"><input type="checkbox" id="useCredit" ${credit ? 'checked' : ''}> ${icon('credit', 16)} Vender a crédito</label>
        <div id="cfields" class="${credit ? '' : 'hidden'}">
          <div class="form-grid c3 mt">
            <div class="field"><label>Cuotas</label><input id="cInst" type="number" min="1" max="60" value="1"></div>
            <div class="field"><label>Frecuencia</label><select id="cFreq">${opt('mensual', 'Mensual')}${opt('quincenal', 'Quincenal')}${opt('semanal', 'Semanal')}</select></div>
            <div class="field"><label>Primer vencimiento</label><input id="cFirst" type="date" value="${addDays(today(), cust.creditDays || D.s.creditDefaultDays)}"></div>
            <div class="field span-all"><label>Forma de pago del crédito (cuotas)</label><div class="seg" id="cPaySeg" style="display:flex">${['efectivo', 'tarjeta', 'transferencia'].map(k => `<button type="button" data-pm="${k}" style="flex:1">${icon(PAY_METHODS[k].icon, 14)} ${PAY_METHODS[k].label}</button>`).join('')}</div><input type="hidden" id="cPay" value="efectivo"></div>
            <div class="field"><label>Interés (%)</label><input id="cRate" type="number" min="0" max="100" step="0.1" value="${CI.rate || ''}" placeholder="0"></div>
            <div class="field span-2"><label>Tipo de interés</label><div class="seg" id="cTypeSeg" style="display:flex"><button type="button" data-t="mensual" style="flex:1">% mensual</button><button type="button" data-t="total" style="flex:1">% total (una sola vez)</button></div><input type="hidden" id="cType" value="${CI.type}"></div>
          </div>
          <div class="credit-sum mt" id="cInfo"></div>
        </div></div>`;
      const syncType = () => { m.$$('#cTypeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === m.$('#cType').value)); m.$$('#cPaySeg button').forEach(b => b.classList.toggle('on', b.dataset.pm === m.$('#cPay').value)); };
      m.$('#cPaySeg').onclick = e => { const b = e.target.closest('[data-pm]'); if (!b) return; m.$('#cPay').value = b.dataset.pm; syncType(); update(); };
      syncType();
      m.$('#cTypeSeg').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; m.$('#cType').value = b.dataset.t; syncType(); update(); };
      m.$('#useCredit').onchange = e => { credit = e.target.checked; m.$('#cfields').classList.toggle('hidden', !credit); m.$('#credHint').style.display = credit ? '' : 'none'; update(); };
      ['#cInst', '#cFreq', '#cRate', '#cFirst'].forEach(s => m.$(s).addEventListener('input', () => update()));
    }
    const a = creditArgs(), inst = a.installments;
    const interest = rest > 0.004 ? D.creditInterest(rest, a) : 0, total = round2(Math.max(0, rest) + interest);
    const avail = D.creditAvailable(cust), debt = D.customerBalance(cust.id);
    m.$('#cInfo').innerHTML = rest > 0.004 ? `
      <div class="tot-row"><span>Valor financiado</span><span>${money(rest)}</span></div>
      <div class="tot-row"><span>Interés ${a.interestRate ? `(${a.interestRate}% ${a.interestType === 'mensual' ? `mensual × ${+D.creditMonths(a).toFixed(2)} mes(es)` : 'total'})` : '(sin interés)'}</span><span>${money(interest)}</span></div>
      <div class="tot-row strong" style="color:#fff"><span>Total a crédito</span><span>${money(total)}</span></div>
      <div class="tot-row"><span>Forma de pago de las cuotas</span><b>${payLabel(a.payMethod)}</b></div>
      <div class="tot-row" style="color:var(--warn)"><span>${inst} cuota(s) ${a.frequency === 'mensual' ? 'mensuales' : a.frequency === 'quincenal' ? 'quincenales' : 'semanales'} de</span><b>${money(total / inst)}</b></div>
      <div class="small muted" style="margin-top:6px">Deuda actual ${money(debt)} · ${avail === Infinity ? 'sin límite de crédito' : `disponible <b class="${avail < total ? 'err-text' : 'ok-text'}">${money(avail)}</b>`}</div>`
      : '<div class="small muted">Todo el valor está pagado; no queda saldo a crédito.</div>';
  };
  m.el.addEventListener('click', e => {
    const a = e.target.closest('[data-add]'), r = e.target.closest('[data-rm]'), qc = e.target.closest('[data-cash]');
    if (a) {
      const k = a.dataset.add;
      const rest = Math.max(0, round2(t.total - paid()));
      const ex = lines.find(l => l.method === k);
      if (k === 'credito') {
        // todo lo pendiente pasa a crédito (se puede agregar una cuota inicial después)
        lines = lines.filter(l => !(l.method === 'efectivo' && l.amount >= t.total - 0.01));
        credit = true; const uc = m.$('#useCredit'); if (uc) uc.checked = true;
        m.$('#cfields')?.classList.remove('hidden'); m.$('#credHint').style.display = '';
        drawLines(); setTimeout(() => m.$('#cInst')?.focus(), 30); return;
      }
      let amt = k === 'saldo' ? Math.min(rest, sc) : k === 'puntos' ? Math.min(rest, ptsMoney) : rest;
      if (ex) ex.amount = round2(ex.amount + amt); else lines.push({ method: k, amount: round2(amt), ref: '' });
      drawLines();
      const inp = m.$(`[data-amt="${lines.findIndex(l => l.method === k)}"]`); inp && (inp.focus(), inp.select());
    }
    if (r) { lines.splice(+r.dataset.rm, 1); drawLines(); }
    if (qc) { const l = lines.find(x => x.method === 'efectivo'); if (l) { l.amount = +qc.dataset.cash; drawLines(); } }
  });
  m.el.addEventListener('input', e => {
    if (e.target.dataset.amt !== undefined) { lines[+e.target.dataset.amt].amount = Math.max(0, num(e.target.value)); update(); }
    if (e.target.dataset.ref !== undefined) lines[+e.target.dataset.ref].ref = e.target.value;
  });
  m.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); m.$('#finish').click(); } });
  drawLines();
  setTimeout(() => { const i = m.$('[data-amt="0"]'); i && (i.focus(), i.select()); }, 60);

  m.$('#finish').onclick = async () => {
    const rest = round2(t.total - paid());
    if (rest > 0.004 && !credit) return toast(isWalk ? 'Falta pagar ' + money(rest) : `Falta ${money(rest)}. Agrega un pago o marca "Vender a crédito".`, 'err');
    if (credit && rest <= 0.004) credit = false;
    const pl = lines.find(l => l.method === 'puntos');
    if (pl && pl.amount > ptsMoney + 0.004) return toast(`Los puntos solo cubren ${money(ptsMoney)}`, 'err');
    const sl = lines.find(l => l.method === 'saldo');
    if (sl && sl.amount > sc + 0.004) return toast('El saldo a favor no alcanza', 'err');
    const args = {
      customerId: cust.id, items: cart.items.map(({ key, ...it }) => it), gd: cart.gd, gdType: cart.gdType, payments: lines,
      notes: m.$('#pnotes').value.trim(), quoteId: cart.quoteId,
      credit: credit ? creditArgs() : null,
    };
    let inv;
    try { inv = D.createSale(args); }
    catch (err) {
      if (err.code === 'LIMIT' && await adminAuth(err.message + ' ¿Autorizar de todas formas?')) {
        try { inv = D.createSale({ ...args, overrideLimit: true }); } catch (e2) { return toast(e2.message, 'err'); }
      } else return toast(err.message, 'err');
    }
    m.close();
    POS.cart = POS.newCart();
    const gdIn = $('#gd'); if (gdIn) gdIn.value = '';
    after && after();
    App.updateChrome();
    saleDone(inv);
  };
}

function saleDone(inv) {
  const waCust = WA.eligible(inv.customerId);
  const waAuto = waCust && WA.shouldAuto('sale');
  if (waAuto) WA.notifySale(inv);
  if (D.s.autoPrint) PR.invoice(inv);
  openModal({
    title: 'Venta completada', size: 'sm',
    body: `<div class="center"><div class="success-mark">${icon('check', 30)}</div>
      <div class="muted">${esc(inv.number)} · ${esc(inv.customerName)}</div>
      <div style="font:700 30px var(--display);margin:8px 0">${money(inv.total)}</div>
      ${inv.change ? `<div class="callout ok" style="font-size:16px">Cambio: <b>${money(inv.change)}</b></div>` : ''}
      ${inv.pointsEarned ? `<div class="small ok-text" style="margin-top:8px">⭐ +${inv.pointsEarned} puntos · saldo ${inv.pointsBalance} puntos</div>` : ''}
      ${inv.balance ? `<div class="callout warn">A crédito: <b>${money(inv.balance)}</b>${inv.credit?.interest ? ` (incluye interés ${money(inv.credit.interest)})` : ''}<br>${inv.credit?.installments || 1} cuota(s) de ${money(inv.balance / (inv.credit?.installments || 1))}${inv.dueDate ? ` · última ${fmtDate(inv.dueDate)}` : ''}</div>` : ''}
      ${waAuto ? `<div class="small muted" style="margin-top:10px">${waIcon(13)} Notificación de WhatsApp ${D.s.whatsapp.mode === 'api' ? 'enviada' : 'abierta'} para ${esc(waCust.name)}</div>` : ''}</div>`,
    footer: `${waCust ? `<button class="btn success" id="sd-w" title="Enviar comprobante por WhatsApp">${waIcon(16)} WhatsApp</button>` : ''}<button class="btn" id="sd-t">${icon('receipt', 16)} Ticket</button><button class="btn" id="sd-c">${icon('printer', 16)} Factura carta</button><button class="btn primary" data-close id="sd-n">Nueva venta <span class="kbd">Enter</span></button>`,
    onOpen: m => {
      const w = m.$('#sd-w'); if (w) w.onclick = () => WA.notifySale(inv, { manual: true });
      m.$('#sd-t').onclick = () => PR.invoice(inv, 'ticket');
      m.$('#sd-c').onclick = () => PR.invoice(inv, 'carta');
      setTimeout(() => m.$('#sd-n').focus(), 50);
    },
    onClose: () => { const q = $('#pq'); q && q.focus(); },
  });
}

/* ---------- Apartar (plan separe) ---------- */
function layawayModal(after) {
  const cart = POS.cart;
  if (!cart.items.length) return toast('Agrega productos al carrito', 'warn');
  if (!can('layaway')) return toast(LIC.upgradeMsg('Apartados'), 'warn');
  const t = D.totals(cart.items, cart.gd, cart.gdType);
  const cfg = D.s.layaway;
  let custId = cart.customerId;
  const min = round2(t.total * cfg.minDepositPct / 100);
  const m = openModal({
    title: 'Apartar (plan separe)', size: 'md',
    body: `<div class="big-total mb"><div class="bt-label">Total del apartado</div><div class="bt-value">${money(t.total)}</div><div class="small muted">${cart.items.length} artículo(s) · la mercancía queda reservada</div></div>
      <div class="field mb"><label>Cliente *</label><button class="cust-sel" id="la-cust" type="button"></button></div>
      <div class="form-grid">
        <div class="field"><label>Abono inicial</label><input id="la-dep" type="number" min="0" step="0.01" value="${min}"><span class="hint">Mínimo ${money(min)} (${cfg.minDepositPct}%)</span></div>
        <div class="field"><label>Forma de pago</label><select id="la-m">${opt('efectivo', 'Efectivo')}${opt('tarjeta', 'Tarjeta')}${opt('transferencia', 'Transferencia')}</select></div>
        <div class="field"><label>Fecha límite para pagar y retirar</label><input id="la-due" type="date" value="${addDays(today(), cfg.days)}"></div>
        <div class="field"><label>Notas</label><input id="la-n" placeholder="Opcional"></div>
      </div>
      <div class="callout small mt" id="la-info"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="la-ok">${icon('tag', 15)} Crear apartado</button>`,
  });
  const drawCust = () => {
    const c = D.customer(custId) || D.customer('walkin');
    m.$('#la-cust').innerHTML = `<span class="avatar" style="width:30px;height:30px">${c.id === 'walkin' ? icon('user', 15) : initials(c.name)}</span><div style="flex:1"><div class="c-name">${esc(c.id === 'walkin' ? 'Elegir cliente…' : c.name)}</div><div class="c-sub">${esc(c.phone || '')}</div></div>${icon('edit', 14)}`;
  };
  const info = () => { const d = num(m.$('#la-dep').value); m.$('#la-info').textContent = `Saldo pendiente: ${money(Math.max(0, t.total - d))}. El cliente puede abonar cuando quiera hasta el ${fmtDate(m.$('#la-due').value)}.`; };
  drawCust(); info();
  m.$('#la-cust').onclick = () => chooseCustomer(id => { custId = id; cart.customerId = id; drawCust(); });
  m.$('#la-dep').addEventListener('input', info); m.$('#la-due').onchange = info;
  m.$('#la-ok').onclick = async () => {
    if (D.s.requireCashSession && !D.currentSession() && m.$('#la-m').value === 'efectivo' && num(m.$('#la-dep').value) > 0) { if (!(await quickOpenCash())) return; }
    try {
      const l = D.createLayaway({ customerId: custId, items: cart.items.map(({ key, ...it }) => it), gd: cart.gd, gdType: cart.gdType, deposit: num(m.$('#la-dep').value), method: m.$('#la-m').value, dueDate: m.$('#la-due').value, notes: m.$('#la-n').value.trim() });
      m.close(); POS.cart = POS.newCart(); after && after(); App.updateChrome();
      openModal({
        title: 'Apartado creado', size: 'sm',
        body: `<div class="center"><div class="success-mark">${icon('tag', 28)}</div><h3 style="margin:0">${esc(l.number)}</h3><p class="muted">${esc(l.customerName)} · abonó ${money(l.paid)} · debe ${money(l.balance)}<br>Fecha límite: ${fmtDate(l.dueDate)}</p></div>`,
        footer: `<button class="btn ghost" data-close>Cerrar</button><button class="btn primary" id="lp">${icon('printer', 15)} Imprimir comprobante</button>`,
        onOpen: mm => mm.$('#lp').onclick = () => PR.layaway(l),
      });
    } catch (e) { toast(e.message, 'err', 5000); }
  };
}
