'use strict';
/* ==========================================================
   Productos, inventario y etiquetas
   ========================================================== */

const MOVE_TYPES = {
  inicial: 'Inventario inicial', venta: 'Venta', compra: 'Compra', ajuste: 'Ajuste', entrada: 'Entrada', salida: 'Salida',
  conteo: 'Conteo físico', devolucion: 'Devolución', anulacion: 'Anulación', merma: 'Merma / daño', apartado: 'Apartado',
};

/* Selector de productos/variantes reutilizable (cotizaciones, compras, ajustes) */
function pickVariantModal(onPick, { title = 'Agregar productos', showCost = false, keepOpen = true } = {}) {
  openModal({
    title, size: 'lg',
    body: `<div class="search-box mb">${icon('search', 16)}<input id="pv-q" type="search" placeholder="Nombre, SKU, código de barras, talla, color… (Enter agrega por código)" autofocus></div>
      <div style="max-height:56vh;overflow:auto"><table class="tbl compact"><thead><tr><th>Producto</th><th>Variante</th><th>SKU</th><th class="num">Stock</th><th class="num">${showCost ? 'Costo' : 'Precio'}</th><th></th></tr></thead><tbody id="pv-list"></tbody></table></div>`,
    footer: `<span class="small muted" style="margin-right:auto">Haz clic en una fila para agregarla.</span><button class="btn primary" data-close>Listo</button>`,
    onOpen: m => {
      const draw = () => {
        const words = norm(m.$('#pv-q').value).split(/\s+/).filter(Boolean);
        const rows = [];
        for (const { p, v } of D.vmap().values()) {
          if (p.active === false) continue;
          if (words.length && !words.every(w => norm(`${p.name} ${v.sku} ${v.barcode} ${v.size} ${v.color} ${D.category(p.categoryId)?.name || ''}`).includes(w))) continue;
          rows.push({ p, v }); if (rows.length >= 150) break;
        }
        m.$('#pv-list').innerHTML = rows.map(({ p, v }) => `<tr class="clickable" data-v="${v.id}"><td class="strong">${esc(p.name)}</td><td>${esc(D.vLabel(v) || '—')}</td><td class="small muted">${esc(v.sku)}</td><td class="num ${v.stock <= 0 ? 'err-text' : ''}">${qtyFmt(v.stock)}</td><td class="num">${money(showCost ? D.vCost(p, v) : D.vPrice(p, v))}</td><td class="actions">${icon('plus', 15)}</td></tr>`).join('')
          || '<tr><td colspan="6"><div class="empty">Sin resultados</div></td></tr>';
      };
      draw();
      const q = m.$('#pv-q');
      q.addEventListener('input', draw);
      q.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const hit = D.findByCode(q.value);
        if (hit) { onPick(hit.p, hit.v); toast(`${hit.p.name} ${D.vLabel(hit.v)} agregado`, 'ok', 1200); q.value = ''; draw(); if (!keepOpen) m.close(); }
        else { const f = m.$('[data-v]'); f && f.click(); }
      });
      m.$('#pv-list').addEventListener('click', e => {
        const r = e.target.closest('[data-v]'); if (!r) return;
        const f = D.findVariant(r.dataset.v); onPick(f.p, f.v);
        r.style.background = 'var(--ok-bg)'; setTimeout(() => r.style.background = '', 400);
        if (!keepOpen) m.close();
      });
    },
  });
}

/* Agrega rápidamente un catálogo (categoría/marca) */
async function quickCatalog(kind, selectEl) {
  const name = await promptBox(kind === 'categories' ? 'Nombre de la categoría' : 'Nombre de la marca', { title: kind === 'categories' ? 'Nueva categoría' : 'Nueva marca', required: true });
  if (!name) return;
  const item = { id: uid(), name: name.trim() };
  DB.data[kind].push(item); DB.commit();
  selectEl.insertAdjacentHTML('beforeend', opt(item.id, item.name));
  selectEl.value = item.id;
}

/* ---------- Formulario de producto ---------- */
function productForm(existing, onSaved, template = null) {
  const p = existing ? clone(existing) : template ? clone(template) : { name:'', description: '', categoryId: '', brandId: '', supplierId: '', unit: 'und', cost: '', price: '', price2: '', taxable: true, minStock: '', image: null, active: true, variants: [] };
  const isNew = !existing;
  let hasVar = p.variants.length > 1 || p.variants.some(v => v.size || v.color);
  if (!p.variants.length) p.variants.push({ id: uid(), size: '', color: '', sku: '', barcode: '', stock: 0, price: null, cost: null, _new: true });
  const s = D.s;
  const selSizes = new Set(p.variants.map(v => v.size).filter(Boolean));
  const selColors = new Set(p.variants.map(v => v.color).filter(Boolean));

  const m = openModal({
    title: isNew ? 'Nuevo producto' : 'Editar producto', size: 'xl',
    body: `<div style="display:grid;grid-template-columns:140px 1fr;gap:20px" class="pf-top">
      <div><div class="img-drop" id="pf-img" title="Clic para subir imagen">${p.image ? `<img src="${p.image}">` : `${icon('upload', 22)}<br>Imagen`}</div>
        ${p.image ? '<button class="btn sm ghost block mt" id="pf-noimg" style="margin-top:6px">Quitar</button>' : ''}</div>
      <div class="form-grid c4">
        <div class="field span-2"><label>Nombre *</label><input name="name" value="${esc(p.name)}" autofocus></div>
        <div class="field"><label>Categoría</label><div class="input-group"><select name="categoryId"><option value="">—</option>${DB.data.categories.map(c => opt(c.id, c.name, p.categoryId)).join('')}</select><button class="btn" type="button" data-qc="categories" title="Nueva categoría">${icon('plus', 15)}</button></div></div>
        <div class="field"><label>Marca</label><div class="input-group"><select name="brandId"><option value="">—</option>${DB.data.brands.map(c => opt(c.id, c.name, p.brandId)).join('')}</select><button class="btn" type="button" data-qc="brands" title="Nueva marca">${icon('plus', 15)}</button></div></div>
        <div class="field"><label>Precio de venta *</label><input name="price" type="number" min="0" step="0.01" value="${p.price}"></div>
        <div class="field"><label>Precio mayoreo</label><input name="price2" type="number" min="0" step="0.01" value="${p.price2 ?? ''}" placeholder="Opcional"></div>
        <div class="field"><label>Costo</label><input name="cost" type="number" min="0" step="0.01" value="${p.cost}"></div>
        <div class="field"><label>Margen</label><input id="pf-margin" readonly></div>
        <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">—</option>${DB.data.suppliers.map(c => opt(c.id, c.name, p.supplierId)).join('')}</select></div>
        <div class="field"><label>Unidad</label><select name="unit">${s.units.map(u => opt(u, u, p.unit)).join('')}</select></div>
        <div class="field"><label>Stock mínimo</label><input name="minStock" type="number" min="0" value="${p.minStock}" placeholder="${s.lowStockDefault}"></div>
        <div class="field"><label>Garantía (días)</label><input name="warrantyDays" type="number" min="0" step="1" value="${p.warrantyDays ?? ''}" placeholder="${s.warrantyDays || 0} (general)" title="Vacío = usa la garantía general de Configuración → Documentos. 0 = sin garantía."></div>
        <div class="field" style="justify-content:flex-end"><label class="check"><input type="checkbox" name="taxable" ${p.taxable !== false ? 'checked' : ''}> Aplica ${esc(s.taxName)}</label><label class="check"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Activo</label></div>
        <div class="field span-all"><label>Descripción</label><input name="description" value="${esc(p.description)}" placeholder="Material, detalles, notas…"></div>
      </div></div>
      <div class="divider"></div>
      <div class="row between"><label class="check strong" style="color:var(--text)"><input type="checkbox" id="pf-hasvar" ${hasVar ? 'checked' : ''}> Este producto tiene variantes (tallas / colores)</label>
        <span class="small muted">${isNew ? 'El stock inicial se registra como movimiento de inventario.' : 'Para cambiar existencias usa Inventario → Ajustar.'}</span></div>
      <div id="pf-vargen" class="mt"></div>
      <div id="pf-vars" class="mt"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="pf-save">${icon('check', 16)} Guardar producto</button>`,
  });
  const margin = () => { const pr = num(m.$('[name=price]').value), co = num(m.$('[name=cost]').value); m.$('#pf-margin').value = pr ? `${((pr - co) / pr * 100).toFixed(1)}%  ·  ${money(pr - co)}` : ''; };
  margin(); m.$('[name=price]').addEventListener('input', margin); m.$('[name=cost]').addEventListener('input', margin);
  m.$$('[data-qc]').forEach(b => b.onclick = () => quickCatalog(b.dataset.qc, b.previousElementSibling));
  m.$('#pf-img').onclick = async () => {
    const f = await pickFile('image/*'); if (!f) return;
    p.image = await resizeImage(f); m.$('#pf-img').innerHTML = `<img src="${p.image}">`;
  };
  const noimg = m.$('#pf-noimg'); if (noimg) noimg.onclick = () => { p.image = null; m.$('#pf-img').innerHTML = `${icon('upload', 22)}<br>Imagen`; noimg.remove(); };

  const syncFromTable = () => {
    m.$$('[data-vf]').forEach(inp => {
      const v = p.variants[+inp.dataset.i]; if (!v) return;
      const f = inp.dataset.vf;
      v[f] = f === 'stock' ? num(inp.value) : (f === 'price' || f === 'cost') ? (inp.value === '' ? null : num(inp.value)) : inp.value.trim();
    });
  };
  const drawGen = () => {
    if (!hasVar) { m.$('#pf-vargen').innerHTML = ''; return; }
    const allSizes = [...new Set([...s.sizes, ...selSizes])];
    const allColors = [...new Set([...s.colors, ...selColors])];
    m.$('#pf-vargen').innerHTML = `<div class="grid g-2">
      <div><div class="label mb" style="margin-bottom:6px">Tallas</div><div class="chips" id="g-sizes">${allSizes.map(x => `<span class="chip ${selSizes.has(x) ? 'on' : ''}" data-s="${esc(x)}">${esc(x)}</span>`).join('')}<span class="chip" data-addsize>+ otra</span></div></div>
      <div><div class="label" style="margin-bottom:6px">Colores</div><div class="chips" id="g-colors">${allColors.map(x => `<span class="chip ${selColors.has(x) ? 'on' : ''}" data-c="${esc(x)}">${esc(x)}</span>`).join('')}<span class="chip" data-addcolor>+ otro</span></div></div>
      </div><div class="row mt"><button class="btn sm" id="g-gen">${icon('layers', 14)} Generar combinaciones</button><span class="small muted">Crea una variante por cada talla × color seleccionados.</span></div>`;
  };
  const drawVars = () => {
    const vs = p.variants;
    if (!hasVar) {
      const v = vs[0];
      m.$('#pf-vars').innerHTML = `<div class="form-grid c4">
        <div class="field"><label>SKU / Código interno</label><input data-vf="sku" data-i="0" value="${esc(v.sku)}" placeholder="Automático"></div>
        <div class="field"><label>Código de barras</label><div class="input-group"><input data-vf="barcode" data-i="0" value="${esc(v.barcode)}" placeholder="Escanear o automático"><button class="btn" type="button" data-genbc="0" title="Generar">${icon('barcode', 15)}</button></div></div>
        <div class="field"><label>${v._new ? 'Stock inicial' : 'Stock actual'}</label><input type="number" data-vf="stock" data-i="0" value="${v.stock}" ${v._new ? '' : 'readonly'}></div>
      </div>`;
      return;
    }
    m.$('#pf-vars').innerHTML = `<div class="card"><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Talla</th><th>Color</th><th>SKU</th><th>Código de barras</th><th class="num">Precio propio</th><th class="num">Stock</th><th></th></tr></thead><tbody>
      ${vs.map((v, i) => `<tr><td><input data-vf="size" data-i="${i}" value="${esc(v.size)}" style="width:80px"></td><td><input data-vf="color" data-i="${i}" value="${esc(v.color)}" style="width:110px"></td>
        <td><input data-vf="sku" data-i="${i}" value="${esc(v.sku)}" placeholder="Auto" style="width:130px"></td>
        <td><div class="input-group"><input data-vf="barcode" data-i="${i}" value="${esc(v.barcode)}" placeholder="Auto" style="width:140px"><button class="btn sm" type="button" data-genbc="${i}">${icon('barcode', 13)}</button></div></td>
        <td class="num"><input type="number" data-vf="price" data-i="${i}" value="${v.price ?? ''}" placeholder="Base" style="width:100px;text-align:right"></td>
        <td class="num"><input type="number" data-vf="stock" data-i="${i}" value="${v.stock}" ${v._new ? '' : 'readonly title="Ajusta desde Inventario"'} style="width:80px;text-align:right"></td>
        <td class="actions"><button class="icon-btn danger" type="button" data-rmv="${i}">${icon('trash', 14)}</button></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="row mt"><button class="btn sm" id="pf-addv">${icon('plus', 14)} Agregar variante manual</button><span class="small muted">${vs.length} variante(s) · stock total ${qtyFmt(sum(vs, v => v.stock))}</span></div>`;
  };
  drawGen(); drawVars();

  m.$('#pf-hasvar').onchange = e => {
    syncFromTable(); hasVar = e.target.checked;
    if (!hasVar && p.variants.length > 1) {
      if (p.variants.filter(v => !v._new).length > 1) { e.target.checked = true; hasVar = true; return toast('Elimina primero las variantes existentes', 'warn'); }
      p.variants = [p.variants.find(v => !v._new) || p.variants[0]];
    }
    if (!hasVar) p.variants.forEach(v => { v.size = ''; v.color = ''; });
    drawGen(); drawVars();
  };
  m.el.addEventListener('click', async e => {
    const sc = e.target.closest('[data-s]'), cc = e.target.closest('[data-c]');
    if (sc) { const x = sc.dataset.s; selSizes.has(x) ? selSizes.delete(x) : selSizes.add(x); sc.classList.toggle('on'); }
    if (cc) { const x = cc.dataset.c; selColors.has(x) ? selColors.delete(x) : selColors.add(x); cc.classList.toggle('on'); }
    if (e.target.closest('[data-addsize]')) { const v = await promptBox('Nueva talla (separa varias con coma)', { title: 'Tallas' }); if (v) { v.split(',').map(x => x.trim()).filter(Boolean).forEach(x => selSizes.add(x)); syncFromTable(); drawGen(); } }
    if (e.target.closest('[data-addcolor]')) { const v = await promptBox('Nuevo color (separa varios con coma)', { title: 'Colores' }); if (v) { v.split(',').map(x => x.trim()).filter(Boolean).forEach(x => selColors.add(x)); syncFromTable(); drawGen(); } }
    if (e.target.closest('#g-gen')) {
      syncFromTable();
      const sizes = selSizes.size ? [...selSizes] : [''], colors = selColors.size ? [...selColors] : [''];
      if (!selSizes.size && !selColors.size) return toast('Selecciona tallas y/o colores', 'warn');
      // quitar la variante vacía inicial si es nueva
      p.variants = p.variants.filter(v => !(v._new && !v.size && !v.color && !v.stock));
      let added = 0;
      sizes.forEach(sz => colors.forEach(co => {
        if (!p.variants.some(v => v.size === sz && v.color === co)) { p.variants.push({ id: uid(), size: sz, color: co, sku: '', barcode: '', stock: 0, price: null, cost: null, _new: true }); added++; }
      }));
      // ordenar según el orden de tallas
      const order = [...s.sizes, ...sizes];
      p.variants.sort((a, b) => (order.indexOf(a.size) - order.indexOf(b.size)) || a.color.localeCompare(b.color));
      drawVars(); toast(`${added} variante(s) agregada(s)`);
    }
    if (e.target.closest('#pf-addv')) { syncFromTable(); p.variants.push({ id: uid(), size: '', color: '', sku: '', barcode: '', stock: 0, price: null, cost: null, _new: true }); drawVars(); }
    const rm = e.target.closest('[data-rmv]');
    if (rm) {
      syncFromTable();
      const v = p.variants[+rm.dataset.rmv];
      if (!v._new && v.stock > 0) return toast('La variante tiene stock. Ajústalo a 0 antes de eliminarla.', 'warn');
      if (!v._new && DB.data.invoices.some(i => i.items.some(it => it.variantId === v.id)) && !(await confirmBox('Esta variante tiene ventas registradas. Las facturas conservarán su nombre. ¿Eliminar?', { danger: true }))) return;
      if (p.variants.length === 1) return toast('Debe quedar al menos una variante', 'warn');
      p.variants.splice(+rm.dataset.rmv, 1); drawVars();
    }
    const gb = e.target.closest('[data-genbc]');
    if (gb) { syncFromTable(); p.variants[+gb.dataset.genbc].barcode = D.newBarcode(); drawVars(); }
  });

  m.$('#pf-save').onclick = () => {
    syncFromTable();
    const f = readForm(m.$('.pf-top'));
    if (!f.name) return toast('El nombre es obligatorio', 'warn');
    if (!(f.price >= 0) || f.price === '') return toast('Indica el precio de venta', 'warn');
    const maxP = LIC.limits().products;
    if (isNew && DB.data.products.length >= maxP) return toast(`Tu plan ${LIC.limits().name} permite hasta ${maxP} productos. Mejora a Premium para agregar más.`, 'warn', 6000);
    // validar códigos únicos
    const codes = new Map();
    for (const { p: op, v } of D.vmap().values()) { if (op.id === existing?.id) continue; if (v.sku) codes.set(norm(v.sku), op.name); if (v.barcode) codes.set(norm(v.barcode), op.name); }
    const seen = new Set();
    for (const v of p.variants) {
      for (const c of [v.sku, v.barcode].filter(Boolean)) {
        const k = norm(c);
        if (codes.has(k)) return toast(`El código "${c}" ya está en uso por "${codes.get(k)}"`, 'err');
        if (seen.has(k) && v.sku !== v.barcode) return toast(`Código duplicado: ${c}`, 'err');
        seen.add(k);
      }
    }
    if (hasVar && new Set(p.variants.map(v => `${v.size}|${v.color}`)).size !== p.variants.length) return toast('Hay variantes repetidas (misma talla y color)', 'err');
    Object.assign(p, f, { cost: num(f.cost), price: num(f.price), price2: f.price2 === '' ? '' : num(f.price2) });
    p.variants.forEach(v => { if (!v.sku) v.sku = D.newSku(p.name); if (!v.barcode) v.barcode = D.newBarcode(); });
    const initial = p.variants.filter(v => v._new && v.stock).map(v => ({ id: v.id, qty: v.stock }));
    p.variants.forEach(v => {
      if (v._new) v.stock = 0;
      else { const cur = D.findVariant(v.id); if (cur) v.stock = cur.v.stock; }
      delete v._new;
    });
    if (isNew) { p.id = uid(); p.createdAt = nowISO(); DB.data.products.push(p); }
    else { const i = DB.data.products.findIndex(x => x.id === p.id); p.updatedAt = nowISO(); DB.data.products[i] = p; }
    DB.rev++;
    initial.forEach(x => D.move(x.id, x.qty, 'inicial', '', 'Stock inicial'));
    audit(isNew ? 'Producto creado' : 'Producto editado', p.name);
    DB.commit(); m.close(); toast('Producto guardado');
    onSaved && onSaved(p);
  };
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const IMPORT_COLS = ['nombre', 'categoria', 'marca', 'talla', 'color', 'sku', 'codigo_barras', 'costo', 'precio', 'precio_mayoreo', 'stock', 'stock_minimo', 'descripcion'];
async function importProductsCSV(onDone) {
  const file = await pickFile('.csv,text/csv'); if (!file) return;
  const rows = parseCSV((await readFileAsText(file)).replace(/^﻿/, ''));
  if (rows.length < 2) return toast('El archivo no tiene datos', 'err');
  const head = rows[0].map(h => norm(h).trim().replace(/\s+/g, '_'));
  const idx = k => head.indexOf(k);
  if (idx('nombre') < 0 || idx('precio') < 0) return toast('El CSV debe tener al menos las columnas "nombre" y "precio"', 'err');
  const get = (r, k) => idx(k) >= 0 ? (r[idx(k)] || '').trim() : '';
  const groups = new Map();
  rows.slice(1).forEach(r => { const n = get(r, 'nombre'); if (!n) return; if (!groups.has(n)) groups.set(n, []); groups.get(n).push(r); });
  const ensure = (kind, name) => { if (!name) return ''; let x = DB.data[kind].find(c => norm(c.name) === norm(name)); if (!x) { x = { id: uid(), name }; DB.data[kind].push(x); } return x.id; };
  let created = 0, updated = 0, skipped = 0;
  const maxP = LIC.limits().products;
  groups.forEach((rs, name) => {
    const r0 = rs[0];
    let p = DB.data.products.find(x => norm(x.name) === norm(name));
    if (!p && DB.data.products.length >= maxP) { skipped++; return; }
    if (!p) {
      const defs = rs.map(r => ({ size: get(r, 'talla'), color: get(r, 'color'), sku: get(r, 'sku'), barcode: get(r, 'codigo_barras'), stock: num(get(r, 'stock')) }));
      createProduct({ name, description: get(r0, 'descripcion'), categoryId: ensure('categories', get(r0, 'categoria')), brandId: ensure('brands', get(r0, 'marca')), cost: num(get(r0, 'costo')), price: num(get(r0, 'precio')), price2: get(r0, 'precio_mayoreo') ? num(get(r0, 'precio_mayoreo')) : '', minStock: get(r0, 'stock_minimo') ? num(get(r0, 'stock_minimo')) : '' }, defs);
      created++;
    } else {
      p.price = num(get(r0, 'precio')) || p.price; if (get(r0, 'costo')) p.cost = num(get(r0, 'costo'));
      rs.forEach(r => {
        const sz = get(r, 'talla'), co = get(r, 'color');
        let v = p.variants.find(x => x.size === sz && x.color === co);
        if (!v) { v = { id: uid(), size: sz, color: co, sku: get(r, 'sku') || D.newSku(name), barcode: get(r, 'codigo_barras') || D.newBarcode(), stock: 0, price: null, cost: null }; p.variants.push(v); DB.rev++; }
        const st = get(r, 'stock'); if (st !== '' && num(st) !== v.stock) D.move(v.id, num(st) - v.stock, 'ajuste', '', 'Importación CSV');
      });
      updated++;
    }
  });
  audit('Importación de productos', `${created} nuevos, ${updated} actualizados`);
  DB.commit(); toast(`Importación lista: ${created} nuevos, ${updated} actualizados${skipped ? ` · ${skipped} omitidos por el límite de tu plan (${maxP} productos)` : ''}`, skipped ? 'warn' : 'ok', skipped ? 7000 : 3200);
  onDone && onDone();
}
function exportProductsCSV() {
  const rows = [];
  DB.data.products.forEach(p => p.variants.forEach(v => rows.push({ p, v })));
  downloadFile(`productos-${today()}.csv`, toCSV(rows, [
    { label: 'nombre', value: r => r.p.name }, { label: 'categoria', value: r => D.category(r.p.categoryId)?.name || '' }, { label: 'marca', value: r => D.brand(r.p.brandId)?.name || '' },
    { label: 'talla', value: r => r.v.size }, { label: 'color', value: r => r.v.color }, { label: 'sku', value: r => r.v.sku }, { label: 'codigo_barras', value: r => r.v.barcode },
    { label: 'costo', value: r => D.vCost(r.p, r.v) }, { label: 'precio', value: r => D.vPrice(r.p, r.v) }, { label: 'precio_mayoreo', value: r => r.p.price2 ?? '' },
    { label: 'stock', value: r => r.v.stock }, { label: 'stock_minimo', value: r => r.p.minStock ?? '' }, { label: 'descripcion', value: r => r.p.description || '' },
  ]), 'text/csv');
}

/* ---------- Página: Productos ---------- */
Pages.products = {
  title: 'Productos',
  render(el) {
    const edit = can('products.edit');
    const st = { cat: '', status: 'activos' };
    el.innerHTML = `<div class="page-head"><div class="muted">${DB.data.products.length} productos · ${D.vmap().size} variantes</div><span class="spacer"></span>
      ${edit && can('promos') ? `<button class="btn" id="promos">${icon('gift', 16)} Ofertas <span class="badge info">${(DB.data.promos || []).filter(p => p.active && (!p.to || p.to >= today())).length}</span></button>` : ''}
      ${edit ? `<button class="btn" id="imp">${icon('upload', 16)} Importar CSV</button>` : ''}
      <button class="btn" id="exp">${icon('download', 16)} Exportar</button>
      ${edit ? `<button class="btn primary" id="new">${icon('plus', 16)} Nuevo producto</button>` : ''}</div><div id="tbl"></div>`;
    const dt = DataTable($('#tbl', el), {
      placeholder: 'Buscar por nombre, SKU, código, talla, color…',
      toolbar: `<select id="f-cat" style="width:auto"><option value="">Todas las categorías</option>${DB.data.categories.map(c => opt(c.id, c.name)).join('')}</select>
        <select id="f-st" style="width:auto">${opt('activos', 'Activos')}${opt('inactivos', 'Inactivos')}${opt('bajo', 'Stock bajo / agotado')}${opt('todos', 'Todos')}</select>`,
      rows: () => DB.data.products.filter(p => (!st.cat || p.categoryId === st.cat) &&
        (st.status === 'todos' || (st.status === 'activos' && p.active !== false) || (st.status === 'inactivos' && p.active === false) || (st.status === 'bajo' && p.active !== false && D.stockState(p) !== 'ok'))),
      searchText: p => `${p.name} ${p.description} ${D.category(p.categoryId)?.name} ${D.brand(p.brandId)?.name} ${p.variants.map(v => `${v.sku} ${v.barcode} ${v.size} ${v.color}`).join(' ')}`,
      sortKey: 'name', sortDir: 'asc',
      columns: [
        { label: 'Producto', sort: 'name', html: p => `<div class="cell-main">${p.image ? `<img class="thumb" src="${p.image}">` : `<span class="thumb">${esc(initials(p.name))}</span>`}<div><div class="t1">${esc(p.name)} ${p.active === false ? '<span class="badge">Inactivo</span>' : ''}</div><div class="t2">${esc([D.category(p.categoryId)?.name, D.brand(p.brandId)?.name].filter(Boolean).join(' · ') || 'Sin categoría')}</div></div></div>` },
        { label: 'Variantes', html: p => p.variants.length > 1 ? `<span class="small">${esc([...new Set(p.variants.map(v => v.size).filter(Boolean))].join(', '))}</span><div class="small muted">${esc([...new Set(p.variants.map(v => v.color).filter(Boolean))].join(', '))}</div>` : `<span class="small muted">${esc(p.variants[0].sku)}</span>` },
        { label: 'Precio', cls: 'num', sort: 'price', sortValue: p => +p.price, html: p => `${money(p.price)}${p.price2 ? `<div class="small muted">May. ${money(p.price2)}</div>` : ''}` },
        { label: 'Costo', cls: 'num', sort: 'cost', sortValue: p => +p.cost, html: p => money(p.cost) },
        { label: 'Margen', cls: 'num', sort: 'margin', sortValue: p => p.price ? (p.price - p.cost) / p.price : 0, html: p => p.price ? `${((p.price - p.cost) / p.price * 100).toFixed(0)}%` : '—' },
        { label: 'Stock', cls: 'num', sort: 'stock', sortValue: p => D.stockOf(p), html: p => { const s = D.stockState(p); return `<span class="badge ${s === 'out' ? 'err' : s === 'low' ? 'warn' : 'ok'}">${qtyFmt(D.stockOf(p))} ${esc(p.unit || '')}</span>`; } },
        { label: '', cls: 'actions', html: p => `<button class="icon-btn" data-act="labels" data-id="${p.id}" title="Etiquetas">${icon('barcode', 16)}</button>${edit ? `<button class="icon-btn" data-act="dup" data-id="${p.id}" title="Duplicar">${icon('copy', 16)}</button><button class="icon-btn" data-act="edit" data-id="${p.id}" title="Editar">${icon('edit', 16)}</button><button class="icon-btn danger" data-act="del" data-id="${p.id}" title="Eliminar">${icon('trash', 16)}</button>` : `<button class="icon-btn" data-act="view" data-id="${p.id}" title="Ver">${icon('eye', 16)}</button>`}` },
      ],
      empty: 'No hay productos. Crea el primero o importa un CSV.',
    });
    $('#f-cat', el).onchange = e => { st.cat = e.target.value; dt.refresh(); };
    $('#f-st', el).onchange = e => { st.status = e.target.value; dt.refresh(); };
    $('#exp', el).onclick = exportProductsCSV;
    const pb = $('#promos', el); if (pb) pb.onclick = () => { location.hash = '#/promos'; };
    if (edit) {
      $('#new', el).onclick = () => productForm(null, () => dt.refresh());
      $('#imp', el).onclick = () => openModal({
        title: 'Importar productos desde CSV', size: 'md',
        body: `<p class="muted" style="margin-top:0">Usa una fila por variante. Las filas con el mismo <b>nombre</b> se agrupan como un producto con variantes. Si el producto ya existe, se actualizan precio, costo y stock.</p>
          <div class="callout small">Columnas: ${IMPORT_COLS.map(c => `<code>${c}</code>`).join(', ')}</div>`,
        footer: `<button class="btn" id="tpl">${icon('download', 15)} Descargar plantilla</button><button class="btn primary" id="go">${icon('upload', 15)} Seleccionar archivo</button>`,
        onOpen: m => {
          m.$('#tpl').onclick = () => downloadFile('plantilla-productos.csv', '﻿' + IMPORT_COLS.join(',') + '\nCamiseta Básica,Camisetas,NOIR,M,Negro,,,250,690,590,10,3,Algodón 100%\nCamiseta Básica,Camisetas,NOIR,L,Negro,,,250,690,590,8,3,\nGorra,Accesorios,NOIR,,,,,320,890,,15,5,', 'text/csv');
          m.$('#go').onclick = () => { m.close(); importProductsCSV(() => App.route()); };
        },
      });
    }
    onActions(el, {
      edit: id => productForm(D.product(id), () => dt.refresh()),
      view: id => productView(D.product(id)),
      dup: id => {
        const c = clone(D.product(id)); delete c.id; delete c.createdAt; c.name += ' (copia)';
        c.variants.forEach(v => { v.id = uid(); v.sku = ''; v.barcode = ''; v.stock = 0; v._new = true; });
        productForm(null, () => dt.refresh(), c);
      },
      labels: id => labelsModal([D.product(id)]),
      del: async id => {
        const p = D.product(id);
        const used = DB.data.invoices.some(i => i.items.some(it => it.productId === id)) || DB.data.purchases.some(po => po.items.some(it => it.productId === id));
        if (used) {
          if (await confirmBox(`"${esc(p.name)}" tiene ventas o compras registradas y no puede eliminarse. ¿Deseas desactivarlo? Ya no aparecerá en el punto de venta.`, { ok: 'Desactivar' })) { p.active = false; DB.commit(); dt.refresh(); toast('Producto desactivado'); }
          return;
        }
        if (!(await confirmBox(`¿Eliminar "${esc(p.name)}" definitivamente?`, { danger: true, ok: 'Eliminar' }))) return;
        DB.data.products = DB.data.products.filter(x => x.id !== id);
        audit('Producto eliminado', p.name); DB.commit(); dt.refresh(); toast('Producto eliminado');
      },
    });
  },
};
function productView(p) {
  openModal({
    title: esc(p.name), size: 'lg',
    body: `<div class="info-grid mb"><div><div class="ig-label">Categoría</div><div class="ig-value">${esc(D.category(p.categoryId)?.name || '—')}</div></div><div><div class="ig-label">Precio</div><div class="ig-value">${money(p.price)}</div></div><div><div class="ig-label">Mayoreo</div><div class="ig-value">${p.price2 ? money(p.price2) : '—'}</div></div><div><div class="ig-label">Stock total</div><div class="ig-value">${qtyFmt(D.stockOf(p))}</div></div></div>
      <table class="tbl compact"><thead><tr><th>Variante</th><th>SKU</th><th>Código</th><th class="num">Precio</th><th class="num">Stock</th></tr></thead><tbody>${p.variants.map(v => `<tr><td>${esc(D.vLabel(v) || 'Única')}</td><td>${esc(v.sku)}</td><td>${esc(v.barcode)}</td><td class="num">${money(D.vPrice(p, v))}</td><td class="num">${qtyFmt(v.stock)}</td></tr>`).join('')}</tbody></table>`,
  });
}

/* ---------- Etiquetas ---------- */
function labelsModal(products) {
  const rows = [];
  products.forEach(p => p.variants.forEach(v => rows.push({ p, v, copies: Math.max(0, Math.round(v.stock)) || 1 })));
  openModal({
    title: 'Imprimir etiquetas', size: 'lg',
    body: `<div class="row mb"><div class="seg" id="lb-fmt"><button data-f="hoja" class="on">Hoja carta (4 col.)</button><button data-f="rollo">Rollo 50×30 mm</button></div>
      <label class="check"><input type="checkbox" id="lb-price" checked> Mostrar precio</label><span class="spacer"></span>
      <button class="btn sm" id="lb-add">${icon('plus', 14)} Agregar productos</button><button class="btn sm ghost" id="lb-one">Todas en 1</button></div>
      <div style="max-height:50vh;overflow:auto"><table class="tbl compact"><thead><tr><th>Producto</th><th>Variante</th><th>Código</th><th class="num">Copias</th><th></th></tr></thead><tbody id="lb-rows"></tbody></table></div>`,
    footer: `<span class="small muted" style="margin-right:auto" id="lb-tot"></span><button class="btn ghost" data-close>Cerrar</button><button class="btn primary" id="lb-print">${icon('printer', 16)} Imprimir</button>`,
    onOpen: m => {
      let fmt = 'hoja';
      const draw = () => {
        m.$('#lb-rows').innerHTML = rows.map((r, i) => `<tr><td>${esc(r.p.name)}</td><td>${esc(D.vLabel(r.v) || '—')}</td><td class="small muted">${esc(r.v.barcode || r.v.sku)}</td><td class="num"><input type="number" min="0" value="${r.copies}" data-cp="${i}" style="width:80px;text-align:right"></td><td class="actions"><button class="icon-btn danger" data-rm="${i}">${icon('x', 14)}</button></td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Agrega productos</div></td></tr>';
        m.$('#lb-tot').textContent = `${sum(rows, r => r.copies)} etiquetas`;
      };
      draw();
      m.$('#lb-fmt').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; fmt = b.dataset.f; m.$$('#lb-fmt button').forEach(x => x.classList.toggle('on', x === b)); };
      m.el.addEventListener('input', e => { if (e.target.dataset.cp !== undefined) { rows[+e.target.dataset.cp].copies = Math.max(0, Math.round(num(e.target.value))); m.$('#lb-tot').textContent = `${sum(rows, r => r.copies)} etiquetas`; } });
      m.el.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { rows.splice(+r.dataset.rm, 1); draw(); } });
      m.$('#lb-one').onclick = () => { rows.forEach(r => r.copies = 1); draw(); };
      m.$('#lb-add').onclick = () => pickVariantModal((p, v) => { const ex = rows.find(r => r.v.id === v.id); if (ex) ex.copies++; else rows.push({ p, v, copies: 1 }); draw(); });
      m.$('#lb-print').onclick = () => PR.labels(rows, { format: fmt, showPrice: m.$('#lb-price').checked });
    },
  });
}

/* ---------- Ajustes de inventario ---------- */
function adjustModal({ mode = 'entrada', preset = [] } = {}) {
  const lines = preset.map(({ p, v }) => ({ p, v, qty: mode === 'conteo' ? v.stock : 1 }));
  openModal({
    title: 'Ajuste de inventario', size: 'lg',
    body: `<div class="row mb"><div class="seg" id="aj-mode">
        <button data-m="entrada">${icon('down', 14)} Entrada</button><button data-m="salida">${icon('up', 14)} Salida</button><button data-m="merma">Merma / daño</button><button data-m="conteo">Conteo físico</button></div>
        <span class="spacer"></span><button class="btn sm" id="aj-add">${icon('plus', 14)} Agregar productos</button>
        <button class="btn sm ghost" id="aj-all" title="Cargar todos los productos para conteo">Cargar todo</button></div>
      <div class="callout small mb" id="aj-help"></div>
      <div style="max-height:46vh;overflow:auto"><table class="tbl compact"><thead><tr><th>Producto</th><th>Variante</th><th class="num">Stock actual</th><th class="num" id="aj-qh">Cantidad</th><th class="num">Resultado</th><th></th></tr></thead><tbody id="aj-rows"></tbody></table></div>
      <div class="field mt"><label>Motivo / nota</label><input id="aj-note" placeholder="Ej. Mercancía recibida sin factura, prenda dañada, conteo mensual…"></div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="aj-save">${icon('check', 16)} Aplicar ajuste</button>`,
    onOpen: m => {
      const help = { entrada: 'Suma unidades al inventario.', salida: 'Resta unidades del inventario (uso interno, traslado, regalo…).', merma: 'Registra pérdidas por daño, robo o defecto.', conteo: 'Escribe la cantidad contada físicamente: el sistema calcula la diferencia.' };
      const result = l => mode === 'conteo' ? l.qty : mode === 'entrada' ? l.v.stock + l.qty : l.v.stock - l.qty;
      const draw = () => {
        m.$$('#aj-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
        m.$('#aj-help').textContent = help[mode];
        m.$('#aj-qh').textContent = mode === 'conteo' ? 'Contado' : 'Cantidad';
        m.$('#aj-all').classList.toggle('hidden', mode !== 'conteo');
        m.$('#aj-rows').innerHTML = lines.map((l, i) => { const r = result(l); const diff = r - l.v.stock; return `<tr><td>${esc(l.p.name)}</td><td>${esc(D.vLabel(l.v) || '—')}</td><td class="num">${qtyFmt(l.v.stock)}</td>
          <td class="num"><input type="number" min="0" step="any" value="${l.qty}" data-q="${i}" style="width:90px;text-align:right"></td>
          <td class="num"><b class="${r < 0 ? 'err-text' : ''}">${qtyFmt(r)}</b> <span class="small ${diff > 0 ? 'ok-text' : diff < 0 ? 'err-text' : 'muted'}">(${diff > 0 ? '+' : ''}${qtyFmt(diff)})</span></td>
          <td class="actions"><button class="icon-btn danger" data-rm="${i}">${icon('x', 14)}</button></td></tr>`; }).join('') || '<tr><td colspan="6"><div class="empty">Agrega productos al ajuste</div></td></tr>';
      };
      draw();
      m.$('#aj-mode').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; const prev = mode; mode = b.dataset.m; if ((prev === 'conteo') !== (mode === 'conteo')) lines.forEach(l => l.qty = mode === 'conteo' ? l.v.stock : 1); draw(); };
      m.$('#aj-add').onclick = () => pickVariantModal((p, v) => { const ex = lines.find(l => l.v.id === v.id); if (ex) { if (mode !== 'conteo') ex.qty++; } else lines.push({ p, v, qty: mode === 'conteo' ? v.stock : 1 }); draw(); });
      m.$('#aj-all').onclick = () => { DB.data.products.filter(p => p.active !== false).forEach(p => p.variants.forEach(v => { if (!lines.some(l => l.v.id === v.id)) lines.push({ p, v, qty: v.stock }); })); draw(); };
      m.el.addEventListener('change', e => { if (e.target.dataset.q !== undefined) { lines[+e.target.dataset.q].qty = Math.max(0, num(e.target.value)); draw(); } });
      m.el.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { lines.splice(+r.dataset.rm, 1); draw(); } });
      m.$('#aj-save').onclick = async () => {
        const note = m.$('#aj-note').value.trim();
        const eff = lines.map(l => ({ l, diff: round2(result(l) - l.v.stock) })).filter(x => x.diff !== 0);
        if (!eff.length) return toast('No hay cambios que aplicar', 'warn');
        if (!D.s.allowNegativeStock && eff.some(x => x.l.v.stock + x.diff < 0)) return toast('El ajuste dejaría stock negativo', 'err');
        if (!(await confirmBox(`Se ajustarán ${eff.length} variante(s). ¿Continuar?`))) return;
        const ref = `AJ-${Date.now().toString(36).toUpperCase()}`;
        const type = mode === 'conteo' ? 'conteo' : mode;
        eff.forEach(x => D.move(x.l.v.id, x.diff, type, ref, note));
        audit('Ajuste de inventario', `${MOVE_TYPES[type]} · ${eff.length} variante(s) · ${note}`);
        DB.commit(); m.close(); toast('Inventario actualizado'); App.route();
      };
    },
  });
}

/* ---------- Página: Inventario ---------- */
Pages.inventory = {
  title: 'Inventario',
  tab: 'stock',
  render(el, params) {
    if (params[0]) this.tab = params[0];
    const adj = can('inventory.adjust');
    const all = []; DB.data.products.filter(p => p.active !== false).forEach(p => p.variants.forEach(v => all.push({ p, v })));
    const units = sum(all, x => Math.max(0, x.v.stock));
    const valCost = sum(all, x => Math.max(0, x.v.stock) * D.vCost(x.p, x.v));
    const valSale = sum(all, x => Math.max(0, x.v.stock) * D.vPrice(x.p, x.v));
    const low = DB.data.products.filter(p => p.active !== false && D.stockState(p) !== 'ok').length;
    el.innerHTML = `<div class="grid g-4 mb">
        <div class="card kpi"><div class="k-label">Unidades en stock</div><div class="k-value">${qtyFmt(units)}</div><div class="k-sub">${all.length} variantes</div></div>
        <div class="card kpi"><div class="k-label">Valor al costo</div><div class="k-value">${money(valCost)}</div></div>
        <div class="card kpi"><div class="k-label">Valor a precio de venta</div><div class="k-value">${money(valSale)}</div><div class="k-sub">Ganancia potencial ${money(valSale - valCost)}</div></div>
        <div class="card kpi"><div class="k-label">Productos con stock bajo</div><div class="k-value ${low ? 'warn-text' : ''}">${low}</div></div></div>
      <div class="tabs">${[['stock', 'Existencias'], ['moves', 'Movimientos (kárdex)'], ['labels', 'Etiquetas']].map(([k, l]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="inv-body"></div>`;
    $$('[data-tab]', el).forEach(b => b.onclick = () => { this.tab = b.dataset.tab; history.replaceState(null, '', '#/inventory/' + this.tab); this.render(el, []); });
    const body = $('#inv-body', el);
    if (this.tab === 'stock') {
      const st = { cat: '', state: '' };
      const dt = DataTable(body, {
        placeholder: 'Buscar producto, SKU, código…',
        toolbar: `<select id="f-cat" style="width:auto"><option value="">Todas las categorías</option>${DB.data.categories.map(c => opt(c.id, c.name)).join('')}</select>
          <select id="f-state" style="width:auto">${opt('', 'Todo el stock')}${opt('low', 'Stock bajo')}${opt('out', 'Agotado')}</select><span class="spacer"></span>
          ${WA.ownerReady() ? `<button class="btn sm success" id="b-lowwa">${waIcon(14)} Alerta al dueño</button>` : ''}
          ${adj ? `<button class="btn sm" id="b-count">${icon('check', 14)} Conteo físico</button><button class="btn sm primary" id="b-adj">${icon('layers', 14)} Ajuste de inventario</button>` : ''}`,
        rows: () => all.filter(x => (!st.cat || x.p.categoryId === st.cat) && (!st.state || D.stockState(x.p, x.v) === st.state || (st.state === 'low' && D.stockState(x.p, x.v) === 'out'))),
        searchText: x => `${x.p.name} ${x.v.sku} ${x.v.barcode} ${x.v.size} ${x.v.color}`,
        sortKey: 'name', sortDir: 'asc',
        columns: [
          { label: 'Producto', sort: 'name', sortValue: x => x.p.name + D.vLabel(x.v), html: x => `<div class="t1 strong">${esc(x.p.name)}</div><div class="small muted">${esc(D.vLabel(x.v) || 'Única')}</div>` },
          { label: 'SKU / Código', html: x => `<div class="small">${esc(x.v.sku)}</div><div class="small muted">${esc(x.v.barcode)}</div>` },
          { label: 'Stock', cls: 'num', sort: 'stock', sortValue: x => x.v.stock, html: x => { const s = D.stockState(x.p, x.v); return `<span class="badge ${s === 'out' ? 'err' : s === 'low' ? 'warn' : 'ok'}">${qtyFmt(x.v.stock)}</span>`; } },
          { label: 'Costo', cls: 'num', html: x => money(D.vCost(x.p, x.v)) },
          { label: 'Valor costo', cls: 'num', sort: 'val', sortValue: x => x.v.stock * D.vCost(x.p, x.v), html: x => money(Math.max(0, x.v.stock) * D.vCost(x.p, x.v)) },
          { label: 'Valor venta', cls: 'num', html: x => money(Math.max(0, x.v.stock) * D.vPrice(x.p, x.v)) },
          { label: '', cls: 'actions', html: x => `<button class="icon-btn" data-act="kardex" data-id="${x.v.id}" title="Kárdex">${icon('eye', 15)}</button>${adj ? `<button class="btn sm" data-act="adj" data-id="${x.v.id}">Ajustar</button>` : ''}` },
        ],
        footer: rows => `<tr><td colspan="2">Total (${rows.length})</td><td class="num">${qtyFmt(sum(rows, x => x.v.stock))}</td><td></td><td class="num">${money(sum(rows, x => Math.max(0, x.v.stock) * D.vCost(x.p, x.v)))}</td><td class="num">${money(sum(rows, x => Math.max(0, x.v.stock) * D.vPrice(x.p, x.v)))}</td><td></td></tr>`,
      });
      $('#f-cat', body).onchange = e => { st.cat = e.target.value; dt.refresh(); };
      $('#f-state', body).onchange = e => { st.state = e.target.value; dt.refresh(); };
      const lw = $('#b-lowwa', body); if (lw) lw.onclick = () => WA.toOwner(WA.lowStockText(), 'stock bajo');
      if (adj) {
        $('#b-adj', body).onclick = () => adjustModal({ mode: 'entrada' });
        $('#b-count', body).onclick = () => adjustModal({ mode: 'conteo' });
      }
      onActions(body, {
        adj: id => adjustModal({ mode: 'entrada', preset: [D.findVariant(id)] }),
        kardex: id => { this.tab = 'moves'; this.kardexVariant = id; this.render(el, []); },
      });
    } else if (this.tab === 'moves') {
      const st = { from: addDays(today(), -30), to: today(), type: '', vid: this.kardexVariant || '' };
      this.kardexVariant = null;
      const rowsFn = () => DB.data.movements.filter(mv => inRange(mv.date, st.from, st.to) && (!st.type || mv.type === st.type) && (!st.vid || mv.variantId === st.vid)).sort((a, b) => b.date.localeCompare(a.date));
      const vf = st.vid ? D.findVariant(st.vid) : null;
      const dt = DataTable(body, {
        placeholder: 'Buscar producto o referencia…',
        toolbar: `<input type="date" id="f-from" value="${st.from}" style="width:auto"><input type="date" id="f-to" value="${st.to}" style="width:auto">
          <select id="f-type" style="width:auto"><option value="">Todos los tipos</option>${Object.entries(MOVE_TYPES).map(([k, v]) => opt(k, v)).join('')}</select>
          ${vf ? `<span class="badge info">${esc(vf.p.name)} ${esc(D.vLabel(vf.v))} <a href="#" id="f-clear" style="margin-left:4px">✕</a></span>` : ''}
          <span class="spacer"></span><button class="btn sm" id="b-csv">${icon('download', 14)} CSV</button>`,
        rows: rowsFn,
        searchText: mv => `${mv.name} ${mv.variant} ${mv.ref} ${mv.note}`,
        columns: [
          { label: 'Fecha', html: mv => `<span class="nowrap">${fmtDateTime(mv.date)}</span>` },
          { label: 'Producto', html: mv => `<div class="strong">${esc(mv.name)}</div><div class="small muted">${esc(mv.variant || '')}</div>` },
          { label: 'Tipo', html: mv => `<span class="badge ${mv.qty > 0 ? 'ok' : 'err'}">${MOVE_TYPES[mv.type] || mv.type}</span>` },
          { label: 'Referencia', html: mv => `<div>${esc(mv.ref || '—')}</div>${mv.note ? `<div class="small muted">${esc(mv.note)}</div>` : ''}` },
          { label: 'Cantidad', cls: 'num', html: mv => `<b class="${mv.qty > 0 ? 'ok-text' : 'err-text'}">${mv.qty > 0 ? '+' : ''}${qtyFmt(mv.qty)}</b>` },
          { label: 'Saldo', cls: 'num', html: mv => qtyFmt(mv.balance) },
          { label: 'Usuario', html: mv => `<span class="small muted">${esc(D.userName(mv.userId))}</span>` },
        ],
        empty: 'Sin movimientos en el periodo', emptyIcon: 'layers',
      });
      const upd = () => { st.from = $('#f-from', body).value; st.to = $('#f-to', body).value; st.type = $('#f-type', body).value; dt.refresh(); };
      ['#f-from', '#f-to', '#f-type'].forEach(s => $(s, body).onchange = upd);
      const fc = $('#f-clear', body); if (fc) fc.onclick = e => { e.preventDefault(); this.render(el, []); };
      $('#b-csv', body).onclick = () => downloadFile(`kardex-${st.from}-${st.to}.csv`, toCSV(dt.rows(), [
        { label: 'Fecha', value: m => fmtDateTime(m.date) }, { label: 'Producto', value: m => m.name }, { label: 'Variante', value: m => m.variant },
        { label: 'Tipo', value: m => MOVE_TYPES[m.type] || m.type }, { label: 'Referencia', value: m => m.ref }, { label: 'Nota', value: m => m.note },
        { label: 'Cantidad', value: m => m.qty }, { label: 'Saldo', value: m => m.balance }, { label: 'Usuario', value: m => D.userName(m.userId) },
      ]), 'text/csv');
    } else {
      body.innerHTML = `<div class="card card-pad"><div class="row"><div style="flex:1"><h3 style="margin:0 0 4px;font:600 16px var(--display)">Etiquetas con código de barras</h3>
        <div class="muted">Imprime etiquetas en hoja carta (4 columnas) o en impresora de rollo 50×30 mm. Por defecto se imprime una etiqueta por unidad en stock.</div></div></div>
        <div class="row mt"><button class="btn primary" id="lb-pick">${icon('plus', 16)} Elegir productos</button>
        <button class="btn" id="lb-all">${icon('barcode', 16)} Todo el inventario</button>
        <select id="lb-cat" style="width:auto"><option value="">…o por categoría</option>${DB.data.categories.map(c => opt(c.id, c.name)).join('')}</select></div></div>`;
      $('#lb-pick', body).onclick = () => labelsModal([]);
      $('#lb-all', body).onclick = () => labelsModal(DB.data.products.filter(p => p.active !== false));
      $('#lb-cat', body).onchange = e => e.target.value && labelsModal(DB.data.products.filter(p => p.active !== false && p.categoryId === e.target.value));
    }
  },
};

