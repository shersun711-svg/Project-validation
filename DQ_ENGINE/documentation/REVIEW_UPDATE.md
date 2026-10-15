# Review dates, decimal rates and outlier join update

Wait for profiling/configuration jobs to finish. In deployment copies replace
every DQ_DB with LAB_T_ORION_MVT (or the approved engine schema). Use SQL Assistant
in Teradata mode; submit complete procedures, with each GRANT separately.
These instructions assume the reporting-level upgrade is already installed.

1. Run `teradata/setup/21_capture_period_dates.sql` once. It adds POU_DT DATE to
   the existing DQ_METRIC_RESULT and DQ_RULE_RESULT tables. Submit the two ALTERs
   separately; skip a column that already exists. No new table is created.
2. Recompile both procedures and grants in `modules/03_numeric_statistics.sql`,
   source helper first and wrapper second.
3. Recompile `modules/10_numeric_basic.sql`, `modules/12_numeric_outliers.sql`
   and `modules/15_other_basic.sql`, including their grants.
4. Recompile the four procedures/grants in `modules/00_run_engine.sql`
   separately: EXTENDED, PROFILE, BASIC, ENGINE.
5. Run `results/90_colour_classification.sql`: replace the view, compile the
   complete classifier, then execute its grant. Replace both views in
   `results/91_dq_summary_views.sql`, then `results/93_dq_basic_review.sql`.
6. Keep the existing five-field selection and SAS settings for the timing test.
   No Excel reload or SAS code change is needed solely for this upgrade. Run
   file 00 with a fresh run ID; require SUCCEEDED before review.

All paths above are under `DQ_ENGINE/teradata/`. No history is deleted. Capture
dates require a new run; old runs show NULL POU_DT. Counts and calculated metrics
remain unchanged. Existing saved results gain the decimal display immediately.

The final review has MISSING_RATE, ZERO_RATE, SPECIAL_RATE and OUTLIER_RATE:
25% is 0.250000. Decimal statistics/bounds have six places; counts remain integers.
Stored percentage metrics and rule thresholds retain their units and precision.
Update direct consumers of the review's former *_RATE_PCT/PERIOD_VALUE columns.
DQ_COMPLETED_RESULT and DQ_RULE_RESULT include POU_DT and retain internal period
keys. No new table or extra review view is introduced.

If you already deployed the earlier version that created DQ_RUN_PERIOD, the
updated procedures/views no longer use it. Once the complete upgrade succeeds,
you can drop that unused table. Do not drop it while older procedures/views
still depend on it.

POU_DT is the latest actual configured reporting date within each month/year,
cast to DATE without time. It is not necessarily month end. Metrics still cover
the entire group. OVERALL and unknown-date groups show NULL. Source data and
configuration must stay stable during a run. Dates come from existing aggregate
queries; the review never scans RDS or reconstructs dates from labels.

For a completed run, replace 8 below with its short run number:

```sql
SELECT RUN_NUMBER,FIELD_NAME,PERIOD_LEVEL,POU_DT,
       TOTAL_COUNT,MISSING_RATE,SPECIAL_RATE,OUTLIER_RATE,MEAN,STDDEV_POP
FROM LAB_T_ORION_MVT.DQ_BASIC_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=8
ORDER BY FIELD_NAME,PERIOD_LEVEL,POU_DT;
```

Compare the same five fields/settings with the prior successful run. The outlier
join matched all 12 monthly rows for the user's 2018 comparison and took two
seconds for that chunk. This does not establish the full-run runtime. Empty
sources retain the outer join needed for their zero-population summary.

Local generated-query checks passed on synthetic SQLite data. This workspace
cannot compile or execute SAS/Teradata; verify deployment, rounding and elapsed
time on the server. Existing isolated fixtures test monthly, yearly, unknown,
empty and standalone-outlier cases; assertions should return zero rows.
