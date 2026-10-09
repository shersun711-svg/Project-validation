# Configuration

`DQ_PROJECT_CONFIG` has one active source per project. Database, source and column names must be simple identifiers matching `[A-Za-z_][A-Za-z0-9_]*`, up to 128 characters. Project IDs use the same convention up to 30 characters. SQL quotes validated source names; arbitrary SQL snippets and user-supplied predicates are not configuration inputs.

`DQ_FIELD_CONFIG` retains all logical types. A field runs in Numeric Basic only when FIELD_TYPE=NUMERIC, ACTIVE_IND=Y and NUMERIC_BASIC_IND=Y. Disabling a field is an explicit analyst decision. No automatic text-to-number conversion or type change occurs during profiling. Non-numeric invalid fields appear in the configuration report but do not block this selected numeric module.

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

After every change run:

```sql
SELECT * FROM DQ_DB.DQ_CONFIG_VALIDATION
WHERE PROJECT_ID='RDS' ORDER BY VALIDATION_STATUS,FIELD_NAME;
```

Numeric types allowed are integer family (`I1`, `I2`, `I`, `I8`), DECIMAL (`D`) and FLOAT (`F`). DECIMAL must have at most 28 integral digits and 10 fractional digits. NUMBER, character representations, wider decimals and other physical types are rejected, pending a deliberate representation design. FLOAT is allowed with a range/precision note; values outside the result representation fail explicitly. Do not reduce precision merely to get a failing field accepted.

## Add a project

Insert a project row pointing to an approved table/view and its real reporting-date column. The candidate account column can be NULL if not applicable; it is not a grouping key. Load that project's approved field mappings, review the dictionary report, optionally create a settings override, and run `%run_dq_engine(project=YOUR_PROJECT,numeric_basic=Y)`.

DATE and TIMESTAMP reporting columns are accepted. For TIMESTAMP WITH TIME ZONE, confirm the database's extraction/session time-zone convention before comparing calendar periods across systems. The engine accepts dictionary code TZ, but timezone behaviour has not been tested here.

Keep source population and configuration stable during a run. The numeric selection is captured and revalidated per attempt; the latest failed-run retry refreshes selection/settings. There is no transaction-wide source snapshot across batches. Use a controlled, immutable staging table if source data can change during profiling. Future modules should use the same captured source, period conventions and metric metadata, with global success decided by the orchestrator after all selected modules complete.
