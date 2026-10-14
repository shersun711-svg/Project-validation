# Numeric Outliers

Enable numeric_outliers=Y in sas/00_run_dq_engine.sas. It runs for every active
NUMERIC field. No new workbook columns or per-field switches are needed.

## Rule and populations

    Lower bound = mean - 3 * sample standard deviation
    Upper bound = mean + 3 * sample standard deviation

Only values strictly below/above these bounds are outliers. Equality is allowed.
Calculate separate statistics/bounds for OVERALL, YEARLY and MONTHLY; NULL
reporting dates appear in UNKNOWN yearly/monthly groups. Source view rows are
not deduplicated or filtered. NULL and configured numeric special values are
excluded from statistics, testing and the rate denominator.

The agreed multiplier is fixed at 3. Keep OUTLIER_SD_MULTIPLIER=3 in Excel
Settings; the engine rejects a different value when outliers are selected.

| Review column | Meaning |
|---|---|
| OUTLIER_VALID_COUNT | Non-NULL, non-special population used for statistics/testing |
| OUTLIER_LOWER_BOUND / OUTLIER_UPPER_BOUND | Period-specific mean minus/plus 3 times sample deviation |
| OUTLIER_COUNT | Number of valid values strictly outside bounds |
| OUTLIER_RATE_PCT | 100 * OUTLIER_COUNT / OUTLIER_VALID_COUNT |
| OUTLIER_RATE_COLOUR | Shared exact-count percentage classification |

Fewer than two valid observations cannot define a sample deviation: bounds,
outlier count and rate are NULL; colour is NOT_EVALUATED. VALID_COUNT still
shows 0 or 1. Empty sources produce only OVERALL with these same undefined
results. A constant population with at least two valid observations has zero
deviation, equal bounds, zero outliers and a GREEN zero rate. All-special fields
remain non-missing in Basic but have zero valid outlier observations.

This valid-population denominator implements the user's special-value exclusion;
it differs from the original unfiltered non-missing count when specials exist.
For an unevaluated rate, RATE_NUMERATOR and RATE_DENOMINATOR are NULL, even if
OUTLIER_VALID_COUNT=1. Bounds/count/valid-count are not percentage metrics.
Colours are screening classifications, not proof that flagged values are invalid.

## Statistics reuse and results

Updated Numeric Basic saves its unrounded FLOAT mean/sample deviation and valid
count in DQ_NUMERIC_STATISTICS while processing its existing aggregate. Outliers
reuse those values, rather than rounded DECIMAL results. If Basic=N, the internal
SP_DQ_NUMERIC_STATISTICS prerequisite calculates the same aggregates; it emits
no Basic metric rows or availability dates. Its timing/status appears in module
logs but not the metric-based run summary.

DQ_METRIC_RESULT stores five OUTLIERS metrics per field/period. DQ_BASIC_REVIEW
combines Outlier and Basic metrics in one field/period row. Old
runs have NULL outlier columns. Outliers-only rows have NULL Basic/availability
columns and expose their own valid count. DQ_RUN_SUMMARY groups by module, so
field counts overlap when several numeric modules are selected.

A failed attempt removes all partial metric, availability and numeric-statistic
rows. Retry refreshes field selection and special lists; completed UUIDs remain
protected. The seven-argument PROFILE, six-argument BASIC and two-argument ENGINE
SQL APIs remain compatible for supported tests; the legacy reserved argument
must be N. SAS fixes that argument to N in the eight-argument EXTENDED entry.

## Deploy after the current run finishes

This upgrade assumes the current special-value schema and procedures
are already deployed. Wait for profiling/configuration loads to finish. Replace
DQ_DB with the approved schema, currently LAB_T_ORION_MVT, in deployment copies.
No database deployment is performed by repository tools.

1. Run setup/16_create_outlier_support.sql ONCE. It adds the shared aggregate
   table and five fixed metric definitions. Existing tables/results are preserved.
2. Compile modules/03_numeric_statistics.sql as a complete procedure, then
   execute its following GRANT statement.
3. Recompile modules/10_numeric_basic.sql to capture unrounded statistics.
4. Compile modules/12_numeric_outliers.sql as a complete procedure, then
   execute its following GRANT statement.
5. Recompile all four procedures in modules/00_run_engine.sql separately:
   SP_DQ_RUN_EXTENDED, SP_DQ_RUN_PROFILE, SP_DQ_RUN_BASIC, SP_DQ_RUN_ENGINE.
   Execute the GRANT following each before compiling the next wrapper.
6. Replace results/93_dq_basic_review.sql. Classification/summary procedures do not need recompilation for this change.
7. The deployment files include EXECUTE PROCEDURE grants to DQ_DB and the
   statistics table SELECT/INSERT/DELETE grant. Replace DQ_DB in both ON and TO.
   Verify runtime-user permissions and view-owner access separately. If setup 16
   already ran, execute only its grant; do not rerun CREATE or metadata inserts.
8. Run updated SAS 01 in your session; require controller version
   20261013_BASIC_SPECIAL_OUTLIERS. File 05/configuration loader is unchanged.
9. If Settings already has multiplier 3 and the intended field selection, no
   Excel reload is needed. Otherwise edit/reload with 04 and require APPLIED.
10. Test a small numeric selection with file 00 and numeric_outliers=Y.

```sas
%let numeric_basic = Y;
%let numeric_outliers = Y;
%let categorical_basic = N;
%let date_basic = N;
%let identifier_basic = N;
%let categorical_psi = N;
%let export_excel = N;
%let retry_run_id = ;
```

Require SUCCEEDED. Filter DQ_BASIC_REVIEW by project, new RUN_NUMBER and period.
For standalone outliers set numeric_basic=N, numeric_outliers=Y; the dependency
is handled automatically. Leave retry_run_id blank for a new observation.

## Validate and benchmark

In an isolated test engine run tests/03_create_outlier_fixture.sql once, then
 tests/test_outliers.sql and tests/test_outliers.sas. Assertions return zero rows;
CALL/DDL errors fail the test. The six-field fixture has six reporting periods:
Basic+Outliers produces 612 metrics/36 review rows; Outliers-only produces
180 metrics/36 review rows; empty Outliers produces 30 metrics/6 review rows.
Tests cover strict boundary equality, two tails, special exclusions, unchanged
missing counts, valid denominators, zero deviation, singleton/all-NULL/all-special
fields, UNKNOWN dates, Basic reuse, standalone dependency, failure cleanup/retry
and SAS sample-standard-deviation reconciliation. Supplied server tests have not
been executed here. Substitute fresh consistent UUIDs when repeating tests.

Local checks execute generated aggregate/statistics/insert queries on synthetic
SQLite data with narrow dialect adaptations. They are not Teradata SPL or SAS
execution. Actual procedure compilation, privileges, cleanup/transaction behaviour,
numerical behaviour and workload must be verified on the installed release.

Outliers now count one period at a time against a single bounds row, with a
maximum of five fields. Each statement aggregates without a detail-row join on
year/month keys or a UNION ALL of all period populations. Only small bounds and
aggregate tables are retained. No raw-row staging or ranking is introduced.
Standalone statistics run three separate aggregate statements (overall, yearly,
monthly), avoiding GROUPING SETS expansion. They cap at ten fields.

This reduces the opportunity for period joins/combined statements to create large
intermediate spools. It is a query-shape change, not a measured spool guarantee.
It trades more source references for lower peak work per statement: counting
issues one source query per captured period per field batch. A complex view may
be evaluated repeatedly, so elapsed time can increase substantially when many
months are present. Actual scans and peak spool require Teradata EXPLAIN/DBQL.
SQL_TEXT records the most recent period/pass statement, including the one that
fails. The source view itself or the overall population may still exhaust spool.
Shared SQL_BATCH_SIZE=1 remains supported. Source populations must be stable between statistics and counting.
The module checks total/valid counts against captured statistics and fails on a
mismatch, but unchanged counts cannot detect all value changes. FLOAT arithmetic
and DECIMAL(38,10) storage require tolerance and range checks as in Basic profiling.
PSI and Excel report generation remain deferred.

Grant statements are separate from SPL procedure definitions. A client that
handles SPL deployment sequences can execute both from the same file. With
BTEQ .COMPILE FILE, compile only the procedure block, then submit its GRANT.
No grants have been executed from this workspace.

## Upgrade an existing outlier deployment after error 2646

Wait until the failed job has ended. No tables, views, Excel columns, SAS files,
runner wrappers or rule-result changes are needed for this optimisation.

1. Replace DQ_DB with LAB_T_ORION_MVT in a deployment copy of
   modules/03_numeric_statistics.sql. Compile the complete procedure, then execute
   its included GRANT EXECUTE PROCEDURE statement.
2. Do the same for modules/12_numeric_outliers.sql and its included grant.
3. Keep SQL_BATCH_SIZE=1. If this is already APPLIED, do not reload Excel simply
   because these procedures changed. Use a fresh run (retry_run_id blank),
   numeric_basic=N, numeric_outliers=Y, and all other tests=N. Initially test one
   active numeric field; after success, expand to the five-field selection.
4. Require SUCCEEDED and check the five outlier measurements and rate denominator.
   Compare results on a stable population before accepting the new execution plan.

If error 2646 persists, read the failed NUMERIC_STATISTICS/NUMERIC_OUTLIERS batch
in DQ_MODULE_LOG and obtain its SQL_TEXT for EXPLAIN. The field count alone cannot
solve insufficient spool for a single field over the full source. Assess the
view plan/AMP skew and an approved persistent projection of the final view with
DBA support; do not silently reduce the population or change the statistical rule.
No Teradata compilation, spool benchmark or deployment was performed here.
