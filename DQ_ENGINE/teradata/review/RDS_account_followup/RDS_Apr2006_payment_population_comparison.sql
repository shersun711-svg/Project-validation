/* READ ONLY Teradata SQL Assistant -- one SELECT, six aggregate rows.
Recalculate PCKG_CNP_AMT mean in March/April/May 2006 for two populations.

ALL_ACCOUNTS: all agreement records in that month, with no jump/cohort filter.
This includes the selected cohort. It is agreement-weighted, NOT a distinct-package average.
SELECTED_ACCOUNTS: the SAME fixed cohort as SELECT 2 in
RDS_AprOct2006_payment_window.sql (expected 12,027 each month):
 - MV_PCKG_AVG_PAY_TO_BAL_L6M_RT jumps in April and October at ORIGINAL thresholds
   (absolute >=1 AND relative >=0.5; previous zero uses absolute gate only);
 - payment average increases in April and decreases in October;
 - 13 consecutive account-month records, Oct 2005-Oct 2006;
 - payment and payment average populated in all 13 months;
 - same populated PCKG_THRU_TIME_ID throughout those months.
The cohort includes cases that failed the separate rolling-window identity check;
it is the 12,027 cohort, NOT only the 11,877 identity matches.

Output:
 ACCOUNT_COUNT = accounts observed in the population/month;
 PAYMENT_COUNT = those accounts with non-NULL PCKG_CNP_AMT (mean denominator);
 AVG_MONTH_PAYMENT = AVG(CAST(PCKG_CNP_AMT AS FLOAT)), ignoring NULLs.
Zero and negative payment amounts are retained. No ratio special-code list is
applied to this raw amount: genuine amounts may equal a ratio sentinel code.
The special list below applies ONLY to the ratio used to select flagged accounts.
This reproduces the earlier selected-cohort means on the same source data.
A profiling mean may differ if its source, date scope or value exclusions differ.

All amounts/means are agreement-weighted; several agreements can share a package.
No account IDs are output, no sample, no permanent writes, no new run/configuration.
Duplicate account-month rows or NULL account IDs anywhere in the source window
make numeric outputs NULL. Zero selected counts mean no eligible cohort, not a pass.
Expected selected means: March 1091.73, April 17801.84, May 810.72 (rounded).
Do not expect selected means to match wider-population means.
*/
WITH source_values AS
(SELECT AGMT_ID, CAST(FACT_DT AS DATE) AS POU_DT,
 EXTRACT(YEAR FROM FACT_DT)*12+EXTRACT(MONTH FROM FACT_DT) AS MK,
 CAST(MV_PCKG_AVG_PAY_TO_BAL_L6M_RT AS FLOAT) AS V,
 CAST(PCKG_CNP_AMT AS FLOAT) AS PAYMENT,
 CAST(PCKG_CNP_AVG_L6M_AMT AS FLOAT) AS NUM,
 NULLIF(TRIM(CAST(PCKG_THRU_TIME_ID AS VARCHAR(128))),'') AS THRU,
 COUNT(*) OVER (PARTITION BY AGMT_ID,EXTRACT(YEAR FROM FACT_DT),EXTRACT(MONTH FROM FACT_DT)) AS KC
 FROM LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT
 WHERE CAST(FACT_DT AS DATE) BETWEEN DATE '2005-10-01' AND DATE '2006-10-31'),
control AS
(SELECT SUM(CASE WHEN AGMT_ID IS NULL OR KC<>1 THEN 1 ELSE 0 END) AS BAD FROM source_values),
states AS
(SELECT S.*, CASE WHEN V IS NULL THEN 'MISSING'
 WHEN V IN (-99999,-999999,-999998,-99998,-99997,-9999,-9998,-999997,-999993,-999,-999995,999999,999998,999990,99999,99998,999.99,999.88,999,9999,9998) THEN 'SPECIAL' ELSE 'VALID' END AS ST
 FROM source_values S),
history AS
(SELECT S.*, LAG(V) OVER (PARTITION BY AGMT_ID ORDER BY MK) AS PV,
 LAG(ST) OVER (PARTITION BY AGMT_ID ORDER BY MK) AS PS,
 LAG(MK) OVER (PARTITION BY AGMT_ID ORDER BY MK) AS PM,
 LAG(NUM) OVER (PARTITION BY AGMT_ID ORDER BY MK) AS P_NUM
 FROM states S),
seed AS (SELECT COUNT(*) AS N FROM source_values),
scenarios AS
(SELECT CAST('ORIGINAL' AS VARCHAR(16)) AS SCENARIO, CAST(1 AS FLOAT) AS A, CAST(0.5 AS FLOAT) AS R FROM seed),
flags AS
(SELECT H.*, C.SCENARIO FROM history H CROSS JOIN scenarios C
 WHERE POU_DT IN (DATE '2006-04-30',DATE '2006-10-31')
 AND MK-PM=1 AND PS='VALID' AND ST='VALID'
 AND ABS(V-PV)>=C.A AND (PV=0 OR ABS((V-PV)/NULLIFZERO(ABS(PV)))>=C.R)),
paired AS
(SELECT AGMT_ID, SCENARIO,
 MAX(CASE WHEN POU_DT=DATE '2006-04-30' THEN 1 ELSE 0 END) AS APR,
 MAX(CASE WHEN POU_DT=DATE '2006-10-31' THEN 1 ELSE 0 END) AS OCT,
 MAX(CASE WHEN POU_DT=DATE '2006-04-30' AND NUM>P_NUM THEN 1 ELSE 0 END) AS APR_UP,
 MAX(CASE WHEN POU_DT=DATE '2006-10-31' AND NUM<P_NUM THEN 1 ELSE 0 END) AS OCT_DOWN
 FROM flags GROUP BY AGMT_ID,SCENARIO),
windows AS
(SELECT AGMT_ID,
 CASE WHEN COUNT(*)=13 AND COUNT(DISTINCT MK)=13
 AND COUNT(THRU)=13 AND MIN(THRU)=MAX(THRU)
 AND COUNT(PAYMENT)=13 AND COUNT(NUM)=13 THEN 1 ELSE 0 END AS COMPLETE_STABLE
 FROM source_values GROUP BY AGMT_ID)
, cohort AS
(SELECT P.AGMT_ID FROM paired P JOIN windows W ON P.AGMT_ID=W.AGMT_ID
 WHERE P.SCENARIO='ORIGINAL' AND P.APR_UP=1 AND P.OCT_DOWN=1
 AND W.COMPLETE_STABLE=1),
report_months AS
(SELECT DATE '2006-03-31' AS POU_DT FROM seed
 UNION ALL SELECT DATE '2006-04-30' FROM seed
 UNION ALL SELECT DATE '2006-05-31' FROM seed),
populations AS
(SELECT CAST('ALL_ACCOUNTS' AS VARCHAR(24)) AS POPULATION_GROUP FROM seed
 UNION ALL SELECT CAST('SELECTED_ACCOUNTS' AS VARCHAR(24)) FROM seed),
population_rows AS
(SELECT S.POU_DT,S.AGMT_ID,S.PAYMENT,
 CAST('ALL_ACCOUNTS' AS VARCHAR(24)) AS POPULATION_GROUP
 FROM source_values S JOIN report_months D ON S.POU_DT=D.POU_DT
 UNION ALL
 SELECT S.POU_DT,S.AGMT_ID,S.PAYMENT,
 CAST('SELECTED_ACCOUNTS' AS VARCHAR(24)) AS POPULATION_GROUP
 FROM source_values S JOIN cohort C ON S.AGMT_ID=C.AGMT_ID
 JOIN report_months D ON S.POU_DT=D.POU_DT)
SELECT D.POU_DT,G.POPULATION_GROUP,
 CASE WHEN MAX(K.BAD)=0 THEN COUNT(M.AGMT_ID) END AS ACCOUNT_COUNT,
 CASE WHEN MAX(K.BAD)=0 THEN COUNT(M.PAYMENT) END AS PAYMENT_COUNT,
 CASE WHEN MAX(K.BAD)=0 THEN AVG(M.PAYMENT) END AS AVG_MONTH_PAYMENT
FROM report_months D CROSS JOIN populations G CROSS JOIN control K
LEFT JOIN population_rows M ON D.POU_DT=M.POU_DT
 AND G.POPULATION_GROUP=M.POPULATION_GROUP
GROUP BY D.POU_DT,G.POPULATION_GROUP
ORDER BY D.POU_DT,G.POPULATION_GROUP;
