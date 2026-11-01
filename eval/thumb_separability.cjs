// Section 5.4 study: how well does each single feature separate Thripathaka (thumb tucked)
// from Pathaka (thumb extended out, used as a thumb-out proxy)? In-sample, best single cutoff.
// Usage: node eval/thumb_separability.cjs <replay json> [feature ...]
const r = require(require('path').resolve(process.argv[2]));

const fields = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['spreadThumbIndex', 'radialGapFromIndexMcp', 'tipToIndexMcp', 'thumbIp'];
const T = r.thripathaka.filter((x) => x.detected);
const P = r.pathaka.filter((x) => x.detected);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const r2 = (v) => Math.round(v * 100) / 100;

fields.forEach((f) => {
  const t = T.map((x) => x[f]);
  const p = P.map((x) => x[f]);
  const all = [...t, ...p].sort((a, b) => a - b);
  const cuts = [all[0] - 1, ...all.slice(1).map((v, i) => (all[i] + v) / 2), all[all.length - 1] + 1];
  let best = { ok: 0 };
  cuts.forEach((c) => {
    [1, -1].forEach((dir) => {
      const ok = t.filter((v) => dir * v < dir * c).length + p.filter((v) => dir * v >= dir * c).length;
      if (ok > best.ok) best = { ok, c, dir };
    });
  });
  const n = t.length + p.length;
  console.log(
    `${f}: best ${best.ok}/${n} = ${((100 * best.ok) / n).toFixed(1)}% at cut ${r2(best.c)} (Thripathaka ${best.dir > 0 ? '<' : '>='})`,
    `| Thripathaka median ${r2(median(t))} [${r2(Math.min(...t))}, ${r2(Math.max(...t))}]`,
    `| Pathaka median ${r2(median(p))} [${r2(Math.min(...p))}, ${r2(Math.max(...p))}]`,
  );
  const byUser = {};
  T.forEach((x) => {
    const u = x.file.match(/user\d+/)[0];
    (byUser[u] = byUser[u] || []).push(x[f]);
  });
  console.log('  Thripathaka per-performer medians (n):', Object.entries(byUser).map(([u, v]) => `${u}=${r2(median(v))} (${v.length})`).join(', '));
});
