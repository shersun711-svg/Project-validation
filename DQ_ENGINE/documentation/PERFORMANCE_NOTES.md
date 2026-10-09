# Performance and workload

The default 25-field batch aggregates all compatible calculations together. For 415 numeric fields it generates 17 source aggregation statements. Each uses GROUPING SETS to request overall/yearly/monthly results together; the actual number of physical scans is optimizer-dependent and must be checked with EXPLAIN. Subsequent per-field INSERTs scan only the small volatile period aggregate, never the source view. Ten metric definitions are crossed with that aggregate to write long-format results.

Validated source projection aliases keep generated statements short even for 128-character field names. Local template checks found 8,517 characters for the first real 25-field batch and 13,498 for a 30-field batch of maximum-length names, below the 32,000-character SQL buffer. This is a statement-size check, not a throughput benchmark.

Execution is sequential. The prototype does not create parallel sessions or bypass workload management. Results are distributed by run/field; the log tables are small. A volatile aggregate is session-local and dropped after each batch. Spool demand for evaluating the complex source view can still be large. Have the DBA inspect redistribution, AMP skew, window sorts, cardinality estimates, joins and statement memory limits. Existing source statistics are not altered automatically.

Use `tests/benchmark_numeric.sql` and the actual saved batch SQL. Record batch/module elapsed times and approved DBQL CPU, I/O, spool and skew information. Compare 10, 20, 25 and 30 fields using fresh run IDs, the same field selection, the same stable population and the same workload conditions. Result equivalence is required before comparing speed. No batch size has been demonstrated optimal here.

## Direct view versus controlled staging

Direct-view processing is the implemented default. It avoids mandatory staging for smaller projects and allows the optimizer to prune unused projections. The RDS view's expensive joins/windows may be repeated for each batch. A retained, immutable projection of the **final view** may reduce repeated view work and ensure a consistent population; benchmark it before adoption.

In an approved test schema, materialise the configured numeric fields plus FACT_DT and AGMT_ID from the final view, with **no extra filters or DISTINCT**. Use a DBA-approved distribution key; a candidate `(AGMT_ID,FACT_DT)` primary index need not be unique. Never impose uniqueness before checking the view's actual multiplicity. Size spool and permanent space, include materialisation and statistics collection time in the benchmark, and define retention/security before creating a copy of account-level data.

Create a separate test project pointing to that retained stage and copy the same field/settings configuration; do not mutate the production RDS source project to benchmark it. Profile both paths in Teradata, compare all aggregate metrics with documented tolerances, then compare total elapsed cost, not just the profiling portion. A permanent stage survives the independent SAS sessions used for metadata/configuration; a manually created volatile stage does not. A fully managed staging lifecycle is deferred until this comparison justifies it.

Changing source data between batches can invalidate cross-field/count reconciliation. Use a stable source window or approved stage. Profiling a moving view is not guaranteed to observe one consistent snapshot.
