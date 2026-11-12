FIRST TABLE: ORION TRANSACTION AGGREGATES

Project ID: PRE_RDS_ORION_TXN
Source: DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT
Candidate reporting date: FACT_DT. Confirm its definition using the metadata check.

The starting workbook selects 20 NUMERIC fields for completeness profiling.
No special codes are assumed for this raw transaction source.
Example RDS special lists must remain inactive until their applicability is confirmed.
Some values in those lists can be genuine transaction amounts.

An identifier is not required for this first numeric baseline.
Leave the optional ACCOUNT_ID_FIELD blank and the AGMT_ID row inactive initially.
The source attestation names ACC_PROBE_ID for uniqueness; verify the actual key
before enabling identifier or uniqueness checks. Do not assume a primary index
proves uniqueness.

Run order
1. Run 01_check_source_columns.sql and confirm the requested source fields.
2. Place the edited profiling workbook on the SAS server.
3. In the same SAS session run:
     basic_profiling/02_load_controller.sas
     basic_profiling/03_define_excel_loader.sas
4. Set the workbook path in basic_profiling/04_load_configuration.sas.
   Run and require APPLIED.
5. In basic_profiling/05_run_profiling.sas set:
     project = PRE_RDS_ORION_TXN
     numeric_basic = Y
     numeric_outliers = N
     categorical_basic = N
     categorical_psi = N
     date_basic = N
     identifier_basic = N
     export_excel = N
   Run and require SUCCEEDED. Retain the run number.

No engine reinstall is required. The draft keeps overall/monthly profiling on,
yearly off. The existing runner profiles the configured source as supplied;
the workbook has no arbitrary filter or observation-window setting.
Compare the saved monthly results for the intended period and verify populations
before interpreting differences from the source-testing export.
Overall results cover the source population actually profiled.

No live profiling run is implied by preparing the draft.
