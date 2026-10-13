# Basic profiling upgrade

Numeric Basic has ten metrics. Categorical/identifier basics store missing
count/percentage and distinct count, with total/non-missing context in review.
Date Basic stores exactly total, non-missing, missing counts and missing
percentage. No categorical frequencies or date value extrema are calculated.
All modules use overall/yearly/monthly reporting periods, the existing shared
colour rules and internal UUID lifecycle. Short RUN_NUMBER identifies runs
for users in Teradata/SAS. See [date scope](DATE_BASIC_UPGRADE.md) and
[overall field availability](FIELD_AVAILABILITY.md).

For the current deployed engine, apply DATE_BASIC_UPGRADE.md only. The full
sequence below is for an older numeric-only installation; skip tables/number
backfill already deployed. Do not drop existing results or rerun table CREATEs.

## Full additive upgrade from numeric-only

With profiling/configuration loading stopped, replace DQ_DB with the approved
engine schema (currently LAB_T_ORION_MVT). Use Teradata session mode without
an enclosing transaction.

1. setup/09_add_basic_metrics.sql: categorical/identifier metadata.
2. setup/10_add_run_numbers.sql, once: mapping/counter and historical backfill.
3. setup/11_create_field_availability.sql, once: overall coverage store.
4. setup/12_add_date_basic_metrics.sql: the four date metric definitions.
5. Compile modules/01_assign_run_number.sql, then 15_other_basic.sql.
6. Compile wrappers 20_categorical_basic.sql, 30_date_basic.sql and
   40_identifier_basic.sql separately as complete procedure statements.
7. Recompile modules/10_numeric_basic.sql.
8. Compile modules/00_run_engine.sql as two complete statements, basic runner
   first and the SP_DQ_RUN_ENGINE compatibility wrapper second.
9. Replace results/91_dq_summary_views.sql, 92_dq_numeric_review.sql and
   93_dq_basic_review.sql. File 90's
   shared classification logic is unchanged.
10. Run the current SAS controller in the same session as the run/test file.

Runtime needs procedure EXECUTE, configuration/source SELECT, result/availability
DML, mapping INSERT/SELECT and counter UPDATE/SELECT. View owners need required
grantable access to dependencies. Check these with your DBA. No grants/deployment
are performed by repository tools.

The number allocator owns a short transaction and serializes one counter row,
releasing it before profiling. UUIDs/results are not rewritten. Global numbers
include failed runs; retries retain numbers. Never reset/delete mappings during
old test-result cleanup. Verify concurrent allocation with two sessions.

## Configuration and review

The simplified Excel Fields sheet has three columns; apply
ACTIVE_FIELD_SELECTION.md when migrating an old four-column installation. FIELD_TYPE/ACTIVE_IND select non-numeric fields;
There are no per-field test flags; ACTIVE_IND selects all types consistently. Select the matching basic
SAS switches. A selected module with no eligible fields fails explicitly.
Percentiles/outliers/PSI/Excel export remain N.

DQ_BASIC_REVIEW combines successful metric results. Numeric MINIMUM/MAXIMUM
remain numeric; date rows have NULL in unrelated columns. No separate date
view or reporting workflow is required. Availability is separate,
named FIRST_AVAILABLE_FACT_DT/LAST_AVAILABLE_FACT_DT in combined review and
populated only for OVERALL. Old date extrema remain stored in the legacy table
but are not shown or recalculated. New runs are required for date counts.

Only SQL NULL is missing. Distinct excludes NULL and follows source comparison
semantics. Date Basic does not parse strings or check value validity. Reporting
DATE/TIMESTAMP compatibility and stable source population remain assumptions.
Empty runs emit one OVERALL row per selected field, zero counts and
NULL/NOT_EVALUATED rates, with NULL coverage.

## Performance and validation

Distinct modules use three ordinary GROUP BY queries combined by UNION ALL,
with explicit grouping flags. The user's DISTINCT/GROUPING SETS query returned
fourteen rows/all flags 1; that combination is no longer used. Batches cap at
20 fields for SQL-size safety. Numeric/date use configured batch sizes and
GROUPING SETS. Physical scan sharing and performance need server benchmarking.
Bounded SQL parts avoid the previously reported SPL expression-length error;
actual-length guards reject oversized text instead of truncating it.

Use the synthetic SQL/SAS tests in an isolated test engine. Fixtures provide
known missing, zero, distinct, empty, NULL-date and failure/retry cases. The
current failure field is Z_MISSING_DATE (absent source column); older Z_BAD_DATE
fixtures need updating only within the synthetic project. Fixed completed
UUIDs cannot be replayed. Every assertion query returns zero rows; client/CALL
errors or an abort fail the test.

Local Node checks cover templates and portable SELECT logic only. Live
SAS/Teradata execution, installed-release syntax, permissions, count range,
transaction/lock behaviour and performance acceptance remain server checks.
