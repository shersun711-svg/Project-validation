/* Read-only review AFTER ACCOUNT_PERIMETER_STATUS=READY.
   Change the target name if a different account_table was configured. */
SELECT COUNT(*) AS ACCOUNT_ROWS,
       COUNT(DISTINCT AGMT_ID) AS DISTINCT_AGREEMENTS
FROM LAB_T_ORION_MVT.PRE_RDS_ACCOUNT_PERIMETER;
/* Expected: 293619 for both counts for this supplied list. */

/* CDAO's October 2017 source count was 135059. Count rows and agreements
   separately; EXISTS never multiplies rows due to perimeter joins.
   This tests the supplied fixed account list without using final RDS membership.
   A different count still needs investigation; it is not automatically a defect. */
SELECT COUNT(*) AS SOURCE_ROWS,
       COUNT(DISTINCT T.AGMT_ID) AS DISTINCT_AGREEMENTS
FROM DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT AS T
WHERE T.FACT_DT=DATE '2017-10-31'
  AND EXISTS
      (SELECT 1 FROM LAB_T_ORION_MVT.PRE_RDS_ACCOUNT_PERIMETER AS P
       WHERE P.AGMT_ID=T.AGMT_ID);
