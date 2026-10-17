import Decimal from 'break_eternity.js';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa'];

/** Short number: 12.3, 4.56K, 7.89T, then 1.23e45 and beyond. */
export function fmt(value: Decimal | number, places = 2): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (d.lt(0)) return '-' + fmt(d.neg(), places);
  if (d.lt(1000)) {
    const n = d.toNumber();
    if (n === 0) return '0';
    if (n < 1) return n.toFixed(2).replace(/0$/, '');
    if (n < 10 && Math.abs(n - Math.round(n)) > 0.05) return n.toFixed(1);
    return Math.floor(n + 0.05).toString();
  }
  if (d.lt(1e18)) {
    const n = d.toNumber();
    const tier = Math.floor(Math.log10(n) / 3);
    return (n / 10 ** (tier * 3)).toFixed(places) + SUFFIXES[tier];
  }
  if (d.lt('1e1000000')) {
    const e = Math.floor(d.log10().toNumber());
    const m = d.div(Decimal.pow(10, e)).toNumber();
    return `${m.toFixed(places)}e${e}`;
  }
  return d.toString();
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}
