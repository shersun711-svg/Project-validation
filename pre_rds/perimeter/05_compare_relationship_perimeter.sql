/* READ ONLY. Run after the relationship import is READY.
   This sheet is an alternative candidate perimeter, not a confirmed CDAO rule.
   Relationship dates are not assumed to represent portfolio eligibility.
   Submit each SELECT separately. No source records or tables are changed. */

/* 1. Import coverage. Expect 645076 relationship rows for this supplied sheet.
   Distinct accounts/customers need not equal the relationship row count. */
SELECT COUNT(*) AS RELATIONSHIP_ROWS,
       COUNT(DISTINCT ACC_PROBE_ID) AS DISTINCT_ACCOUNTS,
       COUNT(DISTINCT CUST_PROBE_ID) AS DISTINCT_CUSTOMERS
FROM LAB_T_ORION_MVT.PRE_RDS_ACC_CUST_REL;

/* 2. October 2017: fixed list of all accounts in the relationship sheet.
   EXISTS avoids multiplying source rows for joint borrowers or history rows. */
SELECT COUNT(*) AS SOURCE_ROWS,
       COUNT(DISTINCT T.ACC_PROBE_ID) AS DISTINCT_ACCOUNTS
FROM DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT T
WHERE T.FACT_DT=DATE '2017-10-31'
  AND EXISTS (SELECT 1 FROM LAB_T_ORION_MVT.PRE_RDS_ACC_CUST_REL P
              WHERE P.ACC_PROBE_ID=T.ACC_PROBE_ID);

/* 3. Candidate date rule: START_DT inclusive, END_DT inclusive, NULL end open.
   Confirm those semantics with CDAO before adopting this as the test perimeter. */
SELECT COUNT(*) AS SOURCE_ROWS,
       COUNT(DISTINCT T.ACC_PROBE_ID) AS DISTINCT_ACCOUNTS
FROM DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT T
WHERE T.FACT_DT=DATE '2017-10-31'
  AND EXISTS (SELECT 1 FROM LAB_T_ORION_MVT.PRE_RDS_ACC_CUST_REL P
              WHERE P.ACC_PROBE_ID=T.ACC_PROBE_ID
                AND P.START_DT<=T.FACT_DT
                AND (P.END_DT IS NULL OR P.END_DT>=T.FACT_DT));

/* 4. Candidate date rule: START_DT inclusive, END_DT exclusive, NULL end open.
   Keep as a separate comparison; do not choose a rule just to match 135059. */
SELECT COUNT(*) AS SOURCE_ROWS,
       COUNT(DISTINCT T.ACC_PROBE_ID) AS DISTINCT_ACCOUNTS
FROM DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT T
WHERE T.FACT_DT=DATE '2017-10-31'
  AND EXISTS (SELECT 1 FROM LAB_T_ORION_MVT.PRE_RDS_ACC_CUST_REL P
              WHERE P.ACC_PROBE_ID=T.ACC_PROBE_ID
                AND P.START_DT<=T.FACT_DT
                AND (P.END_DT IS NULL OR P.END_DT>T.FACT_DT));
/* Reference counts: CDAO 135059; account-sheet filtering produced 137436.
   Equal counts alone do not prove identical population membership. */
