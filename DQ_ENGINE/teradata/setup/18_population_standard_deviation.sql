/* One-time metric-definition migration for an existing engine. Replace DQ_DB.
   New installs seed STDDEV_POP directly from setup/00_create_config_tables.sql.
   Optional history clearing is separate in setup/19_clear_run_history.sql. */
UPDATE DQ_DB.DQ_METRIC_DEFINITION
   SET METRIC_NAME='STDDEV_POP'
 WHERE MODULE_NAME='NUMERIC_BASIC'
   AND METRIC_ORDINAL=10
   AND METRIC_NAME='STDDEV_SAMP';

SELECT MODULE_NAME,METRIC_ORDINAL,METRIC_NAME,IS_PERCENTAGE
FROM DQ_DB.DQ_METRIC_DEFINITION
WHERE MODULE_NAME='NUMERIC_BASIC' AND METRIC_ORDINAL=10;
