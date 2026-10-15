# Shared rule evaluation

SP_DQ_CLASSIFY remains the single evaluation step called by the existing runner
once selected profiling modules finish, before the run is marked SUCCEEDED.
The existing DQ_COLOUR_RULE view holds its threshold logic. It reads only stored
percentage metrics and the thresholds captured in DQ_RUN_LOG. It does not query
the source, recalculate metrics or change Excel/SAS test selection.

The classifier now saves decisions in DQ_RULE_RESULT instead of updating metric
colours. Numeric, categorical, date, identifier, special-value and outlier
calculations are unchanged. MIN, MAX, MEAN, STDDEV and other descriptive metrics
produce no rule row. An existing IS_PERCENTAGE=Y metric uses the shared
lower-is-better percentage rule; this change adds no other rule family.

## Simple storage

| Columns | Meaning |
|---|---|
| RUN_ID, PROJECT_ID | Run and project identity |
| FIELD_NAME, MODULE_NAME | Field and profiling module |
| PERIOD_LEVEL, POU_DT | Reporting level and latest actual source date in the group; overall/unknown dates are NULL |
| PERIOD_VALUE | Internal period key, retained for unique keys and compatibility |
| RULE_NAME | Existing percentage metric name, e.g. MISSING_RATE_PCT or OUTLIER_RATE_PCT |
| OBSERVED_VALUE | Calculated percentage copied unchanged from the profiling result |
| GREEN_THRESHOLD, RED_THRESHOLD | Threshold snapshots used for this run |
| STATUS | GREEN, AMBER, RED or NOT_EVALUATED |
| REASON | Why evaluation was impossible; NULL for evaluated decisions |

There is one decision per run/field/module/period/rule, enforced by a unique
index. No second metric-name column, raw counts, field type, run number, rule
version, duplicate evaluator or rule-review view is added. The original metric
row retains exact numerator/denominator for audit. Run timestamps and the short
run number remain in DQ_RUN_LOG/DQ_RUN_NUMBER, rather than being copied here.

## Decisions

- GREEN: percentage < green threshold.
- AMBER: green threshold <= percentage < red threshold.
- RED: percentage >= red threshold.
- NOT_EVALUATED: population/counts, observed percentage or run thresholds are
  missing or invalid. REASON identifies the problem. Empty eligible populations
  are not GREEN.

As before, boundary comparisons use numerator * 100 versus denominator * threshold
in DECIMAL arithmetic. OBSERVED_VALUE retains the stored display precision; a
percentage rounded up to a boundary can therefore retain the colour justified
by its exact counts. No metric is recalculated. Current Excel settings are not
consulted during evaluation; a run uses its captured thresholds.

Evaluation requires an existing RUNNING run with matching metric project IDs.
A short transaction locks the active run row and replaces only that run's rule
rows atomically; repeated evaluation is safe while the run is RUNNING. The runner cleans
rule rows alongside metrics on failure/retry, and publishes only after evaluation
succeeds. Completed/failed/unknown runs cannot be independently reclassified.
Completed UUIDs and historical decisions are not overwritten.

## Compatibility and history

DQ_METRIC_RESULT and its legacy DQ_COLOUR column are retained. New runs leave
that column NULL; their classifications are stored only in DQ_RULE_RESULT.
DQ_COMPLETED_RESULT retains its existing column order/names, reading new statuses
from the rule table and falling back to the saved metric colour for older runs.
DQ_RUN_SUMMARY retains its existing interface. DQ_BASIC_REVIEW is the final
profiling view: it omits colour columns and formats counts as integers,
fractional rates to six decimals (without the _PCT suffix) and descriptive values
to six decimals. Rule OBSERVED_VALUE and thresholds retain percentage units. The casts
affect display only; stored metric precision and rule evaluation are unchanged.
SAS status/summary imports, Excel configuration and procedure arguments require
no change. Direct consumers of DQ_METRIC_RESULT.DQ_COLOUR must use the completed
view or rule table for new classifications.

Historical rule rows are not invented or recalculated. Existing metrics remain
in the metric table and completed views; DQ_RULE_RESULT contains runs evaluated
after deployment. No history reset, reporting or Excel export is required.

For direct rule-table review, join the run log and require SUCCEEDED. This is a
read-only query, not an additional reporting object:

```sql
SELECT N.RUN_NUMBER,Q.FIELD_NAME,Q.MODULE_NAME,Q.PERIOD_LEVEL,Q.POU_DT,
       Q.RULE_NAME,Q.OBSERVED_VALUE,Q.GREEN_THRESHOLD,Q.RED_THRESHOLD,
       Q.STATUS,Q.REASON
FROM LAB_T_ORION_MVT.DQ_RULE_RESULT Q
JOIN LAB_T_ORION_MVT.DQ_RUN_LOG L
  ON Q.RUN_ID=L.RUN_ID AND Q.PROJECT_ID=L.PROJECT_ID
LEFT JOIN LAB_T_ORION_MVT.DQ_RUN_NUMBER N ON Q.RUN_ID=N.RUN_ID
WHERE L.STATUS='SUCCEEDED' AND Q.PROJECT_ID='RDS' AND N.RUN_NUMBER=27
ORDER BY Q.FIELD_NAME,Q.MODULE_NAME,Q.PERIOD_LEVEL,Q.POU_DT,Q.RULE_NAME;
```

## Upgrade an existing engine

Use [the current review/date upgrade](REVIEW_UPDATE.md) after reporting levels
are installed. It includes the new period mapping, rule date column and required
procedure/view recompilation. Fresh installations follow the complete deployment
sequence in README.md. No database deployment is performed from this workspace.

## Focused checks

Locally, run node DQ_ENGINE/tools/check_rule_results.mjs and
node DQ_ENGINE/tools/check_review_views.mjs. They execute the actual evaluator,
INSERT and completed-view SELECTs on synthetic SQLite data after narrow dialect
adaptation. They verify boundary equality, pre-rounding decisions, absent/invalid
inputs, snapshot thresholds, idempotence, project/run/period isolation, unchanged
measurements and historical view compatibility. Guard SELECTs and cleanup source
structure are checked; SPL IF/SIGNAL, transactions, grants and server failure
cleanup are not executed locally.

In an isolated Teradata test engine, tests/test_colour.sql exercises the shared
step and persistence without scanning a profiling source. Assertions must return
zero rows. Separately verify that a classifier CALL on a completed, FAILED or
unknown ID raises U0050 without changing decisions, and cross-project metrics
raise U0051 before deletion. Run the normal failure/retry fixtures to verify rule
cleanup with metrics. These supplied database tests have not been run here.
