/* Targeted sample for the account-level working workbook; not a profiling run.
   Run as one SELECT in SQL Assistant. No tables are changed.
   Uses run 19: five early reversions and five later opposite reversions.
   Expected category follows the supplied Data Attestation Log MV_EXDAY_PAYREV
   CASE, using the final-view aliases previously verified in the sample query.
   NULL handling is preserved: do not replace missing inputs with zero.
   Save the output as a new workbook sheet: MV_EXDAY_PAYREV_check.
   This validates exposed RDS inputs, not their upstream source accuracy.
*/
WITH early_sample AS (
    SELECT TOP 5 AGMT_ID, PREVIOUS_POU_DT, POU_DT, NEXT_POU_DT
    FROM LAB_T_ORION_MVT.DQ_ACCOUNT_DETAIL_REVIEW
    WHERE RUN_NUMBER = 19
      AND FIELD_NAME = 'MV_EXDAY_PAYREV'
      AND VALUE_REVERSION = 1
      AND PREVIOUS_VALUE = 'EITHER FACTOR WITH NUMBER'
      AND CURRENT_VALUE = 'ZERO FOR BOTH FACTORS'
      AND NEXT_VALUE = 'EITHER FACTOR WITH NUMBER'
    ORDER BY POU_DT, AGMT_ID
), later_sample AS (
    SELECT TOP 5 AGMT_ID, PREVIOUS_POU_DT, POU_DT, NEXT_POU_DT
    FROM LAB_T_ORION_MVT.DQ_ACCOUNT_DETAIL_REVIEW
    WHERE RUN_NUMBER = 19
      AND FIELD_NAME = 'MV_EXDAY_PAYREV'
      AND VALUE_REVERSION = 1
      AND POU_DT >= DATE '2020-01-01'
      AND PREVIOUS_VALUE = 'ZERO FOR BOTH FACTORS'
      AND CURRENT_VALUE = 'EITHER FACTOR WITH NUMBER'
      AND NEXT_VALUE = 'ZERO FOR BOTH FACTORS'
    ORDER BY POU_DT, AGMT_ID
), selected_events AS (
    SELECT AGMT_ID, PREVIOUS_POU_DT, POU_DT, NEXT_POU_DT FROM early_sample
    UNION ALL
    SELECT AGMT_ID, PREVIOUS_POU_DT, POU_DT, NEXT_POU_DT FROM later_sample
), numbered_events AS (
    SELECT ROW_NUMBER() OVER (ORDER BY POU_DT, AGMT_ID) AS REVIEW_ID,
           AGMT_ID, PREVIOUS_POU_DT, POU_DT, NEXT_POU_DT
    FROM selected_events
), sample_inputs AS (
    SELECT D.REVIEW_ID, D.POU_DT AS FLAGGED_MONTH, R.FACT_DT,
           R.MV_EXDAY_PAYREV AS OBSERVED_CATEGORY,
           R.CUST_ALL_C_DAYS_IN_EXC_MAX_CNT AS DAYS_IN_EXCESS,
           R.CUST_ALL_C_PYMTS_REV_DR_L6M_CNT AS PAYMENT_REVERSALS,
           R.CUST_ALL_C_UNP_CHG_SUM_L6M_CNT AS UNPAID_CHARGES,
           R.CUST_ALL_C_REFER_SUM_L6M_CNT AS REFERRALS
    FROM numbered_events D
    JOIN LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT R
      ON TRIM(CAST(R.AGMT_ID AS VARCHAR(128))) =
         TRIM(CAST(D.AGMT_ID AS VARCHAR(128)))
     AND R.FACT_DT IN (D.PREVIOUS_POU_DT, D.POU_DT, D.NEXT_POU_DT)
), expected_values AS (
    SELECT S.*,
           CASE
             WHEN PAYMENT_REVERSALS IS NULL AND DAYS_IN_EXCESS IS NULL
               THEN 'TWO FACTORS MISSING'
             WHEN GREATEST(PAYMENT_REVERSALS, UNPAID_CHARGES, REFERRALS) = 0
                  AND DAYS_IN_EXCESS = 0
               THEN 'ZERO FOR BOTH FACTORS'
             WHEN GREATEST(PAYMENT_REVERSALS, UNPAID_CHARGES, REFERRALS) > 0
                  OR DAYS_IN_EXCESS > 0
               THEN 'EITHER FACTOR WITH NUMBER'
             ELSE 'ONE MISSING ONE ZERO'
           END AS EXPECTED_CATEGORY
    FROM sample_inputs S
)
SELECT REVIEW_ID, FLAGGED_MONTH, FACT_DT,
       DAYS_IN_EXCESS, PAYMENT_REVERSALS, UNPAID_CHARGES, REFERRALS,
       OBSERVED_CATEGORY, EXPECTED_CATEGORY,
       CASE WHEN OBSERVED_CATEGORY = EXPECTED_CATEGORY THEN 'MATCH'
            ELSE 'MISMATCH' END AS CHECK_RESULT
FROM expected_values
ORDER BY REVIEW_ID, FACT_DT;
