# Compare the final review with development

[compare_numeric_development.sql](../tests/compare_numeric_development.sql)
compares saved **DQ_BASIC_REVIEW** results with the development team's numeric
result table. It is read-only: no profiling rerun, source-data scan, new tables,
SAS changes or Excel changes are needed. The comparison was written independently
using the supplied development schema and metric definitions as references.

## Run in SQL Assistant

1. Download the SQL file. Replace `DQ_DB` with `LAB_T_ORION_MVT` in your copy.
2. Set `OUR_RUN_NUMBER` at the top to your successful run; default **16**.
   Development `DEV_RUN_ID` is already **1**, as confirmed. These identifiers
   refer to different engines and do not need to have the same number.
3. Confirm SELECT access to
   `LAB_P_DECISION_SCIENCE.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT`.
4. Submit the complete `WITH ... SELECT` statement as one request.

## Read the output

Every row compares one metric for one field and period. Both rates are already
**fractions**: `0.050000` means 5%. There is no additional division by 100.

| FIELD_NAME | METRIC_NAME | OUR_VALUE | DEV_VALUE | DIFFERENCE | STATUS |
|---|---|---:|---:|---:|---|
| AMOUNT | MISSING_RATE | 0.050000 | 0.050000 | 0.000000 | MATCH |
| AMOUNT | ZERO_COUNT | 12.000000 | 10.000000 | 2.000000 | DIFFERENT |

`DIFFERENCE = OUR_VALUE - DEV_VALUE`. Values and differences display with six
decimal places. `POU_DT` and `DEV_POU_DT` show both actual monthly source dates;
our overall date is NULL. The run numbers, project and explanation remain at
the right for traceability. Results are ordered by field, level, date and metric.

All comparisons are shown by default. To focus on exceptions, change
`SHOW_MATCHES` from `Y` to `N` at the top. There are no separate summary rows.
`NOT_EVALUATED` explains missing/invalid inputs and is never a pass. With
`SHOW_MATCHES=N`, an empty output means no exceptions were found in scope.

## Scope and comparison rules

Only numeric fields captured in the chosen successful engine run are included.
Successful module logs determine whether Basic, Outliers or both are compared.
Overall and enabled monthly results are included. **Yearly, categorical,
identifier, date, rule decisions and MoM/YoY are outside this numeric comparison.**
The supplied development suite has no yearly output.

| Review metric | Development column/expression |
|---|---|
| TOTAL_COUNT | row_count |
| NON_MISSING_COUNT | row_count - missing_count |
| MISSING_COUNT / MISSING_RATE | missing_count / missing_pct |
| ZERO_COUNT / ZERO_RATE | zero_count / zero_pct |
| SPECIAL_COUNT / SPECIAL_RATE | special_count / special_pct |
| MIN_VALUE / MAX_VALUE | min_value / max_value |
| MEAN_VALUE / STDDEV_VALUE | mean_value / stddev_value |
| OUTLIER_LOWER_BOUND / OUTLIER_UPPER_BOUND | outlier_value_lower / outlier_value_upper |
| OUTLIER_COUNT / OUTLIER_RATE | outlier_count / outlier_pct |
| OUTLIER_VALID_COUNT | valid_count |

Counts compare exactly. Development minimum/maximum are rounded to six decimal
places, then compared exactly with the review values. Development mean,
population standard deviation and outlier bounds are also rounded to six places;
these compare using `absolute tolerance + relative tolerance * ABS(dev value)`.
Defaults are `0.000001` absolute and `0.000000000001` relative. Rates use absolute
tolerance `0.000001`. NULL matches NULL, but is never silently converted to zero.
This is a comparison at **review precision**, not a full-precision audit.

## Investigate exceptions

- `DIFFERENT`: unequal values, a NULL mismatch or an exceeded tolerance.
- `MISSING_ENGINE`, `MISSING_DEVELOPMENT`, `MISSING_BOTH`: an expected field/period
  is absent. The expected period domain is the union of saved results; a month
  absent from both cannot be discovered without reading the source.
- `DUPLICATE_ENGINE` / `DUPLICATE_DEVELOPMENT`: multiple rows for the comparison
  key; values are withheld rather than silently choosing one.
- `PERIOD_SCOPE_MISMATCH`: development has several actual snapshot dates within
  one engine month. No statistics are pooled. Our engine groups by month,
  while development groups by snapshot date.
- `SNAPSHOT_MISMATCH`: actual monthly reporting dates differ.
- `POPULATION_MISMATCH` / `POPULATION_UNAVAILABLE`: total row counts differ or
  required totals are absent. An Outliers-only review has no Basic totals,
  so its total-population equality cannot be verified by this comparison.
- `DEFINITION_DIFFERENCE`: no valid observations; our undefined outlier count
  is NULL while development records zero.

Both runs must use the same source data/version, filters, reporting date,
field types and special values. Equal dates/counts cannot prove identical
source data. Development uses decimal inputs for statistics, while our engine
uses floating point for some calculations. Values near the strict mean +/- 3
population-standard-deviation boundary can produce different outlier counts;
count differences are always flagged. Development monthly joins can omit
NULL-date groups, and empty-population NULL/zero differences remain visible.
Post-start development rates and non-equivalent metrics are not compared.

The review view can combine or mask individual underlying metric rows; this
query compares its displayed results, not raw metric completeness or uniqueness.
It cannot establish that either engine is correct merely because values match.

## Verification

`node DQ_ENGINE/tools/check_development_comparison.mjs` executes the checked-in
SELECT on synthetic review/development results with SQLite dialect adaptations.
It covers all 17 metrics, fractions, six-decimal rounding, exact large counts,
missing/duplicate rows, input guards, population/date mismatches and an
Outliers-only run. Teradata parsing, permissions, query plans and actual results
remain unverified until you run it in the lab.
