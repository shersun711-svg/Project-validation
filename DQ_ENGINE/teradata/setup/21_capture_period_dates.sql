/* Run ONCE before recompiling the current modules/views. Replace DQ_DB with
   the approved engine schema. No new tables: actual source reporting dates are
   saved with existing metrics and copied to their matching rule rows.
   OVERALL/UNKNOWN and historical results have NULL POU_DT.
   Submit each ALTER separately; skip a column already added successfully. */
ALTER TABLE DQ_DB.DQ_METRIC_RESULT ADD POU_DT DATE;
ALTER TABLE DQ_DB.DQ_RULE_RESULT ADD POU_DT DATE;
