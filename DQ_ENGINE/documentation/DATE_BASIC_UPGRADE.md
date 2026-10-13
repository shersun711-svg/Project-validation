# Date Basic: counts and missing percentage only

This guide describes an earlier capability upgrade. For current special-value
and percentile deployment, use [the current extension guide](SPECIAL_VALUES_AND_PERCENTILES.md),
which includes the new table/procedure prerequisites and three-procedure run API.


Date Basic now calculates exactly TOTAL_COUNT, NON_MISSING_COUNT,
MISSING_COUNT and MISSING_RATE_PCT for overall/yearly/monthly periods. Only
SQL NULL is missing. Missing percentage uses all rows and the existing colour
thresholds. An empty source emits an OVERALL row: zero counts, NULL rate and
NOT_EVALUATED classification. No date-value extrema, distinct counts, date
parsing or date-value validity checks are calculated.

Date metrics now use DQ_METRIC_RESULT, like other profiling types. Old date
extrema remain untouched in the legacy DQ_DATE_REVIEW table, but the current
summary/review views do not expose them. Counts cannot be reconstructed from
old extrema; run a new profile after upgrading. No old tables/results are dropped.

## Upgrade the existing deployment

With profiling stopped, replace DQ_DB with LAB_T_ORION_MVT:

1. Run setup/12_add_date_basic_metrics.sql. It installs four DATE_BASIC metadata
   rows only; other modules' definitions and results are unchanged.
2. Recompile the complete modules/15_other_basic.sql procedure.
3. Recompile the complete modules/30_date_basic.sql wrapper.
4. Recompile both procedures in modules/00_run_engine.sql separately, basic
   runner first then the compatibility wrapper. This retires the legacy date
   store dependency from failure/retry cleanup.
5. Replace both views in results/91_dq_summary_views.sql.
6. Replace results/93_dq_basic_review.sql.
7. Use the latest tests/test_other_basic.sas with the controller loaded.
   Its non-numeric fixture expectation is now 136 metric rows across 5 fields.

No Excel layout or SAS controller change is needed. Availability table 11 from
FIELD_AVAILABILITY.md is still required by the procedures. Do not rerun old table
CREATE files, number backfill or metric definitions for other modules.

## Review

```sql
SELECT RUN_NUMBER,FIELD_NAME,PERIOD_LEVEL,PERIOD_VALUE,
       TOTAL_COUNT,NON_MISSING_COUNT,MISSING_COUNT,MISSING_RATE_PCT,
       MISSING_RATE_COLOUR
FROM LAB_T_ORION_MVT.DQ_BASIC_REVIEW
WHERE RUN_NUMBER=19 AND FIELD_TYPE='DATE' AND PERIOD_LEVEL='OVERALL'
ORDER BY FIELD_NAME;
```

Use your new run number. The combined view keeps unrelated numeric, distinct
and min/max columns NULL for date fields. The explicit SELECT above shows the
requested metrics; SELECT * uses the common layout. In the fixture, EVENT_DATE and EVENT_TS each
have total 4, non-missing 3, missing 1, missing percentage 25 and RED.
Date-only fixture runs have 64 metric rows and 16 review rows. Mixed runs have
216 metric rows and 48 review rows. Empty non-numeric runs have 17 metric rows
and five review rows; five rates are NOT_EVALUATED.

Availability remains in the combined DQ_BASIC_REVIEW, clearly named
FIRST_AVAILABLE_FACT_DT and LAST_AVAILABLE_FACT_DT, only on OVERALL rows.
These describe reporting-date coverage and are not date-field values. The
backing availability table's internal column names remain unchanged.
MINIMUM/MAXIMUM in the combined view return to numeric DECIMAL(38,10); Date
rows have NULL for those unrelated metrics. No separate date view is required. Queries using the former availability aliases must be updated.

## Validation

Local Node checks validate generated SQL length, four date metric inserts,
completed-only reviews, count/rate/classification display and overall coverage.
They are not Teradata compilation or SAS execution. Run the updated SAS fixture
and SQL suite in an isolated test deployment. Old completed fixed UUIDs cannot
be replayed; use a fresh fixture or new consistent test UUIDs.

The late-failure SQL fixture now uses Z_MISSING_DATE, an absent source column,
so counts-only Date Basic still exercises cleanup. Older fixtures using
Z_BAD_DATE must update only that synthetic DQ_BASIC_BAD field configuration;
invalid date text is not a failure condition in this limited module. No RDS
configuration/data change is required for testing.


The previously deployed DQ_DATE_BASIC_REVIEW is now unused; its creation file
was removed from the repository. No engine procedure/view depends on it.
Keeping or removing that old view does not affect results. If desired, remove
only the view with DROP VIEW LAB_T_ORION_MVT.DQ_DATE_BASIC_REVIEW; do not drop
result/history tables or rerun profiling for this repository cleanup.
