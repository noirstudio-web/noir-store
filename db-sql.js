/* ==========================================================
   NOIR STORE — Base de datos SQL (SQLite incorporado en Node.js)
   Cada colección del sistema es una tabla. Cada fila guarda el
   registro completo (columna data, JSON) y columnas calculadas
   para consultar con SQL normal: SELECT number, total FROM invoices
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* colección del sistema -> tabla SQL y columnas consultables */
const TABLES = {
  users: ['users', { username: '$.username', name: '$.name', role: '$.role', active: '$.active' }],
  customers: ['customers', { name: '$.name', doc_id: '$.docId', phone: '$.phone', email: '$.email', credit_limit: '$.creditLimit', store_credit: '$.storeCredit', points: '$.points', created_at: '$.createdAt' }],
  suppliers: ['suppliers', { name: '$.name', tax_id: '$.taxId', contact: '$.contact', phone: '$.phone', email: '$.email' }],
  categories: ['categories', { name: '$.name' }],
  brands: ['brands', { name: '$.name' }],
  products: ['products', { name: '$.name', category_id: '$.categoryId', brand_id: '$.brandId', supplier_id: '$.supplierId', price: '$.price', price2: '$.price2', cost: '$.cost', min_stock: '$.minStock', active: '$.active' }],
  movements: ['movements', { date: '$.date', product_id: '$.productId', variant_id: '$.variantId', name: '$.name', variant: '$.variant', type: '$.type', qty: '$.qty', balance: '$.balance', ref: '$.ref' }],
  invoices: ['invoices', { number: '$.number', date: '$.date', customer_id: '$.customerId', customer_name: '$.customerName', user_name: '$.userName', type: '$.type', status: '$.status', subtotal: '$.subtotal', discount: '$.discount', tax: '$.tax', total: '$.total', paid: '$.paid', balance: '$.balance', due_date: '$.dueDate', credit_interest: '$.credit.interest', credit_pay_method: '$.credit.payMethod', session_id: '$.sessionId' }],
  payments: ['payments', { number: '$.number', date: '$.date', customer_id: '$.customerId', customer_name: '$.customerName', amount: '$.amount', method: '$.method', user_name: '$.userName', voided: '$.voided' }],
  returns: ['returns', { number: '$.number', date: '$.date', invoice_number: '$.invoiceNumber', customer_name: '$.customerName', amount: '$.amount', refund: '$.refund', method: '$.method', reason: '$.reason' }],
  quotes: ['quotes', { number: '$.number', date: '$.date', customer_name: '$.customerName', total: '$.total', status: '$.status', valid_until: '$.validUntil' }],
  purchases: ['purchases', { number: '$.number', date: '$.date', supplier_name: '$.supplierName', total: '$.total', paid: '$.paid', status: '$.status' }],
  supplierPayments: ['supplier_payments', { number: '$.number', date: '$.date', purchase_number: '$.purchaseNumber', supplier_name: '$.supplierName', amount: '$.amount', method: '$.method' }],
  cashSessions: ['cash_sessions', { number: '$.number', opened_at: '$.openedAt', closed_at: '$.closedAt', opened_by: '$.openedByName', opening_amount: '$.openingAmount', expected: '$.expected', counted: '$.counted', difference: '$.difference', status: '$.status' }],
  cashMoves: ['cash_moves', { date: '$.date', session_id: '$.sessionId', type: '$.type', amount: '$.amount', reason: '$.reason', user_name: '$.userName' }],
  expenses: ['expenses', { date: '$.date', category: '$.category', description: '$.description', amount: '$.amount', method: '$.method', voided: '$.voided' }],
  layaways: ['layaways', { number: '$.number', date: '$.date', customer_name: '$.customerName', total: '$.total', paid: '$.paid', balance: '$.balance', due_date: '$.dueDate', status: '$.status' }],
  promos: ['promos', { name: '$.name', value: '$.value', scope: '$.scope', date_from: '$.from', date_to: '$.to', active: '$.active' }],
  warranties: ['warranties', { number: '$.number', date: '$.date', invoice_number: '$.invoiceNumber', customer_name: '$.customerName', item: '$.itemName', in_warranty: '$.inWarranty', valid_until: '$.until', status: '$.status', solution: '$.solution' }],
  held: ['held', { date: '$.date', user_name: '$.user' }],
  audit: ['audit', { date: '$.date', user_name: '$.userName', action: '$.action', detail: '$.detail' }],
  notifications: ['notifications', { date: '$.date', type: '$.type', ref: '$.ref', customer_name: '$.customerName', phone: '$.phone', status: '$.status' }],
};

/* vistas listas para reportes */
const VIEWS = {
  v_invoice_items: `SELECT i.id AS invoice_id, i.number, i.date, i.status, i.customer_name,
      j.value ->> '$.productId' AS product_id, j.value ->> '$.variantId' AS variant_id, j.value ->> '$.name' AS name, j.value ->> '$.variant' AS variant,
      j.value ->> '$.sku' AS sku, j.value ->> '$.qty' AS qty, j.value ->> '$.price' AS price, j.value ->> '$.discount' AS discount_pct,
      j.value ->> '$.lineTotal' AS line_total, j.value ->> '$.cost' AS unit_cost, j.value ->> '$.returnedQty' AS returned_qty
    FROM invoices i, json_each(i.data, '$.items') j`,
  v_invoice_payments: `SELECT i.number AS invoice_number, i.date, i.customer_name, 'inicial' AS kind, j.value ->> '$.method' AS method, j.value ->> '$.amount' AS amount
      FROM invoices i, json_each(i.data, '$.payments') j WHERE i.status <> 'anulada'
    UNION ALL
    SELECT a.value ->> '$.number', p.date, p.customer_name, 'abono ' || p.number, p.method, a.value ->> '$.amount'
      FROM payments p, json_each(p.data, '$.allocations') a WHERE coalesce(p.voided, 0) = 0`,
  v_credit_invoices: `SELECT number, date, customer_name, total, credit_interest, data ->> '$.credit.financed' AS financed, credit_pay_method,
      data ->> '$.credit.installments' AS installments, data ->> '$.credit.frequency' AS frequency, balance, due_date, status
    FROM invoices WHERE type = 'credito' AND status <> 'anulada'`,
  v_customer_balances: `SELECT c.id, c.name, c.phone, c.credit_limit, coalesce(sum(i.balance), 0) AS debt, c.store_credit, c.points
    FROM customers c LEFT JOIN invoices i ON i.customer_id = c.id AND i.status <> 'anulada' AND i.balance > 0
    GROUP BY c.id`,
  v_stock: `SELECT p.id AS product_id, p.name, cat.name AS category, v.value ->> '$.id' AS variant_id, v.value ->> '$.size' AS size, v.value ->> '$.color' AS color,
      v.value ->> '$.sku' AS sku, v.value ->> '$.barcode' AS barcode, v.value ->> '$.stock' AS stock,
      coalesce(v.value ->> '$.price', p.price) AS price, coalesce(v.value ->> '$.cost', p.cost) AS cost
    FROM products p LEFT JOIN categories cat ON cat.id = p.category_id, json_each(p.data, '$.variants') v`,
  v_sales_by_day: `SELECT substr(date, 1, 10) AS day, count(*) AS invoices, round(sum(total), 2) AS total
    FROM invoices WHERE status <> 'anulada' GROUP BY day ORDER BY day DESC`,
};

class SqlStore {
  constructor(file) {
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = OFF;');
    this.db.exec('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.cache = new Map();   // tabla -> Map(id -> "pos|json") para escribir solo lo que cambió
    for (const name of Object.keys(TABLES)) this.ensureTable(name);
    for (const [v, sql] of Object.entries(VIEWS)) { this.db.exec(`DROP VIEW IF EXISTS ${v}`); this.db.exec(`CREATE VIEW ${v} AS ${sql}`); }
    this.ro = null;
  }
  tableOf(collection) {
    if (TABLES[collection]) return TABLES[collection][0];
    return 'c_' + collection.replace(/[^a-zA-Z0-9]/g, '_').replace(/([A-Z])/g, '_$1').toLowerCase();
  }
  ensureTable(collection) {
    const t = this.tableOf(collection);
    if (this.cache.has(t)) return t;
    const cols = TABLES[collection] ? Object.entries(TABLES[collection][1]) : [];
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, pos INTEGER NOT NULL, data TEXT NOT NULL${cols.map(([c, p]) => `, ${c} GENERATED ALWAYS AS (json_extract(data, '${p}')) VIRTUAL`).join('')})`);
    this.cache.set(t, new Map());
    return t;
  }
  isEmpty() { return !this.db.prepare("SELECT 1 FROM config WHERE key = 'meta'").get(); }
  rev() { const r = this.db.prepare("SELECT value FROM config WHERE key = 'meta'").get(); return r ? (JSON.parse(r.value).rev || 0) : 0; }

  /* Lee todo el estado del sistema */
  load() {
    if (this.isEmpty()) return null;
    const out = {};
    for (const r of this.db.prepare('SELECT key, value FROM config').all()) out[r.key] = JSON.parse(r.value);
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'config'").all().map(r => r.name);
    const byTable = Object.fromEntries(Object.entries(TABLES).map(([k, [t]]) => [t, k]));
    for (const t of tables) {
      const col = byTable[t] || (t.startsWith('c_') ? out.__collections?.[t] : null);
      if (!col) continue;
      const cache = this.cache.get(t) || new Map(); this.cache.set(t, cache);
      out[col] = this.db.prepare(`SELECT id, pos, data FROM ${t} ORDER BY pos`).all().map(r => { cache.set(r.id, r.pos + '|' + r.data); return JSON.parse(r.data); });
    }
    delete out.__collections;
    return out;
  }

  /* Guarda el estado: solo inserta, actualiza o borra las filas que cambiaron */
  save(state) {
    const db = this.db;
    const extra = {};
    db.exec('BEGIN');
    try {
      const putCfg = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(state)) {
        if (Array.isArray(v)) {
          const t = this.ensureTable(k);
          if (t.startsWith('c_')) extra[t] = k;
          const cache = this.cache.get(t), seen = new Set();
          const up = db.prepare(`INSERT INTO ${t} (id, pos, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET pos = excluded.pos, data = excluded.data`);
          v.forEach((rec, i) => {
            const id = String(rec && rec.id != null ? rec.id : `__${i}`);
            const json = JSON.stringify(rec), sig = i + '|' + json;
            seen.add(id);
            if (cache.get(id) !== sig) { up.run(id, i, json); cache.set(id, sig); }
          });
          const del = db.prepare(`DELETE FROM ${t} WHERE id = ?`);
          for (const id of [...cache.keys()]) if (!seen.has(id)) { del.run(id); cache.delete(id); }
        } else putCfg.run(k, JSON.stringify(v));
      }
      if (Object.keys(extra).length) putCfg.run('__collections', JSON.stringify(extra));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  /* Copia de seguridad consistente del archivo .sqlite */
  backup(dest) { if (!fs.existsSync(dest)) this.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`); }

  /* Consultas de solo lectura (explorador SQL del sistema) */
  query(sql, limit = 1000) {
    const s = String(sql || '').trim().replace(/;+\s*$/, '');
    if (!/^(select|with|pragma\s+table_info)\b/i.test(s) || s.includes(';')) throw new Error('Solo se permiten consultas de lectura (SELECT o WITH), una a la vez.');
    if (!this.ro) this.ro = new DatabaseSync(this.file, { readOnly: true });
    const stmt = this.ro.prepare(s);
    const rows = []; let truncated = false;
    for (const r of stmt.iterate()) { if (rows.length >= limit) { truncated = true; break; } rows.push(r); }
    const columns = rows.length ? Object.keys(rows[0]) : (stmt.columns ? stmt.columns().map(c => c.name) : []);
    return { columns, rows: rows.map(r => columns.map(c => r[c])), truncated };
  }
  info() {
    const tables = this.db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all()
      .map(r => ({ name: r.name, type: r.type, rows: r.type === 'table' ? this.db.prepare(`SELECT count(*) AS n FROM ${r.name}`).get().n : null,
        columns: this.db.prepare(`PRAGMA table_xinfo(${r.name})`).all().map(c => c.name).filter(c => c !== 'data' && c !== 'pos') }));
    const size = [this.file, this.file + '-wal'].reduce((a, f) => a + (fs.existsSync(f) ? fs.statSync(f).size : 0), 0);
    return { storage: 'sqlite', engine: 'SQLite ' + this.db.prepare('SELECT sqlite_version() AS v').get().v, file: this.file, size, tables };
  }
}

module.exports = { SqlStore, TABLES, VIEWS };
