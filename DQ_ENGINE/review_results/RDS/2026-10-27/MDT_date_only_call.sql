/* MDT DATE-ONLY execution template, based on the supplied procedure interfaces.
   Alternative chosen by the analyst: MDT_date_focused_suite_call.sql keeps one
   numeric/category field and uses the existing suite with trends/APPL disabled.
   Choose one execution approach; do not run both for the same date run ID.
   Calls existing MDT procedures; does not change either engine's calculations.
   Source/configuration names come from the analyst's current suite CALL.
   The deployed MDT date/logger procedures are assumed to use the supplied
   signatures and LAB_T_ORION_MVT internal object references; verify if changed.
   Run each section separately in SQL Assistant, Teradata mode, one connection.
   Do NOT submit SP_RUN_DQ_SUITE: it requires numeric/categorical results.
   No execution against Teradata has been performed from this workspace.

   This direct call profiles all configured DATE fields (overall + monthly).
   It does not run numeric, categorical/frequency, APPL, trend or rule procedures.
   The supplied date procedure uses POU_DT literally; it has no date-column input.
   If A fails, stop: passing 'pou_dt' to the suite does not create that column.
   The date routine rebuilds a shared date driver: do not overlap other MDT jobs.
*/

/* A. Must succeed before proceeding. */
SELECT TOP 1 POU_DT FROM LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT;

/* B. Reserve a NEW MDT ID; independent of our DQ_RUN_NUMBER.
   Hold this short transaction through C in the SAME session.
   Replace every MDT_DATE_RUN_ID token below with the returned integer.
   If interrupted or any allocation/log statement fails, ROLLBACK.
   Do not reuse IDs 12-15 or use MAX+1 outside this reservation transaction. */
BT;
LOCKING TABLE LAB_T_ORION_MVT.IRB_RDS_DQ_RUN FOR WRITE
SELECT COALESCE(MAX(RUN_ID),0)+1 AS NEW_MDT_RUN_ID
FROM LAB_T_ORION_MVT.IRB_RDS_DQ_RUN;

/* C. Replace the token, record allocation, then release the run-log lock. */
CALL LAB_T_ORION_MVT.IRB_RDS_SP_LOG_DQ_RUN_EVENT(
    MDT_DATE_RUN_ID,'RUNNING','DATE_PROFILE','BOTH',
    'Date-only run | source=LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT'
);
ET;

/* D. The date-only CALL; submit this complete statement separately. */
CALL LAB_T_ORION_MVT.IRB_RDS_SP_RUN_DATE_PROFILE(
    MDT_DATE_RUN_ID,             -- use the newly allocated MDT ID
    1,                           -- overall enabled (NOT NULL)
    1,                           -- monthly enabled (NOT NULL)
    NULL,                        -- all metadata fields with FIELD_TYPE=DATE
    'LAB_T_ORION_MVT',            -- source database
    'VW_RDS_PHASE2_FACT',         -- source view, must expose POU_DT
    'LAB_T_ORION_MVT',            -- configuration database
    'IRB_RDS_DQ_CONFIG'           -- configuration table
);

/* E. Verify results before recording completion. Expect populated OVERALL and
   MONTHLY groups. Compare fields with the intended DATE configuration; the
   reference date procedure cross-checks DBC columns and can skip absent fields. */
SELECT RUN_TYPE,COUNT(DISTINCT FIELD_NAME) AS FIELDS_PROFILED,
       COUNT(*) AS RESULT_ROWS
FROM LAB_T_ORION_MVT.IRB_RDS_DQ_DATE_PROFILE_RESULT
WHERE RUN_ID=MDT_DATE_RUN_ID
GROUP BY RUN_TYPE ORDER BY RUN_TYPE;

/* F. Run ONLY after D completed without error and E has been reviewed. */
CALL LAB_T_ORION_MVT.IRB_RDS_SP_LOG_DQ_RUN_EVENT(
    MDT_DATE_RUN_ID,'COMPLETE','DATE_PROFILE','BOTH',
    'Date-only profiling completed; results reviewed'
);

/* If D fails, do NOT run F or rerun the same ID blindly: partial date results
   may exist because the reference date procedure inserts field by field.
   Record FAILED with the existing logger and investigate before cleanup/retry:
CALL LAB_T_ORION_MVT.IRB_RDS_SP_LOG_DQ_RUN_EVENT(
    MDT_DATE_RUN_ID,'FAILED','DATE_PROFILE','BOTH','Date-only profiling failed'
);
*/
