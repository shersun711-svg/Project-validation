/* Read-only column check for PRE_RDS_ORION_TXN.
MVT confirmed FACT_DT as the reporting date and ACC_PROBE_ID as the identifier.
Check availability of these columns and the 20 configured numeric fields.
Catalog visibility does not prove key uniqueness. Use 03_check_uniqueness.sql.
Unknown view column types are not a reason to reclassify logical fields.
*/
SELECT CAST(TRIM(ColumnName) AS VARCHAR(128)) AS COLUMN_NAME,
       CAST(TRIM(ColumnType) AS VARCHAR(8)) AS REPORTED_COLUMN_TYPE,
       CAST(Nullable AS VARCHAR(8)) AS REPORTED_NULLABLE
FROM DBC.ColumnsV
WHERE UPPER(TRIM(DatabaseName))='DWP00V_03_ORION_LEVEL1'
  AND UPPER(TRIM(TableName))='AGGR_ACC_TXN_FACT'
ORDER BY ColumnId;
