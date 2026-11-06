/* Additive one-time upgrade. Overall availability for each selected field.
   Historical source coverage cannot be inferred from saved metric rows;
   older runs remain NULL in review until a NEW run computes availability. */
CREATE MULTISET TABLE DQ_DB.DQ_FIELD_AVAILABILITY
(
    RUN_ID CHAR(36) CHARACTER SET LATIN NOT NULL,
    PROJECT_ID VARCHAR(30) CHARACTER SET LATIN NOT NULL,
    FIELD_NAME VARCHAR(128) CHARACTER SET LATIN NOT NULL,
    EARLIEST_DATE DATE,
    LATEST_DATE DATE
) UNIQUE PRIMARY INDEX (RUN_ID,FIELD_NAME);
