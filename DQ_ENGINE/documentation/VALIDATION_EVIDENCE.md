# Validation evidence

Local developer checks execute generated Basic and Outlier queries on synthetic
SQLite data after narrow dialect adaptation. They check special-value exclusions,
unchanged NULL counts, all 12 numeric/5 categorical metric branches, exact rate
numerators/denominators, period separation, successful-only review, +/-3 outlier
boundaries, empty/insufficient populations and unrounded statistics reuse.
Workbook checks preserve all 589 source mappings and the four configuration sheets.
These checks do not compile Teradata SPL or execute SAS.

The user previously reported successful Numeric Basic and mixed-type RDS runs
with sampled results checked, and successful Excel configuration loads. The current
special-value Basic test on 20 numeric/9 categorical fields subsequently succeeded
according to the user, who checked its results. The user deployed Outliers and
reported error 2646 (no more spool space), including a five-field attempt with
SQL_BATCH_SIZE=1. No successful RDS outlier run is claimed. Supplied SQL/SAS
validation suites and the revised procedures remain unverified on the server.

Verify installed-release syntax, source type compatibility, grants, transactional
application, cleanup/retry, count ranges, spool and execution time on the server.
No full RDS source reconciliation or performance acceptance has been established.

The manager's current scope excludes the retired distribution module. Its code,
SAS switch, review columns and test cases were removed. No stored database history
or running job was modified. Earlier evidence is retained in Git history
for audit context; its instructions are not current deployment steps.

The 2026-10-14 outlier calculation changes were checked locally against synthetic
data: 180 field/period/metric results match independent +/-3 population-deviation
reference calculations; batching one versus five fields produces identical
results; empty populations, UNKNOWN dates and valid rate denominators remain
correct. All 36 standalone period statistics agree with independent calculations.
The next procedure revision processes one reporting year at a time, groups its
rows into monthly summaries and then rolls up overall/yearly/monthly results.
This follows the latest reported spool failure in the all-period aggregate.
Local synthetic checks validate the generated year-chunk and rollup results,
including specials, NULL dates, empty populations, bounds and rate denominators.
These checks do not compile Teradata SPL or establish that year-sized chunks fit
the site's spool limit. Teradata compilation, optimizer choices, spool use,
elapsed time and workload remain unverified.

The user subsequently reported RDS run number 4 failing with 7693 at the
explicit duplicate-period guard after about 31 minutes; its log shows the
year-chunk implementation reaching the final DQ_NO_CHUNKS rollup, not a 2646
spool failure. The first UNION branch left PERIOD_VALUE as the untyped literal
'ALL'. All rollup keys and chunk keys now have explicit widths to avoid
truncation during type resolution. Local checks additionally cover 360 metrics
across multiple years and 90 metrics with only NULL reporting dates. Generated
SQL checks enforce the explicit widths because SQLite does not enforce VARCHAR
lengths. A five-row Teradata regression, tests/test_outlier_rollup.sql, is
generated from the procedure's actual rollup template; locally it produces ten
distinct full period keys and the expected counts. Its execution on Teradata,
the precise truncation diagnosis and a successful RDS rerun remain unverified.

The focused rule-storage change reuses SP_DQ_CLASSIFY/DQ_COLOUR_RULE and leaves
profiling calculations untouched. Synthetic SQLite checks execute the evaluator,
INSERT and completed-result view, covering exact threshold boundaries, rounded
display values, undefined/invalid input reasons, captured thresholds, run/project/
period isolation, repeated evaluation, legacy-colour fallback and unchanged
profiling rows. Guard SELECTs and cleanup structure are checked locally; SPL
SIGNAL/transaction behaviour, grants and the supplied server fixtures still need
Teradata execution. No historical rule backfill or reporting module was added.

After the sequential outlier test exceeded 30 minutes, the user confirmed the
request issue was resolved and requested an update. The next version materializes
a narrow native-type source projection once, then reuses it for standalone
statistics and counting. Generated CTAS/projection SQL was tested on synthetic
SQLite data: rows/duplicates remain unchanged, and deleting the original source
after projection leaves all 180 outlier results and 36 statistics correct.
Run/attempt naming, creation-before-statistics, owner-reference grant and targeted
cleanup paths were checked in the source. These do not test Teradata NOPI/DDL,
physical storage, privileges, hard-abort cleanup or performance. The uploaded
development-team procedure was reviewed as a reference only; no code was copied,
and its population-deviation formula has now been adopted for Numeric Basic and
Outlier calculations. The local outlier check enforces DQ_METRIC_RESULT's unique
field/module/period/metric key and confirms one rollup row per period key. The
procedure reports duplicate rollup keys or pre-existing field results before
insertion and saves the generated metric INSERT in batch SQL_TEXT. These local
checks do not identify the cause of the user's reported Teradata error without
that run's module log. Its code was not copied.

The user subsequently reported a successful outlier RDS run with the explicit
period-width fix, while reporting that runtime remained too slow. The new
reporting-level extension has not been deployed or tested on SAS/Teradata here.
Local generated-query checks cover all seven nonempty scopes for four Basic
types, standalone statistics and outliers, including empty populations, NULL
reporting dates, specials, unchanged selected metrics and field availability.
The starter workbook preserves all 589 mappings and adds Y/Y/N level defaults.
Server tests for captured settings, all-N rejection and transactional application
are supplied in tests/test_reporting_levels.sql; these are not claimed executed.

The partitioned outlier-stage change is checked locally against generated SQL:
source values and duplicate multiplicity are preserved, NULL reporting dates
map to year key 0, internal names avoid source-field collisions, and all seven
reporting scopes return the independently calculated outlier metrics. Multiple
years and timestamp dates are covered. Disabled yearly comparisons and joins
are absent from the generated count query. The server preflight is generated
from the actual CTAS/statistics templates and includes year keys 0, 1 and 9999.
SQLite cannot test Teradata RANGE_N, random-row distribution, partition
elimination, COLLECT STATISTICS, SPL or grants. No server compilation, measured
runtime gain or spool reduction is claimed; test_outlier_partition.sql and the
same-population five-field benchmark remain required server checks.

On 2026-10-15 the user supplied matching synthetic partition-test counts and
both EXPLAIN outputs showing single-partition access (2005 and NULL-date key 0).
The user then supplied successful RDS run-7 logs: Basic 3.58 minutes, Outliers
21.96 minutes including 21.07 minutes in field batch 1. The saved CTAS confirms
that run used the partitioned stage. This verifies user-reported completion and
the synthetic access path, not the full counting query's plan or performance
acceptance for 589 fields. The run-7 no-DBQL diagnostic uses the current generated
stage/bounds/count SQL, with local checks that mismatched saved metadata is
reported before materialization. It does not execute RDS counting; the actual
Teradata EXPLAIN and physical bottleneck remain to be reviewed.

The user subsequently supplied the full 2018 counting EXPLAIN. It confirms a
single-partition stage read and shows detail redistribution by constant overall
bounds, followed by an outer-preservation merge join. The plan estimates about
1.565 million rows at that redistribution and a later detail spool near 539 MB;
these are estimates, not measured peak spool or proof of elapsed-time cause.
Diagnostic section D2 now tests a CROSS JOIN for the nonempty source chunk.
Local query comparisons preserve measurements for ordinary and NULL-date chunks
and explicitly demonstrate why the empty-source path cannot be changed the
same way. Production SQL remains unchanged pending the comparison plan and a
controlled timing/result check on Teradata.

The supplied D2 plan removes detail redistribution by constant bounds and the
outer-preservation merge join; the detail spool is now built locally on AMPs.
The user reported a two-second execution of the new 2018 SELECT. This is one
chunk's observed timing, not a full-engine benchmark. Diagnostic section D3
now materializes both 2018 outputs and checks all columns using bidirectional
MINUS, row counts and duplicate keys. Local mutation tests reject changed
values, NULL differences, missing rows, duplicates and both-empty outputs.
Teradata comparison results remain pending; the production procedure is unchanged.

The user then confirmed the Teradata D3 result: 12 old rows, 12 new rows, zero
differences, zero duplicate keys on both sides, MATCH. The procedure now uses
CROSS JOIN for populated calendar/UNKNOWN chunks and retains the outer join
for the empty-source ALL sentinel. Local regressions cover all seven reporting
level combinations, empty sources, NULL dates, specials and strict bounds. The
updated complete SPL procedure and full-run runtime remain unverified on Teradata.

Review rates now display as fractions and decimal statistics use six places.
POU_DT captures the latest actual source reporting date from existing Basic or
outlier counting aggregates; overall/unknown dates remain NULL. Following the
user's preference to limit tables, it is now stored in DQ_METRIC_RESULT and
copied to DQ_RULE_RESULT. DQ_RUN_PERIOD is no longer created or used. Portable
checks execute generated Basic date INSERTs for every type and period shape,
outlier date persistence and reporting-level combinations, non-month-end dates,
legacy NULL dates and rate units. SQLite does not verify Teradata DECIMAL rounding, SPL, DDL or grants.
Server fixture expectations and SAS reconciliation were updated but not run here.

Field-level MoM/YoY was added as one read-only view and independent SAS controls.
Local checks execute the actual view on synthetic data with SQLite date/decimal
adaptations: 396 comparison rows cover exact month/year gaps, non-month-end
snapshots, all Basic types and outliers, rate units, zero/NULL baselines, large
values and display-range guards. Failed/running/undated results are excluded;
project/run isolation and unchanged source metrics are checked. SAS switch,
status and read-only structure checks do not execute macro expansion.
The development team's comparison behavior was reviewed as reference; their
implementation was not copied. PSI/account-level checks remain deferred.
Teradata view compilation/optimizer behavior, grants, DECIMAL rounding and SAS
execution still require server checks; the optional SQL fixture is provided.
