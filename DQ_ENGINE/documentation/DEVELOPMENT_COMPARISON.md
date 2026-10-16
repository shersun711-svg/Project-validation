# Compare saved numeric results with development

Use [compare_numeric_development.sql](../tests/compare_numeric_development.sql)
after profiling succeeds. It compares Numeric Basic and Numeric Outliers;
it does not rerun profiling, read the RDS source, create objects or change data.
No SAS files, Excel settings or engine deployment changes are required.
The query was written independently using the supplied development table
schema and metric definitions as references.

## Run in SQL Assistant

1. Download the SQL file and replace `DQ_DB` with `LAB_T_ORION_MVT` in your copy.
2. At the top, set `OUR_RUN_NUMBER` to the successful engine run you want to
   check. It defaults to **16**. `DEV_RUN_ID` defaults to the confirmed
   development **run ID 1**; these are different run identifiers.
3. Confirm the development table is
   `LAB_P_DECISION_SCIENCE.IRB_RDS_DQ_NUMERIC_PROFILE_RESULT` and that you
   have SELECT access. Change that identifier if the table has moved.
4. Submit the **complete WITH ... SELECT statement** as one request.

Start with the completed 20-field run. SUMMARY rows count comparisons by
status. DETAIL rows list exceptions with both values, dates, difference and
reason. Set `SHOW_MATCHES='Y'` to display matching details as well.
`MATCH` for every comparison is agreement within the stated rules, not proof
that either implementation is correct. Investigate every other status.
`NOT_EVALUATED` means the input checks prevented comparison, not a pass.

## What is compared

Only numeric fields captured in the chosen engine run are included. A completed
Numeric Basic or Outliers module is required; each contributes its own metrics.
An Outliers-only run can be compared without rerunning Basic. The query uses
saved raw metric precision, not the rounded final review view.

| Engine metric | Development column/expression |
|---|---|
| TOTAL_COUNT | row_count |
| NON_MISSING_COUNT | row_count - missing_count |
| MISSING_COUNT / MISSING_RATE_PCT | missing_count / missing_pct |
| ZERO_COUNT / ZERO_RATE_PCT | zero_count / zero_pct |
| SPECIAL_COUNT / SPECIAL_RATE_PCT | special_count / special_pct |
| MINIMUM / MAXIMUM | min_value / max_value |
| MEAN / STDDEV_POP | mean_value / stddev_value |
| OUTLIER_LOWER_BOUND / OUTLIER_UPPER_BOUND | outlier_value_lower / outlier_value_upper |
| OUTLIER_COUNT / OUTLIER_RATE_PCT | outlier_count / outlier_pct |
| OUTLIER_VALID_COUNT | valid_count |

Rates compare as fractions: an engine raw percentage of `5` becomes `0.05`.
The default absolute rate tolerance is `0.000001` because development rates
are rounded to six decimal places. Counts, minimum and maximum compare
exactly. Mean, population standard deviation and outlier bounds use
`absolute tolerance + relative tolerance * ABS(development value)`; defaults
are `0.000001` and `0.000000000001`. NULL equals NULL, but NULL never equals
zero automatically. `COUNT_DELTA` is an exact decimal difference; `VALUE_DELTA`
is floating point and is only a display aid for exact comparisons.

Overall and enabled monthly periods are compared. The supplied development
suite has no yearly results, so **yearly is outside this comparison** even
when our engine has yearly results. Monthly engine grouping is by calendar
month; development groups by actual snapshot date. A month with several
development snapshot dates is flagged `PERIOD_SCOPE_MISMATCH` rather than
pooling its statistics. Actual monthly dates must also match. Engine internal
period labels remain visible as `PERIOD_KEY` for reconciliation, alongside
both actual `POU_DT` values. Overall dates are not compared.

## Before interpreting a difference

Both runs must use the same source population/version, filters, reporting date,
field types and configured special values. Equal row counts and dates alone
cannot establish identical source data. Historic saved results cannot prove
that the underlying RDS data has not changed between runs.

The query flags different total populations, duplicate keys and missing
fields/periods. Its expected period domain is the union of both saved result
sets; it cannot discover a month absent from both without reading the source.
Development fields outside our captured selection are excluded deliberately.

Known definition differences from the supplied development SQL:

- Development records zero outliers for some groups with no valid values;
  our engine leaves the undefined outlier count NULL. This is labelled
  `DEFINITION_DIFFERENCE`, not MATCH.
- Development calculations use decimal inputs for statistics; our engine uses
  floating point for some calculations. Small differences may be within
  tolerance, but an outlier count difference is always flagged. Values near
  the strict mean +/- 3 population-standard-deviation boundary need review.
- Development joins may omit monthly NULL-date groups; these appear as missing
  development results. Empty-population NULL/zero differences remain visible.
- Development post-start missing/zero rates, valid_pct and created timestamps
  are not compared with different or absent engine metrics.

Categorical, identifier, date, rule decisions and MoM/YoY results are outside
this numeric comparison. No development implementation was copied into the
profiling engine.

## Verification limits

`node DQ_ENGINE/tools/check_development_comparison.mjs` runs the SELECT with
SQLite dialect adaptations against synthetic results. It checks all 17 metric
mappings across overall/monthly, rates, tolerance, exact large counts,
missing/duplicate rows, populations, snapshots and input guards.
This does **not** verify Teradata parsing, permissions, query plans or actual
customer results. Those remain unverified until the SQL is run in your lab.
