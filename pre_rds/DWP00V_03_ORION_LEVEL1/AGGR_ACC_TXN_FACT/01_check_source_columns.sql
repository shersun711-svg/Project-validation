/* Read-only metadata check before loading the draft profiling workbook.
Source: DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT.
Confirm FACT_DT and the 20 configured numeric fields. Inspect identifier columns
for later uniqueness testing; no identifier is required for the numeric baseline.
The source attestation names ACC_PROBE_ID for uniqueness; that is not proof
AGMT_ID is absent or unsuitable. No key uniqueness is inferred here.
Unknown view types in metadata are not a reason to reclassify logical fields.
If the date definition is unclear, inspect SHOW VIEW for the source object.
*/
SELECT CAST(TRIM(ColumnName) AS VARCHAR(128)) AS COLUMN_NAME,
       CAST(TRIM(ColumnType) AS VARCHAR(8)) AS REPORTED_COLUMN_TYPE,
       CAST(Nullable AS VARCHAR(8)) AS REPORTED_NULLABLE
FROM DBC.ColumnsV
WHERE UPPER(TRIM(DatabaseName))='DWP00V_03_ORION_LEVEL1'
  AND UPPER(TRIM(TableName))='AGGR_ACC_TXN_FACT'
ORDER BY ColumnId;
