/* READ ONLY: monthly uniqueness for the MVT-confirmed identifier ACC_PROBE_ID.
Source: DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT; reporting date FACT_DT.
One row is expected per ACC_PROBE_ID per calendar month for this check.
The same identifier recurring in DIFFERENT months is not a duplicate.
No source filters, deduplication, permanent writes or account IDs in output.

TOTAL_COUNT             = source rows in the month.
MISSING_KEY_COUNT       = rows with NULL or blank ACC_PROBE_ID.
DUPLICATE_KEY_GROUPS    = nonmissing identifiers with more than one monthly row.
EXCESS_DUPLICATE_ROWS   = rows beyond the first in those nonmissing groups.
FACT_DATE_COUNT        = distinct FACT_DT dates within the month.
If FACT_DATE_COUNT>1, confirm whether the source grain is finer than a monthly
snapshot before interpreting duplicate groups as errors. MONTH_END=NULL is the
bucket for rows with missing reporting dates. No rows is not a uniqueness pass.

Counts are computed in Teradata and cast to FLOAT for SAS-client compatibility.
The whole source is profiled, consistent with the existing engine; restrict
saved-result comparisons to the intended period, not by silently changing data.
*/
WITH source_rows AS
(SELECT LAST_DAY(CAST(FACT_DT AS DATE)) AS MONTH_END,
        CAST(FACT_DT AS DATE) AS FACT_DATE,
        ACC_PROBE_ID,
        CASE WHEN ACC_PROBE_ID IS NULL
          OR TRIM(CAST(ACC_PROBE_ID AS VARCHAR(128)))=''
          THEN 1 ELSE 0 END AS KEY_MISSING
 FROM DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT),
key_groups AS
(SELECT MONTH_END,ACC_PROBE_ID,KEY_MISSING,
        CAST(COUNT(*) AS BIGINT) AS ROW_N
 FROM source_rows
 GROUP BY MONTH_END,ACC_PROBE_ID,KEY_MISSING),
month_totals AS
(SELECT MONTH_END,
        SUM(ROW_N) AS TOTAL_COUNT,
        SUM(CASE WHEN KEY_MISSING=1 THEN ROW_N ELSE 0 END) AS MISSING_KEY_COUNT,
        SUM(CASE WHEN KEY_MISSING=0 AND ROW_N>1 THEN CAST(1 AS BIGINT)
                 ELSE CAST(0 AS BIGINT) END) AS DUPLICATE_KEY_GROUPS,
        SUM(CASE WHEN KEY_MISSING=0 AND ROW_N>1 THEN ROW_N-1
                 ELSE CAST(0 AS BIGINT) END) AS EXCESS_DUPLICATE_ROWS
 FROM key_groups GROUP BY MONTH_END),
month_dates AS
(SELECT MONTH_END,COUNT(DISTINCT FACT_DATE) AS FACT_DATE_COUNT
 FROM source_rows GROUP BY MONTH_END)
SELECT M.MONTH_END,
       CAST(M.TOTAL_COUNT AS FLOAT) AS TOTAL_COUNT,
       CAST(M.MISSING_KEY_COUNT AS FLOAT) AS MISSING_KEY_COUNT,
       CAST(M.DUPLICATE_KEY_GROUPS AS FLOAT) AS DUPLICATE_KEY_GROUPS,
       CAST(M.EXCESS_DUPLICATE_ROWS AS FLOAT) AS EXCESS_DUPLICATE_ROWS,
       CAST(D.FACT_DATE_COUNT AS FLOAT) AS FACT_DATE_COUNT
FROM month_totals M JOIN month_dates D
 ON M.MONTH_END=D.MONTH_END OR (M.MONTH_END IS NULL AND D.MONTH_END IS NULL)
ORDER BY M.MONTH_END;
