// Per-class summary of a replay file (Tables 5-6 of the CA report).
// Usage: node eval/summarize_replay.cjs <replay json>
const r = require(require('path').resolve(process.argv[2]));

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const isGate = (e) => e.key.startsWith('thumbPlacement') || e.key.startsWith('contact');

let detected = 0;
let mastered = 0;
Object.entries(r).forEach(([mudra, rows]) => {
  const d = rows.filter((x) => x.detected);
  const m = d.filter((x) => x.isMastered).length;
  const mean = d.reduce((s, x) => s + x.matchScore, 0) / d.length;
  const gatePass = d.filter((x) => x.evaluations.filter(isGate).every((e) => e.status === 'CORRECT')).length;
  const gateFail = d.filter((x) => x.evaluations.some((e) => isGate(e) && e.status !== 'CORRECT')).map((x) => x.file);
  detected += d.length;
  mastered += m;
  console.log(`${mudra}: detected ${d.length}, mastered ${m}, mean ${mean.toFixed(1)}, median ${median(d.map((x) => x.matchScore))}, gate pass ${gatePass}`, gateFail.join(' '));
});
console.log(`total: detected ${detected}, mastered ${mastered}`);
