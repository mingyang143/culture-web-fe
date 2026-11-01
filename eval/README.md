# MudraGuide dataset evaluation

Offline replay of the IIIT-Kottayam Kathakali mudra dataset (CC BY-SA 4.0) through the
live practice-page evaluator (`window.__detectAndEvaluateImage`). The dataset is not in
this repo; pass its `images/` directory as an argument. All numbers are in-sample: the
same images were used to calibrate the canonical targets.

Requires the FE dev server on `localhost:5173` (`npm run dev`).

```bash
node eval/run_dataset_replay.cjs <dataset images dir> <output json>
node eval/summarize_replay.cjs <output json>     # per-class detection, mastery, scores, gate passes
node eval/thumb_separability.cjs <output json>   # Thripathaka vs Pathaka single-feature cutoffs
```

## Results (`results/`, 2026-11-01)

- `replay_2026-11-01_thumb-cmc-mcp.json`: before the change; `spreadThumbIndex` used the
  thumb metacarpal (landmarks 1→2).
- `replay_2026-11-01_thumb-mcp-ip.json`: after the change; `spreadThumbIndex` uses the
  thumb proximal phalanx (2→3).
- `summary_2026-11-01.txt`: output of both summary scripts for both files.

The two replays are identical apart from `spreadThumbIndex`, which is unscored. Both give
189/192 detected, 153/189 mastered, and Thripathaka 37/40 mastered with 38/40 thumb gates
passing (failures `user1_03`, `user7_11`).

Thripathaka (40 images) against Pathaka (38 images, a thumb-out proxy, since the dataset
has no incorrect Thripathaka attempts), best single cutoff:

| Feature | Accuracy |
|---|---|
| `spreadThumbIndex`, thumb 1→2 vs index 5→6 | 56/78 (71.8%) |
| `spreadThumbIndex`, thumb 2→3 vs index 5→6 | 60/78 (76.9%) |
| `thumb.pip` (IP flexion) | 67/78 (85.9%) |
| `tipToIndexMcp` | 62/78 (79.5%) |
| `radialGapFromIndexMcp` | 72/78 (92.3%) |
