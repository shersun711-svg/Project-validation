# Account-level numeric sensitivity: all 14 fields

Use [08_account_sensitivity.sas](../sas/08_account_sensitivity.sas) to assess
alternative jump and return thresholds across all 14 numeric fields in the
successful RDS account run 20. It reads captured settings from that run and
reuses the production account-history helper. It does not alter the normal
account runner, loaded project configuration, saved results or run logs.

## Run order

1. Open/run [01_dq_controller.sas](../sas/01_dq_controller.sas).
2. Open/run [07_account_checks.sas](../sas/07_account_checks.sas) in the same SAS
   session. This loads macros; do not execute the ordinary file 06 runner.
3. Open file 08. Confirm connection/schema, project=RDS and baseline run=20.
   Set `sensitivity_output_file` to a NEW `.xlsx` path accessible to the SAS
   server. Existing output files are rejected to preserve assessment history.
4. Keep the source fixed for the complete assessment, preferably using an
   agreed frozen source/build. Run file 08 once; require
   `dq_sensitivity_status=SUCCEEDED` in the SAS log.
5. Retain the exported workbook. Share aggregate Monthly/Totals/Scenarios
   outputs for analysis, with the Manifest and Baseline sheets for provenance.

No AccountFields workbook edits or profiling reload are required. The source,
account/date fields, full date window and four baseline thresholds come from
saved account run 20. The original source version is not recreated. The helper
uses that run's saved special-value snapshot, not today's active special list.
The expected window in the current evidence is January 2005-March 2026.

The runner expects 14 unique numeric fields with consistent source/window
metadata, complete thresholds and unique field/month reference rows. The two
named counters are validated against their saved 3/0/1/0 settings before their
separate scenario grid is applied. A different baseline configuration requires
review of the plan rather than silently treating it as the same assessment.

## Scenario plan

For the 12 fields other than the two month counters:

- **Jump stage:** absolute threshold factors 0.5/1/2 crossed with relative
  threshold factors 0.5/1/2, giving nine combinations. Return tolerances stay
  at baseline. The baseline is `J_A2_R2`.
- **Return stage:** keep both jump thresholds at baseline. Separately halve or
  double absolute return tolerance, then halve or double relative return
  tolerance. The other return tolerance stays at baseline, giving four more
  combinations. IDs are `R_ABS1`, `R_ABS3`, `R_REL1`, `R_REL3`.

For `MTHS_SINCE_DETERIORATION_CNT` and `MV_CUST_ALL_MTHS_SNC_DIST_CNT`:

- **Jump stage:** absolute limits of 2/3/6 months; relative remains zero.
  One-month increments are not introduced as a new generic jump threshold.
- **Return stage:** keep the baseline jump limits, and test absolute return
  tolerances 0.5 and 2, with relative return tolerance zero. For integer-valued
  counters, tolerance 0.5 requires an exact integer return. The baseline
  tolerance is 1. Counter resets can be legitimate and need interpretation.

Total: **166 field/scenario combinations**: 12 x 13 plus 2 x 5. If each field
still has 255 populated months, Monthly should contain 42,330 rows. Missing
whole-month coverage relative to the saved run stops completion. A repeated
counter grid for zero relative thresholds is deliberately avoided.

### Baseline settings evidenced in the current numeric results

Absolute settings are in each field's saved units; relative settings are
fractions. This records the existing screen, not approved materiality limits.

| Field | Absolute jump | Relative jump | Absolute return | Relative return |
|---|---:|---:|---:|---:|
| `CHQ_LMT_UTIL_AVG_BAL_6M` | 20 | 0.5 | 2 | 0.05 |
| `CUST_ALL_C_PYMTS_CR_AVG_L6M_AMT` | 1000 | 0.5 | 100 | 0.05 |
| `CUST_ALL_MT_MAX_DELINQ_BASE_RT` | 1 | 0.5 | 0.1 | 0.05 |
| `MTHS_SINCE_DETERIORATION_CNT` | 3 | 0 | 1 | 0 |
| `MV_CUST_ALL_MTHS_SNC_DIST_CNT` | 3 | 0 | 1 | 0 |
| `MV_PCKG_AVG_PAY_TO_BAL_L6M_RT` | 1 | 0.5 | 0.1 | 0.05 |
| `MV_PCKG_BAL_AMT_L6M_TO_L7T12M_RT` | 0.5 | 0.5 | 0.05 | 0.05 |
| `MV_PCKG_LOAN_TO_INC_RT` | 1 | 0.5 | 0.1 | 0.05 |
| `MV_PCKG_REPAY_TO_INC_RT` | 0.1 | 0.5 | 0.01 | 0.05 |
| `MV_PCKG_SAV_DEP_TO_BALANCE_RT` | 10 | 0.5 | 1 | 0.05 |
| `MV_PCKG_SAV_DEP_TO_REPAY_RT` | 5 | 0.5 | 0.5 | 0.05 |
| `PCKG_BALANCE_AMT` | 10000 | 0.5 | 1000 | 0.05 |
| `PCKG_BOVO_VAL_AMT` | 25000 | 0.2 | 2500 | 0.05 |
| `PCKG_REPAY_AMT` | 250 | 0.5 | 25 | 0.05 |

## Calculation and population controls

A numeric jump requires valid consecutive-month values and both the absolute
and relative limits. When the previous value is zero, only the absolute limit
is applied. A numeric reversion additionally needs valid values in three
consecutive calendar months, a reversal of direction on the second leg, and:

`ABS(next - previous) <= MAX(return_abs, ABS(previous) * return_rel)`

Only the first leg must meet the jump limits. Flags belong to the current
(middle) month. Missing/special values are excluded from valid movements.
Jump rates use valid consecutive pairs; numeric-reversion rates use valid
consecutive triples. Undefined rates remain missing rather than becoming zero.
The current parameter values are provisional screens; their units and business
interpretation still need consideration, particularly for ratios/counters.

The runner builds one session-local `DQ_AT_CHECK` history per field, then
assesses its scenarios before dropping it. Only aggregate monthly results are
transferred to SAS. It does not export identifiers or individual amounts and
does not call the production detail-persistence helper. Source scans/history
construction occur once per field, although scenario evaluation still adds
work. Full-history Teradata runtime and spool requirements are unverified.

Null account keys, duplicate account/months, invalid lengths or empty field
histories stop the assessment. All scenarios for a field use the same staged
history. The analyst must still keep the source unchanged across the 14 fields.

## Output and baseline reconciliation

| Sheet | Contents |
|---|---|
| Manifest | Assessment UUID, project, baseline run, completion and provenance note |
| Baseline | The 14 captured field settings, source mapping and date window |
| Scenarios | Every field/configuration and the changed parameter |
| Monthly | Counts, eligible populations, rates, flags added/removed versus the recalculated baseline, and saved-reference status |
| Totals | Counts across months and rates weighted by eligible account-month comparisons, not averages of monthly rates |

`JUMP_ADDED/REMOVED` and `REVERSION_ADDED/REMOVED` count individual account-month
flag changes relative to the baseline applied to the SAME staged source. This
avoids interpreting equal total counts as proof that the same records flagged.
These are event counts; do not interpret them as distinct customers/accounts
or add them across fields to estimate a unique population.

`REFERENCE_STATUS` compares recalculated baseline totals, eligible populations,
flags and actual monthly snapshot dates with saved run 20:

- `MATCHED_SUMMARY`: these summary controls agree; this does not prove identical
  source records, populations or values at record level.
- `DIFFERENT_SUMMARY`, `DIFFERENT_SNAPSHOT`, `INCOMPLETE_REFERENCE` or
  `NO_SAVED_REFERENCE`: investigate before attributing a difference from the old
  run to tolerance choices. Current-source scenarios can still be compared
  internally, but should not be presented as reproducing the original run.

Check `reference_warning_months` in Totals. Do not sum it across scenarios:
each scenario repeats the field/month reference check. A COMPLETE Manifest is
written last. If export fails, discard the partial file; WORK summaries may
remain. SUCCEEDED means the assessment executed, not that fields passed DQ.

## Review the sensitivity results

1. Check baseline/reference controls before assessing threshold effects.
2. Compare each field's counts/rates across the absolute-relative jump grid.
3. Identify whether the same important field/month clusters remain prominent.
4. Compare added/removed events and inspect the largest changes in counts or
   rates. Retain the reason for accepting, deprioritising or querying examples.
5. Assess return settings separately; jump counts must stay unchanged in this
   stage. Tighter return tolerances may have no effect when the other tolerance
   dominates the MAX rule; that is a meaningful result, not necessarily a bug.
6. Plot flag rate against each threshold, holding the other fixed. Three levels
   give an initial shape, not an objectively optimal cutoff. Refine the grid
   only where results/business meaning justify it.

The assessment can support robustness statements in the final validation
report. Do not select limits simply to reduce flags or claim confirmed defects
from sensitivity counts. Stable aggregate findings may still involve different
records; the added/removed columns help identify that case. The output does not
replace source-level review of selected examples or CDAO business explanation.

## Verification

Local synthetic checks passed for all 14 baseline field configurations and 166
scenarios using the checked-in aggregation SQL with SQLite dialect adaptations.
They cover equivalence to the production jump/reversion expressions, inclusive
boundaries, zero baselines, direction reversal, missing/special eligibility,
monotonicity, added/removed reconciliation and saved-reference warning states.
No SAS runtime or live Teradata compilation/execution was available here.
The analyst must verify execution and inspect any compiler/runtime errors in
the lab. No empirical sensitivity conclusion has yet been drawn.
