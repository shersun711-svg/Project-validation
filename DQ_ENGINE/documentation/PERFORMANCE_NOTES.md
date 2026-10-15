# Performance and workload

Calculations and any raw staging stay inside Teradata; SAS reads configuration,
logs and aggregated summaries. Execution is sequential and respects the site's
workload management. The source view's existing filters and row multiplicity
are retained. Keep source and configuration stable during execution.

| Module | Effective maximum fields per batch | Source access |
|---|---:|---|
| Numeric Basic | Up to 20, with SQL-length splitting | One aggregate statement using GROUPING SETS |
| Categorical Basic | 8 | Three explicit overall/year/month queries using UNION ALL |
| Identifier Basic | 20 | Three explicit period queries using UNION ALL |
| Date Basic | 30 | One aggregate statement using GROUPING SETS |
| Numeric Outliers | Up to 20 copied/counted; SQL-length splitting | One bounded working copy per group; partitioned year-chunk counting |

SQL_BATCH_SIZE remains configurable from 1 to 30; effective size is the lower
of the setting and module cap. Special lists increase generated query size;
Numeric Basic automatically starts a smaller batch before its generated SQL
exceeds the safe text limit; other modules retain their existing length guards.
Lower the setting if a wider aggregate exceeds available spool. Caps bound
query width and are not measured optimal batch sizes. With the current RDS
special list and default setting, 50 numeric fields use three Basic batches.

Basic modules aggregate compatible statistics together, then persist results
from small volatile aggregates. Numeric Basic emits 12 metrics and categorical
5; date and identifier emit 4 and 3. Availability is calculated in the same basic
aggregate and requires no separate source scan.

Categorical/identifier use ordinary GROUP BY with literal period flags because
the user's DISTINCT/GROUPING SETS query returned duplicate period keys. Three
source references do not imply exactly three physical scans: check EXPLAIN on
the actual logged statement. Distinct aggregation can require substantial spool.

Run numbering locks its small counter only before profiling.

## Benchmarking

Use tests/benchmark_numeric.sql and saved DQ_MODULE_LOG.SQL_TEXT. Record module
and batch elapsed minutes and approved DBQL CPU, I/O, spool and AMP skew metrics.
Compare settings 1, 5, 10, 15 and 20 using new run UUIDs, the same active fields,
same stable population and same workload. Values above a module cap do not
increase that module's batch size. Require result equivalence before comparing
speed. Explain the logged aggregate queries on the installed release
and confirm sufficient spool before broad RDS use. No timing, spool or throughput
benchmark of this extension has been executed here.

## Investigate run 7 without DBQL access

The user supplied successful RDS run-7 timings: Numeric Basic 3.58 minutes;
Outliers 21.96 minutes, of which batch 1 accounts for 21.07 minutes. The initial
outlier preparation interval is 0.88 minutes. Batch 0 includes batch 1 and must
not be added to it. These timestamps locate the cost inside batch processing;
they do not identify its physical query bottleneck or establish a speedup.

Use tests/diagnose_outlier_rds_run7.sql when DBC.QryLogV is unavailable. No new
catalog privilege is needed. This script is generated from the actual current
outlier CTAS, bounds and counting templates for the five fields in that run.
Replace every DQ_DB token, including quoted occurrences, with LAB_T_ORION_MVT.
Use one fresh SQL Assistant session and submit sections separately:

1. A checks run identity, project, source, Y/Y/N scope, numeric field ordinals,
   captured specials and available overall/2018 statistics. Require ZERO rows;
   stop on any mismatch or SQL error. This step does not scan RDS.
2. B recreates the full five-field working projection once as DQ_DIAG_OUT_R7,
   with the same physical keys and statistics. This consumes source-view spool
   and permanent space. Verify the name is unused first; a CREATE error is not
   permission to drop an existing table. Record its elapsed time separately.
3. C recreates small session-local bounds from run 7's stored FLOAT statistics.
   D obtains the complete counting SELECT's plan for year 2018. Keep EXPLAIN in
   place: it compiles the plan without executing the expensive count query.
4. Save the entire plan for review of partition access, estimated intermediate
   rows, redistribution, joins and aggregation. Estimates cannot diagnose
   historical workload queuing or establish actual CPU/I/O/spool measurements.
   Section D2 is a comparison EXPLAIN for the populated 2018 chunk. If A-D
   already succeeded, run D2 only in the same session. It reuses the stage and
   bounds and changes only the join of the single overall-bounds row to the
   source from LEFT JOIN to CROSS JOIN. Do not remove EXPLAIN or apply this
   unconditionally to the procedure: an empty source still needs its zero-row
   population summary. The current procedure uses CROSS JOIN only for populated
   chunks and retains LEFT JOIN for the empty-source sentinel.
5. D3 optionally runs the original and candidate counts for 2018 once each into
   DQ_DIAG_OUT_OLD and DQ_DIAG_OUT_NEW (small volatile tables). If B/C are still
   present, run D3 only, one statement at a time, recording each CREATE's elapsed
   time. The summary must report MATCH, equal positive row counts (12 for the
   supplied plan), zero DIFFERENT_ROWS and zero duplicate keys. Bidirectional
   MINUS checks every column including NULLs; separate row/duplicate checks
   prevent set comparison from hiding multiplicity changes. Both empty is a
   failure. Bounds are copied from the same saved FLOAT values, so this join-only
   comparison uses exact equality. Optional detail identifies old-only/new-only
   rows. Stop on errors; do not compare a partial or stale result table.
6. E drops only the diagnostic tables created successfully. Skip the two D3
   result-table drops if that section was not run. Configuration,
   source tables, run logs and published results are untouched. Disconnecting
   removes volatile bounds but can leave the permanent diagnostic stage.

The current view is materialized, not the historical source snapshot. Keep the
source stable; if it changed, this investigates today's plan and cannot prove
run 7's exact execution. No full profiling run or procedure recompile is needed.
This diagnostic has been checked locally, but its Teradata plan has not been
obtained from this workspace. It is a focused investigation artifact rather
than a new profiling module or general-purpose benchmark API.

The supplied 2018 plan confirms partition elimination but exposes a potential
skew bottleneck. Step 7.1 redistributes approximately 1.565 million detail rows
by the overall bounds/counts tuple, which is constant across those rows. A
constant hash key concentrates rows at one hash destination. Step 8 restores
the preserved side of the outer join by a merge join; later detail spools are
estimated at approximately 332 MB and 539 MB before reduction to 12 months.
These are individual optimizer estimates, not measured or additive peak spool.
Broadcasting the one-row bounds table/product join is not itself evidence of
an error. D2 tests whether removing the outer-preservation requirement for a
known populated chunk removes constant-key redistribution and its restoration
join. The supplied new plan removes these steps. The user measured two seconds
for 2018 and confirmed D3: 12 old rows, 12 new rows, zero differences, zero duplicate
keys, MATCH. The join is now integrated for populated chunks. Full-engine runtime
is still unmeasured; repeat the same five-field run after deployment.

## Controlled source staging

For the complex RDS view, an approved immutable projection of the final view
may reduce repeated joins/windows and ensure a consistent population. Benchmark
this before adoption. Preserve all final-view filters and duplicates; add no
extra WHERE/DISTINCT. Candidate (AGMT_ID,FACT_DT) uniqueness is not assumed.
Include materialization, statistics and retention cost in the comparison.

Use a separate test project pointing to a DBA-approved persistent stage, with
the same fields, settings and special lists. Do not mutate production source
configuration for benchmarking. A permanent stage survives separate SAS
sessions; a manually created volatile stage does not. This manually managed benchmark stage is separate from the
automatic outlier work table described below.

## Numeric Outliers

Outliers materialize one bounded field group at a time into a MULTISET work table
in the engine schema, projecting the reporting date and selected numeric fields
without source-column casts, filters or deduplication. It uses permanent space,
with a stored year partition key (0 for NULL dates) and an independent random
bucket as its nonunique primary index. Internal keys preserve all source rows
and values. Partition/year statistics are collected once per loaded field group. Counting
queries constrain the stored partition key directly instead of extracting the
year from every staged row for every batch. Standalone statistics and counting
queries read that copy;
Basic statistics remain reusable as before.

Outliers aggregate one calendar year at a time, grouping each year's rows into
monthly summaries while counting against the overall, yearly and monthly bounds.
This bounds each aggregate's input period instead of combining all history in one
GROUPING SETS statement. At 415 numeric fields and 22 populated years, it is
roughly 1,900 year-chunk and rollup statements across 83 batches (SQL_BATCH_SIZE
5), versus about 21,165 month-level statements in the earlier loop. This is a
query-count estimate; runtime, source scans and spool depend on Teradata's
optimizer. Confirm that each counting request eliminates the other year
partitions. The new layout adds distribution, partition storage and statistics
cost during staging; measure total elapsed time, not just chunk timing.
Standalone statistics use the same copy, restricted to the accepted
counting batch; its internal statistics aggregates remain capped at ten. Materialization itself may exhaust view spool; runtime, permanent space,
I/O and AMP distribution require EXPLAIN/DBQL on the installed release.
Use tests/test_outlier_partition.sql first to check the physical DDL and partition
predicates on eight synthetic rows before a controlled five-field RDS comparison.

Names include run UUID, attempt and first counting batch. The work table is dropped on success/handled
failure. External abort/session loss can leave an orphan; batch-0 SQL_TEXT retains
its current copy creation/load SQL for targeted recovery after the request has stopped.
No measured speed/spool improvement or server compilation is claimed. See
[bounded outlier storage](OUTLIER_STORAGE_UPDATE.md)
for the helper/wrapper compile order, privileges and working-data cleanup.

## Configurable reporting levels

Only selected Basic grouping sets/period queries and standalone statistics passes
are executed. Outliers skip disabled comparison branches and rollups. Year chunks
still schedule reads when YEARLY reporting is off; a small run-owned calendar
is populated from the stage once. This does not establish a runtime improvement.
RDS uses overall/monthly, with yearly disabled; benchmark the selected scope
against the same population. See [reporting levels](REPORTING_LEVELS.md).

## Full RDS permanent-space failure

The user reported run 9: 415-field Numeric Basic took about 77 minutes, then
the old all-field outlier preparation failed after about 6 minutes 40 seconds
with error 2644 in LAB_T_ORION_MVT. The revised flow caps copied fields at 20
with counting also capped at 20 and SQL-length splitting; benchmark the same
20-field population before expanding to all fields.
Completed groups are dropped before the next copy. This bounds working width
but adds source reads, so full-run runtime is unverified. See
[bounded storage and deployment](OUTLIER_STORAGE_UPDATE.md).

## Numeric Basic scan reduction

The previous Basic procedure capped aggregation at ten fields, irrespective of
SQL_BATCH_SIZE=25. The updated procedure caps at 20 and builds field fragments
before appending them. If an additional field would exceed either projection
buffer or the combined 30,000-character projection budget, it leaves that field
for the next batch. The remaining 2,000 characters cover the aggregate wrapper.
No field is skipped and FIELD_COUNT records the accepted width.

For the current 415 RDS numeric fields and configured special values, generated
queries fit in 21 batches instead of 42. This halves the number of aggregate
requests that reference the source, not necessarily elapsed time or physical
I/O. Wider aggregation may need more spool. No permanent working table is added
to Basic. Min/max, population deviation, counts, special exclusions, availability,
POU_DT and result publication are unchanged.

A combined Basic + Outliers run already reuses Basic's unrounded statistics;
standalone Outliers calculates them internally. Do not run a separate statistics
module before Basic. Categorical/identifier DISTINCT aggregation remains bounded
under the existing caps; its spool-heavy plans need measurement before widening.

User-supplied run 10 completed 20 outlier fields in 3m31.52s, including standalone
statistics and a 20-field copy. This confirms one group fits that workload; it is
not a full-RDS throughput guarantee or a benchmark of the new Basic procedure.
See [Basic deployment and benchmark](NUMERIC_BASIC_UPDATE.md).

## Wider outlier calculations

Run 12, supplied by the user, completed 20-field Basic in 1m43.63s and
20-field Outliers in 2m55.85s using four five-field counting batches. Batch 1
included working-copy setup. These logs do not isolate CPU, I/O or spool.

Outlier calculations now accept up to 20 fields using the same 20-field copy.
A combined fragment budget leaves room for joins/wrappers and automatically
splits larger SQL without skipping fields. Current RDS names/specials fit
20-field calculations across all scopes in local generation checks. This reduces
counting passes but can increase peak aggregation spool; no live speedup or
spool-fit guarantee is claimed. See [deployment and benchmark](OUTLIER_WIDTH_UPDATE.md).
