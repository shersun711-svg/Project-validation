PRE-RDS SOURCE SETUP — REUSE THE EXISTING ENGINE

Working branch: pre-rds-project
Base branch: release/dq-engine-team-reuse-2026-10-28

First step
Run Query 1 and Query 2 in 01_source_metadata.sql separately.
Query 1 checks visibility of the requested source fields.
Query 2 lists candidate reporting-date and key columns.
Export both outputs so the configurations can be prepared.

Engine run order
1. Confirm each source's reporting-date column, row grain and required population.
   A reporting date in a result extract is not proof of its source column.
2. Copy basic_profiling/profiling_config.xlsx for each confirmed source project.
   The inherited workbooks contain RDS examples, not ready-to-run pre-RDS inputs.
   Use separate pre-RDS project IDs; preserve existing RDS configurations/results.
3. Configure Project, Fields, Settings and SpecialValues.
   Preserve agreed logical types. Do not reinterpret unknown flags as ACTIVE_IND.
   Confirm source-specific special definitions instead of copying an RDS list.
4. In the same SAS session, run:
     basic_profiling/02_load_controller.sas
     basic_profiling/03_define_excel_loader.sas
   Set the approved server workbook path and connection in:
     basic_profiling/04_load_configuration.sas
   Run and require APPLIED.
5. Run basic_profiling/05_run_profiling.sas for the new source project.
   Enable only basic modules for field types present in that workbook.
   Start with completeness comparisons. Accuracy/outliers and uniqueness are
   separate review areas. Choose the appropriate overall/monthly reporting levels.
6. Compare source populations and TOTAL_COUNT before missing counts/rates.
   Resolve differences in source timing, eligibility and filters before treating
   a comparison difference as a data-quality issue.
7. Uniqueness must use the actual table/month key. Source tables can have
   customer/collateral or composite keys, not the RDS agreement key.

No installation or source change is made by creating this branch.
Do not rerun installation CREATE-table scripts on a working engine.
The engine database and source database are separate settings.
The reusable engine scripts are unchanged from the copied base branch.

Status
No pre-RDS configuration has been loaded and no profiling run has been executed.
The metadata SQL can be run without a separate inventory file.
A detailed inventory was prepared locally; its upload remains subject to explicit
authorization requested in the chat.
