# Outlier precision change — before and after

Change reviewed: commit `8bc2a98` (27 October 2026). Production file:
[12_numeric_outliers.sql](../teradata/modules/12_numeric_outliers.sql).
This is a code-review document, not a deployment script.

## What changed

| Step | Before | After |
|---|---|---|
| Valid source value used in outlier comparison | Converted to FLOAT when compared. | Rounded to ten decimals, converted to DECIMAL(38,10), then compared without a FLOAT recast. |
| Final lower/upper bounds | FLOAT results of mean ± 3 × population standard deviation. | The same calculated bounds, rounded to ten decimals and converted to DECIMAL(38,10). |
| Equality | Tiny FLOAT differences could classify a boundary value as outside. | Values equal to the bound at the declared ten-decimal precision are inliers. |
| Reporting levels | Overall, yearly and monthly. | All three use the same decimal comparison. |
| Population/sample-size conditions | Existing valid-population handling. | Unchanged; no >10 condition or field/project exception. |

The SQL below illustrates the generated expressions; the exact SPL string
changes are included in the expandable diff at the end.

### 1. Values (after native NULL/special handling)

Before:

```sql
CAST(valid_value AS FLOAT)
```

After:

```sql
CAST(ROUND(valid_value, 10) AS DECIMAL(38,10))
```

### 2. Bounds

Before:

```sql
lower_bound = mean_value - 3.0 * stddev_value
upper_bound = mean_value + 3.0 * stddev_value
```

After:

```sql
lower_bound = CAST(ROUND(mean_value - 3.0 * stddev_value, 10)
                   AS DECIMAL(38,10))
upper_bound = CAST(ROUND(mean_value + 3.0 * stddev_value, 10)
                   AS DECIMAL(38,10))
```

### 3. Decision

The strict decision remains `value < lower_bound OR value > upper_bound`.
Both operands now use the same decimal precision. The decimal comparison bounds
are also the bounds published as metrics.

## Effect and limits

For the investigated boundary case, the old FLOAT comparison placed a value
about 0.000000000027 below its calculated lower bound. At ten decimal places,
the value and lower bound agree and the observation is not counted as an outlier.
This example motivates the test; its field name and sample size are not in the
production calculation.

This is an explicit precision policy: a difference that disappears when rounded
to ten decimals no longer counts as a strict violation. It is not a promise that
all near-boundary decisions at arbitrary precision are unchanged.

DECIMAL(38,10) supports 28 integer digits and ten fractional digits. Wider ranges
or finer project requirements need a precision review. FLOAT approximation in
mean/deviation remains; this change does not recover precision already lost in
those inputs. Teradata decimal conversions, ROUND behaviour and performance
still require server verification.

## What remains unchanged

- Captured mean and population standard deviation remain FLOAT.
- The multiplier stays 3; statistics are not recalculated by this change.
- Native NULL/special filtering happens before rounding; valid counts and
  special membership are unchanged.
- No new tables, source scans, SAS settings or Excel columns are added.
- Existing saved results, including the manually corrected run 17, are not rewritten.

## Checks completed locally

- An exact scaled-integer oracle verifies the investigated mathematical boundary.
- Generated SQL tests cover both boundary directions, populations of ten and
  twenty, ten-decimal resolution and genuine tails at eleven observations.
- A valid value close to a special code remains valid after rounding.
- Existing reporting-level, NULL/empty/special, batch-width and shared-copy checks pass.

These are SQLite/dialect-adapted checks. They do not compile or execute Teradata
SPL, enforce Teradata DECIMAL storage, or establish live performance.

## Affected files

| File | Change |
|---|---|
| `teradata/modules/12_numeric_outliers.sql` | Production comparison expressions. |
| `tools/check_outliers.mjs` | Independent precision/boundary regression cases. |
| `tools/check_shared_numeric.mjs` | Structural check now locates bounds SQL rather than a comment. |
| `documentation/NUMERIC_OUTLIERS.md` | Precision contract and limits. |
| `review_results/RDS/2026-10-27/RDS_numeric_MDT_comparison.md` | Investigation and correction status. |

Only file 12 is required for database deployment: replace DQ_DB in deployment
copies, recompile both complete procedures in file order and apply their grants.
A controlled server test is required before a full run.

<details>
<summary>Exact production-code diff (before → after)</summary>

```diff
diff --git a/DQ_ENGINE/teradata/modules/12_numeric_outliers.sql b/DQ_ENGINE/teradata/modules/12_numeric_outliers.sql
index 68ece7a..158e08b 100644
--- a/DQ_ENGINE/teradata/modules/12_numeric_outliers.sql
+++ b/DQ_ENGINE/teradata/modules/12_numeric_outliers.sql
@@ -252,8 +252,12 @@ main: BEGIN
         DO
             IF F.FIELD_ORDINAL<=V_LAST THEN
                 SET V_SUFFIX=TRIM(CAST(F.FIELD_ORDINAL AS VARCHAR(12)));
+                /* Test special values in the native source first. Valid values
+                   and final bounds use the metric store's DECIMAL(38,10)
+                   comparison precision; never convert them back to FLOAT. */
                 SET V_SOURCE_PART='' || ',CASE WHEN "' || TRIM(F.FIELD_NAME) || '" IN ' || V_LIST
-                  || ' THEN NULL ELSE "' || TRIM(F.FIELD_NAME) || '" END AS DQ_C' || V_SUFFIX;
+                  || ' THEN NULL ELSE CAST(ROUND("' || TRIM(F.FIELD_NAME)
+                  || '",10) AS DECIMAL(38,10)) END AS DQ_C' || V_SUFFIX;
                 SET V_OVERALL_PART=''
                   || ',MAX(N' || V_SUFFIX || ') AS N' || V_SUFFIX
                   || ',MAX(L' || V_SUFFIX || ') AS L' || V_SUFFIX
@@ -265,8 +269,8 @@ main: BEGIN
                     SET V_YEAR_BOUNDS=',MAX(B1.N' || V_SUFFIX || ') AS YN' || V_SUFFIX
                       || ',MAX(B1.L' || V_SUFFIX || ') AS YL' || V_SUFFIX
                       || ',MAX(B1.U' || V_SUFFIX || ') AS YU' || V_SUFFIX;
-                    SET V_YEAR_COUNT=',COALESCE(SUM(CAST(CASE WHEN CAST(' || V_FIELD || ' AS FLOAT)<B1.L' || V_SUFFIX
-                      || ' OR CAST(' || V_FIELD || ' AS FLOAT)>B1.U' || V_SUFFIX
+                    SET V_YEAR_COUNT=',COALESCE(SUM(CAST(CASE WHEN ' || V_FIELD || '<B1.L' || V_SUFFIX
+                      || ' OR ' || V_FIELD || '>B1.U' || V_SUFFIX
                       || ' THEN 1 ELSE 0 END AS BIGINT)),0) AS YO' || V_SUFFIX;
                 ELSE
                     SET V_YEAR_BOUNDS=',CAST(NULL AS BIGINT) AS YN' || V_SUFFIX
@@ -282,11 +286,11 @@ main: BEGIN
                   || ',MAX(BM.L' || V_SUFFIX || ') AS ML' || V_SUFFIX
                   || ',MAX(BM.U' || V_SUFFIX || ') AS MU' || V_SUFFIX
                   || ',COALESCE(SUM(CAST(CASE WHEN ' || V_FIELD || ' IS NOT NULL THEN 1 ELSE 0 END AS BIGINT)),0) AS ACTUAL' || V_SUFFIX
-                  || ',COALESCE(SUM(CAST(CASE WHEN ''' || V_PROFILE_OVERALL || '''=''Y'' AND (CAST(' || V_FIELD || ' AS FLOAT)<B0.L' || V_SUFFIX
-                  || ' OR CAST(' || V_FIELD || ' AS FLOAT)>B0.U' || V_SUFFIX || ') THEN 1 ELSE 0 END AS BIGINT)),0) AS OO' || V_SUFFIX
+                  || ',COALESCE(SUM(CAST(CASE WHEN ''' || V_PROFILE_OVERALL || '''=''Y'' AND (' || V_FIELD || '<B0.L' || V_SUFFIX
+                  || ' OR ' || V_FIELD || '>B0.U' || V_SUFFIX || ') THEN 1 ELSE 0 END AS BIGINT)),0) AS OO' || V_SUFFIX
                   || V_YEAR_COUNT
-                  || ',COALESCE(SUM(CAST(CASE WHEN ''' || V_PROFILE_MONTHLY || '''=''Y'' AND (CAST(' || V_FIELD || ' AS FLOAT)<BM.L' || V_SUFFIX
-                  || ' OR CAST(' || V_FIELD || ' AS FLOAT)>BM.U' || V_SUFFIX || ') THEN 1 ELSE 0 END AS BIGINT)),0) AS MO' || V_SUFFIX;
+                  || ',COALESCE(SUM(CAST(CASE WHEN ''' || V_PROFILE_MONTHLY || '''=''Y'' AND (' || V_FIELD || '<BM.L' || V_SUFFIX
+                  || ' OR ' || V_FIELD || '>BM.U' || V_SUFFIX || ') THEN 1 ELSE 0 END AS BIGINT)),0) AS MO' || V_SUFFIX;
                 /* Reserve 3,000 characters for joins, period/date expressions and
                    physical names. Oversized candidates stay for the next batch.
                    Validate before appending to the bounded fragment buffers. */
@@ -353,12 +357,13 @@ main: BEGIN
         UPDATE DQ_DB.DQ_MODULE_LOG SET START_TIME=CURRENT_TIMESTAMP(6)
          WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS'
            AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
-        /* Bounds table contains period aggregates only. Fixed 3 is recorded
-           in SQL; no rounded DECIMAL mean/deviation is read from metric results. */
+        /* Calculate bounds from captured full-precision statistics, then round
+           only the final comparison bounds. The same decimal bounds are saved
+           as metrics. No field/project/sample-size exception is applied. */
         SET V_SQL='CREATE VOLATILE TABLE DQ_NO_BOUNDS AS (SELECT PERIOD_LEVEL,PERIOD_VALUE,MAX(TOTAL_COUNT) AS TOTAL_N'
           || V_BOUND_PROJECTION || ' FROM (SELECT S.*,'
-          || 'CASE WHEN VALID_COUNT>=1 AND STDDEV_VALUE IS NOT NULL THEN MEAN_VALUE-3.0*STDDEV_VALUE END AS LB,'
-          || 'CASE WHEN VALID_COUNT>=1 AND STDDEV_VALUE IS NOT NULL THEN MEAN_VALUE+3.0*STDDEV_VALUE END AS UB '
+          || 'CASE WHEN VALID_COUNT>=1 AND STDDEV_VALUE IS NOT NULL THEN CAST(ROUND(MEAN_VALUE-3.0*STDDEV_VALUE,10) AS DECIMAL(38,10)) END AS LB,'
+          || 'CASE WHEN VALID_COUNT>=1 AND STDDEV_VALUE IS NOT NULL THEN CAST(ROUND(MEAN_VALUE+3.0*STDDEV_VALUE,10) AS DECIMAL(38,10)) END AS UB '
           || 'FROM DQ_DB.DQ_NUMERIC_STATISTICS S WHERE RUN_ID=''' || P_RUN_ID || ''' AND FIELD_NAME IN ('
           || 'SELECT FIELD_NAME FROM DQ_DB.DQ_RUN_FIELD_CONFIG WHERE RUN_ID=''' || P_RUN_ID
           || ''' AND FIELD_TYPE=''NUMERIC'' AND FIELD_ORDINAL BETWEEN ' || TRIM(CAST(V_FIRST AS VARCHAR(12)))
```

</details>
