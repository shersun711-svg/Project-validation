/* Small run-snapshot -> escaped SQL literal list, shared by Basic/Outliers.
   Workbook text is never executed as SQL. Numeric values use a typed DECIMAL;
   categorical literals escape quotes. Empty list uses IN (NULL), which never
   matches; CASE WHEN ... THEN NULL ELSE original END retains all values.
   CALL from procedures only, after the orchestrator snapshots configuration. */
REPLACE PROCEDURE DQ_DB.SP_DQ_SPECIAL_LIST
    (IN P_RUN_ID CHAR(36),IN P_TYPE VARCHAR(16),OUT P_LIST VARCHAR(8000))
SQL SECURITY INVOKER
BEGIN
    DECLARE V_ITEM VARCHAR(300);
    DECLARE V_BODY VARCHAR(7900) DEFAULT '';
    IF P_TYPE IS NULL OR P_TYPE NOT IN ('NUMERIC','CATEGORICAL') THEN
        SIGNAL SQLSTATE 'U0030' SET MESSAGE_TEXT='Special values support numeric/categorical only';
    END IF;
    FOR S AS SPECIAL_CURSOR CURSOR FOR
        SELECT SPECIAL_VALUE,NUMERIC_VALUE FROM DQ_DB.DQ_RUN_SPECIAL_VALUE
         WHERE RUN_ID=P_RUN_ID AND FIELD_TYPE=P_TYPE ORDER BY SPECIAL_VALUE
    DO
        IF P_TYPE='NUMERIC' THEN
            SET V_ITEM=TRIM(CAST(S.NUMERIC_VALUE AS VARCHAR(64)));
        ELSE
            SET V_ITEM='''' || OREPLACE(UPPER(TRIM(S.SPECIAL_VALUE)),'''','''''') || '''';
        END IF;
        IF CHARACTER_LENGTH(V_BODY)+CHARACTER_LENGTH(V_ITEM)+1>7900 THEN
            SIGNAL SQLSTATE 'U0031' SET MESSAGE_TEXT='Special-value list too long';
        END IF;
        IF V_BODY<>'' THEN SET V_BODY=V_BODY || ','; END IF;
        SET V_BODY=V_BODY || V_ITEM;
    END FOR;
    IF V_BODY='' THEN SET P_LIST='(NULL)';
    ELSE SET P_LIST='(' || V_BODY || ')'; END IF;
END;
