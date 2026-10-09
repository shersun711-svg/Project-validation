/* Read-only plan checks. Request workload/DBQL privileges from your DBA;
   the prototype neither enables DBQL nor alters workload policy. */
EXPLAIN
SELECT EXTRACT(YEAR FROM FACT_DT) AS DQ_YEAR,EXTRACT(MONTH FROM FACT_DT) AS DQ_MONTH,
       GROUPING(EXTRACT(YEAR FROM FACT_DT)) AS GY,
       GROUPING(EXTRACT(MONTH FROM FACT_DT)) AS GM,
       SUM(CAST(1 AS BIGINT)) AS TOTAL_N,
       SUM(CAST(CASE WHEN BALANCE_AMT IS NOT NULL THEN 1 ELSE 0 END AS BIGINT)) AS N,
       SUM(CAST(CASE WHEN BALANCE_AMT=0 THEN 1 ELSE 0 END AS BIGINT)) AS Z,
       MIN(BALANCE_AMT),MAX(BALANCE_AMT),
       AVG(CAST(BALANCE_AMT AS FLOAT)),STDDEV_SAMP(CAST(BALANCE_AMT AS FLOAT))
FROM LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT
GROUP BY GROUPING SETS ((),(EXTRACT(YEAR FROM FACT_DT)),
                       (EXTRACT(YEAR FROM FACT_DT),EXTRACT(MONTH FROM FACT_DT)));

/* Capture actual batched SQL from the latest attempt and use EXPLAIN on its
   SELECT body. Do not EXPLAIN a different field list and claim equivalence. */
SELECT RUN_ID,ATTEMPT_NO,BATCH_ID,FIELD_COUNT,START_TIME,END_TIME,
       END_TIME-START_TIME DAY(4) TO SECOND(6) AS ELAPSED,SQL_TEXT
FROM DQ_DB.DQ_MODULE_LOG
WHERE RUN_ID='REPLACE_WITH_RUN_UUID' AND BATCH_ID>0
ORDER BY ATTEMPT_NO,BATCH_ID;
/* Compare batch sizes 10/20/25/30 by updating project-level settings and
   creating NEW run UUIDs, while preserving the same field selection/population.
   Staging comparison instructions are in PERFORMANCE_NOTES.md. */
