# Manual MoM review in Excel

Use [mom_review_by_metric.sql](../teradata/review/mom_review_by_metric.sql).
It contains 16 independent read-only SELECTs against the current file-94 view.
No deployment, SAS program, new table, source-data scan or profiling rerun is
required. It retains the existing relative-movement flags without applying new
materiality rules or changing the view.

## Prepare and export

1. Replace every DQ_DB with LAB_T_ORION_MVT in your copy.
2. The confirmed scope is **RDS run 17 for numeric** and **run 18 for the other
   field types**. Every section uses RUN_NUMBER IN (17,18). Keep the run and
   project filters; change the run selection only when reviewing another run.
3. Highlight and run one numbered SELECT at a time in SQL Assistant. Export its
   full result to the matching Excel tab, keeping the column names.
4. Start with sections 01-08 below. Sections 09-16 contain optional count queries;
   the user's count review is already complete.
5. Each returned row includes EXPECTED_ROWS_IN_EXPORT: the full number of
   flagged rows for that metric across the selected runs. Check the number of
   Excel data rows against that value; do not let a client display/export row
   limit silently reduce the review. An empty query has no count marker: record
   zero returned rows and check that the relevant module exists in the scope.
6. Save one workbook and upload it for assisted manual review. Exported data is
   field-level aggregates, not account/customer records.

| Section / suggested Excel tab | Metric | Coverage |
|---|---|---|
| 01_MISSING_RATE | Missing rate | All four types |
| 02_SPECIAL_RATE | Special-value rate | Numeric/categorical |
| 03_ZERO_RATE | Zero rate | Numeric |
| 04_OUTLIER_RATE | Outlier rate | Numeric Outliers |
| 05_MEAN_VALUE | Mean | Numeric Basic |
| 06_STDDEV_VALUE | Population standard deviation | Numeric Basic |
| 07_MIN_VALUE | Minimum | Numeric Basic |
| 08_MAX_VALUE | Maximum | Numeric Basic |
| 09-16 | Total, non-missing, missing, special, zero, outlier, outlier-valid and distinct counts | Optional, when supported |

Before exporting, save this result as a **Scope** tab:

```sql
SELECT RUN_NUMBER,PROJECT_ID,FIELD_TYPE,
       COUNT(DISTINCT FIELD_NAME) AS FIELDS_WITH_MONTHLY_RESULTS,
       MIN(POU_DT) AS FIRST_POU_DT,MAX(POU_DT) AS LAST_POU_DT,
       COUNT(*) AS FIELD_MONTH_ROWS
FROM LAB_T_ORION_MVT.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER IN (17,18)
GROUP BY RUN_NUMBER,PROJECT_ID,FIELD_TYPE
ORDER BY RUN_NUMBER,FIELD_TYPE;
```

This records the available successful monthly results, not the field counts
that happen to have a flag. Unsupported metrics produce no review rows and must
not be interpreted as zero. Keep an empty metric tab's headers or record its
zero-row result on the Scope tab.

## Read the columns

- PREVIOUS_VALUE and CURRENT_VALUE: review-precision metric values.
- ABSOLUTE_CHANGE: **signed current minus previous**; the existing name does
  not mean ABS(). Both increases and decreases are retained.
- CHANGE_PP: percentage-point change for rates only. Missing rate 0.10 to 0.11
  means ABSOLUTE_CHANGE=0.01 and CHANGE_PP=1.000000.
- RELATIVE_CHANGE: fractional relative movement. In that example it is 0.10,
  meaning 10%; rates and relative values are not multiplied by 100 for display.
- MOVEMENT_FLAG: existing MODERATE, HIGH or ZERO_BASE_MOVEMENT. These identify
  review candidates; they are not automatically data-quality failures.
- Previous/current total counts: population context, when captured by Basic.
  These can be NULL for Outliers-only runs.
- Previous/current event counts and denominators: supplied in rate queries.
  Missing/special/zero rates use TOTAL_COUNT; outlier rate uses OUTLIER_VALID_COUNT.
- Previous/current valid counts in numeric-statistic queries: non-missing minus
  special count, consistent with the population used for those statistics.

Previous metric values/counts are reconstructed from current minus the saved
MoM signed change. A missing prerequisite remains NULL. The current view rounds
values to six decimals, so extremely small rates/changes can be lost at that
precision; counts remain integers. Use numeric Excel cells with six decimal
places for rates/relative values, and date cells formatted YYYY-MM-DD.

The queries return only MODERATE/HIGH/ZERO_BASE movements, not all months.
First months, unavailable comparisons and LOW movements are not included.
These exports are therefore an investigation list, not proof that every other
month is acceptable. YoY and account-level movements are outside this review.

## How the assisted review will work

For each field/metric/month, assess magnitude and direction, absolute change,
small/zero-baseline effects, changes in the population, recurrence and related
metrics. No single relative flag alone establishes a defect. Prioritise material
unexplained increases in missing/special/outlier rates; assess zero-rate changes
and statistics in the meaning of the field, including unexpected reductions.

Keep **June 2009 Glenbeigh migration** as user-provided event context. Do not
remove or automatically accept every June movement: flag affected findings for
an explanation, checking whether the field and population actually changed.
A proposed explanation remains a hypothesis until supported.

Suggested review output columns are REVIEW_PRIORITY, REVIEW_CONCLUSION,
RATIONALE and FOLLOW_UP. Conclusions can be Explained, Low materiality,
Investigate or More context needed; retain the original MOVEMENT_FLAG separately.
The review can prioritise issues and propose explanations. Source ownership/
business evidence is still needed to confirm root causes.

Flag-only exports cannot show every adjacent quiet month or prove a reversion.
For selected findings, obtain surrounding months before concluding that a jump
persisted or reversed. For example, change the field/dates in this query:

```sql
SELECT RUN_NUMBER,FIELD_NAME,POU_DT,TOTAL_COUNT,
       MISSING_RATE,SPECIAL_RATE,ZERO_RATE,OUTLIER_RATE,
       MIN_VALUE,MAX_VALUE,MEAN_VALUE,STDDEV_VALUE
FROM LAB_T_ORION_MVT.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER IN (17,18)
  AND FIELD_NAME='ARREARS_AMT'
  AND POU_DT BETWEEN DATE '2009-04-01' AND DATE '2009-09-30'
ORDER BY RUN_NUMBER,FIELD_NAME,POU_DT;
```

## Verification limits

`node DQ_ENGINE/tools/check_field_changes.mjs` executes all 16 checked-in SELECTs
against synthetic results with SQLite adaptations. It checks exact flag/row
selection, values, previous-value reconstruction, rate units and populations,
and exported row-count markers. These checks do not execute Teradata, measure
query runtime or validate actual RDS findings. No customer results were reviewed
while preparing these queries.
