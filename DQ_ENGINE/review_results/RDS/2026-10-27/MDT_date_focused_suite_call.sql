/* MDT suite workaround for a date-focused run.
   Before calling: retain ALL intended DATE rows, ONE NUMERIC row and ONE
   CATEGORICAL row in the MDT config. Keep a backup and restore the full config
   afterward. Choose a low-cardinality categorical field to limit frequency work.

   This is not strictly date-only: the suite still profiles the numeric/category
   fields and runs category frequency. Their nonempty results satisfy its checks.
   NULL p_appl_date_col skips APPL_SUITE; NONE skips MoM and YoY.
   NULL p_run_id allocates a fresh MDT ID through the existing suite runner.
   Uses the analyst's current source/config names. Source must expose POU_DT for
   the supplied date profiler. Deployed procedure behaviour is not verified here.
   Submit the complete CALL separately. Do not also run the standalone date call
   for the same ID, which could duplicate date-profile rows.
*/
CALL LAB_T_ORION_MVT.SP_RUN_DQ_SUITE (
    'LAB_T_ORION_MVT',           -- p_source_db
    'VW_RDS_PHASE2_FACT',        -- p_source_table
    'LAB_T_ORION_MVT',           -- p_field_driver_db
    'IRB_RDS_DQ_CONFIG',         -- p_field_driver_table
    'NUMERIC',                  -- p_numeric_field_type_selector
    'CATEGORICAL',              -- p_categorical_field_type_selector
    'pou_dt',                   -- p_date_col: keep monthly profiling enabled
    100,                        -- p_top_n: frequency still runs
    NULL,                       -- p_run_id: allocate a new MDT ID
    NULL,                       -- p_appl_date_col: skip APPL_SUITE
    'NONE',                     -- p_trend_mode: skip MoM and YoY
    :o_run_id                   -- returned MDT run ID
);
