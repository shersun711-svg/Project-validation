# RDS numeric jump sensitivity: agreed first stage

Use [09_numeric_jump_sensitivity.sas](../sas/09_numeric_jump_sensitivity.sas)
for the 12 numeric fields remaining after the two month counters were reviewed
separately. This stage assesses **numeric jumps only**, not reversions, return
tolerances or OR-versus-AND return rules. It supersedes the older file 08's
166-configuration plan for this stage. File 08 is retained as an earlier plan.

## Run order

1. Open/run `01_dq_controller.sas`.
2. Open/run `07_account_checks.sas` in the same SAS session to load its macros.
   Required helper version: `20261023_PERSIST_RESULTS`.
3. Open file 09. Confirm `td_server`, `td_authdomain`, `dq_database`,
   `jump_project=RDS` and `jump_baseline_run=20`. Set `jump_output_file` to a
   **new XLSX filename on the SAS server**. Existing files are rejected.
4. Keep the source fixed for the assessment and run file 09. Do not execute
   the ordinary file 06 runner or the older sensitivity file 08 for this stage.
5. Require `dq_jump_status=SUCCEEDED` in the SAS log and a COMPLETE Manifest.
   Share the exported workbook for review. A partial/failed workbook is not
   completed evidence; discard it and resolve the first reported error.

The runner takes the original source mapping, dates and settings from saved
account run 20. No configuration reload, workbook edit or database deployment
is needed if the existing account helper is available. It requires the agreed
12 unique non-counter fields and verifies their original jump settings against
the plan below. A different captured configuration requires review rather than
silently applying this plan to different thresholds.

## Three scenarios per field

Absolute limits use original x0.5 / x1 / x2; relative limits use original
x0.5 / x1 / x1.5. They move together, yielding **36 field/scenario combinations**.

| Field | Absolute lower / original / higher | Relative lower / original / higher |
|---|---|---|
| CHQ_LMT_UTIL_AVG_BAL_6M | 10 / 20 / 40 | 25% / 50% / 75% |
| CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT | 500 / 1,000 / 2,000 | 25% / 50% / 75% |
| CUST_ALL_MT_MAX_DELINQ_BASE_RT | 0.5 / 1 / 2 | 25% / 50% / 75% |
| MV_PCKG_AVG_PAY_TO_BAL_L6M_RT | 0.5 / 1 / 2 | 25% / 50% / 75% |
| MV_PCKG_BAL_AMT_L6M_TO_L7T12M_RT | 0.25 / 0.5 / 1 | 25% / 50% / 75% |
| MV_PCKG_LOAN_TO_INC_RT | 0.5 / 1 / 2 | 25% / 50% / 75% |
| MV_PCKG_REPAY_TO_INC_RT | 0.05 / 0.1 / 0.2 | 25% / 50% / 75% |
| MV_PCKG_SAV_DEP_TO_BALANCE_RT | 5 / 10 / 20 | 25% / 50% / 75% |
| MV_PCKG_SAV_DEP_TO_REPAY_RT | 2.5 / 5 / 10 | 25% / 50% / 75% |
| PCKG_BALANCE_AMT | 5,000 / 10,000 / 20,000 | 25% / 50% / 75% |
| PCKG_BOVO_VAL_AMT | 12,500 / 25,000 / 50,000 | 10% / 20% / 30% |
| PCKG_REPAY_AMT | 125 / 250 / 500 | 25% / 50% / 75% |

These are provisional sensitivity brackets around the original screens,
not calibrated materiality or acceptance limits. Upstream utilisation and
delinquency scales still need confirmation. The rolling-balance ratio's
attestation description conflicts with its formula and also needs confirmation.
Those uncertainties are retained in the Baseline/Scenarios/Manifest metadata;
running the scenarios does not resolve them.

The two month counters are excluded. Their progression/reset rules remain in
the separate counter-review script and evidence note.

## Jump definition and execution

A jump requires valid observations for the same account in consecutive months:

- absolute movement `ABS(current-previous) >= absolute threshold`; **AND**
- absolute relative movement `ABS((current-previous)/ABS(previous)) >= relative threshold`.

For previous value zero, the relative test is bypassed and the absolute
threshold determines the jump. Both increases and decreases are assessed for
these monetary/ratio fields. Missing and captured special values are excluded.
Account entry/exit and calendar gaps do not become numeric movements.

One session-local history is staged per field using the existing helper; all
three scenarios use that same history. The helper also computes its ordinary
flags internally, but this runner consumes only numeric jumps. Return settings
are loaded solely to satisfy that helper's existing interface, not tested or
exported. Only aggregate results leave Teradata; no account IDs are exported.
No permanent source, engine results, configuration or run log is modified.

This runs 12 field-history constructions, not 36 separate source histories.
Scenario aggregation still adds work; full-history runtime and spool are
unverified. Keep the source fixed across fields. Empty histories, duplicate or
missing account keys, excessive key/value lengths, and changed whole-month
coverage versus saved run 20 stop completion.

## Workbook and interpretation

| Sheet | Purpose |
|---|---|
| Baseline | Original settings, field group/unit notes and source/window provenance |
| Scenarios | The 36 explicit absolute/relative threshold pairs |
| Monthly | 13 review columns: field/month/scenario, thresholds, total/eligible counts, jump count/rate, original count, difference and added/removed events; sorted by FIELD_NAME, POU_DT, SCENARIO_ID |
| Totals | 36 field/scenario summaries, pooled eligible-pair rates and reference-warning months |
| Manifest | Assessment UUID, completion, baseline reference and scope |

The expected window in existing evidence is Jan 2005-Mar 2026 (255 months).
If all fields still have that coverage, Monthly contains 9,180 rows.
`TOTAL_COUNT` includes all observed account values; `VALID_PAIR_COUNT` includes
only valid consecutive comparisons. Rates are fractions, not percentage points.
Totals pool numerator/denominator across months; they do not average monthly rates.

`BASELINE_JUMP_COUNT`/`original_jumps` are recalculated using ORIGINAL settings
on the same staged source. The historical run-20 count and per-month reference status are retained internally in `WORK.DQ_JUMP_MONTHLY`, but omitted from the exported Monthly sheet.
`JUMP_DIFFERENCE = JUMP_ADDED - JUMP_REMOVED` relative to the recalculated
original. Added/removed counts compare individual account-month flags, not
just aggregate volumes. They are events, not unique accounts.

The lower scenario must have at least as many flags as original; the higher
scenario must have no more. Original must add/remove zero flags. All scenarios
for a field/month have the same eligible population.

Internal reference statuses compare monthly dates, total/eligible counts and original
jump counts against saved run 20. `MATCHED_SUMMARY` means these controls agree;
it does not prove identical source records. Other statuses are
`DIFFERENT_SUMMARY`, `DIFFERENT_SNAPSHOT`, `INCOMPLETE_REFERENCE` and
`NO_SAVED_REFERENCE`. Review warnings before attributing differences from the
historical run to tolerance choices. Totals retains `reference_warning_months`; if nonzero, inspect the internal Monthly reference status in SAS. Do not sum warning months across scenarios.

For review, start with Totals, then identify months whose jump count/rate
changes most. Assess whether previously important clusters remain evident and
use selected examples/attestation evidence to interpret them. Stability of
counts alone does not establish correct data, and fewer flags do not justify
a threshold. Return-tolerance and reversion assessment remains a later stage.

## Verification

Local synthetic checks passed for all 12 saved baseline settings and all 36
scenarios, using the actual aggregation SQL with SQLite dialect adaptations.
Checks cover production-rule equivalence, AND gates, inclusive boundaries,
both directions, zero prior, missing/special exclusions, calendar eligibility,
nested counts, added/removed reconciliation and saved-reference warnings.
No SAS runtime or live Teradata compilation/execution was available here.
