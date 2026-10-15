/* Teradata SPL. Deploy as ONE procedure statement, using a client supporting
   SPL delimiters. Requires Teradata-session mode (see deployment guide).
   No WHERE clause is added to the configured source: its filters are retained.
   One source aggregation per field batch; the subsequent INSERTs only read
   a tiny volatile aggregate table. Basic-only reads the captured source; the
   combined numeric pipeline supplies its bounded shared copy instead.
   No account-level data leaves Teradata.
   Configured numeric specials stay non-missing; distribution statistics exclude
   them. SPECIAL_COUNT and SPECIAL_RATE_PCT use the raw total population. */
/* Compile this bounded helper + grant before the public wrapper below. */
REPLACE PROCEDURE DQ_DB.SP_DQ_NUMERIC_BASIC_BATCH
    (IN P_RUN_ID CHAR(36),IN P_PROJECT_ID VARCHAR(30),
     IN P_SOURCE_DATABASE VARCHAR(128),IN P_SOURCE_TABLE VARCHAR(128),
     IN P_REPORTING_DATE_FIELD VARCHAR(128),
     IN P_FIELD_FIRST INTEGER,IN P_FIELD_LAST INTEGER,IN P_LOG_BATCH INTEGER)
SQL SECURITY INVOKER
main: BEGIN
    DECLARE V_DB VARCHAR(128);
    DECLARE V_SOURCE VARCHAR(128);
    DECLARE V_DATE VARCHAR(128);
    DECLARE V_GROUPS VARCHAR(200);
    DECLARE V_GROUP_CLAUSE VARCHAR(300);
    DECLARE V_TIME_SELECT VARCHAR(500);
    DECLARE V_SQL VARCHAR(32000);
    DECLARE V_PROJECTION VARCHAR(24000);
    DECLARE V_METRIC_PART VARCHAR(4000);
    DECLARE V_SOURCE_PART VARCHAR(10000);
    DECLARE V_SOURCE_PROJECTION VARCHAR(24000);
    DECLARE V_SPECIAL_LIST VARCHAR(8000);
    DECLARE V_CLEAN VARCHAR(260);
    DECLARE V_SUFFIX VARCHAR(12);
    DECLARE V_FIELD VARCHAR(260);
    DECLARE V_SIZE INTEGER;
    DECLARE V_PROFILE_OVERALL CHAR(1);
    DECLARE V_PROFILE_MONTHLY CHAR(1);
    DECLARE V_PROFILE_YEARLY CHAR(1);
    DECLARE V_COUNT INTEGER;
    DECLARE V_FIELDS INTEGER;
    DECLARE V_BATCH INTEGER DEFAULT 0;
    DECLARE V_FIRST INTEGER;
    DECLARE V_LAST INTEGER;
    DECLARE V_ATTEMPT INTEGER DEFAULT 1;
    DECLARE V_OWNED INTEGER DEFAULT 0;
    DECLARE V_VT_EXISTS INTEGER DEFAULT 0;
    DECLARE V_ERROR VARCHAR(2048) CHARACTER SET UNICODE;
    DECLARE V_ERROR_CODE INTEGER;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS EXCEPTION 1 V_ERROR = MESSAGE_TEXT;
        SET V_ERROR_CODE = SQLCODE;
        /* Do not alter an existing successful or concurrently running run. */
        IF V_OWNED = 1 THEN
            DELETE FROM DQ_DB.DQ_METRIC_RESULT
             WHERE RUN_ID = P_RUN_ID AND MODULE_NAME = 'NUMERIC_BASIC';
            UPDATE DQ_DB.DQ_MODULE_LOG
               SET STATUS = 'FAILED', END_TIME = CURRENT_TIMESTAMP(6),
                   ERROR_CODE = V_ERROR_CODE, ERROR_INFORMATION = V_ERROR
             WHERE RUN_ID = P_RUN_ID AND MODULE_NAME = 'NUMERIC_BASIC'
               AND ATTEMPT_NO = V_ATTEMPT AND STATUS = 'RUNNING';
            UPDATE DQ_DB.DQ_RUN_LOG
               SET STATUS = 'FAILED', END_TIME = CURRENT_TIMESTAMP(6),
                   ERROR_CODE = V_ERROR_CODE, ERROR_INFORMATION = V_ERROR
             WHERE RUN_ID = P_RUN_ID;
            IF V_VT_EXISTS = 1 THEN
                CALL DBC.SysExecSQL('DROP TABLE DQ_NB_AGG');
            END IF;
        END IF;
        RESIGNAL; /* Let the pipeline release its owned working copy. */
    END;

    IF REGEXP_SIMILAR(TRIM(P_RUN_ID),
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$','c') <> 1
       OR REGEXP_SIMILAR(TRIM(P_PROJECT_ID),'^[A-Za-z_][A-Za-z0-9_]{0,29}$','c') <> 1 THEN
        SIGNAL SQLSTATE 'U0001' SET MESSAGE_TEXT = 'Invalid run UUID or project identifier';
    END IF;

    /* Run lifecycle belongs to the shared orchestrator, so later modules can
       join the same run without changing this module's aggregation contract. */
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_LOG
     WHERE RUN_ID = P_RUN_ID AND PROJECT_ID = P_PROJECT_ID AND STATUS = 'RUNNING';
    IF V_COUNT <> 1 THEN
        SIGNAL SQLSTATE 'U0002' SET MESSAGE_TEXT = 'Module requires an active run from SP_DQ_RUN_ENGINE';
    END IF;
    SELECT ATTEMPT_NO INTO V_ATTEMPT FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID = P_RUN_ID;
    SELECT PROFILE_OVERALL,PROFILE_MONTHLY,PROFILE_YEARLY
      INTO V_PROFILE_OVERALL,V_PROFILE_MONTHLY,V_PROFILE_YEARLY
      FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID=P_RUN_ID;
    IF P_FIELD_FIRST IS NULL OR P_FIELD_LAST IS NULL OR P_LOG_BATCH IS NULL
       OR P_FIELD_FIRST<1 OR P_FIELD_LAST<P_FIELD_FIRST OR P_LOG_BATCH<1 THEN
        SIGNAL SQLSTATE 'U0047' SET MESSAGE_TEXT='Invalid Basic field batch';
    END IF;
    SET V_DB=P_SOURCE_DATABASE;
    SET V_SOURCE=P_SOURCE_TABLE;
    SET V_DATE=P_REPORTING_DATE_FIELD;
    IF V_DB IS NULL OR V_SOURCE IS NULL OR V_DATE IS NULL
       OR REGEXP_SIMILAR(V_DB,'^[A-Za-z_][A-Za-z0-9_]*$','c')<>1
       OR REGEXP_SIMILAR(V_SOURCE,'^[A-Za-z_][A-Za-z0-9_]*$','c')<>1
       OR REGEXP_SIMILAR(V_DATE,'^[A-Za-z_][A-Za-z0-9_]*$','c')<>1 THEN
        SIGNAL SQLSTATE 'U0004' SET MESSAGE_TEXT='Unsafe Basic source identifier';
    END IF;
    SELECT SQL_BATCH_SIZE INTO V_SIZE FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID=P_RUN_ID;
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_MODULE_LOG
     WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_BASIC'
       AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=0;
    IF V_COUNT=0 THEN
        INSERT INTO DQ_DB.DQ_MODULE_LOG
            (RUN_ID,MODULE_NAME,ATTEMPT_NO,BATCH_ID,START_TIME,STATUS)
        VALUES (P_RUN_ID,'NUMERIC_BASIC',V_ATTEMPT,0,CURRENT_TIMESTAMP(6),'RUNNING');
    END IF;
    SET V_OWNED=1;
    SELECT COALESCE(MAX(BATCH_ID),0) INTO V_BATCH FROM DQ_DB.DQ_MODULE_LOG
     WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_BASIC' AND ATTEMPT_NO=V_ATTEMPT;
    SET V_BATCH=GREATEST(V_BATCH,P_LOG_BATCH-1);
    /* Workbook FIELD_TYPE is authoritative. No dictionary/type lookup.
       Missing columns, unsupported operations and range errors are handled
       by the existing SQL exception handler when the batch executes. */
    SELECT COUNT(*) INTO V_FIELDS FROM DQ_DB.DQ_RUN_FIELD_CONFIG
     WHERE RUN_ID = P_RUN_ID AND FIELD_TYPE = 'NUMERIC';
    IF V_FIELDS = 0 THEN
        SIGNAL SQLSTATE 'U0009' SET MESSAGE_TEXT = 'No eligible numeric fields; zero-field run rejected';
    END IF;
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_METRIC_DEFINITION
     WHERE MODULE_NAME = 'NUMERIC_BASIC' AND METRIC_ORDINAL BETWEEN 1 AND 12;
    IF V_COUNT <> 12 THEN
        SIGNAL SQLSTATE 'U0010' SET MESSAGE_TEXT = 'Numeric metric definitions incomplete';
    END IF;
    /* Validate captured identifiers, including concurrent configuration edits,
       while keeping the approved workbook classifications unchanged. */
    SELECT COUNT(*) INTO V_FIELDS FROM DQ_DB.DQ_RUN_FIELD_CONFIG
     WHERE RUN_ID = P_RUN_ID AND FIELD_TYPE = 'NUMERIC';
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_FIELD_CONFIG
     WHERE RUN_ID = P_RUN_ID AND FIELD_TYPE = 'NUMERIC'
       AND REGEXP_SIMILAR(FIELD_NAME,'^[A-Za-z_][A-Za-z0-9_]*$','c') <> 1;
    IF V_COUNT > 0 OR V_FIELDS = 0 THEN
        SIGNAL SQLSTATE 'U0011' SET MESSAGE_TEXT = 'Captured numeric identifiers invalid or selection empty';
    END IF;
    CALL DQ_DB.SP_DQ_SPECIAL_LIST(P_RUN_ID,'NUMERIC',V_SPECIAL_LIST);
    /* Wider Basic batches reduce repeated view scans. Build each field first
       and split automatically before exceeding SQL text/buffer limits. */
    SET V_SIZE=LEAST(V_SIZE,20);
    /* Only selected grouping sets enter the source aggregation. */
    SET V_GROUPS='';
    IF V_PROFILE_OVERALL='Y' THEN SET V_GROUPS='()'; END IF;
    IF V_PROFILE_YEARLY='Y' THEN
        IF CHARACTER_LENGTH(V_GROUPS)>0 THEN SET V_GROUPS=V_GROUPS || ','; END IF;
        SET V_GROUPS=V_GROUPS || '(EXTRACT(YEAR FROM S.DQ_DT))';
    END IF;
    IF V_PROFILE_MONTHLY='Y' THEN
        IF CHARACTER_LENGTH(V_GROUPS)>0 THEN SET V_GROUPS=V_GROUPS || ','; END IF;
        SET V_GROUPS=V_GROUPS || '(EXTRACT(YEAR FROM S.DQ_DT),EXTRACT(MONTH FROM S.DQ_DT))';
    END IF;
    IF V_PROFILE_YEARLY='Y' OR V_PROFILE_MONTHLY='Y' THEN
        SET V_TIME_SELECT='EXTRACT(YEAR FROM S.DQ_DT) AS DQ_YEAR,GROUPING(EXTRACT(YEAR FROM S.DQ_DT)) AS GY,';
        SET V_GROUP_CLAUSE=' GROUP BY GROUPING SETS (' || V_GROUPS || ')';
    ELSE
        SET V_TIME_SELECT='CAST(NULL AS INTEGER) AS DQ_YEAR,1 AS GY,';
        SET V_GROUP_CLAUSE='';
    END IF;
    IF V_PROFILE_MONTHLY='Y' THEN
        SET V_TIME_SELECT=V_TIME_SELECT || 'EXTRACT(MONTH FROM S.DQ_DT) AS DQ_MONTH,GROUPING(EXTRACT(MONTH FROM S.DQ_DT)) AS GM,';
    ELSE
        SET V_TIME_SELECT=V_TIME_SELECT || 'CAST(NULL AS INTEGER) AS DQ_MONTH,1 AS GM,';
    END IF;
    SET V_FIRST = P_FIELD_FIRST;
    IF V_FIRST>V_FIELDS THEN SIGNAL SQLSTATE 'U0009' SET MESSAGE_TEXT='Basic field range is empty'; END IF;
    WHILE V_FIRST <= V_FIELDS AND V_FIRST<=P_FIELD_LAST DO
        SET V_BATCH = V_BATCH + 1;
        SET V_LAST = LEAST(V_FIRST + V_SIZE - 1,V_FIELDS,P_FIELD_LAST);
        INSERT INTO DQ_DB.DQ_MODULE_LOG
            (RUN_ID,MODULE_NAME,ATTEMPT_NO,BATCH_ID,START_TIME,STATUS,FIELD_COUNT)
        VALUES (P_RUN_ID,'NUMERIC_BASIC',V_ATTEMPT,V_BATCH,
                CURRENT_TIMESTAMP(6),'RUNNING',V_LAST - V_FIRST + 1);
        SET V_PROJECTION = '';
        SET V_SOURCE_PROJECTION = '"' || V_DATE || '" AS DQ_DT';
        FOR F AS FIELDS_CURSOR CURSOR FOR
            SELECT FIELD_NAME,FIELD_ORDINAL FROM DQ_DB.DQ_RUN_FIELD_CONFIG
             WHERE RUN_ID = P_RUN_ID AND FIELD_TYPE = 'NUMERIC'
               AND FIELD_ORDINAL BETWEEN V_FIRST AND V_LAST
             ORDER BY FIELD_ORDINAL
        DO
            IF F.FIELD_ORDINAL<=V_LAST THEN
                SET V_SUFFIX = TRIM(CAST(F.FIELD_ORDINAL AS VARCHAR(12)));
                SET V_SOURCE_PART = ',"' || TRIM(F.FIELD_NAME)
                    || '" AS DQ_F' || V_SUFFIX;
                SET V_FIELD = 'S.DQ_F' || V_SUFFIX;
                SET V_CLEAN = 'S.DQ_C' || V_SUFFIX;
                SET V_SOURCE_PART = V_SOURCE_PART
                  || ',CASE WHEN "' || TRIM(F.FIELD_NAME) || '" IN ' || V_SPECIAL_LIST
                  || ' THEN NULL ELSE "' || TRIM(F.FIELD_NAME) || '" END AS DQ_C' || V_SUFFIX;
                SET V_METRIC_PART = ''
                 || ',COALESCE(SUM(CAST(CASE WHEN ' || V_FIELD || ' IS NOT NULL THEN 1 ELSE 0 END AS BIGINT)),0) AS N' || V_SUFFIX
                 || ',COALESCE(SUM(CAST(CASE WHEN ' || V_FIELD || ' = 0 THEN 1 ELSE 0 END AS BIGINT)),0) AS Z' || V_SUFFIX
                 || ',MIN(' || V_CLEAN || ') AS LO' || V_SUFFIX
                 || ',MAX(' || V_CLEAN || ') AS HI' || V_SUFFIX
                 || ',AVG(CAST(' || V_CLEAN || ' AS FLOAT)) AS AV' || V_SUFFIX
                 || ',STDDEV_POP(CAST(' || V_CLEAN || ' AS FLOAT)) AS SD' || V_SUFFIX
                 || ',COALESCE(SUM(CAST(CASE WHEN ' || V_CLEAN || ' IS NOT NULL THEN 1 ELSE 0 END AS BIGINT)),0) AS V' || V_SUFFIX
                 || ',MIN(CASE WHEN ' || V_FIELD || ' IS NOT NULL THEN CAST(S.DQ_DT AS DATE) END) AS FA' || V_SUFFIX
                 || ',MAX(CASE WHEN ' || V_FIELD || ' IS NOT NULL THEN CAST(S.DQ_DT AS DATE) END) AS LA' || V_SUFFIX;
                /* Reserve 2,000 characters for SELECT/grouping/table names. The
                   complete query is bounded before assignment to VARCHAR(32000).
                   Shrinking V_LAST leaves rejected fields for the next batch. */
                IF CHARACTER_LENGTH(V_SOURCE_PROJECTION)+CHARACTER_LENGTH(V_SOURCE_PART)>24000
                   OR CHARACTER_LENGTH(V_PROJECTION)+CHARACTER_LENGTH(V_METRIC_PART)>24000
                   OR CHARACTER_LENGTH(V_SOURCE_PROJECTION)+CHARACTER_LENGTH(V_SOURCE_PART)
                     +CHARACTER_LENGTH(V_PROJECTION)+CHARACTER_LENGTH(V_METRIC_PART)>30000 THEN
                    IF F.FIELD_ORDINAL=V_FIRST THEN
                        SIGNAL SQLSTATE 'U0034' SET MESSAGE_TEXT='Single numeric field SQL exceeds safe length';
                    END IF;
                    SET V_LAST=F.FIELD_ORDINAL-1;
                ELSE
                    SET V_SOURCE_PROJECTION = V_SOURCE_PROJECTION || V_SOURCE_PART;
                    SET V_PROJECTION = V_PROJECTION || V_METRIC_PART;
                END IF;
            END IF;
        END FOR;
        /* Record the accepted width after any automatic split. */
        UPDATE DQ_DB.DQ_MODULE_LOG SET FIELD_COUNT=V_LAST-V_FIRST+1
         WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_BASIC'
           AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
        /* GROUPING distinguishes an actual NULL date bucket from rolled-up
           NULLs. An empty source still emits its OVERALL aggregate row. */
        SET V_SQL = 'CREATE VOLATILE TABLE DQ_NB_AGG AS ('
          || 'SELECT ' || V_TIME_SELECT || 'COALESCE(SUM(CAST(1 AS BIGINT)),0) AS TOTAL_N,MAX(CAST(S.DQ_DT AS DATE)) AS POU_DT'
          || V_PROJECTION || ' FROM (SELECT ' || V_SOURCE_PROJECTION
          || ' FROM "' || V_DB || '"."' || V_SOURCE || '") S'
          || V_GROUP_CLAUSE
          || ') WITH DATA PRIMARY INDEX (DQ_YEAR) ON COMMIT PRESERVE ROWS';
        UPDATE DQ_DB.DQ_MODULE_LOG SET SQL_TEXT = V_SQL
         WHERE RUN_ID = P_RUN_ID AND MODULE_NAME = 'NUMERIC_BASIC'
           AND ATTEMPT_NO = V_ATTEMPT AND BATCH_ID = V_BATCH;
        CALL DBC.SysExecSQL(V_SQL);
        SET V_VT_EXISTS = 1;

        FOR R AS RESULTS_CURSOR CURSOR FOR
            SELECT FIELD_NAME,FIELD_ORDINAL FROM DQ_DB.DQ_RUN_FIELD_CONFIG
             WHERE RUN_ID = P_RUN_ID AND FIELD_TYPE = 'NUMERIC'
               AND FIELD_ORDINAL BETWEEN V_FIRST AND V_LAST
             ORDER BY FIELD_ORDINAL
        DO
            SET V_SUFFIX = TRIM(CAST(R.FIELD_ORDINAL AS VARCHAR(12)));
            SET V_SQL = 'INSERT INTO DQ_DB.DQ_METRIC_RESULT '
              || '(RUN_ID,PROJECT_ID,FIELD_NAME,FIELD_TYPE,MODULE_NAME,PERIOD_LEVEL,'
              || 'PERIOD_VALUE,METRIC_NAME,METRIC_VALUE,IS_PERCENTAGE,RATE_NUMERATOR,'
              || 'RATE_DENOMINATOR,POU_DT,EXECUTION_TIMESTAMP) SELECT ''' || P_RUN_ID || ''','''
              || P_PROJECT_ID || ''',''' || TRIM(R.FIELD_NAME) || ''',''NUMERIC'',''NUMERIC_BASIC'','
              || 'CASE WHEN A.GY=1 THEN ''OVERALL'' WHEN A.GM=1 THEN ''YEARLY'' ELSE ''MONTHLY'' END,'
              || 'CASE WHEN A.GY=1 THEN ''ALL'' WHEN A.DQ_YEAR IS NULL THEN ''UNKNOWN'' '
              || 'WHEN A.GM=1 THEN TRIM(CAST(A.DQ_YEAR AS CHAR(4))) ELSE '
              || 'TRIM(CAST(A.DQ_YEAR AS CHAR(4)))||''-''||SUBSTR(''00''||TRIM(CAST(A.DQ_MONTH AS VARCHAR(2))),'
              || 'CHARACTER_LENGTH(''00''||TRIM(CAST(A.DQ_MONTH AS VARCHAR(2))))-1,2) END,'
              || 'M.METRIC_NAME,CASE M.METRIC_ORDINAL '
              || 'WHEN 1 THEN CAST(A.TOTAL_N AS DECIMAL(38,10)) WHEN 2 THEN CAST(A.N' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 3 THEN CAST(A.TOTAL_N-A.N' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 4 THEN CAST(100.0*CAST(A.TOTAL_N-A.N' || V_SUFFIX || ' AS FLOAT)/NULLIF(A.TOTAL_N,0) AS DECIMAL(38,10))'
              || ' WHEN 5 THEN CAST(A.Z' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 6 THEN CAST(100.0*CAST(A.Z' || V_SUFFIX || ' AS FLOAT)/NULLIF(A.TOTAL_N,0) AS DECIMAL(38,10))'
              || ' WHEN 7 THEN CAST(A.LO' || V_SUFFIX || ' AS DECIMAL(38,10)) WHEN 8 THEN CAST(A.HI' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 9 THEN CAST(A.AV' || V_SUFFIX || ' AS DECIMAL(38,10)) WHEN 10 THEN CAST(A.SD' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 11 THEN CAST(A.N' || V_SUFFIX || '-A.V' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 12 THEN CAST(100.0*CAST(A.N' || V_SUFFIX || '-A.V' || V_SUFFIX || ' AS FLOAT)/NULLIF(A.TOTAL_N,0) AS DECIMAL(38,10))'
              || ' END,M.IS_PERCENTAGE,'
              || 'CASE M.METRIC_ORDINAL WHEN 4 THEN A.TOTAL_N-A.N' || V_SUFFIX
              || ' WHEN 6 THEN A.Z' || V_SUFFIX || ' WHEN 12 THEN A.N' || V_SUFFIX || '-A.V' || V_SUFFIX || ' ELSE NULL END,'
              || 'CASE WHEN M.IS_PERCENTAGE=''Y'' THEN A.TOTAL_N ELSE NULL END,'
              || 'CASE WHEN A.GY=1 THEN CAST(NULL AS DATE) ELSE A.POU_DT END,CURRENT_TIMESTAMP(6) FROM DQ_NB_AGG A CROSS JOIN DQ_DB.DQ_METRIC_DEFINITION M '
              || 'WHERE M.MODULE_NAME=''NUMERIC_BASIC'' AND M.METRIC_ORDINAL BETWEEN 1 AND 12';
            CALL DBC.SysExecSQL(V_SQL);
            /* Keep unrounded FLOAT mean/deviation for strict Outlier bounds.
               V is the non-NULL, non-special population; no source rescan. */
            SET V_SQL = 'INSERT INTO DQ_DB.DQ_NUMERIC_STATISTICS '
              || '(RUN_ID,FIELD_NAME,PERIOD_LEVEL,PERIOD_VALUE,TOTAL_COUNT,VALID_COUNT,MEAN_VALUE,STDDEV_VALUE) '
              || 'SELECT ''' || P_RUN_ID || ''',''' || TRIM(R.FIELD_NAME) || ''','
              || 'CASE WHEN A.GY=1 THEN ''OVERALL'' WHEN A.GM=1 THEN ''YEARLY'' ELSE ''MONTHLY'' END,'
              || 'CASE WHEN A.GY=1 THEN ''ALL'' WHEN A.DQ_YEAR IS NULL THEN ''UNKNOWN'' '
              || 'WHEN A.GM=1 THEN TRIM(CAST(A.DQ_YEAR AS CHAR(4))) ELSE '
              || 'TRIM(CAST(A.DQ_YEAR AS CHAR(4)))||''-''||SUBSTR(''00''||TRIM(CAST(A.DQ_MONTH AS VARCHAR(2))),'
              || 'CHARACTER_LENGTH(''00''||TRIM(CAST(A.DQ_MONTH AS VARCHAR(2))))-1,2) END,'
              || 'A.TOTAL_N,A.V' || V_SUFFIX || ',A.AV' || V_SUFFIX || ',A.SD' || V_SUFFIX || ' FROM DQ_NB_AGG A';
            CALL DBC.SysExecSQL(V_SQL);
            /* Coverage is overall-only and depends on this field being non-NULL.
               NULL reporting dates contribute no availability endpoint. */
            SET V_SQL = 'INSERT INTO DQ_DB.DQ_FIELD_AVAILABILITY '
              || '(RUN_ID,PROJECT_ID,FIELD_NAME,EARLIEST_DATE,LATEST_DATE) SELECT ''' || P_RUN_ID || ''','''
              || P_PROJECT_ID || ''',''' || TRIM(R.FIELD_NAME) || ''',MIN(A.FA' || V_SUFFIX || '),MAX(A.LA' || V_SUFFIX || ')'
              || ' FROM DQ_NB_AGG A';
            CALL DBC.SysExecSQL(V_SQL);
        END FOR;
        CALL DBC.SysExecSQL('DROP TABLE DQ_NB_AGG');
        SET V_VT_EXISTS = 0;
        UPDATE DQ_DB.DQ_MODULE_LOG SET STATUS = 'SUCCEEDED',END_TIME = CURRENT_TIMESTAMP(6)
         WHERE RUN_ID = P_RUN_ID AND MODULE_NAME = 'NUMERIC_BASIC'
           AND ATTEMPT_NO = V_ATTEMPT AND BATCH_ID = V_BATCH;
        SET V_FIRST = V_LAST + 1;
    END WHILE;
    IF P_FIELD_LAST>=V_FIELDS THEN
        UPDATE DQ_DB.DQ_MODULE_LOG
           SET STATUS = 'SUCCEEDED',END_TIME = CURRENT_TIMESTAMP(6),FIELD_COUNT = V_FIELDS
         WHERE RUN_ID = P_RUN_ID AND MODULE_NAME = 'NUMERIC_BASIC'
           AND ATTEMPT_NO = V_ATTEMPT AND BATCH_ID = 0;
    END IF;
END main;

/* Execute after compiling the procedure. Replace DQ_DB in ON and TO. */
GRANT EXECUTE PROCEDURE ON DQ_DB.SP_DQ_NUMERIC_BASIC_BATCH TO DQ_DB;

/* Preserve the two-argument Basic-only API. Configuration is already captured
   by the shared orchestrator; never replace it from live Excel tables here. */
REPLACE PROCEDURE DQ_DB.SP_DQ_NUMERIC_BASIC
    (IN P_RUN_ID CHAR(36),IN P_PROJECT_ID VARCHAR(30))
SQL SECURITY INVOKER
BEGIN
    DECLARE V_DB VARCHAR(128);
    DECLARE V_SOURCE VARCHAR(128);
    DECLARE V_DATE VARCHAR(128);
    SELECT SOURCE_DATABASE,SOURCE_TABLE,REPORTING_DATE_FIELD
      INTO V_DB,V_SOURCE,V_DATE FROM DQ_DB.DQ_RUN_LOG
     WHERE RUN_ID=P_RUN_ID AND PROJECT_ID=P_PROJECT_ID AND STATUS='RUNNING';
    CALL DQ_DB.SP_DQ_NUMERIC_BASIC_BATCH(P_RUN_ID,P_PROJECT_ID,V_DB,V_SOURCE,V_DATE,1,2147483647,1);
END;
GRANT EXECUTE PROCEDURE ON DQ_DB.SP_DQ_NUMERIC_BASIC TO DQ_DB;
