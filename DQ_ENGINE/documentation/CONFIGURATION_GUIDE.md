# Configuration

Normal users edit `config/DQ_RDS_config.xlsx` and run `sas/04_load_dq_config.sas`.
SAS loads Project, Fields and Settings directly to Teradata without a workbook
validation phase. See [Excel setup and usage](EXCEL_CONFIGURATION.md). The CSV
workflow below is retained as a legacy option.

`DQ_PROJECT_CONFIG` has one active source per project. Database, source and column names must be simple identifiers matching `[A-Za-z_][A-Za-z0-9_]*`, up to 128 characters. Project IDs use the same convention up to 30 characters. SQL quotes validated source names; arbitrary SQL snippets and user-supplied predicates are not configuration inputs.

`DQ_FIELD_CONFIG` retains all logical types. A field runs in Numeric Basic only when FIELD_TYPE=NUMERIC, ACTIVE_IND=Y and NUMERIC_BASIC_IND=Y. Disabling a field is an explicit analyst decision. The approved workbook FIELD_TYPE controls module selection. The engine does not query database types or alter classifications; Teradata evaluates numeric expressions and explicit statistical casts when each batch executes.

The global `DQ_ENGINE_SETTINGS` row uses PROJECT_ID='*'. A project's complete settings row overrides the global row. Defaults are green threshold 1%, red threshold 5%, batch size 25, and reserved outlier multiplier 3. A project override is one row, not hundreds of repeated field settings:

```sql
INSERT INTO DQ_DB.DQ_ENGINE_SETTINGS VALUES ('RDS',1.0000,5.0000,3.0000,20);
```

If the row exists, UPDATE it instead. Batch size is 1–30 for this prototype. Thresholds are snapshotted in the run log, and all percentage colours use them centrally. Outlier settings and `DQ_PSI_REFERENCE_CONFIG` reserve later interfaces; no outliers, PSI or baseline distributions are implemented/seeded.

## Refresh approved field mappings

Initial deployment already loads the workbook-derived RDS mappings. For a later approved workbook, export its field/type columns as UTF-8 CSV with header `FIELD_NAME,FIELD_TYPE`; validate the header and mapping before loading. `config/rds_fields.csv` is the supplied workbook's checked export.

```sas
%include "/approved/path/DQ_ENGINE/sas/01_dq_controller.sas";
%include "/approved/path/DQ_ENGINE/sas/03_load_field_config.sas";
%load_dq_field_config(project=RDS,
    config_csv=/approved/path/DQ_ENGINE/config/rds_fields.csv);
```

The loader rejects empty files, duplicate field names, invalid identifiers and unknown types. It stages only the small configuration dataset using a unique load UUID, then submits one MERGE. Existing ACTIVE_IND and module overrides are retained; new rows get ACTIVE_IND=Y and Numeric Basic enabled only for NUMERIC fields. A change from non-numeric to numeric therefore needs an explicit eligibility review for an existing row. Rows omitted from an upload are retained; explicitly deactivate retired fields. Failed uploads may leave staging rows: remove only the reported LOAD_ID after diagnosis.

After every change review the stored configuration:

```sql
SELECT * FROM DQ_DB.DQ_FIELD_CONFIG
WHERE PROJECT_ID='RDS' ORDER BY FIELD_TYPE,FIELD_NAME;
```

Workbook classifications are assumed correct. No DBC.ColumnsV or validation-view dependency remains. Numeric values are expected to fit the existing DECIMAL(38,10) result representation. Additional fractional digits round at storage; values outside the integral range fail during execution. No numeric precision preflight or automatic reclassification is performed. Missing source columns or incompatible operations are logged as module/run failures. A zero-test run is still rejected.

## Add a project

Copy the three-sheet workbook, edit its Project row to point to the approved table/view and reporting date, and load it using the Excel configuration program. Alternatively, insert a project row manually. The candidate account column can be NULL if not applicable; it is not a grouping key or a required Numeric Basic input. Load that project's approved field mappings, review the configuration, optionally create a settings override, and run `%run_dq_engine(project=YOUR_PROJECT,numeric_basic=Y)`.

DATE and TIMESTAMP reporting columns are accepted. For TIMESTAMP WITH TIME ZONE, confirm the database's extraction/session time-zone convention before comparing calendar periods across systems. There is no database type lookup; reporting-date compatibility and timezone behaviour have not been tested here.

Keep source population and configuration stable during a run. The numeric selection is captured and revalidated per attempt; the latest failed-run retry refreshes selection/settings. There is no transaction-wide source snapshot across batches. Use a controlled, immutable staging table if source data can change during profiling. Future modules should use the same captured source, period conventions and metric metadata, with global success decided by the orchestrator after all selected modules complete.

## Excel configuration is now implemented

The agreed Project/Fields/Settings workbook is available. The final user decision
is to load it directly, without SAS workbook validation. Database table constraints
and transaction error handling remain. Profiling calculations and the deferred
Excel report module are unchanged.
