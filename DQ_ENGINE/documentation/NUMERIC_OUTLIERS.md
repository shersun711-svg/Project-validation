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

Fewer than two valid observations cannot define a sample deviation: bounds,
outlier count and rate are NULL; the matching rule status is NOT_EVALUATED. VALID_COUNT still
shows 0 or 1. Empty sources produce only OVERALL with these same undefined
results. A constant population with at least two valid observations has zero
deviation, equal bounds and zero outliers; the rule status is GREEN. All-special fields
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
no Basic metric rows or availability dates. Outliers now use the internal
SP_DQ_NUMERIC_STATS_SOURCE helper against their narrow working table; the original
two-argument statistics procedure remains a compatible wrapper. Statistics timing
appears in module logs but not the metric-based run summary.

DQ_METRIC_RESULT stores five OUTLIERS metrics per field/period. DQ_BASIC_REVIEW
combines Outlier and Basic profiling metrics in one field/period row, without
colour columns. Read OUTLIER_RATE_PCT status and reason from DQ_RULE_RESULT. Old
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
2. In modules/03_numeric_statistics.sql, compile SP_DQ_NUMERIC_STATS_SOURCE and
   execute its following GRANT, then compile the SP_DQ_NUMERIC_STATISTICS wrapper
   and execute its grant. Submit the two complete procedures separately.
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

Outliers create a narrow MULTISET table in the engine schema containing only the
reporting-date column and all selected numeric columns. The original final view
is referenced once for this materialization, without extra row filters, DISTINCT,
numeric casts or special removal. Native source types, NULLs and duplicate rows
are retained. NO PRIMARY INDEX avoids choosing a skewed date/value primary index.
The table uses permanent space, not a volatile raw-row spool.

Standalone statistics and period counting read that table thereafter. Counting
filters the work table to one reporting month (or NULL-date rows) per statement
and calculates outliers against that month's OVERALL, YEARLY and MONTHLY bounds
in the same scan. It then rolls each set of counts up to its own period. This
avoids both the prior full-population OVERALL aggregate and rescanning every month
separately for each period level. A 255-month history needs 255 count statements
per five-field batch, or about 2,550 for 50 numeric fields at the five-field cap.
SQL_BATCH_SIZE=1 reduces fields per batch, but not the number of months. Runtime
and spool still require Teradata testing. Basic statistics are reused when
available; keep the source stable during a combined Basic+Outlier run. Existing
count checks detect population changes, not all value changes.

Work tables are named DQ_OS_<UUID without hyphens>_A<attempt>, so concurrent runs
and retries use distinct names. The outlier batch-0 SQL_TEXT retains the exact
creation statement/table name. Successful or handled-failure paths drop only the
table this invocation created. They do not overwrite/drop an existing table when
creation fails. An external abort/session loss may bypass SPL cleanup and leave
a work table; follow the recovery instructions below. No raw values are logged,
read by SAS or copied into repository files.

This trades permanent-space allocation and one materialization for avoiding
repeated expensive view work. The CTAS can still need substantial source-view
spool. Actual runtime, AMP distribution, permanent-space requirements, NO PRIMARY
INDEX support, DDL/grant permissions and cleanup need server testing. No measured
performance improvement is claimed. FLOAT calculations, DECIMAL storage, sample
standard deviation and the five outlier metrics are unchanged. PSI and Excel
report generation remain deferred.

Grant statements are separate from SPL procedure definitions. A client that
handles SPL deployment sequences can execute both from the same file. With
BTEQ .COMPILE FILE, compile only the procedure block, then submit its GRANT.
No grants have been executed from this workspace.

## Upgrade an existing outlier deployment after error 2646

Wait until the old request has ended. This update changes only the outlier
procedure. It assumes the current narrow work-table and statistics helper/wrapper
version is already deployed. No configuration table, result view, Excel column,
SAS file or runner wrapper change is required. Runtime needs free permanent space
and approved CREATE TABLE, DROP TABLE and grantable SELECT access in the engine
schema. The dynamic work-table SELECT grant is included in the procedure. A
procedure grant alone does not grant table-creation privileges.

1. Replace DQ_DB with LAB_T_ORION_MVT in a deployment copy of
   modules/12_numeric_outliers.sql. Compile the complete procedure, then execute
   its included GRANT EXECUTE PROCEDURE statement.
2. Keep the already-applied field configuration and test with a fresh run
   (retry_run_id blank), numeric_basic=N, numeric_outliers=Y and other tests=N.
   Use the same small numeric selection for a comparable run.
3. Require SUCCEEDED and review the outlier measurements/denominator. Confirm
   work-table removal and record elapsed time. If it is still too slow or fails
   2646, keep the SQL_TEXT and ask the Teradata DBA to review EXPLAIN, spool and
   AMP skew before increasing the field selection.

Batch-0 SQL_TEXT identifies the work-table CTAS. Later SQL_TEXT records the
current chunk or rollup statement; a failed chunk statement is limited to one
reporting month. The source view still needs enough spool for materialization.
Resolve permanent-space or DDL/grant errors before another run. Do not silently
change the source population or statistical rule. Teradata compilation, storage
and spool/runtime effects have not been verified from this workspace.

## Recover working data after an external abort

First confirm that the database request and session are no longer running.
Find the exact work-table name in the NUMERIC_OUTLIERS batch-0 SQL_TEXT for the
aborted RUN_ID/ATTEMPT_NO. SHOW TABLE that exact name in the engine schema to
check whether it remains. Drop only that identified table after confirming it
belongs to the stopped attempt; do not use wildcard or broad schema cleanup.
If SHOW TABLE reports it absent, no working-data cleanup is needed.

For example, the fixture run 40000000-0000-4000-8000-000000000001 attempt 1 uses
DQ_OS_40000000000040008000000000000001_A1. This is an example, not a table name to
reuse for a real run. A retry creates its own attempt-specific work table and
will not delete an older orphan. Existing run recovery rules still apply: do not
manually mark an active database request FAILED, and retain run-number mappings.
An interruption during CTAS or a failed cleanup may require DBA assistance to
verify/drop a leftover object. Working input has no historical retention purpose.

## Development reference

The supplied development-team numeric profile procedure was reviewed only as
reference material. Its two-pass statistics/counting structure is relevant, but
its STDDEV_POP choice, DBC.ColumnsV lookup and other result semantics were not
adopted. This engine retains STDDEV_SAMP, trusted Excel field types, captured
special lists and its existing five outlier metrics. No development-team code or
uploaded source file was copied into the repository.
