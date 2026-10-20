# Field-level MoM and YoY

**DQ_FIELD_CHANGE_REVIEW**, defined in file **94**, is the final wide comparison
view, like DQ_BASIC_REVIEW. One row represents a successful run, field and actual
monthly POU_DT. Each metric has its current value, absolute and relative MoM/YoY
changes and movement flags in adjacent columns. Numeric Basic and Outliers
combine into one field/month row. File 94 matches the user-supplied deployed
definition received on 2026-10-20, with the reusable DQ_DB schema placeholder.
There is one deployed comparison view; file 95 has been removed.

It reads saved monthly results only. No RDS scan, configuration reload, result
table, stored procedure, shared rule-evaluation call or profiling rerun is needed. Querying
the view calculates changes on demand. No separate SAS comparison runner is needed.
Account-level jumps/reversions, categorical PSI and rule colours are separate work.

## Upgrade the previous comparison layout

1. If you deployed the former file 95, drop its dependent review view first:

   ```sql
   DROP VIEW LAB_T_ORION_MVT.DQ_CHANGE_REVIEW;
   ```

   Skip this statement if that view was never created. It removes only a view,
   not saved profiling results. No other view/table needs dropping.
2. Replace DQ_DB with LAB_T_ORION_MVT in
   `teradata/results/94_dq_field_change_review.sql`. Run the complete REPLACE VIEW
   statement in SQL Assistant, followed by its SELECT grant separately.
   Existing view owners still need grantable SELECT on its dependencies.
3. Query the view directly in Teradata. No SAS execution is required.
4. For subsequent profiling runs, use the current SAS files 00 and 01. The
   controller version is **20261020_PROFILE_ONLY**; MoM/YoY switches and the
   summary macro have been removed. This SAS cleanup does not require
   redeploying an already current view 94.

Excel files and profiling procedures do not need changes.
No rerun of file 00 or configuration load is required. Fresh installations
create only the current file-94 view and its grant; they skip the obsolete-view
cleanup. The table-backed MOM/YOY catalogue also fixes the Teradata error
`A SELECT for a UNION,INTERSECT or MINUS must reference a table`.

## Comparison scope

MoM compares the same field/module/metric with the previous calendar month.
YoY compares with the same calendar month one year earlier. Actual POU_DT gives
the month key, so different snapshot days and leap years do not break matching.
Missing February never makes March compare with January as MoM. YoY does not
require all intervening months or depend on twelve preceding rows.

Only successful monthly results with captured POU_DT are eligible. Overall,
yearly, unknown dates and older results without captured dates are excluded.
Fields/modules come from the saved run, not today's ACTIVE_IND settings. Runs
and projects never borrow comparison values from one another. If numeric and
other types were profiled in separate runs, review their run numbers separately.

## Columns and units

| Example column | Meaning |
|---|---|
| MISSING_RATE | Current fractional rate, such as 0.080000 |
| MISSING_RATE_MOM_CHANGE | Current minus previous calendar month's rate |
| MISSING_RATE_MOM_REL_CHANGE | (current - previous) / previous, as a fraction |
| MISSING_RATE_MOM_FLAG | Movement flag from the supplied 10%/20% thresholds |
| MISSING_RATE_YOY_CHANGE | Current minus the same calendar month's rate last year |
| MISSING_RATE_YOY_REL_CHANGE / MISSING_RATE_YOY_FLAG | Equivalent annual comparison |

This pattern covers total/non-missing/missing counts and missing rate, special
count/rate, outlier valid count/count/rate, distinct count, zero count/rate,
MIN_VALUE, MAX_VALUE, MEAN_VALUE and STDDEV_VALUE. Counts and their changes are
integers. Rates, numeric statistics and their changes have six decimals.
Categorical/identifier populations reuse saved missing-rate counts as in
DQ_BASIC_REVIEW. Unsupported columns stay NULL for the field type.

Columns ending **_CHANGE** are signed differences. For a rate
moving from 0.02 to 0.08, the change is **0.060000**. For mean 100 to 125, the
change is **25.000000**. Columns ending **_REL_CHANGE** divide that difference
by the previous value: the examples give **3.000000** and **0.250000**.
Both are decimal fractions, not values multiplied by 100.
Six-decimal review precision is used throughout;
changes below that precision can disappear. First/missing reference months and
undefined metrics give NULL changes, never zero. A zero baseline still allows
a signed difference. For relative changes, two zero values give zero; a zero
previous value with nonzero current gives NULL. Missing values remain NULL.
Negative values retain the signed previous-value denominator.

The supplied definition adds these flags, using the magnitude of the unrounded
relative calculation (before the six-decimal display cast):

| Flag | Condition |
|---|---|
| NOT_EVALUATED | Reference/current value unavailable or relative calculation NULL |
| ZERO_BASE_MOVEMENT | Previous is zero and current is nonzero |
| HIGH_RELATIVE_MOVEMENT | Absolute relative movement >= 0.20 |
| MODERATE_RELATIVE_MOVEMENT | Absolute relative movement >= 0.10 and < 0.20 |
| LOW_RELATIVE_MOVEMENT | Absolute relative movement < 0.10, including both values zero |

Thresholds apply to every supported metric in this supplied view and are
currently fixed in file 94. They do not update DQ_RULE_RESULT or represent
green/amber/red classifications. Relative values with magnitude >= 1E32 display
NULL because of the decimal range; their flag can still be HIGH_RELATIVE_MOVEMENT.
Rounding may make a displayed relative value look exactly on a threshold even
when its flag uses a value just below it.

MOM_PREVIOUS_POU_DT and YOY_PREVIOUS_POU_DT retain available actual reference dates.
MOM_STATUS and YOY_STATUS summarise only the metrics present for that field:

- EVALUATED: all present metrics have an evaluable signed difference.
- PARTIALLY_EVALUATED: some present metrics can be compared, while others have
  unavailable current/reference values or reference metric rows.
- NOT_EVALUATED: none of the present metrics can be compared.

Unsupported metrics do not contribute to these statuses. A NULL change with a
missing reference date means no usable reference month/metric was found. A NULL
change with a reference date can mean an unavailable metric value. The wide
layout exposes current values, signed/relative changes and movement flags;
per-metric previous values and reason columns are not public columns.
Statuses describe absolute-difference availability, independently of movement
flags: ZERO_BASE_MOVEMENT can coexist with EVALUATED.

## Run and review

MoM/YoY is reviewed directly in Teradata. It has no SAS switch, macro or
separate runner. File 00 runs profiling only; querying view 94 computes both
comparison types from the selected successful run. No profiling rerun is needed
to review completed results.

```sql
SELECT *
FROM LAB_T_ORION_MVT.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=17
ORDER BY FIELD_NAME,POU_DT;
```

For a focused review:

```sql
SELECT FIELD_NAME,POU_DT,
       MISSING_RATE,MISSING_RATE_MOM_CHANGE,MISSING_RATE_MOM_REL_CHANGE,MISSING_RATE_MOM_FLAG,
       MISSING_RATE_YOY_CHANGE,MISSING_RATE_YOY_REL_CHANGE,MISSING_RATE_YOY_FLAG,
       SPECIAL_RATE,SPECIAL_RATE_MOM_CHANGE,SPECIAL_RATE_YOY_CHANGE,
       OUTLIER_RATE,OUTLIER_RATE_MOM_CHANGE,OUTLIER_RATE_YOY_CHANGE,
       MEAN_VALUE,MEAN_VALUE_MOM_CHANGE,MEAN_VALUE_YOY_CHANGE,
       MOM_STATUS,YOY_STATUS
FROM LAB_T_ORION_MVT.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=17
ORDER BY FIELD_NAME,POU_DT;
```

Always filter project/run, optionally field. Comparisons are computed from saved
results on demand, so runtime depends on result volume, filter pushdown and the
Teradata workload/plan. DQ_BASIC_REVIEW remains the profiling-only review.

## Verification and independence

The development team's behavior was reviewed as a reference only. This engine's
comparison SQL was written independently; no implementation was copied. No
source/customer data, account IDs or credentials were added.

`node DQ_ENGINE/tools/check_field_changes.mjs` executes the SQL with SQLite date
and decimal adaptations. It checks exact calendar gaps, all types, specials and
outliers, missing/zero/negative values, large values, source retention and run/
project isolation. It verifies every wide current/absolute/relative/flag cell against internal
comparison rows, plus dates, statuses, module merging and checks that the
retired SAS comparison API is absent. Cases include both-zero values, zero-to-nonzero
movements, exact 10%/20% boundaries and negative movements. The isolated optional Teradata fixture
`tests/test_field_changes.sql` uses the new wide layout; each assertion must
return zero rows. No fixture is required to review completed production results.

SAS profiling macro execution, Teradata compilation/grants, numeric edge cases,
query plans and full RDS runtime remain unverified in this workspace.
