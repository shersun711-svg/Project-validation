# Performance and workload

Calculations and any raw staging stay inside Teradata; SAS reads configuration,
logs and aggregated summaries. Execution is sequential and respects the site's
workload management. The source view's existing filters and row multiplicity
are retained. Keep source and configuration stable during execution.

## Batch sizes and spool

| Module | Effective maximum fields per batch | Source access |
|---|---:|---|
| Numeric Basic | Up to 20, with SQL-length splitting | GROUPING SETS on source for Basic-only; shared copy when Outliers is also selected |
| Categorical Basic | Up to 20, reduced for long identifiers/special lists | Separate ordinary GROUP BY request for each enabled period level |
| Identifier Basic | 20 | Separate ordinary GROUP BY request for each enabled period level |
| Date Basic | 30 | One aggregate statement using GROUPING SETS |
| Numeric Outliers | Up to 20 copied/counted; SQL-length splitting | One bounded working copy per group; partitioned year-chunk counting |

SQL_BATCH_SIZE remains configurable from 1 to 30; effective size is the lower
of the setting and module cap. Special lists increase generated query size;
Numeric Basic automatically starts a smaller batch before its generated SQL
exceeds the safe text limit; Categorical Basic reduces its width using the
captured maximum field-name length and special-list length. Length guards remain.
Lower the setting if a wider aggregate exceeds available spool. Caps bound
query width and are not measured optimal batch sizes. With the current RDS
special list and default setting, 50 numeric fields use three Basic batches.

Basic modules aggregate compatible statistics together, then persist results
from small volatile aggregates. Numeric Basic emits 12 metrics and categorical
5; date and identifier emit 4 and 3. Availability is calculated in the same basic
aggregate and requires no separate source scan.

Categorical/identifier use ordinary GROUP BY with literal period flags because
the user's DISTINCT/GROUPING SETS query returned duplicate period keys. Only
enabled levels execute; check EXPLAIN on the actual logged statement for
physical scans. Distinct aggregation can require substantial spool.

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

## Working storage

Combined Numeric Basic + Outliers uses the same bounded, native-value working
copy for each accepted field range: prepare, calculate Basic and statistics,
count outliers, then drop that copy. At most 20 numeric fields plus reporting/
distribution keys are copied together. SQL-length guards may choose fewer.
Standalone Basic reads the captured source; standalone Outliers prepares its
own bounded copies and statistics. See [current deployment and phase timings](SHARED_NUMERIC_COPY.md).

Copies preserve native values, NULLs, duplicate rows and the configured source
population. Random primary-index distribution and a stored reporting-year
partition key support the outlier counting path. Populated year chunks use the
CROSS JOIN path; the empty-source sentinel retains its outer-join behavior.
This bounds width, not bytes: database permanent space and spool must still fit
one group. No per-group copy creates an atomic snapshot across the whole run.
Keep RDS stable while profiling. Only the copy owned by the invocation is dropped;
handled failures retain their original error and clean up partial outputs.
A disconnected/aborted session can leave a copy; identify its exact name from
the module log and verify no active execution owns it before manual cleanup.

The retired full-source 415-field copy and five-field counting workflow are not
current deployment steps. The former run-specific diagnostic and its generator
have been removed. Use the generic benchmark and isolated partition/rollup tests
for future investigations rather than reusing historical run IDs or copied SQL.

## Timing and result writes

Use DQ_RUN_LOG for end-to-end elapsed time. Module BATCH_ID=0 covers its child
work and can overlap other module totals in a combined run; do not add those
parent durations. Successful BATCH_ID>0 rows separate NUMERIC_PREPARE, Basic,
outlier and standalone-statistics phases. A provisional RUNNING outlier row may
start before preparation; SQL_TEXT does not prove which request is active.

NUMERIC_PREPARE records copy loading, grants, partition statistics and the chunk
calendar. A visible gap between successive outlier calculations can therefore
be preparation and Basic for the next group, not idle waiting. Compare like
phases and include all selected modules when estimating total completion.

Basic/Outlier/Categorical/Identifier/Date result writes are already batched using
bounded INSERT ... UNION ALL requests reading only small saved aggregates.
Field-name and numeric casts preserve widths and precision; SQL-length guards
flush before the limit. For the current 589-field configuration at size 25,
local generation uses 124 result writes instead of 2,008. These are statement
counts, not speedups. See [current writer deployment and verification](RESULT_WRITE_UPDATE.md).

The optional field-level MoM/YoY view reads saved results only. Query it directly
in Teradata without running SAS. Filter run/project
and field to avoid unnecessarily comparing all history. It does not scan RDS.

## Categorical and identifier batch update

Categorical Basic previously capped each batch at eight fields because the
overall/yearly/monthly SELECTs had to fit one UNION statement. Each enabled
period now runs as a separate request: the first creates the existing small
DQ_OB_AGG volatile aggregate and subsequent requests append to it. No raw
working copy, persistent table, schema column, setting or SAS switch is added.
DATE retains its existing single GROUPING SETS request.

The categorical cap is now 20, further limited by SQL_BATCH_SIZE and a conservative
source-projection bound based on the captured maximum identifier length and
serialized special-list length. Long names/lists reduce width automatically.
The source-projection/aggregate buffers and per-period guards remain bounded,
including declared concatenation widths for Teradata SPL compilation.
Identifier remains capped at 20; Date remains capped at 30. Their workload has
no equivalent categorical batch-count reduction.

For all 125 configured RDS categorical fields, the standard special list and
SQL_BATCH_SIZE=25, this produces **7 batches instead of 16**. With overall and
monthly enabled, that is 14 period aggregate requests instead of 32 source
references spread across 16 UNION requests. This reduces repeated view queries;
it does not prove a physical scan count or a runtime improvement. A wider
DISTINCT aggregate can require more spool and must be measured in Teradata.

Count/missing/special/distinct formulas, NULL and blank treatment, availability,
actual POU_DT, bulk result writes, run/project isolation, successful-only
publication and exception cleanup remain unchanged. The temporary aggregate is
dropped after its batch and on handled errors. Each batch's SQL_TEXT shows its
current/latest period request. Keep RDS stable during profiling: enabled
periods now execute as separate statements rather than one UNION request.

### Deploy before running the remaining field types

1. Wait for any active engine run using these procedures to finish.
2. Replace DQ_DB with LAB_T_ORION_MVT in a deployment copy of
   [15_other_basic.sql](../teradata/modules/15_other_basic.sql).
3. Compile the complete SP_DQ_OTHER_BASIC procedure in SQL Assistant, then run
   its included GRANT EXECUTE PROCEDURE statement. Public wrappers/signatures
   are unchanged; no other procedure or view needs recompilation.
4. Keep the existing Excel configuration and SQL_BATCH_SIZE (25 is suitable
   for exercising the new effective 20-field limit). No Excel reload is needed
   unless active fields or settings were edited.
5. In SAS file 00 use numeric_basic=N, numeric_outliers=N,
   categorical_basic=Y, date_basic=Y and identifier_basic=Y. Leave other
   switches N and retry_run_id blank. Each selected type needs active fields.
6. Require SUCCEEDED, then inspect the new run number and per-batch timings.
   For all 125 categorical fields and the standard list, expect six 20-field
   batches and a final five-field batch. Existing numeric run results are retained.

Local checks execute generated period statements for all seven reporting-level
combinations and compare them with the former UNION plan, including empty and
UNKNOWN groups. Wider batches are checked against eight-field results across
all 125 RDS categorical fields, long identifiers/lists and NULL/blank/special
values. Metric/availability persistence is also checked at 20-field width.
Teradata SPL compilation, optimizer plans, quota/spool and elapsed time remain
unverified locally. This change was developed independently of the development
team's implementation.
