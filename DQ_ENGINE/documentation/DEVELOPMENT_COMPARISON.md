# Compare the final review with development

[Numeric comparison](../tests/compare_numeric_development.sql) and
[categorical comparison](../tests/compare_categorical_development.sql) and
[date comparison](../tests/compare_date_development.sql) use the same output
layout. Run categorical and date scripts separately to get separate result
tables/grids; their rows are never combined. None reruns profiling or creates
database objects.

| Field type | Our run number | MDT run ID(s) | MDT saved result table |
|---|---:|---|---|
| Numeric | 17 | 12, 13, 14, 15 | `IRB_RDS_DQ_NUMERIC_PROFILE_RESULT` |
| Categorical | 18 | 20 | `IRB_RDS_DQ_CATEGORICAL_PROFILE_RESULT` |
| Date | 18 | 21 | `IRB_RDS_DQ_DATE_PROFILE_RESULT` |

[compare_numeric_development.sql](../tests/compare_numeric_development.sql)
compares saved **DQ_BASIC_REVIEW** results with the development team's numeric
result table, selecting MDT runs **12, 13, 14 and 15** together. It is read-only:
no profiling rerun, source-data scan, new tables,
SAS changes or Excel changes are needed. The comparison was written independently
using the supplied development schema and metric definitions as references.

## Run in SQL Assistant

1. Download the SQL file. Replace `DQ_DB` with `LAB_T_ORION_MVT` in your copy.
2. Set `OUR_RUN_NUMBER` at the top to your successful run; default **17**.
   The `DEV_RUN_IDS` list is already **12, 13, 14 and 15**, as confirmed.
   These identifiers refer to different engines and do not need to have the
   same number as our run.
3. Confirm SELECT access to
   `LAB_T_ORION_MVT.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT`.
4. Submit the complete `WITH ... SELECT` statement as one request.

Both engines' saved results now reside in `LAB_T_ORION_MVT`. Replacing `DQ_DB`
sets the schema for both sides; the MDT result-table names are assumed unchanged.
The comparison joins the deployed `DQ_BASIC_REVIEW` by `RUN_NUMBER` and
`PROJECT_ID`; that view does not need to expose the internal `RUN_ID` UUID.
Existing run logs and captured configuration still use the internal ID.
The numeric defaults are our run **17** and MDT runs **12–15**. The categorical
query uses our run **18**, MDT run **20**. The separate date query uses our
run **18**, MDT run **21**, as confirmed by the analyst.

### MDT numeric field batches

The analyst ran the 415 MDT numeric fields in four batches: 100, 100, 100 and
115. The query reads the saved rows from all four IDs as one comparison scope;
it does not sum statistics or counts across batches. Each compared row reports
the actual contributing MDT `DEV_RUN_ID`.

Each field/period must have one MDT row across the selected runs. Overlap is
flagged `DUPLICATE_DEVELOPMENT` (or `PERIOD_SCOPE_MISMATCH` for several actual
dates within a month), with values withheld. No latest-run choice or silent
deduplication is performed. Missing selected runs or repeated/NULL selected IDs
return `NOT_EVALUATED`. All batches must use equivalent source versions, filters,
periods and metric definitions; matching counts alone do not establish that.

To verify the saved field batches before comparison:

```sql
SELECT RUN_ID,COUNT(DISTINCT UPPER(TRIM(FIELD_NAME))) AS FIELD_COUNT
FROM LAB_T_ORION_MVT.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT
WHERE RUN_ID IN (12,13,14,15)
GROUP BY RUN_ID
ORDER BY RUN_ID;
```

Expect 100, 100, 100 and 115 in the stated batch order. These counts do not prove
disjoint fields; the comparison also checks duplicate field/period keys within
its selected validation scope. MDT-only fields outside that scope require the
classification-exception review below.

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
that run did not include categorical profiling. Development run ID is **20**, using
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
with six decimals and SHOW_MATCHES=Y by default. Original saved values and the
original `DIFFERENCE` are preserved. Categorical output additionally includes
`BLANKCOUNT` (MDT's saved blank count), `ADJUSTED_OUR_VALUE` and
`ADJUSTED_DIFFERENCE`. `STATUS` evaluates the adjusted values after the existing
scope/population/duplicate checks.

The supplied development code has two different definitions:

- **Missing:** development includes NULL and blank/whitespace strings; our
  missing metric is NULL-only. For positive MDT `BLANK_COUNT`, the comparison
  uses these expressions on our side, then compares with the original MDT value:
  - Missing count: `our missing count + BLANKCOUNT`.
  - Non-missing count: `our non-missing count - BLANKCOUNT`.
  - Missing rate: `(our missing count + BLANKCOUNT) / our total count`.
  The rate is recomputed from counts rather than adding a blank fraction to an
  already rounded rate. A matching adjusted value is marked
  `MATCH_AFTER_BLANK_ADJUSTMENT`; a residual mismatch is `DIFFERENT`.
  MDT's missing count already includes blanks, so blanks must not be added to
  MDT's missing count again.
- **Distinct:** development counts raw distinct values, including special
  values; our distinct metric excludes configured special values. When either
  special count is positive, distinct is flagged DEFINITION_DIFFERENCE, even
  if the displayed counts happen to agree. Counts alone cannot establish the
  number of distinct special values to subtract.

For example, **if the saved MDT BLANK_COUNT is 6,264**, our missing count
22,042 adjusts to 28,306. Against MDT missing count 28,306, the original difference
is -6,264 and the adjusted difference is zero. This example is conditional;
the uploaded comparison did not contain the saved blank count.

`SHOW_MATCHES=N` hides both `MATCH` and `MATCH_AFTER_BLANK_ADJUSTMENT` rows.
Distinct-count definition differences remain visible; a blank observation count
cannot establish a distinct special-value count. The adjustment reconciles saved
counts under MDT's definition; it does not independently verify source records
or establish which missing-value policy is appropriate.

If required blank/missing/special counts are unavailable, or a blank count is
negative, exceeds MDT missing count or would make our adjusted missing count
exceed our population, the affected missing comparison is `NOT_EVALUATED`.
No unavailable blank count is silently treated as zero. Missing rows, duplicate keys, different populations/dates and
multiple snapshots per month use the same safeguards as the numeric query.
Special-value lists, character comparison rules and the source population
must agree before interpreting results. Development casts strings to
VARCHAR(4000), while our engine uses the native field for distinct counting;
longer strings and differing collation/type semantics require separate review.
Mode, frequencies and string lengths are not engine metrics and are not
compared. `BLANKCOUNT` is an MDT reconciliation input, not a separately measured
engine blank metric. No source data is read and no new objects are created.

## Date comparison

Use [compare_date_development.sql](../tests/compare_date_development.sql) for
our run **18** versus MDT date run **21**. Replace `DQ_DB` with
`LAB_T_ORION_MVT`, then submit the complete statement separately from the
categorical query. It reads `IRB_RDS_DQ_DATE_PROFILE_RESULT`, not the
categorical result table, and returns a separate date result grid.

Our selected successful run must contain captured DATE fields and a successful
DATE_BASIC module in its current attempt. Only overall and enabled monthly
periods are compared. A numeric/category field retained for the MDT date-focused
suite workaround cannot enter the date comparison.

| Review metric | MDT saved date value |
|---|---|
| TOTAL_COUNT | row_count |
| NON_MISSING_COUNT | row_count - missing_count |
| MISSING_COUNT | missing_count |
| MISSING_RATE | missing_pct (fraction) |

Counts compare exactly; missing rate uses absolute tolerance `0.000001`.
The engine date review exposes no date-value minimum/maximum, distinct or
special metrics, so these are not compared. Field-availability dates are not
date-value extrema. The query assumes the deployed MDT date table has
`RUN_ID`, `FIELD_NAME`, `RUN_TYPE`, `POU_DT`, `ROW_COUNT`, `MISSING_COUNT` and
`MISSING_PCT`, with rates stored as fractions, consistent with the MDT profile
naming used by the existing comparisons. The repository has no MDT date-result
DDL; confirm these column names and units in the lab before execution.

Output uses the same OUR_VALUE / DEV_VALUE / DIFFERENCE / STATUS columns.
The duplicate, missing-row, snapshot, population and input checks apply to date
results independently. `SHOW_MATCHES=N` returns date exceptions only. These are
read-only result grids, not persistent output database tables.

## Verification

`node DQ_ENGINE/tools/check_development_comparison.mjs` executes the checked-in
SELECT on synthetic review/development results with SQLite dialect adaptations.
It covers all 17 metrics, fractions, six-decimal rounding, exact large counts,
missing/duplicate rows, input guards, population/date mismatches and an
Outliers-only run. It also checks four numeric field batches, actual contributing
run IDs, overlapping batches, missing selected runs and repeated selection IDs.
The same checker executes the categorical query across all
seven metrics, definition differences, unavailable prerequisites, MDT run 20
selection and exception cases. It also checks blank-adjusted counts/rates,
residual mismatches, invalid/unavailable blank counts, exact large adjusted
counts, duplicate withholding and filtering of reconciled matches. The date query is exercised across four metrics
for overall/monthly periods, rate tolerance, exact large counts, NULLs, missing
and duplicate rows, population/snapshot mismatches, input/module guards,
reporting switches and run/field-type isolation (our 18 versus MDT 21).
Teradata parsing, permissions, deployed MDT date schema and actual results
remain unverified until you run it in the lab.
