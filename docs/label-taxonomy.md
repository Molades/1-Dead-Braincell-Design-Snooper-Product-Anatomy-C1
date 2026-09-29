# Measured vs Inferred

| Layer | Source | Label |
|---|---|---|
| 1. Facts | Script reads DOM/computed styles; deterministic | **Measured** |
| 2. Rules | Threshold rule over facts (WCAG, 44px target) | **Measured**; judgment laws (Hick, Gestalt) → **Inferred** |
| 3. Interpretation | Intent, hierarchy, strategy, trade-offs | **Inferred** |

Rules of the road
- Measured values are rendered from `Facts`, never from model text.
- A `measured` Claim must list `evidence` paths that resolve in `Facts`.
- An `inferred` trade-off must cite at least one Measured fact.
- "Can't measure" is a first-class state (e.g. contrast over images/gradients), never a guess.
