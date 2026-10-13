# Data Quality Engine - SAS and Teradata

This repository contains the basic Data Quality Engine in [DQ_ENGINE](DQ_ENGINE/).
Users maintain configuration in Excel, SAS loads it and starts profiling, and
Teradata stores the configuration and calculates the results.

Numeric Basic is implemented: total, non-missing, missing and zero counts,
missing/zero percentages, minimum, maximum, mean and sample standard deviation.
Categorical and identifier basics add missing counts/percentages and distinct
counts. Date Basic provides total, non-missing and missing counts plus missing percentage.
[Date Basic upgrade](DQ_ENGINE/documentation/DATE_BASIC_UPGRADE.md).
FIRST_AVAILABLE_FACT_DT/LAST_AVAILABLE_FACT_DT describe overall non-missing availability for every
selected field. [Availability upgrade](DQ_ENGINE/documentation/FIELD_AVAILABILITY.md).
All field types support overall, yearly and monthly periods; percentages use
the shared green/amber/red rules. Percentiles, outliers, PSI and Excel report
export remain deferred. [Upgrade an existing engine](DQ_ENGINE/documentation/BASIC_PROFILING_UPGRADE.md)
before enabling the new modules.

## Start here

- **Existing installation:** follow the everyday workflow below.
- **New installation:** follow [one-time deployment instructions](DQ_ENGINE/documentation/README.md#one-time-deployment).
- **Configuration changes:** see [Excel configuration instructions](DQ_ENGINE/documentation/EXCEL_CONFIGURATION.md).
- **Result meanings:** see [metric definitions](DQ_ENGINE/documentation/RESULTS_DICTIONARY.md).

## Everyday workflow

Use the same SAS server session for these steps. Connect to a server that can
access both the workbook and Teradata; SASApp is the user's working connection.

| When | File to run | Purpose |
|---|---|---|
| Once per new session | [01_dq_controller.sas](DQ_ENGINE/sas/01_dq_controller.sas) | Defines the engine macros |
| Once per session when loading Excel | [05_dq_excel_config.sas](DQ_ENGINE/sas/05_dq_excel_config.sas) | Defines the Excel loader |
| First configuration load or after an Excel edit | [04_load_dq_config.sas](DQ_ENGINE/sas/04_load_dq_config.sas) | Loads Excel; require APPLIED |
| Each profiling run | [00_run_dq_engine.sas](DQ_ENGINE/sas/00_run_dq_engine.sas) | Runs selected profiling; require SUCCEEDED |

Edit the workbook path and approved connection settings before first use.
The workbook path and optional engine_root must be SAS server paths.
If configuration is unchanged and the controller is loaded, run only file 00.
No passwords belong in the workbook or repository.

The [starter workbook](DQ_ENGINE/config/DQ_RDS_config.xlsx) contains 589 RDS
field mappings and enables all 415 numeric fields. To test fewer fields, set
NUMERIC_BASIC_IND=Y only for the desired numeric fields, keep their ACTIVE_IND=Y,
then reload Excel. In file 00 use project=RDS, numeric_basic=Y, new basic switches selected as needed and a blank retry_run_id for a new run.
Non-numeric fields use FIELD_TYPE and ACTIVE_IND; NUMERIC_BASIC_IND affects only
numeric fields. See [field selection and module switches](DQ_ENGINE/documentation/BASIC_PROFILING_UPGRADE.md#choose-fields-and-modules).

## Final results

Review DQ_BASIC_REVIEW: one row per field and period across all four types,
with applicable metrics, classifications as columns. Date rows share the same layout; unrelated metrics are NULL.
DQ_NUMERIC_REVIEW remains available for numeric-only review. Both include only
successful runs. Filter by PROJECT_ID and the short RUN_NUMBER (1, 2, 3...) to
select the correct results. UUIDs remain internal RUN_ID values.
See [review query and view deployment](DQ_ENGINE/documentation/README.md#review-the-final-result).

| Teradata object | Purpose |
|---|---|
| `DQ_CONFIG_LOAD_LOG` | Confirms the Excel load status |
| `DQ_FIELD_CONFIG` | Confirms enabled fields |
| `DQ_RUN_LOG` / `DQ_MODULE_LOG` | Run status, progress and errors |
| `DQ_METRIC_RESULT` | Stored results, one row per metric |
| `DQ_COMPLETED_RESULT` | Successful results, one row per metric |
| `DQ_NUMERIC_REVIEW` | Numeric-only review, metrics as columns |
| `DQ_BASIC_REVIEW` | Final review across all four field types |
| `DQ_RUN_NUMBER` | Short number mapped to each internal run UUID |

## Repository map

```text
DQ_ENGINE/
  config/          Excel workbook and original input audit references
  sas/             Four SAS files for configuration and execution
  teradata/
    setup/         One-time database deployment
    modules/       Numeric profiling and run orchestration
    results/       Classification and result views
  documentation/   Deployment, settings, metrics and validation evidence
  tests/           Optional regression and performance checks
  tools/           Developer-only static and workbook checks
```

[Optional tests](DQ_ENGINE/tests/README.md) support engine maintenance; they
are not part of every profiling run. Local checks do not compile SAS or Teradata.
See [validation evidence](DQ_ENGINE/documentation/VALIDATION_EVIDENCE.md) for
user-server results and remaining assumptions.
