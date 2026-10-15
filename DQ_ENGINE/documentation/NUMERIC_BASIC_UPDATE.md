# Numeric Basic: fewer source aggregations

Numeric Basic previously limited each batch to ten fields even when Excel
SQL_BATCH_SIZE was 25. It now accepts up to 20, with automatic splitting to keep
generated SQL within buffer limits. SQL_BATCH_SIZE continues to control width;
no new setting, table, metric or SAS interface is introduced.

With the current 415 RDS numeric fields and configured special list, the plan
uses 21 source aggregation statements instead of 42. This is a reduction in
requests, not a measured halving of runtime. Wider queries can require more
spool; available workload capacity and EXPLAIN determine the physical behavior.

## Deploy

1. Wait until profiling/configuration loads are inactive.
2. Replace DQ_DB with LAB_T_ORION_MVT in a deployment copy of
   teradata/modules/10_numeric_basic.sql.
3. Compile the complete SP_DQ_NUMERIC_BASIC procedure in SQL Assistant, then
   execute its accompanying GRANT EXECUTE PROCEDURE statement.
4. No table migration or changes to 03/12, orchestrators or SAS are required
   for this update. Keep the previously deployed bounded outlier version.

## Benchmark before another full run

Use the same 20 active numeric fields, stable source, reporting levels and
special values for two new Basic-only runs. First load SQL_BATCH_SIZE=10 via
SAS 04, confirm APPLIED, then run 00 with numeric_basic=Y and all other profiling
modules=N. Repeat at SQL_BATCH_SIZE=20 (25 is also capped at 20). The first run
plans two Basic batches; the second plans one unless the SQL length requires
splitting. Compare module-0 elapsed time; do not add its batch times again.
Existing results remain subject to the engine's normal retention policy.

Require SUCCEEDED and compare profiling values excluding identifiers and
execution timestamps. Use the same levels, fields and special list for both
runs; changing these makes timing/results incomparable. Keep sources stable.
The completed work remains in the result tables for successful retained runs;
no Basic recalculation is required just to review it.

If the wider batch is slower or exhausts spool, use SQL_BATCH_SIZE=10. Smaller
settings remain supported. Outlier counting also supports up to 20 fields after the
[separate outlier update](OUTLIER_WIDTH_UPDATE.md). Benchmark it separately;
a Basic-only benchmark does not validate its spool requirement.

For a subsequent full Basic + Outliers run, enable both in 00. Outliers already
reuses Basic's unrounded mean and population standard deviation; a separate
standalone statistics pass is unnecessary. The original source view must remain
stable throughout the run; count guards cannot detect every value change.

## Verification limits

Node/SQLite checks execute the generated aggregate expressions at different
widths for 415 fields and all reporting levels, including NULLs, special values,
empty data and long-SQL splitting. Existing tests cover metric persistence,
POU_DT, availability, standalone statistics and outliers. These are developer
checks, not a Teradata SPL compiler or a live spool/runtime benchmark.

No formula, special exclusion, percentage storage, review formatting, rule
logic, safe publication, project isolation or retention behavior is changed.
