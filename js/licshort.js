'use strict';
/* ==========================================================
   NOIR STORE — Número de licencia permanente: NOIR-A1B2-C3D4-E5F6
   Letras y números intercalados. Lleva dentro el plan (Básica / Premium)
   y una comprobación que solo sabe calcular quien tiene la clave del panel.
   Se verifica sin internet. (El mismo código está en el Panel de Licencias.)
   ========================================================== */
const LIC_SHORT_RE = /^\s*NOIR[\s-]*([A-Z0-9]{4}[\s-]*){3}\s*$/i;
const LicShort = (() => {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';                    // sin I ni O (se confunden con 1 y 0)
  const TOTAL = 24n ** 6n * 10n ** 6n, DATA = 1n << 21n, MACS = TOTAL / DATA;
  const A = 1000000007n, B = 98765432109876n;
  const inv = (a, m) => { let r0 = a % m, r1 = m, s0 = 1n, s1 = 0n; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return ((s0 % m) + m) % m; };
  const AI = inv(A, TOTAL);
  const mac = (secret, data) => BigInt(parseInt(sha256(secret + '|' + data).slice(0, 12), 16)) % MACS;
  function encode(n) {
    let s = '';
    for (let i = 11; i >= 0; i--) { const base = i % 2 ? 10n : 24n; const c = Number(n % base); n /= base; s = (i % 2 ? String(c) : L[c]) + s; }
    return `NOIR-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  }
  function decode(body) {
    let n = 0n;
    for (let i = 0; i < 12; i++) {
      const ch = body[i];
      if (i % 2) { const d = '0123456789'.indexOf(ch); if (d < 0) return null; n = n * 10n + BigInt(d); }
      else { const d = L.indexOf(ch); if (d < 0) return null; n = n * 24n + BigInt(d); }
    }
    return n;
  }
  /* corrige confusiones típicas al escribir: O→0, I/L→1 en las posiciones de número */
  function canon(key) {
    const s = String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^NOIR/, '');
    if (s.length !== 12) return null;
    return [...s].map((ch, i) => i % 2 ? ({ O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8' }[ch] || ch) : ({ '0': 'O', '1': 'I' }[ch] || ch)).join('');
  }
  return {
    make(secret, serial, tier) {
      const data = BigInt(serial) * 2n + (tier === 'premium' ? 1n : 0n);
      if (data >= DATA) throw new Error('serial fuera de rango');
      return encode(((data * MACS + mac(secret, data)) * A + B) % TOTAL);
    },
    check(secret, key) {
      const body = canon(key); if (!body || !secret) return null;
      const p = decode(body); if (p === null || p >= TOTAL) return null;
      const n = (((p - B) % TOTAL + TOTAL) % TOTAL) * AI % TOTAL;
      const data = n / MACS;
      if (data >= DATA || n % MACS !== mac(secret, data)) return null;
      return { key: encode(p), tier: data & 1n ? 'premium' : 'basic', serial: Number(data >> 1n) };
    },
  };
})();
