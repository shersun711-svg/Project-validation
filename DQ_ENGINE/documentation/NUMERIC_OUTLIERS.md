For configurable overall/monthly/yearly output, follow the current
[reporting-level upgrade](REPORTING_LEVELS.md) before using these procedures.

# Numeric Outliers

Enable numeric_outliers=Y in sas/00_run_dq_engine.sas. It runs for every active
NUMERIC field. No new workbook columns or per-field switches are needed.

## Rule and populations

    Lower bound = mean - 3 * population standard deviation
    Upper bound = mean + 3 * population standard deviation

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
| OUTLIER_LOWER_BOUND / OUTLIER_UPPER_BOUND | Period-specific mean minus/plus 3 times population deviation |
| OUTLIER_COUNT | Number of valid values strictly outside bounds |
| OUTLIER_RATE | OUTLIER_COUNT / OUTLIER_VALID_COUNT, displayed to six decimals; stored OUTLIER_RATE_PCT retains percentage units |

No valid observations cannot define a deviation: bounds, outlier count and rate
are NULL; the matching rule status is NOT_EVALUATED. With one valid observation,
population deviation is zero, both bounds equal that value, and its rate is zero.
Empty sources produce only OVERALL with undefined results. A constant population
has zero deviation, equal bounds and zero outliers; the rule status is GREEN. All-special fields
remain non-missing in Basic but have zero valid outlier observations.

This valid-population denominator implements the user's special-value exclusion;
it differs from the original unfiltered non-missing count when specials exist.
For an unevaluated rate, RATE_NUMERATOR and RATE_DENOMINATOR are NULL, even if
OUTLIER_VALID_COUNT=0. Bounds/count/valid-count are not percentage metrics.
Colours are screening classifications, not proof that flagged values are invalid.

## Statistics reuse and results

Updated Numeric Basic saves its unrounded FLOAT mean/population deviation and valid
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

## Deployment and test selection

For a fresh installation, use [the complete deployment sequence](README.md#one-time-deployment).
For the current existing engine, follow [the reporting-level upgrade](REPORTING_LEVELS.md),
which includes the statistics helper, outlier procedure and runner dependencies.
Do not rerun table CREATE scripts on an existing installation. Replace DQ_DB with
the approved schema in deployment copies, including grants. Wait for running
profiling and configuration jobs to finish before deploying.

After deployment, load SAS 01 in your session. Edit the workbook and reload with
04 only when changing configuration; require APPLIED. Test a small numeric
selection with file 00 and numeric_outliers=Y:

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
and SAS population-standard-deviation reconciliation. Supplied server tests have not
been executed here. Substitute fresh consistent UUIDs when repeating tests.

Local checks execute generated aggregate/statistics/insert queries on synthetic
SQLite data with narrow dialect adaptations. They are not Teradata SPL or SAS
execution. Actual procedure compilation, privileges, cleanup/transaction behaviour,
numerical behaviour and workload must be verified on the installed release.

Outliers create a narrow MULTISET table in the engine schema containing the
reporting-date column, selected numeric columns and two internal physical keys.
The original final view is referenced once for materialization, without extra
row filters, DISTINCT, source-column casts or special removal. Native source
types, NULLs and duplicate rows are retained. A stored year key partitions rows
by year; 0 holds NULL dates. A random integer bucket is the nonunique primary
index, distributing rows independently of repeated dates, values or duplicates.
Internal names are chosen outside the selected source-column namespace. Neither
key changes profiling values or participates in outlier bounds/counts.
The table uses permanent space, not a volatile raw-row spool. Partition and year
statistics are collected once after loading. Each chunk filters its stored year
key directly, allowing static partition elimination; confirm it with EXPLAIN.

Standalone statistics and period counting read that table thereafter. The
outlier procedure aggregates one calendar year per statement, grouping that
year into at most twelve monthly summaries while retaining overall, yearly and
monthly bounds/counts. It then rolls the compact summaries into final periods.
This avoids the full-history aggregate that exhausted spool and avoids one
query per month. For 415 numeric fields over 22 populated years, it generates
roughly 1,900 year-chunk and rollup statements at the five-field cap, versus
about 21,165 month-level statements in the earlier loop. This query-count
estimate does not guarantee Teradata runtime or spool use. The source view is
still materialized once; each year query filters the narrow stage. Basic
statistics are reused when available; keep the source stable during a combined
Basic+Outlier run. Existing count checks detect population changes, not all
value changes.

Work tables are named DQ_OS_<UUID without hyphens>_A<attempt>, so concurrent runs
and retries use distinct names. The outlier batch-0 SQL_TEXT retains the exact
creation statement/table name. Successful or handled-failure paths drop only the
table this invocation created. They do not overwrite/drop an existing table when
creation fails. An external abort/session loss may bypass SPL cleanup and leave
a work table; follow the recovery instructions below. No raw values are logged,
read by SAS or copied into repository files.

This trades permanent-space allocation and one materialization for avoiding
repeated expensive view work. The CTAS can still need substantial source-view
spool. Partitioning adds row storage, redistribution and statistics-collection
cost at creation. Actual runtime, AMP distribution, permanent-space requirements,
partitioned CTAS/RANDOM support, DDL/statistics/grant permissions and cleanup need
server testing. No measured
performance improvement is claimed. FLOAT calculations, DECIMAL storage,
population standard deviation and the five outlier metrics are unchanged. PSI and Excel
report generation remain deferred.

Grant statements are separate from SPL procedure definitions. A client that
handles SPL deployment sequences can execute both from the same file. With
BTEQ .COMPILE FILE, compile only the procedure block, then submit its GRANT.
No grants have been executed from this workspace.

## Upgrade an existing outlier deployment after error 2646

This update assumes the reporting-level upgrade is installed. It changes only
modules/12_numeric_outliers.sql; no Excel, SAS, configuration/result schema,
statistics-helper or runner recompilation is required. Keep the five-field cap.
Runtime needs CREATE/DROP TABLE, grantable SELECT and permission to collect
statistics on the work table it creates. The dynamic SELECT grant and the
procedure EXECUTE grant are included. No database deployment is performed here.

1. Confirm the previous database request/session has ended. An interrupted
   client's RUNNING log is not proof of a live query. Resolve its stale status
   and exact orphan table using the recovery guidance below; do not drop tables
   belonging to active requests or change other runs.
2. Run [test_outlier_partition.sql](../tests/test_outlier_partition.sql) in an
   approved test schema, replacing DQ_DB globally. It creates two tiny permanent
   tables with eight synthetic rows and no RDS access. Verify their names are
   unused first; submit statements separately and stop on any error. Expected:
   TOTAL_ROWS=8, YEAR_KEYS=6, BAD_KEYS=0, DUPLICATE_ROWS=2. Save EXPLAIN output;
   confirm partition elimination for year 2005 and key 0 (NULL dates). Drop only
   these successfully created test tables using the final statements.
3. Replace DQ_DB with LAB_T_ORION_MVT in a deployment copy of
   modules/12_numeric_outliers.sql. Compile the whole procedure, then execute
   its included GRANT separately. Do not change the SQL_BATCH_SIZE or field
   selection for the comparison.
4. Run the same five fields and source population with the same module switches
   and Y/Y/N overall/monthly/yearly settings, using a fresh run ID. The update
   omits the disabled yearly bounds join/comparisons. Numeric Basic reuse and
   standalone outliers remain supported. Compare identical module selections;
   a Basic+Outlier run is not a timing baseline for Outliers-only.
5. Require SUCCEEDED, unchanged metrics and normal working-table cleanup. Record
   materialization/statistics overhead and full module/batch elapsed minutes.
   Review the actual counting query's plan and approved DBQL I/O, peak spool and
   AMP skew. The synthetic preflight does not establish RDS performance. Expand
   the field selection only after this comparison passes.

The table range covers year keys 0 through 9999. Normal chunks address one year
partition; NULL-date chunks address key 0, and the empty-source chunk reads no
rows. It is still a sequential year loop, with global bounds applied to every
chunk for OVERALL counts and separate monthly bounds for MONTHLY counts. Overall
counts are not the sum of monthly outlier counts. Explicit period widths,
duplicate-key/population guards, special exclusions and publication are unchanged.

Batch-0 SQL_TEXT identifies the work-table CTAS. Later SQL_TEXT records the
current batch aggregate or metric insert. A failed aggregate can cover all
reporting periods for that batch. The source view still needs enough spool for
materialization.
Resolve permanent-space or DDL/grant errors before another run. Do not silently
change the source population or statistical rule. Teradata compilation, storage
and spool/runtime effects have not been verified from this workspace.

## Check period keys after the rollup duplicate-key error

The reported run 4 completed chunk counting and reached the rollup guard,
which signalled `Outlier rollup contains duplicate period keys` (7693).
Its logged UNION started with the untyped literal `'ALL'` as PERIOD_VALUE.
That leaves the output width dependent on Teradata's set-operation type
resolution and can truncate longer year/month keys. The revised procedure
explicitly casts every rollup branch to VARCHAR(8) for PERIOD_LEVEL and
VARCHAR(10) for PERIOD_VALUE, matching the result-table domains. Chunk keys
also have explicit VARCHAR(10) widths. The duplicate-key guard is retained;
no DISTINCT or deduplication is used to conceal collisions.

Before another RDS run, execute [test_outlier_rollup.sql](../tests/test_outlier_rollup.sql)
in a fresh SQL Assistant session. It uses five synthetic chunk rows and two
volatile test tables, with no RDS reads or permanent engine changes. Expected
summary: PERIOD_ROWS=10, UNIQUE_PERIOD_KEYS=10, BAD_ROWS=0. The detail output
must retain full keys such as 2005-01, 2005-02, 2006-01, 2026-03 and UNKNOWN.
The script drops its own test tables at the end. If it errors, stop and retain
the error/output; disconnect that test session to discard its volatile tables.

After this passes, recompile the complete updated `12_numeric_outliers.sql`
and its included grant, replacing DQ_DB with the approved schema. No configuration
reload, permanent schema migration or other procedure recompile is needed.
The old unpartitioned work table could be scanned for every year/batch; a year
filter alone did not establish partition elimination. The current partitioned
layout and server preflight are described in the upgrade steps above. Volatile
bounds/chunks are session-local and removed after completion, so explaining a
logged full counting query can require an isolated reconstruction of its objects.
Do not rerun a logged INSERT against live work tables merely to get its plan.

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
its STDDEV_POP choice informed this engine's standard-deviation change; its
DBC.ColumnsV lookup and other result semantics were not adopted. This engine
uses trusted Excel field types, captured special lists and its existing five
outlier metrics. No development-team code or
uploaded source file was copied into the repository.
