# Results and logs

One logical result is `(RUN_ID, FIELD_NAME, MODULE_NAME, PERIOD_LEVEL, PERIOD_VALUE, METRIC_NAME)`, enforced by a unique secondary index. RUN_ID identifies exactly one project; a completed run cannot be overwritten. `DQ_COMPLETED_RESULT` exposes only successful runs. `DQ_RUN_SUMMARY` counts fields separately from metric rows and groups by module/type.

`DQ_METRIC_RESULT` stores numeric metrics as DECIMAL(38,10): 28 integral digits, 10 fractional digits. Exact supported source min/max and counts are cast independently before CASE evaluation, avoiding implicit FLOAT promotion. Counts/rate denominators are also preserved as BIGINT where applicable. Mean, sample standard deviation and reported rates use FLOAT arithmetic before storage, consistent with SAS floating-point statistical calculations; they require numeric tolerances in reconciliation. Tiny differences and rates below storage scale can round. Colours use exact count comparisons, not the stored rounded rate. FLOAT source min/max already have source floating-point precision.

`DATE_METRIC_VALUE` is a TIMESTAMP(6) slot reserved for a later date module. No date metrics are emitted in Phase 2. `EXECUTION_TIMESTAMP` records result insertion time. `IS_PERCENTAGE`, `RATE_NUMERATOR` and `RATE_DENOMINATOR` let future percentage metrics use the shared rules without embedding thresholds in modules.

| Numeric Basic metric | Definition |
|---|---|
| TOTAL_COUNT | Number of source rows, including NULL numeric values |
| NON_MISSING_COUNT | Number of non-NULL values |
| MISSING_COUNT | Total minus non-missing |
| MISSING_RATE_PCT | 100 × missing / total |
| ZERO_COUNT | Number of values exactly equal to zero; NULL is not zero |
| ZERO_RATE_PCT | 100 × zero / total |
| MINIMUM / MAXIMUM | Non-NULL source extrema |
| MEAN | Arithmetic mean of non-NULL values, calculated in FLOAT |
| STDDEV_SAMP | Sample standard deviation of non-NULL values, denominator n−1 |

Only SQL NULL is missing. Teradata cannot recover SAS special missing codes lost during source ingestion. Negative values, sentinel values and zero are not treated as missing.

| Period | Value |
|---|---|
| OVERALL | `ALL`, independently calculated from all source rows |
| YEARLY | `YYYY`, derived from the configured reporting date |
| MONTHLY | `YYYY-MM`, derived from the same date |
| YEARLY / MONTHLY null date | `UNKNOWN`, distinct from rollup NULLs via GROUPING |

A source with no rows produces ten OVERALL results per eligible field: counts are zero, rates/statistics are NULL, and percentage colours are NOT_EVALUATED. No yearly/monthly rows are invented. All-NULL fields have 100% missing when population >0 and NULL extrema/mean/deviation. A singleton non-missing population has NULL sample deviation; a constant field with at least two non-missing values has zero sample deviation.

Green is strictly below 1%, amber is at least 1% but below 5%, and red is at least 5%, unless an approved project settings override applies. Exact thresholds are compared using numerator × 100 against denominator × threshold in DECIMAL arithmetic. A display that rounds up to 1% can therefore remain GREEN. Non-percentage metrics have NULL DQ_COLOUR. Colours are screening classifications, not proof of invalid data.

`DQ_RUN_LOG` records first start, latest end, status, source/date, thresholds, batch size and attempt number. Its elapsed time can include time between failed attempts. `DQ_MODULE_LOG` preserves attempt/batch timings, field count, errors and aggregate SQL; batch 0 is the module summary. Successful earlier batches in an ultimately failed attempt remain marked successful in history, but their partial metric rows are removed. Actual run/module failure messages are retained; SAS status variables alone are not the audit store. `DQ_RUN_FIELD_CONFIG` holds the latest attempt's captured numeric selection; historical SQL_TEXT records retain prior batch expressions.
