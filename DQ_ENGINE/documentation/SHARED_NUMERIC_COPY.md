# Shared numeric copy for Basic and Outliers

Combined numeric runs previously aggregated Basic directly from the configured
view, then read that view again to prepare each outlier copy. Both selections
now route through SP_DQ_NUMERIC_PIPELINE. For each bounded group it:

1. Creates/loads the existing partitioned native-value copy, capped at 20 fields.
2. Calls SP_DQ_NUMERIC_BASIC_BATCH against that copy for the accepted field range.
   This is the same Basic aggregate/result logic used by the public Basic API.
3. Uses the saved unrounded statistics and same copied rows for outlier counting.
4. Drops the copy after its final field, then prepares the next group.

This avoids Basic's separate original-view reference in a combined run. It
still requires one pass for statistics and another for outlier comparisons.
SQL-length splitting, source row multiplicity, special handling, population
standard deviation, strict +/-3 bounds, reporting levels, POU_DT, availability,
rule evaluation, publication, project isolation and retention are unchanged.
No new table or Excel/SAS setting is introduced. Keep source/configuration
stable for the run: a per-group copy is not an all-field atomic snapshot.

Basic-only uses SP_DQ_NUMERIC_BASIC against the captured original source.
Outliers-only uses SP_DQ_NUMERIC_OUTLIERS and its existing standalone statistics
helper. Public signatures remain unchanged. The Basic helper uses captured run
fields/settings; it no longer refreshes them from mutable configuration during
execution or overwrites original-source metadata with a working-table name.

## Deploy while profiling and loads are stopped

Replace DQ_DB with LAB_T_ORION_MVT in deployment copies. Use SQL Assistant to
compile each complete procedure separately and execute its grant immediately:

1. modules/10_numeric_basic.sql: SP_DQ_NUMERIC_BASIC_BATCH + grant, then
   SP_DQ_NUMERIC_BASIC + grant.
2. modules/12_numeric_outliers.sql: SP_DQ_NUMERIC_PIPELINE + grant, then
   SP_DQ_NUMERIC_OUTLIERS + grant.
3. modules/00_run_engine.sql: recompile SP_DQ_RUN_EXTENDED (the first procedure)
   and its grant. The remaining wrappers are unchanged and need no update for
   an existing installation. Fresh installations compile every wrapper in order.

No table creation, migration, 03 statistics, rule/view or SAS redeployment is
required for this update when the previous width update is already installed.
Do not submit individual lines from inside a procedure.

## Next intended run

Use the approved active fields, SQL_BATCH_SIZE=25, overall/monthly Y and yearly N.
In SAS 00 enable Numeric Basic and Outliers together, plus the other required
Basic modules for the full 589-field selection. The numeric path shares copies
automatically; nonnumeric modules retain their current source aggregation.
Reload Excel with 04/APPLIED only if you changed the applied configuration.
No separate prerequisite-statistics call or extra configuration flag is needed.

Local regressions have been run. The user can measure the next intended run
rather than performing a matrix of manual pilots. Live compilation and the
site's resource limits still determine whether that run succeeds. Completion
within two hours is a target, not a verified guarantee; a slower or failed
workload must be diagnosed from the recorded phases.

## Log timings

The existing DQ_MODULE_LOG now also records NUMERIC_PREPARE rows (BATCH_ID>0):
copy creation/loading, grants, partition statistics and chunk-calendar setup.
Its FIELD_COUNT is the number of copied numeric fields. These are phase rows,
not new profiling metrics or an extra result table.

NUMERIC_BASIC batch rows record Basic calculation and persistence. Outlier
batch START_TIME is reset after Basic/standalone-statistics prerequisites, so
its successful duration covers bounds, chunk counting, rollup, persistence and
cleanup. During preparation a RUNNING outlier row can still show its provisional
start time and load SQL; SQL_TEXT alone never proves which request is active.

Use DQ_RUN_LOG for end-to-end time. Module-0 Basic and Outliers wall times can
span/interleave other work and must not be added. Sum successful batch rows
(BATCH_ID>0) per phase to compare preparation, Basic and counting. Metadata,
orchestration, classification and nonnumeric work account for any remaining
run duration. Failed phases are diagnostic, not successful timings.

Handled Basic exceptions propagate to the pipeline, which attempts to drop its
owned copy and volatile tables, then to the shared run handler, which clears
partial output and fails the run. Hard aborts can still leave the exact named
copy for targeted recovery after all requests stop. No wildcard cleanup occurs.

## Evidence and independence

Node/SQLite tests compare generated Basic metrics, full-precision statistics,
availability and dates against direct-source results for 41 fields in three
bounded groups, seven reporting scopes and empty/nonempty NULL/special data.
Changing the original source after staging leaves copied results unchanged.
Existing 415-field scheduling and outlier-value regressions remain in use.
SPL execution, nested exception propagation, DDL transaction cleanup, privileges,
physical I/O, spool and production runtime cannot be verified here.

The reviewed development-team numeric procedure uses a three-field batch and
one generated INSERT with stats/ol/agg CTEs. Both stats and ol reference its
configured source; the suite requests overall and monthly modes separately.
Those are logical references, not an observed physical plan. Our code was
implemented independently from our existing calculations; no development-team
SQL was copied. Their reported timing is not a controlled benchmark against
our configured view, population, metrics, privileges or workload.
