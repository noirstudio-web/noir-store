'use strict';
/* ==========================================================
   NOIR STORE — Datos de demostración
   ========================================================== */

function createProduct(data, variantDefs) {
  const p = {
    id: uid(), name: data.name, description: data.description || '', categoryId: data.categoryId || '', brandId: data.brandId || '',
    supplierId: data.supplierId || '', unit: data.unit || 'und', cost: round2(data.cost || 0), price: round2(data.price || 0),
    price2: data.price2 ?? '', taxable: data.taxable !== false, minStock: data.minStock ?? '', image: data.image || null,
    active: true, createdAt: nowISO(), variants: [],
  };
  (variantDefs && variantDefs.length ? variantDefs : [{}]).forEach(vd => {
    p.variants.push({
      id: uid(), size: vd.size || '', color: vd.color || '',
      sku: vd.sku || D.newSku(p.name), barcode: vd.barcode || D.newBarcode(),
      stock: 0, price: vd.price ?? null, cost: vd.cost ?? null,
    });
  });
  DB.data.products.push(p);
  DB.rev++;
  (variantDefs && variantDefs.length ? variantDefs : [{}]).forEach((vd, i) => { if (+vd.stock) D.move(p.variants[i].id, +vd.stock, 'inicial', '', 'Inventario inicial'); });
  return p;
}

function loadDemoData() {
  const d = DB.data;
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = arr => arr[rnd(0, arr.length - 1)];
  const cat = n => (d.categories.find(c => c.name === n) || {}).id || '';
  const brand = d.brands[0]?.id || '';
  /* Escala los precios de ejemplo a la moneda del país */
  const k = (typeof COUNTRY_PRESETS !== 'undefined' && COUNTRY_PRESETS[d.settings.country]?.demoScale) || 1;
  const nice = v => d.settings.decimals === 0 ? Math.max(100, Math.round(v / 100) * 100) : round2(v);
  const P = v => { const x = v * k; return x >= 5000 ? Math.round(x / 1000) * 1000 - 100 : nice(x); };

  const sups = [
    { name: 'Textiles del Caribe', contact: 'Luis Gómez', phone: '809-555-0141', email: 'ventas@textilescaribe.com', taxId: '1-31-00000-1', address: 'Zona Industrial, Nave 4' },
    { name: 'Calzados Premium', contact: 'Andrea Ruiz', phone: '809-555-0178', email: 'pedidos@calzadospremium.com', taxId: '1-31-00000-2', address: 'Av. Principal 220' },
    { name: 'Importadora Global', contact: 'Pedro Sánchez', phone: '809-555-0199', email: 'info@importglobal.com', taxId: '1-31-00000-3', address: 'Puerto Libre, Local 12' },
  ].map(s => ({ id: uid(), ...s, notes: '', createdAt: nowISO() }));
  d.suppliers.push(...sups);

  const custs = [
    { name: 'María Rodríguez', docId: '001-1234567-8', phone: '809-555-1020', email: 'maria@correo.com', address: 'Calle Las Flores 12', creditLimit: 15000, creditDays: 30 },
    { name: 'Carlos Méndez', docId: '001-7654321-0', phone: '829-555-3344', email: 'carlos.m@correo.com', address: 'Res. Los Pinos, Apto 3B', creditLimit: 10000, creditDays: 15 },
    { name: 'Boutique La Esquina', docId: '1-30-55555-2', phone: '809-555-8800', email: 'compras@laesquina.com', address: 'Av. Central 45', creditLimit: 60000, creditDays: 30 },
    { name: 'Ana Pérez', docId: '', phone: '849-555-7766', email: '', address: '', creditLimit: 0, creditDays: 0 },
    { name: 'José Martínez', docId: '', phone: '809-555-4512', email: 'jose@correo.com', address: '', creditLimit: 8000, creditDays: 30 },
  ].map(c => ({ id: uid(), ...c, creditLimit: c.creditLimit ? nice(c.creditLimit * k) : 0, storeCredit: 0, notes: '', createdAt: nowISO() }));
  d.customers.push(...custs);

  const mk = (name, catName, price, cost, sizes, colors, supIdx = 0, extra = {}) => {
    const defs = [];
    if (sizes.length || colors.length) {
      (sizes.length ? sizes : ['']).forEach(sz => (colors.length ? colors : ['']).forEach(co => defs.push({ size: sz, color: co, stock: rnd(0, 9) ? rnd(2, 14) : rnd(0, 2) })));
    } else defs.push({ stock: rnd(5, 30) });
    return createProduct({ name, categoryId: cat(catName), brandId: brand, supplierId: sups[supIdx].id, price: P(price), cost: nice(cost * k), price2: nice(P(price) * .85), ...extra }, defs);
  };
  mk('Camisa Oxford Slim', 'Camisas', 1890, 850, ['S', 'M', 'L', 'XL'], ['Blanco', 'Azul']);
  mk('Camiseta Básica Premium', 'Camisetas', 690, 250, ['S', 'M', 'L', 'XL'], ['Negro', 'Blanco', 'Gris']);
  mk('Jeans Skinny Noir', 'Jeans', 2490, 1100, ['28', '30', '32', '34'], ['Negro', 'Azul']);
  mk('Pantalón Chino', 'Pantalones', 1990, 900, ['30', '32', '34', '36'], ['Beige', 'Negro']);
  mk('Vestido Midi Satinado', 'Vestidos', 3290, 1450, ['S', 'M', 'L'], ['Negro', 'Rojo']);
  mk('Falda Plisada', 'Faldas', 1590, 700, ['S', 'M', 'L'], ['Negro', 'Beige']);
  mk('Chaqueta Cuero Sintético', 'Abrigos', 4590, 2100, ['S', 'M', 'L', 'XL'], ['Negro'], 2);
  mk('Hoodie Oversize', 'Abrigos', 2290, 950, ['S', 'M', 'L', 'XL'], ['Negro', 'Gris']);
  mk('Tenis Urban Low', 'Calzado', 3890, 1800, ['38', '39', '40', '41', '42'], ['Blanco', 'Negro'], 1);
  mk('Botín Chelsea', 'Calzado', 4290, 2000, ['37', '38', '39', '40'], ['Negro'], 1);
  mk('Gorra Monograma', 'Accesorios', 890, 320, [], [], 2);
  mk('Cinturón de Piel', 'Accesorios', 1190, 480, [], [], 2);
  mk('Bolso Tote Noir', 'Accesorios', 2790, 1200, [], [], 2);
  mk('Lentes de Sol Classic', 'Accesorios', 1490, 520, [], [], 2);
  mk('Calcetines Pack x3', 'Ropa interior', 450, 150, [], [], 0, { minStock: 10 });

  /* Historial de ventas de los últimos 30 días */
  const variants = [];
  d.products.forEach(p => p.variants.forEach(v => variants.push({ p, v })));
  const methods = ['efectivo', 'efectivo', 'efectivo', 'tarjeta', 'tarjeta', 'transferencia'];
  for (let back = 29; back >= 0; back--) {
    const n = rnd(1, back === 0 ? 3 : 5);
    for (let k = 0; k < n; k++) {
      const items = [];
      const lines = rnd(1, 3);
      for (let j = 0; j < lines; j++) {
        const avail = variants.filter(x => x.v.stock > 1);
        if (!avail.length) break;
        const { p, v } = pick(avail);
        if (items.some(i => i.variantId === v.id)) continue;
        items.push({ variantId: v.id, productId: p.id, name: p.name, variant: D.vLabel(v), sku: v.sku, qty: 1, price: D.vPrice(p, v), discount: rnd(0, 9) ? 0 : 10, cost: D.vCost(p, v), taxable: true });
      }
      if (!items.length) continue;
      const t = D.totals(items);
      const credit = back > 3 && rnd(1, 9) === 1;
      const cust = credit ? pick(custs.filter(c => c.creditLimit > 0)) : (rnd(0, 3) ? d.customers[0] : pick(custs));
      const payments = credit ? [{ method: 'efectivo', amount: round2(t.total * .2) }] : [{ method: pick(methods), amount: t.total }];
      try {
        const date = new Date(); date.setDate(date.getDate() - back); date.setHours(rnd(9, 19), rnd(0, 59), 0, 0);
        const inv = D.createSale({ customerId: cust.id, items, payments, overrideLimit: true, credit: credit ? { installments: rnd(1, 3), frequency: 'quincenal', firstDue: addDays(dayKey(date), 15) } : null });
        inv.date = date.toISOString();
        if (inv.credit) { const sch = D.schedule(inv); inv.dueDate = sch[sch.length - 1].date; }
        d.movements.filter(m => m.ref === inv.number).forEach(m => m.date = inv.date);
      } catch (e) { /* omitir */ }
    }
  }
  d.settings.seq.invoice = d.invoices.length + 1;
  /* Una cotización de ejemplo */
  const qv = variants.slice(0, 3).map(({ p, v }) => ({ variantId: v.id, productId: p.id, name: p.name, variant: D.vLabel(v), sku: v.sku, qty: 6, price: p.price2 || p.price, discount: 0, cost: D.vCost(p, v), taxable: true }));
  D.saveQuote({ customerId: custs[2].id, items: qv, gd: 5, gdType: 'percent', validUntil: addDays(today(), 15), notes: 'Pedido al por mayor para temporada.' });
  audit('Datos de demostración', 'Se cargaron productos, clientes y ventas de ejemplo');
  DB.commit();
}
