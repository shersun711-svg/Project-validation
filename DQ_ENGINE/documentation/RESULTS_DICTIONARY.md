# Results and logs

One logical result is `(RUN_ID, FIELD_NAME, MODULE_NAME, PERIOD_LEVEL, PERIOD_VALUE, METRIC_NAME)`, enforced by a unique secondary index. RUN_ID identifies exactly one project; a completed run cannot be overwritten. `DQ_COMPLETED_RESULT` exposes only successful runs. `DQ_RUN_SUMMARY` counts fields separately from metric rows and groups by module/type.

`DQ_BASIC_REVIEW` is the common final review layout over
`DQ_COMPLETED_RESULT`: one row per run, project, field/type and period. Basic and optional Outlier metrics
share the same numeric row when both modules are selected.
Applicable metric names become columns. The view contains profiling values only;
rule statuses are read separately from DQ_RULE_RESULT. Counts display with zero
fractional digits, fractional rates with six, and descriptive numeric statistics and
bounds with six. Review rate columns omit the _PCT suffix and divide the stored
percentage by 100. These are presentation casts only: stored values in
DQ_METRIC_RESULT remain DECIMAL(38,10), including the original NULL statistics.
Rule outcomes are not recalculated from displayed rates or current configuration. Filter by
RUN_ID and optionally PERIOD_LEVEL; historical runs and different periods
remain separate. The view reads aggregates, not the source dataset.

`CREATED_TIMESTAMP` is the latest stored metric `EXECUTION_TIMESTAMP` contributing
to that review row, displayed as TIMESTAMP(0) without fractional seconds
(e.g. 2026-10-15 10:02:00). For combined Basic/Outlier rows it includes both modules.
It records result insertion time on Teradata and remains fixed when queried;
it is separate from the source snapshot date `POU_DT` and run completion time.

`DQ_METRIC_RESULT` stores numeric metrics as DECIMAL(38,10): 28 integral digits, 10 fractional digits. Exact supported source min/max and counts are cast independently before CASE evaluation, avoiding implicit FLOAT promotion. Counts/rate denominators are also preserved as BIGINT where applicable. Mean, population standard deviation and reported rates use FLOAT arithmetic before storage, consistent with SAS floating-point calculations; they require numeric tolerances in reconciliation. Tiny differences and rates below storage scale can round. Colours use exact count comparisons, not the stored rounded rate. FLOAT source min/max already have source floating-point precision.

Numeric Basic stores `STDDEV_POP`; `DQ_BASIC_REVIEW` exposes it as `STDDEV_VALUE`
(population standard deviation). Review aliases are `MIN_VALUE`, `MAX_VALUE`,
`MEAN_VALUE` and `STDDEV_VALUE`; internal metric names are unchanged.

`DATE_METRIC_VALUE` remains reserved and unused. Date Basic emits its four count/missing metrics into DQ_METRIC_RESULT; no date-value extrema are calculated. `EXECUTION_TIMESTAMP` records result insertion time. `IS_PERCENTAGE`, `RATE_NUMERATOR` and `RATE_DENOMINATOR` let future percentage metrics use the shared rules without embedding thresholds in modules.

| Numeric Basic metric | Definition |
|---|---|
| TOTAL_COUNT | Number of source rows, including NULL numeric values |
| NON_MISSING_COUNT | Number of non-NULL values |
| MISSING_COUNT | Total minus non-missing |
| MISSING_RATE_PCT | 100 × missing / total |
| ZERO_COUNT | Number of values exactly equal to zero; NULL is not zero |
| ZERO_RATE_PCT | 100 × zero / total |
| SPECIAL_COUNT | Number of configured special values; SQL NULL is excluded |
| SPECIAL_RATE_PCT | 100 × special count / total |
| MINIMUM / MAXIMUM | Source extrema excluding NULL and configured specials |
| MEAN | Arithmetic mean of non-NULL, non-special values, calculated in FLOAT |
| STDDEV_POP | Population standard deviation of non-NULL, non-special values, denominator n |

Only SQL NULL is missing. Teradata cannot recover SAS special missing codes lost during source ingestion. Negative values, sentinel values and zero are not treated as missing.

| Period | Value |
|---|---|
| OVERALL | `ALL`, independently calculated from all source rows |
| YEARLY | `YYYY`, derived from the configured reporting date |
| MONTHLY | `YYYY-MM`, derived from the same date |
| YEARLY / MONTHLY null date | `UNKNOWN`, distinct from rollup NULLs via GROUPING |

A source with no rows produces twelve OVERALL results per eligible field: counts are zero, rates/statistics are NULL, and percentage rules are NOT_EVALUATED in DQ_RULE_RESULT. No yearly/monthly rows are invented. All-NULL fields have 100% missing when population >0 and NULL extrema/mean/deviation. A singleton valid population has zero population deviation; a constant field also has zero deviation.

Green is strictly below 1%, amber is at least 1% but below 5%, and red is at least 5%, unless an approved project settings override applies. Exact thresholds are compared using numerator × 100 against denominator × threshold in DECIMAL arithmetic. A display that rounds up to 1% can therefore remain GREEN. Non-percentage metrics have no rule result.
For new runs DQ_METRIC_RESULT.DQ_COLOUR remains NULL even for percentages;
DQ_COMPLETED_RESULT supplies it from DQ_RULE_RESULT for compatibility. Colours are screening classifications, not proof of invalid data.

`DQ_RUN_LOG` records first start, latest end, status, source/date, thresholds, batch size and attempt number. Its elapsed time can include time between failed attempts. `DQ_MODULE_LOG` preserves attempt/batch timings, field count, errors and the latest generated SQL for a batch; batch 0 is the module summary. For Outliers, SQL_TEXT is updated to the field-specific metric INSERT immediately before execution. Successful earlier batches in an ultimately failed attempt remain marked successful in history, but their partial metric rows are removed. Actual run/module failure messages are retained; SAS status variables alone are not the audit store. `DQ_RUN_FIELD_CONFIG` holds the latest attempt's captured field selection; historical SQL_TEXT records retain prior expressions.

`WORK.DQ_MODULE_STATUS` contains run/module identifiers, attempt/batch numbers,
timings, status, error code/information and field count. SQL_TEXT stays in
Teradata; neither a preview nor preview-length/truncation fields are imported.
Read the full SQL from Teradata DQ_MODULE_LOG for EXPLAIN or failure analysis.
This SAS projection does not alter the stored log or result data.

`WORK.DQ_SUMMARY` has the same summary columns as DQ_RUN_SUMMARY, with its five
numeric count columns cast to FLOAT on the Teradata read for SAS compatibility.
SAS uses double-precision numeric values: integer counts through 2^53 are exact;
larger integers may round. Use the database view for exact large counts. Stored
metric values and count-based percentage classifications are unaffected.


## Other basic results and short run numbers

Both CATEGORICAL_BASIC and IDENTIFIER_BASIC emit MISSING_COUNT,
MISSING_RATE_PCT and DISTINCT_COUNT. Categorical additionally emits SPECIAL_COUNT
and SPECIAL_RATE_PCT. Distinct excludes NULL and follows source comparison
semantics; categorical distinct also excludes configured specials. Missing percentage uses the total row population; blanks
are not automatically NULL. No category/identifier values or frequencies are
saved. Their review population counts are derived from saved rate counts.

DATE_BASIC emits TOTAL_COUNT, NON_MISSING_COUNT, MISSING_COUNT and
MISSING_RATE_PCT into DQ_METRIC_RESULT. No date-value extrema or distinct counts
are emitted. DQ_BASIC_REVIEW shows these four metrics,
with unrelated numeric/distinct columns NULL. Empty sources have zero counts and NULL/NOT_EVALUATED rates. Legacy date
extrema remain stored but are excluded from current review/summary views.
FIRST_AVAILABLE_FACT_DT/LAST_AVAILABLE_FACT_DT in DQ_BASIC_REVIEW describe
overall reporting-date coverage for every selected field; other periods show
NULL. Combined MIN_VALUE/MAX_VALUE remain numeric. See the field-availability definitions below.

RUN_NUMBER is a BIGINT mapping in DQ_RUN_NUMBER and is exposed in completed
and review views. It is global across projects and includes failed runs.
Retries retain it. RUN_ID remains the original internal UUID; mapping numbers
are never reset/reused. DQ_RUN_FIELD_CONFIG now captures selected fields for
all basic types, with FIELD_ORDINAL numbered separately within FIELD_TYPE.
Use the current deployment sequence in [setup and operation](README.md).

## Review period date

POU_DT is a DATE: the latest actual configured reporting date in each monthly or
yearly group, even when that date is not the calendar month/year end. It does not
change the population grouped for those metrics. OVERALL and NULL-date groups
have NULL POU_DT. DQ_METRIC_RESULT stores the date alongside each metric,
captured in existing Basic or outlier counting aggregates without another
source scan. Keep source/configuration stable throughout the run.

DQ_BASIC_REVIEW exposes POU_DT instead of PERIOD_VALUE. DQ_COMPLETED_RESULT and
DQ_RULE_RESULT also expose POU_DT; they retain their internal PERIOD_VALUE keys
for compatibility, uniqueness and joins. Use POU_DT for date display. Historical
runs without a captured date remain NULL; dates are never inferred from
month labels or backfilled from today's source. Failure/retry removes dates
with their metric/rule rows; there is no additional table to maintain.

## Field availability

FIRST_AVAILABLE_FACT_DT and LAST_AVAILABLE_FACT_DT are the earliest/latest
configured reporting dates where the field is non-NULL. They are DATE values
without time and appear only on OVERALL rows. Actual date-field values do not
define these endpoints. Non-missing zeros, blanks and configured special values
remain available; NULL reporting dates cannot extend coverage. If no row has
both a non-NULL field and reporting date, both endpoints are NULL.

DQ_FIELD_AVAILABILITY stores one row per field/run alongside Basic aggregation.
Review never recalculates coverage from live source data. Runs without saved
coverage, including Outliers-only runs, show NULL availability. Yearly and
monthly rows also show NULL. Historical coverage is not backfilled from extrema
or counts. Date Basic exposes only counts/missing percentage; MIN_VALUE/MAX_VALUE
and unrelated special/numeric/outlier columns remain NULL for date fields.

## Numeric outliers

Five metrics store lower/upper mean +/-3 population-standard-deviation bounds, outlier count,
valid count and outlier percentage. The denominator excludes NULL and configured
specials. Insufficient populations are NOT_EVALUATED; constants with n>=2 have
zero outliers. Unrounded Basic/prerequisite statistics are retained in
DQ_NUMERIC_STATISTICS; only percentage metrics receive rule assessments in
DQ_RULE_RESULT. See
[outlier definitions and validation](NUMERIC_OUTLIERS.md).

See [shared rule evaluation](RULE_RESULTS.md) for the simple rule table,
threshold/reason semantics, historical compatibility and deployment steps.
