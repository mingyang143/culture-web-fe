// Replays IIIT-Kottayam dataset images through the live MudraPractice evaluator
// (window.__detectAndEvaluateImage) and writes a compact per-image record.
// Usage (FE dev server on :5173):
//   node eval/run_dataset_replay.cjs <dataset images dir> <output json>
// Adapted from the original calibration run (run_dataset_calibration.js, 2026-10-24).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const [datasetDir, outPath] = process.argv.slice(2);
if (!datasetDir || !outPath) {
  console.error('Usage: node eval/run_dataset_replay.cjs <dataset images dir> <output json>');
  process.exit(1);
}

const mudraFolders = [
  { folder: '17.tripataka', mudraKey: 'thripathaka' },
  { folder: '1.pataka', mudraKey: 'pathaka' },
  { folder: '2.mudrakhya', mudraKey: 'mudrakhyam' },
  { folder: '3.kataka', mudraKey: 'katakam' },
  { folder: '4.mushti', mudraKey: 'mushti' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/learn/mudras/practice/thripathaka');
  await page.waitForFunction(() => typeof window.__detectAndEvaluateImage === 'function', { timeout: 60000 });

  const results = {};
  for (const { folder, mudraKey } of mudraFolders) {
    const folderPath = path.join(datasetDir, folder);
    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith('.jpg')).sort();
    results[mudraKey] = [];
    for (const file of files) {
      const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(folderPath, file)).toString('base64');
      const r = await page.evaluate(({ s, key }) => window.__detectAndEvaluateImage(s, key), { s: src, key: mudraKey });
      if (!r) {
        results[mudraKey].push({ file, detected: false });
        continue;
      }
      const { kinematics: k, evalRes: e } = r;
      results[mudraKey].push({
        file,
        detected: true,
        handedness: r.handedness,
        matchScore: e.matchScore,
        isMastered: e.isMastered,
        spreadThumbIndex: k.spreadThumbIndex,
        thumbMcp: k.thumb.mcp,
        thumbIp: k.thumb.pip,
        indexMcp: k.index.mcp,
        radialGapFromIndexMcp: k.thumbPlacement.radialGapFromIndexMcp,
        tipToIndexMcp: k.thumbPlacement.tipToIndexMcp,
        evaluations: e.jointEvaluations.map((j) => ({ key: j.jointKey, raw: j.rawValue, status: j.status })),
      });
    }
    console.log(`${folder}: ${results[mudraKey].filter((x) => x.detected).length}/${files.length} detected`);
  }
  fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
