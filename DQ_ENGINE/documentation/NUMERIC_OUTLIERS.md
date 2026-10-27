For the current bounded-copy upgrade, use [working storage](PERFORMANCE_NOTES.md#working-storage).
For configurable overall/monthly/yearly output, follow the current
[reporting-level upgrade](REPORTING_LEVELS.md) before using these procedures.

# Numeric Outliers

Enable numeric_outliers=Y in sas/00_run_dq_engine.sas. It runs for every active
NUMERIC field. No new workbook columns or per-field switches are needed.

## Rule and populations

    Lower bound = mean - 3 * population standard deviation
    Upper bound = mean + 3 * population standard deviation

Only values strictly below/above these bounds are outliers. Equality is allowed.
For a population of n valid observations, the largest possible absolute
population-standardised distance is sqrt(n-1). Therefore, with 1–10 valid
observations no strict 3-sigma outlier is mathematically possible. The counting
predicates enforce this identity using each reporting period's valid count,
preventing floating-point rounding from turning a boundary value into an outlier.
This is not a new minimum-sample-size setting: statistics and bounds are still
calculated, counts/rates are zero for these valid populations, and empty
populations keep their existing NULL behaviour. No tolerance is added to larger
populations and the multiplier remains 3.
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
count in DQ_NUMERIC_STATISTICS while processing its existing aggregate. Combined
Basic + Outliers now use the same bounded copy via SP_DQ_NUMERIC_PIPELINE;
Basic-only still reads the captured source directly. Outliers
reuse those values, rather than rounded DECIMAL results. If Basic=N, the internal
SP_DQ_NUMERIC_STATISTICS prerequisite calculates the same aggregates; it emits
no Basic metric rows or availability dates. Outliers now use the internal
SP_DQ_NUMERIC_STATS_BATCH helper against the same bounded working copy; the original
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

Outliers use one bounded MULTISET working copy at a time. SQL_BATCH_SIZE controls
its width, capped at 20 numeric fields plus the reporting date and physical keys;
counting queries also accept up to 20 fields, splitting automatically if their
generated SQL would be too long. A 20-field copy normally serves one counting
batch, then is dropped before copying the next group. Copies preserve native
values, NULLs and duplicates, year partitions and independent random distribution.
They use permanent space; aggregation uses small volatile summaries.

The faster join for populated year chunks and the empty-source outer join remain
unchanged. Reuse unrounded Basic statistics when present; otherwise the bounded
shared helper computes this counting batch's statistics from the same copy.
Only the current group's source columns are loaded. Keep source/configuration
stable while processing groups; count checks cannot detect every value change.
The combined path calls the same Basic batch helper against the copy before
counting, rather than completing Basic on the original source first. See
[shared-copy deployment and timings](SHARED_NUMERIC_COPY.md).

Names include run UUID, attempt and first counting batch. Batch 1 is logged
before loading. Batch 0 is the overall summary and retains copy identity for
recovery. Empty-table creation precedes loading so handled load failures can drop
an owned table. Hard session termination can bypass cleanup. No unowned or active
work table may be removed automatically. See [deployment, recovery, exact limits
and validation](PERFORMANCE_NOTES.md#working-storage). For the wider calculation update,
see [20-field deployment](PERFORMANCE_NOTES.md#batch-sizes-and-spool).

This reduces peak copy width but adds source reads; it does not guarantee a
full-run runtime or that one copy fits the remaining database quota. Existing
math and period results are unchanged. Live Teradata compilation, grants,
transaction/cleanup behavior, permanent and spool space still need verification.

## Upgrade an existing outlier deployment after error 2646

Use the current [bounded-storage deployment](PERFORMANCE_NOTES.md#working-storage): file 03
now has three helper/wrapper procedures, and file 12 uses bounded copies. Do not
follow an older instruction to compile file 12 alone. No table migration is
needed. Submit each procedure and its included grant separately.

The optional [partition preflight](../tests/test_outlier_partition.sql) creates
an eight-row source and one small working table in an approved test schema.
Verify names are unused first; stop on errors. Expected: TOTAL_ROWS=8,
YEAR_KEYS=6, BAD_KEYS=0, DUPLICATE_ROWS=2. Confirm EXPLAIN partition elimination
for year 2005 and key 0 (NULL dates). Drop only the two test tables created by
that preflight. It checks empty-table CREATE, INSERT, statistics and partition
predicates, without proving RDS capacity or runtime.

Stored year keys span 0-9999. Overall counts use overall bounds across chunks,
rather than adding monthly outlier counts. The conditional fast join, explicit
period widths, duplicate/population guards and special exclusions are retained.

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
DQ_OS_40000000000040008000000000000001_A1_B1. This is an example, not a table name to
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
