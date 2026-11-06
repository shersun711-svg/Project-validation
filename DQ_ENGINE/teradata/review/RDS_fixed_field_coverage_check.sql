/* READ ONLY Teradata SQL Assistant. Run once; expected two field rows.
   Verifies coverage behind zero reported flags for normally fixed fields.
   Uses saved successful account run 19, not the current source. No source scan,
   new engine run, permanent object or saved-result update.
   Require one SAVED_RUN_COUNT, FIXED_ENABLED_MONTHS>0 and FIXED_VALID_PAIRS>0
   before treating FIXED_CHANGES=0 as evidence of no observed valid-value changes.
   Partial activation or absent eligible pairs needs explanation. No returned row
   is not a pass. These are account-month pairs, not unique accounts.
   Column NULL for FIXED_CHANGES means the fixed-value test was not enabled.
*/
SELECT FIELD_NAME, FIELD_TYPE, RUN_NUMBER,
       COUNT(DISTINCT RUN_ID) AS SAVED_RUN_COUNT,
       COUNT(*) AS MONTHS_SAVED,
       SUM(CASE WHEN VALID_PAIR_COUNT>0 THEN 1 ELSE 0 END) AS MONTHS_WITH_VALID_PAIRS,
       CAST(SUM(CAST(VALID_PAIR_COUNT AS FLOAT)) AS DECIMAL(18,0)) AS VALID_PAIR_COUNT,
       SUM(CASE WHEN STABLE_VALUE_IND='Y' THEN 1 ELSE 0 END) AS FIXED_ENABLED_MONTHS,
       CAST(SUM(CASE WHEN STABLE_VALUE_IND='Y' THEN CAST(VALID_PAIR_COUNT AS FLOAT)
                     ELSE CAST(0 AS FLOAT) END) AS DECIMAL(18,0)) AS FIXED_VALID_PAIRS,
       CAST(SUM(CASE WHEN STABLE_VALUE_IND='Y'
                     THEN CAST(STABLE_VALUE_CHANGE_COUNT AS FLOAT) END)
            AS DECIMAL(18,0)) AS FIXED_CHANGES
FROM LAB_T_ORION_MVT.DQ_ACCOUNT_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=19
  AND FIELD_NAME IN ('IO_AT_ORIGINATION_IND','CUTOVER_DT')
GROUP BY FIELD_NAME, FIELD_TYPE, RUN_NUMBER
ORDER BY FIELD_NAME;
