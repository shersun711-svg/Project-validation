/* Fixed rule: mean +/- 3*STDDEV_POP for each field/period; strict outside.
   Exclude NULL and configured numeric specials from statistics, testing and
   rate denominator. Reuse unrounded Basic statistics when present; otherwise
   calculate the prerequisite internally without producing Basic results.
   Materialize reporting date and a bounded group of numeric fields into
   one run/attempt/batch MULTISET work table, preserving types and duplicates.
   Partition the projection by a stored year key (0 for NULL dates); distribute
   rows by an independent random bucket, not by date or a possibly skewed value.
   Use permanent space for the projection, not volatile raw-row spool. Drop it
   on success/handled failure; a terminated session may leave it for recovery.
   Aggregate one calendar year at a time to bound peak work while counting
   against overall, yearly and monthly bounds (maximum 5 fields).
   Roll up the compact yearly chunks after aggregation.
   The shared orchestrator owns status, rollback of partial output and retries. */
REPLACE PROCEDURE DQ_DB.SP_DQ_NUMERIC_OUTLIERS
    (IN P_RUN_ID CHAR(36),IN P_PROJECT_ID VARCHAR(30))
SQL SECURITY INVOKER
main: BEGIN
    DECLARE V_DB VARCHAR(128);
    DECLARE V_SOURCE VARCHAR(128);
    DECLARE V_SOURCE_DATABASE VARCHAR(128);
    DECLARE V_SOURCE_TABLE VARCHAR(128);
    DECLARE V_NEED_STATS INTEGER DEFAULT 0;
    DECLARE V_DATE VARCHAR(128);
    DECLARE V_SIZE INTEGER;
    DECLARE V_STAGE_SIZE INTEGER;
    DECLARE V_STAGE_FIRST INTEGER;
    DECLARE V_STAGE_LAST INTEGER;
    DECLARE V_PROFILE_OVERALL CHAR(1);
    DECLARE V_PROFILE_MONTHLY CHAR(1);
    DECLARE V_PROFILE_YEARLY CHAR(1);
    DECLARE V_ATTEMPT INTEGER;
    DECLARE V_COUNT INTEGER;
    DECLARE V_METRIC_NAMES INTEGER;
    DECLARE V_FIELDS INTEGER;
    DECLARE V_FIRST INTEGER DEFAULT 1;
    DECLARE V_LAST INTEGER;
    DECLARE V_BATCH INTEGER DEFAULT 0;
    DECLARE V_OWNED INTEGER DEFAULT 0;
    DECLARE V_BOUNDS_EXISTS INTEGER DEFAULT 0;
    DECLARE V_AGG_EXISTS INTEGER DEFAULT 0;
    DECLARE V_CHUNK_EXISTS INTEGER DEFAULT 0;
    DECLARE V_STAGE_EXISTS INTEGER DEFAULT 0;
    DECLARE V_STAGE VARCHAR(128);
    DECLARE V_STAGE_BUCKET VARCHAR(30);
    DECLARE V_STAGE_YEAR VARCHAR(30);
    DECLARE V_KEY_SUFFIX INTEGER DEFAULT 0;
    DECLARE V_STAGE_PROJECTION VARCHAR(28000);
    DECLARE V_STAGE_SELECT VARCHAR(30000);
    DECLARE V_SQL VARCHAR(32000);
    DECLARE V_SOURCE_PROJECTION VARCHAR(8000);
    DECLARE V_PROJECTION VARCHAR(6000);
    DECLARE V_BOUND_PROJECTION VARCHAR(6000);
    DECLARE V_OVERALL_BOUND_PROJECTION VARCHAR(3000);
    DECLARE V_CHECK VARCHAR(2000);
    DECLARE V_LIST VARCHAR(8000);
    DECLARE V_SUFFIX VARCHAR(12);
    DECLARE V_FIELD VARCHAR(150);
    DECLARE V_SOURCE_FILTER VARCHAR(1000);
    DECLARE V_SOURCE_JOIN VARCHAR(20);
    DECLARE V_SOURCE_JOIN_ON VARCHAR(16);
    DECLARE V_CHUNK_YEAR VARCHAR(7);
    DECLARE V_YEAR_BOUNDS VARCHAR(500);
    DECLARE V_YEAR_COUNT VARCHAR(1000);
    DECLARE V_YEAR_TOTAL VARCHAR(100);
    DECLARE V_YEAR_JOIN VARCHAR(500);
    DECLARE V_PERIOD_QUERY VARCHAR(24000);
    DECLARE V_ROLLUP_OVERALL VARCHAR(6000);
    DECLARE V_ROLLUP_YEARLY VARCHAR(6000);
    DECLARE V_ROLLUP_MONTHLY VARCHAR(6000);
    DECLARE V_ROLLUP_QUERY VARCHAR(24000);
    DECLARE V_QUERY_OVERALL VARCHAR(8000);
    DECLARE V_QUERY_YEARLY VARCHAR(8000);
    DECLARE V_QUERY_MONTHLY VARCHAR(8000);
    DECLARE V_ERROR VARCHAR(2048) CHARACTER SET UNICODE;
    DECLARE V_ERROR_CODE INTEGER;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS EXCEPTION 1 V_ERROR=MESSAGE_TEXT;
        SET V_ERROR_CODE=SQLCODE;
        IF V_OWNED=1 THEN
            DELETE FROM DQ_DB.DQ_OUTLIER_CHUNK_YEAR WHERE RUN_ID=P_RUN_ID;
            UPDATE DQ_DB.DQ_MODULE_LOG SET STATUS='FAILED',END_TIME=CURRENT_TIMESTAMP(6),
                   ERROR_CODE=V_ERROR_CODE,ERROR_INFORMATION=V_ERROR
             WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS'
               AND ATTEMPT_NO=V_ATTEMPT AND STATUS='RUNNING';
        END IF;
        BEGIN
            DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET V_COUNT=0;
            IF V_AGG_EXISTS=1 THEN CALL DBC.SysExecSQL('DROP TABLE DQ_NO_AGG'); END IF;
            IF V_CHUNK_EXISTS=1 THEN CALL DBC.SysExecSQL('DROP TABLE DQ_NO_CHUNKS'); END IF;
            IF V_BOUNDS_EXISTS=1 THEN CALL DBC.SysExecSQL('DROP TABLE DQ_NO_BOUNDS'); END IF;
            IF V_STAGE_EXISTS=1 THEN
                CALL DBC.SysExecSQL('DROP TABLE DQ_DB.' || V_STAGE);
            END IF;
        END;
        RESIGNAL;
    END;
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_LOG
     WHERE RUN_ID=P_RUN_ID AND PROJECT_ID=P_PROJECT_ID AND STATUS='RUNNING';
    IF V_COUNT<>1 THEN SIGNAL SQLSTATE 'U0002' SET MESSAGE_TEXT='Outliers require an active engine run'; END IF;
    SELECT SOURCE_DATABASE,SOURCE_TABLE,REPORTING_DATE_FIELD,SQL_BATCH_SIZE,ATTEMPT_NO
      INTO V_DB,V_SOURCE,V_DATE,V_SIZE,V_ATTEMPT FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID=P_RUN_ID;
    SELECT PROFILE_OVERALL,PROFILE_MONTHLY,PROFILE_YEARLY
      INTO V_PROFILE_OVERALL,V_PROFILE_MONTHLY,V_PROFILE_YEARLY
      FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID=P_RUN_ID;
    /* SQL_BATCH_SIZE controls copy width (maximum 20). Keep the tested
       counting-query width at five fields, independently of copy width. */
    SET V_STAGE_SIZE=LEAST(V_SIZE,20);
    SET V_SIZE=LEAST(V_SIZE,5);
    INSERT INTO DQ_DB.DQ_MODULE_LOG (RUN_ID,MODULE_NAME,ATTEMPT_NO,BATCH_ID,START_TIME,STATUS)
    VALUES (P_RUN_ID,'NUMERIC_OUTLIERS',V_ATTEMPT,0,CURRENT_TIMESTAMP(6),'RUNNING');
    SET V_OWNED=1;
    SELECT COUNT(*) INTO V_FIELDS FROM DQ_DB.DQ_RUN_FIELD_CONFIG WHERE RUN_ID=P_RUN_ID AND FIELD_TYPE='NUMERIC';
    IF V_FIELDS=0 THEN SIGNAL SQLSTATE 'U0009' SET MESSAGE_TEXT='Outliers selected without eligible numeric fields'; END IF;
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_FIELD_CONFIG
     WHERE RUN_ID=P_RUN_ID AND FIELD_TYPE='NUMERIC'
       AND REGEXP_SIMILAR(FIELD_NAME,'^[A-Za-z_][A-Za-z0-9_]*$','c')<>1;
    IF V_COUNT>0 THEN SIGNAL SQLSTATE 'U0011' SET MESSAGE_TEXT='Unsafe captured numeric identifier'; END IF;
    SELECT COUNT(*),COUNT(DISTINCT METRIC_NAME) INTO V_COUNT,V_METRIC_NAMES
      FROM DQ_DB.DQ_METRIC_DEFINITION
     WHERE MODULE_NAME='NUMERIC_OUTLIERS' AND METRIC_ORDINAL BETWEEN 1 AND 5;
    IF V_COUNT<>5 OR V_METRIC_NAMES<>5 THEN
        SIGNAL SQLSTATE 'U0010' SET MESSAGE_TEXT='Outlier metric definitions must contain five unique names';
    END IF;
    /* Prepare bounded copies of the final configured view. No DISTINCT, extra row
       filters, numeric casts or special removal: preserve the view population.
       Internal keys affect physical placement only, never the test population.
       A different name per run/attempt isolates concurrent work and retries. */
    IF REGEXP_SIMILAR(TRIM(P_RUN_ID),
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$','c')<>1
       OR REGEXP_SIMILAR(V_DB,'^[A-Za-z_][A-Za-z0-9_]*$','c')<>1
       OR REGEXP_SIMILAR(V_SOURCE,'^[A-Za-z_][A-Za-z0-9_]*$','c')<>1
       OR REGEXP_SIMILAR(V_DATE,'^[A-Za-z_][A-Za-z0-9_]*$','c')<>1 THEN
        SIGNAL SQLSTATE 'U0004' SET MESSAGE_TEXT='Unsafe outlier source or run identifier';
    END IF;
    SET V_SOURCE_DATABASE=V_DB;
    SET V_SOURCE_TABLE=V_SOURCE;
    /* Choose internal column names outside the projected source namespace.
       A source field may legitimately have one of these names. */
    SET V_COUNT=1;
    WHILE V_COUNT>0 DO
        SET V_STAGE_BUCKET='DQ_OS_BUCKET_' || TRIM(CAST(V_KEY_SUFFIX AS VARCHAR(10)));
        SET V_STAGE_YEAR='DQ_OS_YEAR_' || TRIM(CAST(V_KEY_SUFFIX AS VARCHAR(10)));
        SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_FIELD_CONFIG
         WHERE RUN_ID=P_RUN_ID AND FIELD_TYPE='NUMERIC'
           AND UPPER(TRIM(FIELD_NAME)) IN (V_STAGE_BUCKET,V_STAGE_YEAR);
        IF UPPER(V_DATE) IN (V_STAGE_BUCKET,V_STAGE_YEAR) THEN SET V_COUNT=V_COUNT+1; END IF;
        SET V_KEY_SUFFIX=V_KEY_SUFFIX+1;
    END WHILE;
    /* Decide once whether Basic supplied the prerequisite. Otherwise each
       small copy supplies its own statistics before outlier counting. */
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_NUMERIC_STATISTICS WHERE RUN_ID=P_RUN_ID;
    IF V_COUNT=0 THEN SET V_NEED_STATS=1; END IF;
    CALL DQ_DB.SP_DQ_SPECIAL_LIST(P_RUN_ID,'NUMERIC',V_LIST);
    WHILE V_FIRST<=V_FIELDS DO
        IF V_STAGE_EXISTS=0 THEN
            SET V_STAGE_FIRST=V_FIRST;
            SET V_STAGE_LAST=LEAST(V_STAGE_FIRST+V_STAGE_SIZE-1,V_FIELDS);
        END IF;
        SET V_BATCH=V_BATCH+1;
        SET V_LAST=LEAST(V_FIRST+V_SIZE-1,V_FIELDS,V_STAGE_LAST);
        INSERT INTO DQ_DB.DQ_MODULE_LOG (RUN_ID,MODULE_NAME,ATTEMPT_NO,BATCH_ID,START_TIME,STATUS,FIELD_COUNT)
        VALUES (P_RUN_ID,'NUMERIC_OUTLIERS',V_ATTEMPT,V_BATCH,CURRENT_TIMESTAMP(6),'RUNNING',V_LAST-V_FIRST+1);
        IF V_STAGE_EXISTS=0 THEN
            SET V_STAGE='DQ_OS_' || OREPLACE(TRIM(P_RUN_ID),'-','') || '_A'
              || TRIM(CAST(V_ATTEMPT AS VARCHAR(12))) || '_B' || TRIM(CAST(V_BATCH AS VARCHAR(12)));
            SET V_DB=V_SOURCE_DATABASE;
            SET V_SOURCE=V_SOURCE_TABLE;
            SET V_STAGE_PROJECTION='"' || V_DATE || '"';
            FOR W AS STAGE_FIELDS_CURSOR CURSOR FOR
                SELECT FIELD_NAME FROM DQ_DB.DQ_RUN_FIELD_CONFIG
                 WHERE RUN_ID=P_RUN_ID AND FIELD_TYPE='NUMERIC'
                   AND FIELD_ORDINAL BETWEEN V_STAGE_FIRST AND V_STAGE_LAST ORDER BY FIELD_ORDINAL
            DO
                /* If reporting date is also selected, project it only once. */
                IF UPPER(TRIM(W.FIELD_NAME))<>UPPER(V_DATE) THEN
                    IF CHARACTER_LENGTH(V_STAGE_PROJECTION)+CHARACTER_LENGTH(TRIM(W.FIELD_NAME))+3>28000 THEN
                        SIGNAL SQLSTATE 'U0034' SET MESSAGE_TEXT='Outlier projection SQL too long; select fewer numeric fields';
                    END IF;
                    SET V_STAGE_PROJECTION=V_STAGE_PROJECTION || ',"' || TRIM(W.FIELD_NAME) || '"';
                END IF;
            END FOR;
            SET V_STAGE_SELECT='SELECT ' || V_STAGE_PROJECTION
              || ',RANDOM(1,2147483647) AS "' || V_STAGE_BUCKET || '"'
              || ',COALESCE(EXTRACT(YEAR FROM "' || V_DATE || '"),0) AS "' || V_STAGE_YEAR || '"'
              || ' FROM "' || V_DB || '"."' || V_SOURCE || '"';
            /* Establish table ownership before loading. If INSERT runs out of room,
               the handler can drop this owned table even though loading failed. */
            SET V_SQL='CREATE MULTISET TABLE DQ_DB.' || V_STAGE || ' AS (' || V_STAGE_SELECT || ') WITH NO DATA'
              || ' PRIMARY INDEX ("' || V_STAGE_BUCKET || '")'
              || ' PARTITION BY RANGE_N("' || V_STAGE_YEAR || '" BETWEEN 0 AND 9999 EACH 1)';
            /* Batch 0 retains creation SQL/table identity for operator recovery. */
            UPDATE DQ_DB.DQ_MODULE_LOG SET SQL_TEXT=V_SQL
             WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS' AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID IN (0,V_BATCH);
            CALL DBC.SysExecSQL(V_SQL);
            SET V_STAGE_EXISTS=1;
            SET V_SQL='INSERT INTO DQ_DB.' || V_STAGE || ' ' || V_STAGE_SELECT;
            UPDATE DQ_DB.DQ_MODULE_LOG SET SQL_TEXT=V_SQL
             WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS'
               AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID IN (0,V_BATCH);
            CALL DBC.SysExecSQL(V_SQL);
            /* Include owner-reference access for the dynamic work table. */
            SET V_SQL='GRANT SELECT ON DQ_DB.' || V_STAGE || ' TO DQ_DB WITH GRANT OPTION';
            CALL DBC.SysExecSQL(V_SQL);
            /* Collect partition statistics once per loaded field batch, not per year.
               Batch 0 retains INSERT/table identity for operator recovery. */
            SET V_SQL='COLLECT STATISTICS COLUMN (PARTITION), COLUMN ("' || V_STAGE_YEAR
              || '") ON DQ_DB.' || V_STAGE;
            CALL DBC.SysExecSQL(V_SQL);
            SET V_DB='DQ_DB';
            SET V_SOURCE=V_STAGE;
            /* Scan scheduling is independent of reporting levels. This small run-owned
               calendar contains no profile metrics and is removed on completion/failure. */
            DELETE FROM DQ_DB.DQ_OUTLIER_CHUNK_YEAR WHERE RUN_ID=P_RUN_ID;
            SET V_SQL='INSERT INTO DQ_DB.DQ_OUTLIER_CHUNK_YEAR (RUN_ID,CHUNK_YEAR) SELECT DISTINCT '''
              || P_RUN_ID || ''',CAST(CASE WHEN "' || V_STAGE_YEAR || '"=0 THEN ''UNKNOWN'' '
              || 'ELSE TRIM(CAST("' || V_STAGE_YEAR || '" AS CHAR(4))) END AS VARCHAR(7)) '
              || 'FROM DQ_DB.' || V_STAGE;
            CALL DBC.SysExecSQL(V_SQL);
            INSERT INTO DQ_DB.DQ_OUTLIER_CHUNK_YEAR (RUN_ID,CHUNK_YEAR)
            SELECT P_RUN_ID,'ALL' FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID=P_RUN_ID
               AND NOT EXISTS (SELECT 1 FROM DQ_DB.DQ_OUTLIER_CHUNK_YEAR WHERE RUN_ID=P_RUN_ID);
        END IF;
        IF V_NEED_STATS=1 THEN
            CALL DQ_DB.SP_DQ_NUMERIC_STATS_BATCH(P_RUN_ID,P_PROJECT_ID,V_DB,V_SOURCE,V_DATE,
                 V_FIRST,V_LAST,V_BATCH);
        END IF;
        /* Never silently mix partially captured and newly computed statistics. */
        SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_FIELD_CONFIG F
         WHERE F.RUN_ID=P_RUN_ID AND F.FIELD_TYPE='NUMERIC'
           AND F.FIELD_ORDINAL BETWEEN V_FIRST AND V_LAST AND NOT EXISTS
           (SELECT 1 FROM DQ_DB.DQ_NUMERIC_STATISTICS S WHERE S.RUN_ID=F.RUN_ID
            AND S.FIELD_NAME=F.FIELD_NAME)
           AND (V_PROFILE_OVERALL='Y' OR EXISTS
             (SELECT 1 FROM DQ_DB.DQ_OUTLIER_CHUNK_YEAR C WHERE C.RUN_ID=P_RUN_ID AND C.CHUNK_YEAR<>'ALL'));
        IF V_COUNT>0 THEN SIGNAL SQLSTATE 'U0040' SET MESSAGE_TEXT='Captured numeric statistics are incomplete'; END IF;
        SET V_SOURCE_PROJECTION='"' || V_DATE || '" AS DQ_DT,1 AS DQ_PRESENT';
        SET V_BOUND_PROJECTION='';
        SET V_OVERALL_BOUND_PROJECTION='';
        SET V_PROJECTION='';
        SET V_ROLLUP_OVERALL='';
        SET V_ROLLUP_YEARLY='';
        SET V_ROLLUP_MONTHLY='';
        SET V_CHECK='A.ACTUAL_TOTAL<>A.TOTAL_N';
        FOR F AS FIELDS_CURSOR CURSOR FOR
            SELECT FIELD_NAME,FIELD_ORDINAL FROM DQ_DB.DQ_RUN_FIELD_CONFIG
             WHERE RUN_ID=P_RUN_ID AND FIELD_TYPE='NUMERIC' AND FIELD_ORDINAL BETWEEN V_FIRST AND V_LAST ORDER BY FIELD_ORDINAL
        DO
            SET V_SUFFIX=TRIM(CAST(F.FIELD_ORDINAL AS VARCHAR(12)));
            IF CHARACTER_LENGTH(V_SOURCE_PROJECTION)+CHARACTER_LENGTH(V_LIST)+2*CHARACTER_LENGTH(TRIM(F.FIELD_NAME))+100>8000 THEN
                SIGNAL SQLSTATE 'U0034' SET MESSAGE_TEXT='Outlier SQL too long; reduce batch size or special list';
            END IF;
            SET V_SOURCE_PROJECTION=V_SOURCE_PROJECTION || ',CASE WHEN "' || TRIM(F.FIELD_NAME) || '" IN ' || V_LIST
              || ' THEN NULL ELSE "' || TRIM(F.FIELD_NAME) || '" END AS DQ_C' || V_SUFFIX;
            SET V_BOUND_PROJECTION=V_BOUND_PROJECTION
              || ',MAX(CASE WHEN FIELD_NAME=''' || TRIM(F.FIELD_NAME) || ''' THEN VALID_COUNT END) AS N' || V_SUFFIX
              || ',MAX(CASE WHEN FIELD_NAME=''' || TRIM(F.FIELD_NAME) || ''' THEN LB END) AS L' || V_SUFFIX
              || ',MAX(CASE WHEN FIELD_NAME=''' || TRIM(F.FIELD_NAME) || ''' THEN UB END) AS U' || V_SUFFIX;
            SET V_OVERALL_BOUND_PROJECTION=V_OVERALL_BOUND_PROJECTION
              || ',MAX(N' || V_SUFFIX || ') AS N' || V_SUFFIX
              || ',MAX(L' || V_SUFFIX || ') AS L' || V_SUFFIX
              || ',MAX(U' || V_SUFFIX || ') AS U' || V_SUFFIX;
            SET V_FIELD='S.DQ_C' || V_SUFFIX;
            /* Keep the small chunk layout stable without generating yearly
               comparisons or a yearly bounds join when that level is off. */
            IF V_PROFILE_YEARLY='Y' THEN
                SET V_YEAR_BOUNDS=',MAX(B1.N' || V_SUFFIX || ') AS YN' || V_SUFFIX
                  || ',MAX(B1.L' || V_SUFFIX || ') AS YL' || V_SUFFIX
                  || ',MAX(B1.U' || V_SUFFIX || ') AS YU' || V_SUFFIX;
                SET V_YEAR_COUNT=',COALESCE(SUM(CAST(CASE WHEN CAST(' || V_FIELD || ' AS FLOAT)<B1.L' || V_SUFFIX
                  || ' OR CAST(' || V_FIELD || ' AS FLOAT)>B1.U' || V_SUFFIX
                  || ' THEN 1 ELSE 0 END AS BIGINT)),0) AS YO' || V_SUFFIX;
            ELSE
                SET V_YEAR_BOUNDS=',CAST(NULL AS BIGINT) AS YN' || V_SUFFIX
                  || ',CAST(NULL AS FLOAT) AS YL' || V_SUFFIX || ',CAST(NULL AS FLOAT) AS YU' || V_SUFFIX;
                SET V_YEAR_COUNT=',CAST(0 AS BIGINT) AS YO' || V_SUFFIX;
            END IF;
            SET V_PROJECTION=V_PROJECTION
              || ',MAX(B0.N' || V_SUFFIX || ') AS ON' || V_SUFFIX
              || ',MAX(B0.L' || V_SUFFIX || ') AS OL' || V_SUFFIX
              || ',MAX(B0.U' || V_SUFFIX || ') AS OU' || V_SUFFIX
              || V_YEAR_BOUNDS
              || ',MAX(BM.N' || V_SUFFIX || ') AS MN' || V_SUFFIX
              || ',MAX(BM.L' || V_SUFFIX || ') AS ML' || V_SUFFIX
              || ',MAX(BM.U' || V_SUFFIX || ') AS MU' || V_SUFFIX
              || ',COALESCE(SUM(CAST(CASE WHEN ' || V_FIELD || ' IS NOT NULL THEN 1 ELSE 0 END AS BIGINT)),0) AS ACTUAL' || V_SUFFIX
              || ',COALESCE(SUM(CAST(CASE WHEN ''' || V_PROFILE_OVERALL || '''=''Y'' AND (CAST(' || V_FIELD || ' AS FLOAT)<B0.L' || V_SUFFIX
              || ' OR CAST(' || V_FIELD || ' AS FLOAT)>B0.U' || V_SUFFIX || ') THEN 1 ELSE 0 END AS BIGINT)),0) AS OO' || V_SUFFIX
              || V_YEAR_COUNT
              || ',COALESCE(SUM(CAST(CASE WHEN ''' || V_PROFILE_MONTHLY || '''=''Y'' AND (CAST(' || V_FIELD || ' AS FLOAT)<BM.L' || V_SUFFIX
              || ' OR CAST(' || V_FIELD || ' AS FLOAT)>BM.U' || V_SUFFIX || ') THEN 1 ELSE 0 END AS BIGINT)),0) AS MO' || V_SUFFIX;
            SET V_ROLLUP_OVERALL=V_ROLLUP_OVERALL
              || ',MAX(C.ON' || V_SUFFIX || ') AS N' || V_SUFFIX
              || ',MAX(C.OL' || V_SUFFIX || ') AS L' || V_SUFFIX
              || ',MAX(C.OU' || V_SUFFIX || ') AS U' || V_SUFFIX
              || ',SUM(C.ACTUAL' || V_SUFFIX || ') AS ACTUAL' || V_SUFFIX
              || ',SUM(C.OO' || V_SUFFIX || ') AS O' || V_SUFFIX;
            SET V_ROLLUP_YEARLY=V_ROLLUP_YEARLY
              || ',MAX(C.YN' || V_SUFFIX || ') AS N' || V_SUFFIX
              || ',MAX(C.YL' || V_SUFFIX || ') AS L' || V_SUFFIX
              || ',MAX(C.YU' || V_SUFFIX || ') AS U' || V_SUFFIX
              || ',SUM(C.ACTUAL' || V_SUFFIX || ') AS ACTUAL' || V_SUFFIX
              || ',SUM(C.YO' || V_SUFFIX || ') AS O' || V_SUFFIX;
            SET V_ROLLUP_MONTHLY=V_ROLLUP_MONTHLY
              || ',MAX(C.MN' || V_SUFFIX || ') AS N' || V_SUFFIX
              || ',MAX(C.ML' || V_SUFFIX || ') AS L' || V_SUFFIX
              || ',MAX(C.MU' || V_SUFFIX || ') AS U' || V_SUFFIX
              || ',SUM(C.ACTUAL' || V_SUFFIX || ') AS ACTUAL' || V_SUFFIX
              || ',SUM(C.MO' || V_SUFFIX || ') AS O' || V_SUFFIX;
            SET V_CHECK=V_CHECK || ' OR A.N' || V_SUFFIX || ' IS NULL OR A.ACTUAL' || V_SUFFIX || '<>A.N' || V_SUFFIX;
        END FOR;
        /* Bounds table contains period aggregates only. Fixed 3 is recorded
           in SQL; no rounded DECIMAL mean/deviation is read from metric results. */
        SET V_SQL='CREATE VOLATILE TABLE DQ_NO_BOUNDS AS (SELECT PERIOD_LEVEL,PERIOD_VALUE,MAX(TOTAL_COUNT) AS TOTAL_N'
          || V_BOUND_PROJECTION || ' FROM (SELECT S.*,'
          || 'CASE WHEN VALID_COUNT>=1 AND STDDEV_VALUE IS NOT NULL THEN MEAN_VALUE-3.0*STDDEV_VALUE END AS LB,'
          || 'CASE WHEN VALID_COUNT>=1 AND STDDEV_VALUE IS NOT NULL THEN MEAN_VALUE+3.0*STDDEV_VALUE END AS UB '
          || 'FROM DQ_DB.DQ_NUMERIC_STATISTICS S WHERE RUN_ID=''' || P_RUN_ID || ''' AND FIELD_NAME IN ('
          || 'SELECT FIELD_NAME FROM DQ_DB.DQ_RUN_FIELD_CONFIG WHERE RUN_ID=''' || P_RUN_ID
          || ''' AND FIELD_TYPE=''NUMERIC'' AND FIELD_ORDINAL BETWEEN ' || TRIM(CAST(V_FIRST AS VARCHAR(12)))
          || ' AND ' || TRIM(CAST(V_LAST AS VARCHAR(12))) || ')) Q GROUP BY PERIOD_LEVEL,PERIOD_VALUE)'
          || ' WITH DATA PRIMARY INDEX (PERIOD_LEVEL,PERIOD_VALUE) ON COMMIT PRESERVE ROWS';
        CALL DBC.SysExecSQL(V_SQL);
        SET V_BOUNDS_EXISTS=1;
        /* Read one physical year partition per statement. Normal chunks produce
           at most twelve monthly summaries; UNKNOWN and empty populations
           each use one small special chunk. Filter the stored partition key
           directly, including 0 for NULL dates. Verify elimination in EXPLAIN. */
        FOR C AS CHUNKS_CURSOR CURSOR FOR
                SELECT CHUNK_YEAR AS CHUNK_VALUE FROM DQ_DB.DQ_OUTLIER_CHUNK_YEAR
                 WHERE RUN_ID=P_RUN_ID ORDER BY CHUNK_YEAR
            DO
                IF C.CHUNK_VALUE='UNKNOWN' THEN
                    SET V_SOURCE_FILTER='"' || V_STAGE_YEAR || '"=0';
                    SET V_CHUNK_YEAR='UNKNOWN';
                ELSEIF C.CHUNK_VALUE='ALL' THEN
                    SET V_SOURCE_FILTER='1=0';
                    SET V_CHUNK_YEAR='ALL';
                ELSE
                    SET V_SOURCE_FILTER='"' || V_STAGE_YEAR || '"='
                      || TRIM(C.CHUNK_VALUE);
                    SET V_CHUNK_YEAR=TRIM(C.CHUNK_VALUE);
                END IF;
                /* Calendar years and UNKNOWN contain staged rows. A product
                   join avoids redistributing detail rows by constant bounds.
                   Only the empty-source ALL sentinel needs an outer row. */
                SET V_SOURCE_JOIN=' CROSS JOIN ';
                SET V_SOURCE_JOIN_ON='';
                IF C.CHUNK_VALUE='ALL' THEN
                    SET V_SOURCE_JOIN=' LEFT JOIN ';
                    SET V_SOURCE_JOIN_ON=' ON 1=1';
                END IF;
                SET V_YEAR_TOTAL='CAST(NULL AS BIGINT)';
                SET V_YEAR_JOIN='';
                IF V_PROFILE_YEARLY='Y' THEN
                    SET V_YEAR_TOTAL='MAX(B1.TOTAL_N)';
                    SET V_YEAR_JOIN=' LEFT JOIN (SELECT * FROM DQ_NO_BOUNDS WHERE PERIOD_LEVEL=''YEARLY'' AND PERIOD_VALUE='''
                      || V_CHUNK_YEAR || ''') B1 ON 1=1';
                END IF;
                SET V_PERIOD_QUERY='SELECT CAST(CASE WHEN ''' || C.CHUNK_VALUE || '''=''ALL'' THEN ''ALL'''
                  || ' WHEN ''' || C.CHUNK_VALUE || '''=''UNKNOWN'' THEN ''UNKNOWN'' ELSE CAST('''
                  || V_CHUNK_YEAR || '-''||SUBSTR(''00''||TRIM(CAST(EXTRACT(MONTH FROM S.DQ_DT) AS VARCHAR(2))),'
                  || 'CHARACTER_LENGTH(''00''||TRIM(CAST(EXTRACT(MONTH FROM S.DQ_DT) AS VARCHAR(2))))-1,2) AS VARCHAR(7)) END AS VARCHAR(10)) AS CHUNK_VALUE,'
                  || 'CAST(''' || V_CHUNK_YEAR || ''' AS VARCHAR(10)) AS CHUNK_YEAR,'
                  || 'MAX(CAST(S.DQ_DT AS DATE)) AS POU_DT,MAX(B0.TOTAL_N) AS OVERALL_TOTAL_N,' || V_YEAR_TOTAL || ' AS YEARLY_TOTAL_N,MAX(BM.TOTAL_N) AS MONTHLY_TOTAL_N,'
                  || 'COALESCE(SUM(CAST(CASE WHEN S.DQ_PRESENT=1 THEN 1 ELSE 0 END AS BIGINT)),0) AS ACTUAL_TOTAL'
                  || V_PROJECTION
                  || ' FROM (SELECT MAX(TOTAL_N) AS TOTAL_N' || V_OVERALL_BOUND_PROJECTION
                  || ' FROM DQ_NO_BOUNDS WHERE PERIOD_LEVEL=''OVERALL'' AND PERIOD_VALUE=''ALL'') B0'
                  || V_YEAR_JOIN
                  || V_SOURCE_JOIN || '(SELECT ' || V_SOURCE_PROJECTION || ' FROM "' || V_DB || '"."' || V_SOURCE
                  || '" WHERE ' || V_SOURCE_FILTER || ') S' || V_SOURCE_JOIN_ON
                  || ' LEFT JOIN DQ_NO_BOUNDS BM ON ''' || V_PROFILE_MONTHLY || '''=''Y'' AND BM.PERIOD_LEVEL=''MONTHLY'' AND BM.PERIOD_VALUE=CASE'
                  || ' WHEN S.DQ_DT IS NULL THEN ''UNKNOWN'' ELSE CAST(''' || V_CHUNK_YEAR
                  || '-''||SUBSTR(''00''||TRIM(CAST(EXTRACT(MONTH FROM S.DQ_DT) AS VARCHAR(2))),'
                  || 'CHARACTER_LENGTH(''00''||TRIM(CAST(EXTRACT(MONTH FROM S.DQ_DT) AS VARCHAR(2))))-1,2) AS VARCHAR(7)) END'
                  || ' GROUP BY EXTRACT(MONTH FROM S.DQ_DT)';
                IF V_CHUNK_EXISTS=0 THEN
                    SET V_SQL='CREATE MULTISET VOLATILE TABLE DQ_NO_CHUNKS AS (' || V_PERIOD_QUERY
                      || ') WITH DATA PRIMARY INDEX (CHUNK_VALUE) ON COMMIT PRESERVE ROWS';
                ELSE
                    SET V_SQL='INSERT INTO DQ_NO_CHUNKS ' || V_PERIOD_QUERY;
                END IF;
                /* SQL_TEXT identifies the current year or special chunk. */
                UPDATE DQ_DB.DQ_MODULE_LOG SET SQL_TEXT=V_SQL
                 WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS'
                   AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
                CALL DBC.SysExecSQL(V_SQL);
                SET V_CHUNK_EXISTS=1;
            END FOR;
        /* Explicit widths in EVERY branch: do not let the first literal ALL
           determine the UNION/CTAS period width and collapse longer keys.
           Match the result-table domain; retain the duplicate-key guard. */
        SET V_QUERY_OVERALL='';
        SET V_QUERY_YEARLY='';
        SET V_QUERY_MONTHLY='';
        IF V_PROFILE_OVERALL='Y' THEN
            SET V_QUERY_OVERALL='SELECT CAST(''OVERALL'' AS VARCHAR(8)) AS PERIOD_LEVEL,CAST(''ALL'' AS VARCHAR(10)) AS PERIOD_VALUE,'
              || 'MAX(C.OVERALL_TOTAL_N) AS TOTAL_N,SUM(C.ACTUAL_TOTAL) AS ACTUAL_TOTAL,CAST(NULL AS DATE) AS POU_DT'
              || V_ROLLUP_OVERALL || ' FROM DQ_NO_CHUNKS C';
        END IF;
        IF V_PROFILE_YEARLY='Y' THEN
            SET V_QUERY_YEARLY='SELECT CAST(''YEARLY'' AS VARCHAR(8)) AS PERIOD_LEVEL,CAST(C.CHUNK_YEAR AS VARCHAR(10)) AS PERIOD_VALUE,'
              || 'MAX(C.YEARLY_TOTAL_N) AS TOTAL_N,SUM(C.ACTUAL_TOTAL) AS ACTUAL_TOTAL,MAX(C.POU_DT) AS POU_DT'
              || V_ROLLUP_YEARLY || ' FROM DQ_NO_CHUNKS C WHERE C.CHUNK_VALUE<>''ALL'' GROUP BY C.CHUNK_YEAR';
            IF CHARACTER_LENGTH(V_QUERY_OVERALL)>0 THEN SET V_QUERY_YEARLY=' UNION ALL ' || V_QUERY_YEARLY; END IF;
        END IF;
        IF V_PROFILE_MONTHLY='Y' THEN
            SET V_QUERY_MONTHLY='SELECT CAST(''MONTHLY'' AS VARCHAR(8)) AS PERIOD_LEVEL,CAST(C.CHUNK_VALUE AS VARCHAR(10)) AS PERIOD_VALUE,'
              || 'MAX(C.MONTHLY_TOTAL_N) AS TOTAL_N,SUM(C.ACTUAL_TOTAL) AS ACTUAL_TOTAL,MAX(C.POU_DT) AS POU_DT'
              || V_ROLLUP_MONTHLY || ' FROM DQ_NO_CHUNKS C WHERE C.CHUNK_VALUE<>''ALL'' GROUP BY C.CHUNK_VALUE';
            IF CHARACTER_LENGTH(V_QUERY_OVERALL)>0 OR CHARACTER_LENGTH(V_QUERY_YEARLY)>0 THEN
                SET V_QUERY_MONTHLY=' UNION ALL ' || V_QUERY_MONTHLY;
            END IF;
        END IF;
        SET V_ROLLUP_QUERY=V_QUERY_OVERALL || V_QUERY_YEARLY || V_QUERY_MONTHLY;
            IF V_AGG_EXISTS=0 THEN
                SET V_SQL='CREATE VOLATILE TABLE DQ_NO_AGG AS (' || V_ROLLUP_QUERY
                  || ') WITH DATA PRIMARY INDEX (PERIOD_LEVEL,PERIOD_VALUE) ON COMMIT PRESERVE ROWS';
            ELSE
                SET V_SQL='INSERT INTO DQ_NO_AGG ' || V_ROLLUP_QUERY;
            END IF;
            UPDATE DQ_DB.DQ_MODULE_LOG SET SQL_TEXT=V_SQL
             WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS'
               AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
            CALL DBC.SysExecSQL(V_SQL);
            SET V_AGG_EXISTS=1;
            /* DQ_NO_AGG is created dynamically, so keep its duplicate-key
               check dynamic too; a static reference fails procedure compile. */
            SET V_SQL='UPDATE DQ_DB.DQ_MODULE_LOG SET ERROR_CODE=50042 WHERE RUN_ID=''' || P_RUN_ID
              || ''' AND MODULE_NAME=''NUMERIC_OUTLIERS'' AND ATTEMPT_NO=' || TRIM(CAST(V_ATTEMPT AS VARCHAR(12)))
              || ' AND BATCH_ID=' || TRIM(CAST(V_BATCH AS VARCHAR(12)))
              || ' AND EXISTS (SELECT 1 FROM (SELECT PERIOD_LEVEL,PERIOD_VALUE FROM DQ_NO_AGG'
              || ' GROUP BY PERIOD_LEVEL,PERIOD_VALUE HAVING COUNT(*)>1) D)';
            CALL DBC.SysExecSQL(V_SQL);
            SELECT COALESCE(ERROR_CODE,0) INTO V_COUNT FROM DQ_DB.DQ_MODULE_LOG
             WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS'
               AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
            IF V_COUNT=50042 THEN
                SIGNAL SQLSTATE 'U0044' SET MESSAGE_TEXT='Outlier rollup contains duplicate period keys';
            END IF;
            CALL DBC.SysExecSQL('DROP TABLE DQ_NO_CHUNKS');
            SET V_CHUNK_EXISTS=0;
        /* Record the generated population check on the batch log, then read
           its flag through ordinary SPL SELECT against a permanent table. */
        SET V_SQL='UPDATE DQ_DB.DQ_MODULE_LOG SET ERROR_CODE=50041 WHERE RUN_ID=''' || P_RUN_ID
          || ''' AND MODULE_NAME=''NUMERIC_OUTLIERS'' AND ATTEMPT_NO=' || TRIM(CAST(V_ATTEMPT AS VARCHAR(12)))
          || ' AND BATCH_ID=' || TRIM(CAST(V_BATCH AS VARCHAR(12)))
          || ' AND EXISTS (SELECT 1 FROM DQ_NO_AGG A WHERE ' || V_CHECK || ')';
        CALL DBC.SysExecSQL(V_SQL);
        SELECT COALESCE(ERROR_CODE,0) INTO V_COUNT FROM DQ_DB.DQ_MODULE_LOG
         WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS' AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
        IF V_COUNT<>0 THEN
            SIGNAL SQLSTATE 'U0041' SET MESSAGE_TEXT='Outlier population counts changed after statistics; use a stable source';
        END IF;
        FOR R AS RESULTS_CURSOR CURSOR FOR
            SELECT FIELD_NAME,FIELD_ORDINAL FROM DQ_DB.DQ_RUN_FIELD_CONFIG
             WHERE RUN_ID=P_RUN_ID AND FIELD_TYPE='NUMERIC' AND FIELD_ORDINAL BETWEEN V_FIRST AND V_LAST ORDER BY FIELD_ORDINAL
        DO
            SET V_SUFFIX=TRIM(CAST(R.FIELD_ORDINAL AS VARCHAR(12)));
            SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_METRIC_RESULT
             WHERE RUN_ID=P_RUN_ID AND FIELD_NAME=R.FIELD_NAME AND MODULE_NAME='NUMERIC_OUTLIERS';
            IF V_COUNT>0 THEN
                SIGNAL SQLSTATE 'U0045' SET MESSAGE_TEXT='Outlier metrics already exist for this run and field';
            END IF;
            SET V_SQL='INSERT INTO DQ_DB.DQ_METRIC_RESULT '
              || '(RUN_ID,PROJECT_ID,FIELD_NAME,FIELD_TYPE,MODULE_NAME,PERIOD_LEVEL,PERIOD_VALUE,METRIC_NAME,'
              || 'METRIC_VALUE,IS_PERCENTAGE,RATE_NUMERATOR,RATE_DENOMINATOR,POU_DT,EXECUTION_TIMESTAMP) '
              || 'SELECT ''' || P_RUN_ID || ''',''' || P_PROJECT_ID || ''',''' || TRIM(R.FIELD_NAME)
              || ''',''NUMERIC'',''NUMERIC_OUTLIERS'',A.PERIOD_LEVEL,A.PERIOD_VALUE,M.METRIC_NAME,'
              || 'CASE M.METRIC_ORDINAL WHEN 1 THEN CAST(A.L' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 2 THEN CAST(A.U' || V_SUFFIX || ' AS DECIMAL(38,10))'
              || ' WHEN 3 THEN CASE WHEN A.L' || V_SUFFIX || ' IS NOT NULL THEN CAST(A.O' || V_SUFFIX || ' AS DECIMAL(38,10)) END'
              || ' WHEN 4 THEN CASE WHEN A.L' || V_SUFFIX || ' IS NOT NULL THEN CAST(100.0*CAST(A.O' || V_SUFFIX
              || ' AS FLOAT)/NULLIF(A.N' || V_SUFFIX || ',0) AS DECIMAL(38,10)) END'
              || ' WHEN 5 THEN CAST(A.N' || V_SUFFIX || ' AS DECIMAL(38,10)) END,M.IS_PERCENTAGE,'
              || 'CASE WHEN M.METRIC_ORDINAL=4 AND A.L' || V_SUFFIX || ' IS NOT NULL THEN A.O' || V_SUFFIX || ' END,'
              || 'CASE WHEN M.METRIC_ORDINAL=4 AND A.L' || V_SUFFIX || ' IS NOT NULL THEN A.N' || V_SUFFIX || ' END,'
              || 'A.POU_DT,CURRENT_TIMESTAMP(6) FROM DQ_NO_AGG A CROSS JOIN DQ_DB.DQ_METRIC_DEFINITION M '
              || 'WHERE M.MODULE_NAME=''NUMERIC_OUTLIERS'' AND M.METRIC_ORDINAL BETWEEN 1 AND 5';
            UPDATE DQ_DB.DQ_MODULE_LOG SET SQL_TEXT=V_SQL
             WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS'
               AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
            CALL DBC.SysExecSQL(V_SQL);
        END FOR;
        CALL DBC.SysExecSQL('DROP TABLE DQ_NO_AGG');
        SET V_AGG_EXISTS=0;
        CALL DBC.SysExecSQL('DROP TABLE DQ_NO_BOUNDS');
        SET V_BOUNDS_EXISTS=0;
        /* Reuse this copy for its remaining small counting batches. Release
           permanent space before copying the next field group. */
        IF V_LAST=V_STAGE_LAST THEN
            CALL DBC.SysExecSQL('DROP TABLE DQ_DB.' || V_STAGE);
            SET V_STAGE_EXISTS=0;
        END IF;
        UPDATE DQ_DB.DQ_MODULE_LOG SET STATUS='SUCCEEDED',END_TIME=CURRENT_TIMESTAMP(6)
         WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS' AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=V_BATCH;
        SET V_FIRST=V_LAST+1;
    END WHILE;
    DELETE FROM DQ_DB.DQ_OUTLIER_CHUNK_YEAR WHERE RUN_ID=P_RUN_ID;
    UPDATE DQ_DB.DQ_MODULE_LOG SET STATUS='SUCCEEDED',END_TIME=CURRENT_TIMESTAMP(6),FIELD_COUNT=V_FIELDS
     WHERE RUN_ID=P_RUN_ID AND MODULE_NAME='NUMERIC_OUTLIERS' AND ATTEMPT_NO=V_ATTEMPT AND BATCH_ID=0;
END main;

/* Execute after compiling the complete procedure above. Replace DQ_DB in
   both ON and TO with the approved engine schema. */
GRANT EXECUTE PROCEDURE ON DQ_DB.SP_DQ_NUMERIC_OUTLIERS TO DQ_DB;
