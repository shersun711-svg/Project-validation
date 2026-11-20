/* MANUAL CLEANUP ONLY. Do NOT submit this file as a batch.
   The user authorized removing the unusable account import tables.
   First confirm the old SAS/Teradata loading session has ENDED with your DBA.
   An unchanged COUNT(*) is not proof that it ended.
   Do not run a DROP while any loader is active, blocked, or cancelling.
   No customer/relationship table, source table, engine table or other perimeter
   version is touched. These are the two account targets from the failed runs. */

/* 1. List the failed targets. Run this SELECT first. */
SELECT DatabaseName, TableName, TableKind
FROM DBC.TablesV
WHERE DatabaseName='LAB_T_ORION_MVT'
  AND TableName IN ('PRE_RDS_ACCOUNT_PERIMETER',
                    'PRE_RDS_ACCOUNT_PERIMETER_V2');

/* 2. Run each count ONLY if that table exists. Record the counts.
   V2 was last reported at 196,310 versus 293,619 expected.
   If either table is now complete or used by another task, stop and review. */
SELECT COUNT(*) AS ROW_N
FROM LAB_T_ORION_MVT.PRE_RDS_ACCOUNT_PERIMETER_V2;

SELECT COUNT(*) AS ROW_N
FROM LAB_T_ORION_MVT.PRE_RDS_ACCOUNT_PERIMETER;

/* 3. After the session is confirmed ended and the tables are confirmed
   unusable, submit the relevant DROP statements ONE AT A TIME.
   Skip missing tables. Do not automatically drop FastLoad utility/error tables;
   let the DBA review those if a bulk-load failure later occurs. */
DROP TABLE LAB_T_ORION_MVT.PRE_RDS_ACCOUNT_PERIMETER_V2;

DROP TABLE LAB_T_ORION_MVT.PRE_RDS_ACCOUNT_PERIMETER;

/* 4. Rerun the existence SELECT above. Both names should be absent before
   loading into the default PRE_RDS_ACCOUNT_PERIMETER name. */
