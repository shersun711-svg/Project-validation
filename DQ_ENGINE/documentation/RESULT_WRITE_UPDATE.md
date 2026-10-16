# Fewer result-writing statements

The user timed the run-15 Numeric Basic aggregate alone at 43 seconds against
DQ_DIAG_NUMERIC_15. The earlier Basic batch, including result publication, took
about 4m30s. These observations were separate requests and may have different
workload conditions; they do not prove that every remaining second is INSERT
cost. However, the old code issued three writes per numeric field, making
statement dispatch, parsing, locking and persistence a concrete optimization
target. The supplied EXPLAIN showed one source scan and small estimated
aggregate spools; its estimates were not measured runtime.

## Change

Keep source aggregation and calculation formulas unchanged. Build each existing
per-field SELECT, then combine compatible SELECTs using INSERT ... UNION ALL.
Flush before a statement would exceed 30,000 characters, and before dropping
the small volatile aggregate it reads. These statements reference only saved
aggregates, not the RDS view or raw working-copy rows.

- Numeric Basic batches metric, full-precision statistics and availability writes.
- Outliers batches its result writes and logging updates. One run/field-range
  duplicate check replaces the equivalent per-field existence checks.
- Categorical, Identifier and Date Basic batch metric and availability writes.
- Standalone prerequisite statistics in file 03 retain their existing writer;
  combined Basic + Outliers runs obtain those statistics from Basic.

Explicit VARCHAR(128) field-name casts in every UNION branch avoid inferring a
short width from the first literal. Metric DECIMAL(38,10) casts, raw integer
numerators/denominators, FLOAT prerequisite statistics, dates, module/period
identifiers and special/missing rules remain intact. Execution timestamps now
mark each bulk insertion rather than a separate statement for every field.
No new persistent or volatile table, procedure, schema column, Excel setting or
SAS switch is introduced. Shared numeric copies and existing publication/failure
cleanup remain in use. No development-team implementation was copied.

For the supplied field list at SQL_BATCH_SIZE=25 and current SQL templates,
local statement generation gives:

| Selected workload | Previous result writes | Batched result writes |
|---|---:|---:|
| 20-field Numeric Basic batch | 60 | 4 |
| All 415 Numeric Basic fields | 1,245 | 83 |
| All 589 fields: required Basic modules + numeric Outliers | 2,008 | 124 |

These are generated request counts, not numbers of result rows, physical scans
or live speedups. The current count includes the
[wider categorical batches](PERFORMANCE_NOTES.md#categorical-and-identifier-batch-update).
Automatic aggregate SQL splitting, project/name lengths and
future configuration can change the counts. Metadata, source aggregation,
working-copy preparation, classification, standalone prerequisite statistics,
SAS readback and cleanup calls are excluded. Results have the same number of
field/period/metric rows as before. A two-hour full-run target is unverified.

## Deploy while profiling/configuration loads are stopped

Replace DQ_DB with LAB_T_ORION_MVT in deployment copies. Submit complete
procedures separately in SQL Assistant and run each included grant immediately:

1. modules/10_numeric_basic.sql: SP_DQ_NUMERIC_BASIC_BATCH + grant, then
   SP_DQ_NUMERIC_BASIC + grant.
2. modules/12_numeric_outliers.sql: SP_DQ_NUMERIC_PIPELINE + grant, then
   SP_DQ_NUMERIC_OUTLIERS + grant.
3. modules/15_other_basic.sql: SP_DQ_OTHER_BASIC + grant.

The public signatures are unchanged. Existing 20/30/40 wrappers, the file-00
runner, file-03 statistics helpers, results views, SAS files and Excel workbook
need no redeployment for this update. Preserve the shared-copy file-00 runner
already deployed for run 15. This is not a table migration or history cleanup.

Use the next intended profiling run to measure real end-to-end time; no manual
matrix of batch-size pilots is required by this update. Keep source/settings
stable. Reload Excel through 04/APPLIED only when changing active fields or
configuration. Module-0 numeric timings overlap in the shared-copy flow: use
DQ_RUN_LOG for total time, or the successful preparation/Basic/outlier batch
rows for phase totals. Require SUCCEEDED before reviewing saved results.

DQ_DIAG_NUMERIC_15 is a manual diagnostic copy, not an engine dependency. Once
its diagnostic work is complete, it and the session-only DQ_NB_DIAG_15 aggregate
can be dropped by their exact names if still present. Do not drop active engine
working copies or clear engine results as part of this deployment.

## Validation and limits

Run tools/check_result_writes.mjs with Node 24. It evaluates the actual SPL
substring/length guards, flushes and append expressions. It executes the
resulting INSERTs on SQLite and compares them with individual per-field writes
for all profiling writer types, long field names, empty/UNKNOWN groups, counts
above 2^53, unrounded FLOAT statistics and duplicate rejection. Generated
statement counts cover the current 589-field list. Tests also exercise the
outlier range guard with existing fields inside/outside the range and another
run. Existing aggregate, outlier, shared-copy, reporting-scope, rule, review and
MoM/YoY checks remain relevant and have not been replaced by these comparisons.

SQLite adaptations do not compile Teradata SPL, validate Teradata's UNION type
inference/decimal behavior, execute nested transaction rollback or measure the
site's resource use. Live compilation, privileges, quota, spool, workload and
full-RDS speed must still be verified on the installed release. No quantified
production speedup or two-hour guarantee is claimed.
