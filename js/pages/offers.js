'use strict';
/* ==========================================================
   NOIR STORE — Ofertas y descuentos
   Se aplican solas en el punto de venta mientras estén vigentes:
   % de descuento, $ menos por unidad, precio especial,
   "lleva N y paga M" (2x1, 3x2…) y cupones para el total.
   ========================================================== */
const OFFER_TYPES = {
  pct: 'Descuento en %',
  amount: 'Descuento en dinero por unidad',
  price: 'Precio especial',
  nxm: 'Lleva N y paga M (2x1, 3x2…)',
  coupon: 'Cupón de descuento (para el total)',
};
const WEEKDAYS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];

Pages.promos = {
  title: 'Ofertas y descuentos',
  render(el) {
    const t = today(), list = DB.data.promos || [];
    const stateOf = p => !p.active ? ['Pausada', ''] : p.to && p.to < t ? ['Terminada', ''] : p.from && p.from > t ? ['Programada', 'info'] : (p.type === 'coupon' && p.maxUses && (p.uses || 0) >= p.maxUses) ? ['Agotado', ''] : ['Vigente', 'ok'];
    const live = list.filter(p => stateOf(p)[0] === 'Vigente');
    el.innerHTML = `
      <div class="grid g-4 mb">
        <div class="card kpi"><div class="kpi-label">${icon('tag', 15)} Ofertas vigentes</div><div class="kpi-value">${live.filter(p => p.type !== 'coupon').length}</div></div>
        <div class="card kpi"><div class="kpi-label">${icon('gift', 15)} Cupones activos</div><div class="kpi-value">${live.filter(p => p.type === 'coupon').length}</div></div>
        <div class="card kpi"><div class="kpi-label">${icon('calendar', 15)} Programadas</div><div class="kpi-value">${list.filter(p => stateOf(p)[0] === 'Programada').length}</div></div>
        <div class="card kpi"><div class="kpi-label">${icon('receipt', 15)} Cupones usados</div><div class="kpi-value">${sum(list.filter(p => p.type === 'coupon'), p => p.uses || 0)}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Ofertas y descuentos</h3><span class="spacer"></span><button class="btn primary" id="of-new">${icon('plus', 15)} Nueva oferta</button></div>
        <p class="muted small" style="margin:0 18px 12px">Se aplican solas en el punto de venta mientras estén vigentes. Si un producto tiene varias, se usa la que más le conviene al cliente. Los cupones se escriben en el punto de venta.</p>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Oferta</th><th>Tipo</th><th>Aplica a</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody>
        ${list.slice().reverse().map(p => {
          const [st, cls] = stateOf(p);
          return `<tr><td class="strong">${esc(p.name)}${p.type === 'coupon' ? `<div class="small muted mono">${esc(p.code)}${p.maxUses ? ` · ${p.uses || 0}/${p.maxUses} usos` : ` · ${p.uses || 0} usos`}</div>` : ''}</td>
            <td><span class="badge">${esc(D.promoShort(p))}</span></td><td>${esc(offerScope(p))}</td>
            <td class="small">${fmtDate(p.from)} → ${p.to ? fmtDate(p.to) : 'sin fin'}${p.days && p.days.length ? `<div class="muted">${WEEKDAYS.filter(([d]) => p.days.includes(d)).map(([, l]) => l).join(' ')}</div>` : ''}</td>
            <td><span class="badge ${cls}">${st}</span></td>
            <td class="actions"><button class="btn sm" data-act="tg" data-id="${p.id}">${p.active ? 'Pausar' : 'Activar'}</button><button class="btn sm" data-act="ed" data-id="${p.id}">${icon('edit', 14)}</button><button class="icon-btn danger" data-act="rm" data-id="${p.id}">${icon('trash', 14)}</button></td></tr>`;
        }).join('') || `<tr><td colspan="6"><div class="empty">${icon('tag', 34)}<div>Aún no tienes ofertas. Crea la primera con “Nueva oferta”.</div></div></td></tr>`}
        </tbody></table></div>
      </div>`;
    $('#of-new', el).onclick = () => offerModal(null, () => this.render(el));
    onActions(el, {
      tg: async id => { const p = DB.data.promos.find(x => x.id === id); p.active = !p.active; DB.commit(); this.render(el); },
      ed: id => offerModal(DB.data.promos.find(x => x.id === id), () => this.render(el)),
      rm: async id => { if (!(await confirmBox('¿Eliminar esta oferta?'))) return; DB.data.promos = DB.data.promos.filter(x => x.id !== id); audit('Oferta eliminada', id); DB.commit(); this.render(el); },
    });
  },
};

function offerScope(p) {
  if (p.type === 'coupon') return p.min ? `Compras desde ${money(p.min)}` : 'Toda la compra';
  return p.scope === 'all' ? 'Toda la tienda' : p.scope === 'category' ? 'Categoría: ' + (D.category(p.targetId)?.name || '—') : 'Producto: ' + (D.product(p.targetId)?.name || '—');
}

function offerModal(existing, onDone) {
  const p = existing ? { ...existing } : { type: 'pct', value: 10, scope: 'all', targetId: '', from: today(), to: addDays(today(), 7), days: [], active: true, buy: 2, pay: 1, ctype: 'percent', min: 0, maxUses: 0 };
  const m = openModal({
    title: existing ? 'Editar oferta' : 'Nueva oferta', size: 'md',
    body: `<div class="form-grid">
      <div class="field span-2"><label>Nombre</label><input id="of-n" value="${esc(p.name || '')}" placeholder="Ej. Black Friday, 2x1 en camisetas, Cupón BIENVENIDA"></div>
      <div class="field span-2"><label>Tipo de oferta</label><select id="of-t">${Object.entries(OFFER_TYPES).map(([k, l]) => opt(k, l, p.type)).join('')}</select></div>
      <div class="field" data-for="pct"><label>Descuento (%)</label><input id="of-pct" type="number" min="1" max="90" value="${p.type === 'pct' ? p.value : 10}"></div>
      <div class="field" data-for="amount"><label>Descuento por unidad (${esc(D.s.currencySymbol)})</label><input id="of-amt" type="number" min="0" step="0.01" value="${p.type === 'amount' ? p.value : ''}"></div>
      <div class="field" data-for="price"><label>Precio especial (${esc(D.s.currencySymbol)})</label><input id="of-price" type="number" min="0" step="0.01" value="${p.type === 'price' ? p.value : ''}"></div>
      <div class="field" data-for="nxm"><label>Lleva</label><input id="of-buy" type="number" min="2" step="1" value="${p.buy || 2}"></div>
      <div class="field" data-for="nxm"><label>Paga</label><input id="of-pay" type="number" min="1" step="1" value="${p.pay || 1}"></div>
      <div class="field" data-for="coupon"><label>Código del cupón</label><input id="of-code" value="${esc(p.code || '')}" placeholder="BIENVENIDA" style="text-transform:uppercase"></div>
      <div class="field" data-for="coupon"><label>Descuento</label><div class="input-group"><input id="of-cv" type="number" min="0" step="0.01" value="${p.type === 'coupon' ? p.value : 10}"><select id="of-ct" style="width:80px">${opt('percent', '%', p.ctype)}${opt('amount', esc(D.s.currencySymbol), p.ctype)}</select></div></div>
      <div class="field" data-for="coupon"><label>Compra mínima <span class="muted">— opcional</span></label><input id="of-min" type="number" min="0" step="0.01" value="${p.min || ''}"></div>
      <div class="field" data-for="coupon"><label>Usos máximos <span class="muted">— vacío = sin límite</span></label><input id="of-max" type="number" min="0" step="1" value="${p.maxUses || ''}"></div>
      <div class="field" data-not="coupon"><label>Aplica a</label><select id="of-s">${opt('all', 'Toda la tienda', p.scope)}${opt('category', 'Una categoría', p.scope)}${opt('product', 'Un producto', p.scope)}</select></div>
      <div class="field" data-not="coupon" id="of-tw"><label>Categoría / producto</label><select id="of-tg"></select></div>
      <div class="field"><label>Desde</label><input id="of-f" type="date" value="${p.from || today()}"></div>
      <div class="field"><label>Hasta <span class="muted">— vacío = sin fin</span></label><input id="of-to" type="date" value="${p.to || ''}"></div>
      <div class="field span-2"><label>Solo estos días <span class="muted">— ninguno marcado = todos los días</span></label>
        <div class="row" id="of-days">${WEEKDAYS.map(([d, l]) => `<button type="button" class="chip ${(p.days || []).includes(d) ? 'on' : ''}" data-day="${d}">${l}</button>`).join('')}</div></div>
      <div class="field span-2"><div class="callout small" id="of-prev"></div></div>
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>${existing ? 'Guardar cambios' : 'Crear oferta'}</button>`,
  });
  const $m = s => m.$(s);
  const fillTargets = () => {
    const s = $m('#of-s').value;
    $m('#of-tw').style.visibility = s === 'all' ? 'hidden' : 'visible';
    $m('#of-tg').innerHTML = s === 'category' ? DB.data.categories.map(c => opt(c.id, c.name, p.targetId)).join('') : s === 'product' ? DB.data.products.filter(x => x.active !== false).map(x => opt(x.id, x.name, p.targetId)).join('') : '';
  };
  const read = () => {
    const type = $m('#of-t').value;
    const o = { ...p, type, name: $m('#of-n').value.trim(), from: $m('#of-f').value, to: $m('#of-to').value, days: [...m.el.querySelectorAll('#of-days .on')].map(b => +b.dataset.day) };
    if (type === 'pct') o.value = num($m('#of-pct').value);
    if (type === 'amount') o.value = num($m('#of-amt').value);
    if (type === 'price') o.value = num($m('#of-price').value);
    if (type === 'nxm') { o.buy = Math.round(num($m('#of-buy').value)); o.pay = Math.round(num($m('#of-pay').value)); o.value = 0; }
    if (type === 'coupon') { o.code = $m('#of-code').value.trim().toUpperCase().replace(/\s+/g, ''); o.value = num($m('#of-cv').value); o.ctype = $m('#of-ct').value; o.min = num($m('#of-min').value); o.maxUses = Math.round(num($m('#of-max').value)); o.scope = 'all'; o.targetId = ''; }
    else { o.scope = $m('#of-s').value; o.targetId = o.scope === 'all' ? '' : $m('#of-tg').value; }
    return o;
  };
  const refresh = () => {
    const type = $m('#of-t').value;
    m.el.querySelectorAll('[data-for]').forEach(f => f.style.display = f.dataset.for === type ? '' : 'none');
    m.el.querySelectorAll('[data-not]').forEach(f => f.style.display = f.dataset.not === type ? 'none' : '');
    const o = read();
    $m('#of-prev').innerHTML = `${icon('tag', 14)} <b>${esc(D.promoShort(o))}</b> · ${esc(offerScope(o))}${o.type === 'nxm' && o.buy > o.pay ? ` — el cliente lleva ${o.buy} y paga ${o.pay}` : ''}${o.type === 'price' ? ' — si el precio normal es menor, no se aplica' : ''}`;
  };
  fillTargets(); refresh();
  $m('#of-t').onchange = refresh; $m('#of-s').onchange = () => { fillTargets(); refresh(); };
  m.el.addEventListener('input', refresh);
  $m('#of-days').onclick = e => { const b = e.target.closest('[data-day]'); if (b) { b.classList.toggle('on'); refresh(); } };
  $m('[data-ok]').onclick = () => {
    const o = read();
    if (!o.name) return toast('Ponle un nombre a la oferta', 'warn');
    if (o.type === 'pct' && !(o.value > 0 && o.value <= 90)) return toast('El descuento debe estar entre 1% y 90%', 'warn');
    if ((o.type === 'amount' || o.type === 'price') && !(o.value > 0)) return toast('Escribe el valor', 'warn');
    if (o.type === 'nxm' && !(o.buy >= 2 && o.pay >= 1 && o.buy > o.pay)) return toast('“Lleva” debe ser mayor que “Paga” (ej. lleva 2, paga 1)', 'warn');
    if (o.type === 'coupon') {
      if (!/^[A-Z0-9_-]{3,20}$/.test(o.code)) return toast('El código debe tener de 3 a 20 letras o números, sin espacios', 'warn');
      if ((DB.data.promos || []).some(x => x.type === 'coupon' && x.code === o.code && x.id !== o.id)) return toast('Ya existe un cupón con ese código', 'warn');
      if (!(o.value > 0) || (o.ctype === 'percent' && o.value > 90)) return toast('Revisa el descuento del cupón', 'warn');
    }
    if (o.type !== 'coupon' && o.scope !== 'all' && !o.targetId) return toast('Elige a qué aplica', 'warn');
    if (o.to && o.from && o.to < o.from) return toast('La fecha final es anterior a la inicial', 'warn');
    if (existing) { const i = DB.data.promos.findIndex(x => x.id === existing.id); DB.data.promos[i] = o; audit('Oferta editada', o.name); }
    else { o.id = uid(); o.active = true; o.createdAt = nowISO(); o.uses = 0; DB.data.promos.push(o); audit('Oferta creada', `${o.name} · ${D.promoShort(o)}`); }
    DB.commit(); m.close(); toast(existing ? 'Oferta actualizada' : 'Oferta creada'); onDone && onDone();
  };
}
