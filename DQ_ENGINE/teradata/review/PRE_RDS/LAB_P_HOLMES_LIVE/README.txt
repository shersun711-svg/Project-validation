PRE-RDS DQ SETUP — REUSE THE EXISTING ENGINE

First step
Run Query 1 and Query 2 in 01_source_metadata.sql separately.
Query 1 checks visibility of the requested fields.
Query 2 lists candidate reporting-date and key columns.
Export the outputs for configuration review.

How to reuse the engine
1. Confirm each source's reporting date, row grain, required key and population.
   A reporting date on a result export is not proof of its source column.
2. Use one workbook per source project (or approved population-specific view).
   Create separate pre-RDS project IDs and preserve existing RDS settings/results.
3. Configure Project, Fields, Settings and SpecialValues using the existing layout.
   Preserve the agreed logical field types; metadata alone is not a reclassification.
   Do not copy unknown flags into ACTIVE_IND or assume RDS special lists apply.
4. In the same SAS session, run:
     sas/01_dq_controller.sas
     sas/05_dq_excel_config.sas
   Set the workbook path in sas/04_load_dq_config.sas and run it.
   Require the configuration load status to be APPLIED.
5. Then use sas/00_run_dq_engine.sas for the configured source project.
   Enable only basic modules matching types present in that workbook.
   Start by comparing completeness; outlier and other accuracy checks are separate.
   Use the appropriate overall/monthly levels for each source.
   Do not force an event-date field to be the monthly snapshot date.
6. Compare total counts before missing counts and rates.
   If populations differ, investigate eligibility, filters and source timing.
   An empty population is not a completeness pass.
7. Uniqueness is a separate check of the actual source/month key.
   Some tables have customer/collateral or composite keys, not the RDS agreement key.

Do not rerun installation CREATE-table scripts on a working engine.
Do not change generic profiling logic merely to reproduce a comparison result.
No source profiling or configuration loading has been executed by preparing these files.

The detailed field_inventory.csv is a local working file pending separate upload
authorization. The metadata SQL can be run without that CSV.
