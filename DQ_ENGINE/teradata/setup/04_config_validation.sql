/* Runtime dictionary validation is authoritative; DDL analysis cannot infer
   types inherited from upstream tables. Metadata access must be granted. */
REPLACE VIEW DQ_DB.DQ_CONFIG_VALIDATION AS
SELECT F.PROJECT_ID, F.FIELD_NAME, F.FIELD_TYPE, F.ACTIVE_IND,
       F.NUMERIC_BASIC_IND, C.ColumnType AS PHYSICAL_TYPE,
       C.DecimalTotalDigits AS NUMERIC_PRECISION,
       C.DecimalFractionalDigits AS NUMERIC_SCALE,
       CAST(CASE
           WHEN REGEXP_SIMILAR(TRIM(F.FIELD_NAME), '^[A-Za-z_][A-Za-z0-9_]*$', 'c') <> 1
               THEN 'INVALID_IDENTIFIER'
           WHEN C.ColumnName IS NULL THEN 'MISSING_COLUMN'
           WHEN F.FIELD_TYPE = 'NUMERIC' AND C.ColumnType NOT IN ('I1','I2','I','I8','D','F')
               THEN 'INCOMPATIBLE_NUMERIC'
           WHEN F.FIELD_TYPE = 'NUMERIC' AND C.ColumnType = 'D'
                AND (C.DecimalFractionalDigits > 10
                     OR C.DecimalTotalDigits - C.DecimalFractionalDigits > 28)
               THEN 'UNSUPPORTED_PRECISION'
           WHEN F.FIELD_TYPE = 'DATE' AND C.ColumnType NOT IN ('DA','TS','TZ')
               THEN 'INCOMPATIBLE_DATE'
           ELSE 'VALID'
       END AS VARCHAR(32)) AS VALIDATION_STATUS,
       CAST(CASE WHEN F.FIELD_TYPE = 'NUMERIC' AND C.ColumnType = 'F'
           THEN 'FLOAT: confirm DECIMAL(38,10) range; statistics use FLOAT'
           ELSE NULL END AS VARCHAR(128)) AS VALIDATION_NOTE
FROM DQ_DB.DQ_FIELD_CONFIG F
JOIN DQ_DB.DQ_PROJECT_CONFIG P ON F.PROJECT_ID = P.PROJECT_ID
LEFT JOIN DBC.ColumnsV C
  ON UPPER(TRIM(C.DatabaseName)) = UPPER(P.SOURCE_DATABASE)
 AND UPPER(TRIM(C.TableName)) = UPPER(P.SOURCE_TABLE)
 AND UPPER(TRIM(C.ColumnName)) = UPPER(F.FIELD_NAME);
