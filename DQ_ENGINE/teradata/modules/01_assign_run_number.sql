/* Brief serialized allocation only; no lock held during profiling.
   Caller must use Teradata mode without an enclosing transaction.
   Counter and mapping are committed together. Never reset the counter or
   delete number mappings as part of result/test cleanup. */
REPLACE PROCEDURE DQ_DB.SP_DQ_ASSIGN_RUN_NUMBER (IN P_RUN_ID CHAR(36))
SQL SECURITY INVOKER
BEGIN
    DECLARE V_COUNT INTEGER;
    DECLARE V_NUMBER BIGINT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    BEGIN TRANSACTION;
    /* Retain the row write lock until END TRANSACTION. Do not use MAX+1 or
       UPDATE/SELECT in separate autocommit statements: those can race. */
    UPDATE DQ_DB.DQ_RUN_COUNTER SET LAST_NUMBER=LAST_NUMBER WHERE COUNTER_KEY=1;
    IF ACTIVITY_COUNT<>1 THEN
        SIGNAL SQLSTATE 'U0021' SET MESSAGE_TEXT = 'Run-number counter missing';
    END IF;
    SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_NUMBER WHERE RUN_ID=P_RUN_ID;
    IF V_COUNT=0 THEN
        SELECT COUNT(*) INTO V_COUNT FROM DQ_DB.DQ_RUN_LOG WHERE RUN_ID=P_RUN_ID;
        IF V_COUNT<>1 THEN
            SIGNAL SQLSTATE 'U0022' SET MESSAGE_TEXT = 'Cannot number an unregistered run';
        END IF;
        UPDATE DQ_DB.DQ_RUN_COUNTER SET LAST_NUMBER=LAST_NUMBER+1 WHERE COUNTER_KEY=1;
        SELECT LAST_NUMBER INTO V_NUMBER FROM DQ_DB.DQ_RUN_COUNTER WHERE COUNTER_KEY=1;
        INSERT INTO DQ_DB.DQ_RUN_NUMBER VALUES (P_RUN_ID,V_NUMBER);
    END IF;
    END TRANSACTION;
END;
