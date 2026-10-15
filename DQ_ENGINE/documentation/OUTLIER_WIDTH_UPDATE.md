# Outliers: up to 20 fields per calculation

The previous release loaded a 20-field working copy but calculated five fields
at a time. This update keeps the copy cap at 20 and also accepts up to 20 fields
per calculation. Excel SQL_BATCH_SIZE controls both caps; 25 or 30 means at
most 20. No schema, workbook, SAS or procedure signature changes are needed.

SQL fragments are checked before appending. If the next field exceeds the
combined 29,000-character source/count/overall-bound budget, it stays for the
next calculation. The remaining 3,000 characters cover joins, period expressions
and wrappers inside VARCHAR(32000). Separate buffers are sized for the accepted
width. Current RDS names and configured specials fit 20-field calculations in
local checks, including yearly reporting. Very long special lists can cause
smaller batches; existing standalone statistics guards may still reject a list
that cannot fit their own query buffers.

The working copy remains immutable for its calculations and is dropped only
when its final field finishes. Statistics and bounds use only the accepted
field range. No sampling, percentile, rule, aggregation formula, +/-3 population
deviation rule, exclusion, period, retention or publication change is made.

Standalone statistics still aggregate at most ten fields per internal batch.
A wider outlier call can produce two such batches. They now continue after
existing statistics log IDs for the current run/attempt, preventing the next
outlier call from reusing a statistics batch ID. Summary timings include
interleaving and must not be summed with outlier timings. When Basic is enabled,
outliers reuse its captured statistics and do not call this prerequisite.

## Deploy, with profiling and loads stopped

1. In deployment copies replace DQ_DB with LAB_T_ORION_MVT.
2. Recompile all three complete procedures in modules/03_numeric_statistics.sql
   separately in file order, running each included grant immediately:
   SP_DQ_NUMERIC_STATS_BATCH, SP_DQ_NUMERIC_STATS_SOURCE, SP_DQ_NUMERIC_STATISTICS.
3. Recompile the complete modules/12_numeric_outliers.sql, then its grant.
   A local edit changing only the old five-field cap is insufficient; use this
   complete version with buffers, length guards and accepted-range handling.
4. Do not redeploy tables, SQL runners, Basic or SAS for this update.

## Controlled benchmark

Keep the same 20 active numeric fields, stable RDS population, special values
and reporting scope used in successful run 12. Keep SQL_BATCH_SIZE=25; if those
settings are already applied, no Excel reload is needed. In SAS 00 enable
numeric_basic=Y and numeric_outliers=Y, with the other profiling modules=N, to
compare the same combined workflow. Require a new successful run before review.

Expect one Basic batch and, if SQL length permits, one outlier counting batch
with FIELD_COUNT=20. Its time includes working-copy creation/loading, statistics
collection on the stage, year-chunk counting, result insertion and cleanup.
It is not the time of a single SQL statement. Do not add module summary rows
to their batch timings. Compare run-12 Basic (1m43.63s), Outliers (2m55.85s) and
combined module wall time (4m39.53s), while allowing for different database load.

The wider query may reduce repeated scans, but can require more peak spool.
A failed or slower run does not establish a speedup. Set SQL_BATCH_SIZE=10 or 5
and reload via SAS 04/APPLIED if a smaller width is needed. This also narrows the
working copy; it does not reproduce the old 20-copy/five-count layout exactly.
Keep the previous working Git version available for a full rollback if needed.

For an outlier-only test set Basic=N; its prerequisite statistics make its
runtime different from a combined run. Never compare that timing directly to
run 12 and attribute the difference solely to counting width.

## Verification

Local Node/SQLite checks execute generated 5/10/20-field calculations and compare
all saved metrics across seven scopes, NULLs, specials and empty populations.
The 415-field storage simulation verifies same-copy bounded statistics, unique
log IDs, one copy at a time and simulated failed-load cleanup. Generated SQL
width checks exercise actual RDS names and near-maximum special lists that
force splitting without skipped fields. Live Teradata SPL compilation, inference
of concatenation types, spool, permanent space, privileges, transaction cleanup
and speed remain unverified here. No development-team code was copied.
