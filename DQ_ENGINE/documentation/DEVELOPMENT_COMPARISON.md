# Compare the final review with development

[Numeric comparison](../tests/compare_numeric_development.sql) and
[categorical comparison](../tests/compare_categorical_development.sql) use the
same output layout. Choose the script for the field type; neither reruns profiling.

[compare_numeric_development.sql](../tests/compare_numeric_development.sql)
compares saved **DQ_BASIC_REVIEW** results with the development team's numeric
result table. It is read-only: no profiling rerun, source-data scan, new tables,
SAS changes or Excel changes are needed. The comparison was written independently
using the supplied development schema and metric definitions as references.

## Run in SQL Assistant

1. Download the SQL file. Replace `DQ_DB` with `LAB_T_ORION_MVT` in your copy.
2. Set `OUR_RUN_NUMBER` at the top to your successful run; default **17**.
   Development `DEV_RUN_ID` is already **1**, as confirmed. These identifiers
   refer to different engines and do not need to have the same number.
3. Confirm SELECT access to
   `LAB_T_ORION_MVT.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT`.
4. Submit the complete `WITH ... SELECT` statement as one request.

Both engines' saved results now reside in `LAB_T_ORION_MVT`. Replacing `DQ_DB`
sets the schema for both sides; the MDT result-table names are assumed unchanged.
Our run numbers and the MDT run ID belong to separate engines. The defaults
remain MDT run 1, our numeric run 17 and our categorical run 18; edit the MDT
ID if the completed MDT execution used a different ID.

## CDAO-confirmed field classification exceptions

The analyst confirmed with CDAO that these fields should be categorical:

| Field | CDAO classification | MDT numeric output |
|---|---|---|
| `BRANCH_ORIGIN_ID` | CATEGORICAL | Retain as replication evidence only. |
| `BROKER_CD` | CATEGORICAL | Retain as replication evidence only. |
| `SECURITISED_DEAL_ID` | CATEGORICAL | Retain as replication evidence only. |
| `BOR2_CUSTOMER_AGE` | CATEGORICAL | Retain as replication evidence only. |

All four are already categorical in the engine's checked-in field list.
Preserve any numeric and categorical runs made for replication; do not rewrite
their saved types or results. A numeric match for these fields is evidence of
reproduction under the numeric definition, not endorsement of that field type.

The numeric comparison follows the selected run's saved numeric field scope.
If our saved run classified a field as categorical, no numeric result is
invented or compared for that field. Its absence from numeric scope is an
expected classification exception, not a metric mismatch or a numeric pass.
If both numeric outputs exist from a dedicated replication run, they can be
compared using that run, with this exception recorded in the working papers.

Use categorical results for the validation interpretation. A categorical
comparison requires MDT categorical output as well; numeric statistics cannot
substitute for it. No configuration, source data or saved result is changed
by these comparison queries.

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

## Categorical comparison

Use [compare_categorical_development.sql](../tests/compare_categorical_development.sql)
with the same schema replacement and run-number settings. Choose a successful
engine run that **contains CATEGORICAL_BASIC results**; a numeric-only run will
return NOT_EVALUATED. The default engine number is 18 and must be edited if
that run did not include categorical profiling. Development run ID is 1, using
`LAB_T_ORION_MVT.IRB_RDS_DQ_CATEGORICAL_PROFILE_RESULT`.

It compares seven metrics, for overall/enabled monthly periods:

| Review metric | Development value |
|---|---|
| TOTAL_COUNT | row_count |
| NON_MISSING_COUNT | row_count - missing_count |
| MISSING_COUNT / MISSING_RATE | missing_count / missing_pct |
| SPECIAL_COUNT / SPECIAL_RATE | special_count / special_pct |
| DISTINCT_COUNT | distinct_count |

Counts compare exactly; fractional rates use absolute tolerance 0.000001.
The output is the same OUR_VALUE / DEV_VALUE / DIFFERENCE / STATUS layout,
with six decimals and SHOW_MATCHES=Y by default. Saved values are not adjusted.

The supplied development code has two different definitions:

- **Missing:** development includes NULL and blank/whitespace strings; our
  missing metric is NULL-only. When development BLANK_COUNT is positive,
  missing count/rate and non-missing count are flagged DEFINITION_DIFFERENCE.
- **Distinct:** development counts raw distinct values, including special
  values; our distinct metric excludes configured special values. When either
  special count is positive, distinct is flagged DEFINITION_DIFFERENCE, even
  if the displayed counts happen to agree. Counts alone cannot establish the
  number of distinct special values to subtract.

If a required blank/special count is unavailable, the affected comparison is
NOT_EVALUATED. Missing rows, duplicate keys, different populations/dates and
multiple snapshots per month use the same safeguards as the numeric query.
Special-value lists, character comparison rules and the source population
must agree before interpreting results. Development casts strings to
VARCHAR(4000), while our engine uses the native field for distinct counting;
longer strings and differing collation/type semantics require separate review.
Mode, frequencies, blank metrics and string lengths are not engine metrics
and are not compared. No source data is read and no new objects are created.

## Verification

`node DQ_ENGINE/tools/check_development_comparison.mjs` executes the checked-in
SELECT on synthetic review/development results with SQLite dialect adaptations.
It covers all 17 metrics, fractions, six-decimal rounding, exact large counts,
missing/duplicate rows, input guards, population/date mismatches and an
Outliers-only run. The same checker executes the categorical query across all
seven metrics, definition differences, unavailable prerequisites and exception
cases. Teradata parsing, permissions, query plans and actual results
remain unverified until you run it in the lab.
