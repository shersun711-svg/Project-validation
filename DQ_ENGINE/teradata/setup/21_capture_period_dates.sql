/* Run ONCE, after setup/17_create_rule_results.sql, before recompiling modules.
   Replace DQ_DB throughout with the approved engine schema.
   One small row per run/reporting period, captured from existing aggregates.
   POU_DT is the latest actual reporting date in that group, never an invented
   month end. OVERALL and UNKNOWN have NULL dates. Historical runs stay NULL.
   Internal period keys remain necessary for grouping, uniqueness and retries. */
CREATE MULTISET TABLE DQ_DB.DQ_RUN_PERIOD
(
    RUN_ID CHAR(36) CHARACTER SET LATIN NOT NULL,
    PROJECT_ID VARCHAR(30) CHARACTER SET LATIN NOT NULL,
    PERIOD_LEVEL VARCHAR(8) CHARACTER SET LATIN NOT NULL
        CHECK (PERIOD_LEVEL IN ('OVERALL','YEARLY','MONTHLY')),
    PERIOD_VALUE VARCHAR(10) CHARACTER SET LATIN NOT NULL,
    POU_DT DATE
) UNIQUE PRIMARY INDEX (RUN_ID,PROJECT_ID,PERIOD_LEVEL,PERIOD_VALUE);

GRANT SELECT ON DQ_DB.DQ_RUN_PERIOD TO DQ_DB WITH GRANT OPTION;
GRANT INSERT, DELETE ON DQ_DB.DQ_RUN_PERIOD TO DQ_DB;

/* Submit separately. Do not rerun if this column already exists. */
ALTER TABLE DQ_DB.DQ_RULE_RESULT ADD POU_DT DATE;
