# Field-level MoM and YoY

DQ_FIELD_CHANGE_REVIEW compares saved monthly profiling metrics within one
successful run and project. It reads existing result/log/number tables; no RDS
scan, configuration reload, new result table, stored procedure or rule evaluator
is added. Querying it computes the requested comparisons. No comparison history
needs separate cleanup: deleting the source results removes their comparisons.

This is population-level field analysis. Account-level jumps/reversions and
categorical PSI remain separate future modules. No red/amber/green thresholds
are applied to changes: such thresholds have not been agreed.

## Comparisons and metrics

MoM pairs the same field/module/metric with the previous calendar month. YoY
pairs it with the same calendar month one year earlier. Compare year/month keys
from actual POU_DT; different snapshot days and leap years do not break matching.
Missing February never makes March compare with January as MoM. YoY does not
require all intervening months or depend on twelve preceding rows.

Supported metrics, when present in the successful profiling run:

| Metrics | Types/modules |
|---|---|
| Total, non-missing and missing counts; missing rate | All Basic types |
| Special count/rate | Numeric and categorical Basic |
| Zero count/rate; MIN_VALUE, MAX_VALUE, MEAN_VALUE, STDDEV_VALUE | Numeric Basic |
| Distinct count | Categorical and identifier Basic |
| Outlier count, valid count and rate | Numeric Outliers, including outliers-only runs |

Categorical/identifier total and non-missing counts reuse their saved missing-rate
denominator/numerator, as in DQ_BASIC_REVIEW. Unsupported statistics and outlier
bounds produce no comparison rows. Only the fields/modules actually profiled in
the selected run are compared; today's Excel ACTIVE_IND settings do not alter
historical scope. OVERALL, YEARLY and unknown-date groups are excluded. The run
must have monthly results with captured POU_DT from the current date upgrade.
Older metrics without POU_DT remain unchanged and are excluded from comparisons.

## Result values

One row represents a field/module/metric/month and comparison type (MOM or YOY).
RUN_ID, short RUN_NUMBER and PROJECT_ID provide traceability. POU_DT and
PREVIOUS_POU_DT retain actual source reporting dates, rather than invented month
ends. METRIC_NAME uses the review names such as MISSING_RATE and MEAN_VALUE.

| Column | Meaning |
|---|---|
| CURRENT_VALUE / PREVIOUS_VALUE | Normalized metric values at six-decimal review precision |
| ABSOLUTE_CHANGE | Signed current minus previous, in the metric's units; it is not ABS() |
| RELATIVE_CHANGE | (current - previous) / previous, as a decimal fraction |
| RATE_CHANGE_PP | Rate difference times 100, in percentage points; NULL for counts/statistics |
| IS_RATE | Y for fractional rates; N for counts/statistics |
| COMPARISON_STATUS | EVALUATED or NOT_EVALUATED, without a rule classification |
| REASON | Missing comparison/value, or why relative change is unavailable |

For a rate moving from 0.02 to 0.08, ABSOLUTE_CHANGE=0.060000,
RATE_CHANGE_PP=6.000000 and RELATIVE_CHANGE=3.000000 (a 300% relative increase).
For mean 100 to 125, ABSOLUTE_CHANGE=25.000000 and RELATIVE_CHANGE=0.250000.
Generic value columns have six fractional places even for count metrics.

Comparisons intentionally use six-decimal normalized values, matching the final
review display. Changes below that precision can disappear. When the previous
value is zero, signed difference remains evaluable but relative change is NULL
with a reason. Negative baselines retain the signed denominator, so assess the
signed difference alongside the relative change. An unrepresentable relative
change (magnitude >= 1E32) is NULL with a reason. Rate change in percentage points
is a difference, rather than a percentage change.

The first month, missing reference months and unavailable values remain visible
as NOT_EVALUATED with a reason. NULL statistics never become zero. An evaluable
zero-baseline row can have a reason despite COMPARISON_STATUS=EVALUATED because
only its relative change is undefined. These statuses are separate from
DQ_RULE_RESULT; no existing rule assessments or profiling results are changed.

## Deploy on an existing engine

1. Replace DQ_DB with the approved schema, currently LAB_T_ORION_MVT, in
   `teradata/results/94_dq_field_change_review.sql`. Run the complete REPLACE VIEW
   as one statement in SQL Assistant, then its SELECT grant separately.
   The view owner needs grantable SELECT on its existing dependencies, as with
   other engine views. There is no EXECUTE PROCEDURE grant for this view.
2. Run the latest `sas/01_dq_controller.sas` in your SAS session. Require controller
   version `20261015_FIELD_CHANGES`.
3. Open `sas/06_run_dq_changes.sas`, enter the short number of an existing
   successful RDS run, and select mom=Y/N and yoy=Y/N. Run the whole file.
   No Excel reload or profiling rerun is needed when dated monthly results exist.
4. Require dq_change_status=SUCCEEDED and inspect WORK.DQ_CHANGE_SUMMARY.
   It reports fields, metric comparisons and evaluated/not-evaluated counts for
   each selected comparison type. It imports summaries only, not all details.

This upgrade does not require setup scripts or changes to profiling procedures.
Existing table grants remain as deployed. For a new installation, deploy view 94
after the current metric/run/number schema and POU_DT column migration.

For future profiling runs, set mom=Y and/or yoy=Y in file 00 to request comparison
summaries after profiling succeeds. They default to N for existing workflows.
Use file 06 for comparisons alone; file 00 still requires a profiling module.
SAS macro callers may use:

```sas
%run_dq_changes(project=RDS,run_number=8,mom=Y,yoy=Y);
```

Use your actual run number. Both switches N returns SKIPPED with no database
read. Invalid switches, unknown/wrong-project or unsuccessful runs are rejected.
No dated monthly results also fails clearly. A comparison read failure leaves
the original profiling run and dq_status unchanged; inspect dq_change_status
and dq_change_error separately. Comparison queries do not write module/run logs.

## Review details in Teradata

Always filter project, run number and comparison type. Avoid querying all history
at once: the view derives comparisons on demand, so runtime depends on saved
result volume, filter pushdown and the Teradata plan/workload.

```sql
SELECT FIELD_NAME,MODULE_NAME,POU_DT,PREVIOUS_POU_DT,METRIC_NAME,
       CURRENT_VALUE,PREVIOUS_VALUE,ABSOLUTE_CHANGE,RELATIVE_CHANGE,
       RATE_CHANGE_PP,COMPARISON_STATUS,REASON
FROM LAB_T_ORION_MVT.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=8 AND COMPARISON_TYPE='MOM'
ORDER BY FIELD_NAME,POU_DT,METRIC_NAME;
```

Change MOM to YOY for annual comparisons over monthly snapshots. Filter METRIC_NAME
to MISSING_RATE, SPECIAL_RATE or OUTLIER_RATE for an initial quality review.
DQ_BASIC_REVIEW remains the profiling review; it is not widened with comparison
columns. No Excel export or category-frequency reporting is introduced.

## Validation and independence

The development team's files were inspected for behavior only. Their numeric
comparisons reuse monthly profiles, enforce calendar gaps and keep changes
separate from profiling. Their categorical comparisons also use saved frequencies
for PSI and other distribution measures. This implementation was written
independently for this engine's existing result schema and does not copy their
code or include those additional distribution measures.

Run `node DQ_ENGINE/tools/check_field_changes.mjs` locally. It executes the actual
view SELECTs after narrow SQLite date/decimal adaptations, checking month/year
gaps, year boundaries, all field types, specials/outliers, zero/NULL baselines,
rate units, large values, and project/run isolation. SAS checks verify source
structure only. Use `tests/test_field_changes.sql` optionally in an isolated
Teradata test engine; every assertion must return zero rows.

There is no SAS/Teradata connection in this workspace. View compilation, grants,
numeric rounding/ranges, macro execution and full RDS query runtime require
server validation. No source data, account IDs or credentials were added.
