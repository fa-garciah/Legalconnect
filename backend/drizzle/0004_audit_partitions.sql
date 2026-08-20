-- Monthly partition management for audit_event (research.md D7).

CREATE OR REPLACE FUNCTION audit_event_ensure_partition(p_month date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('audit_event_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = v_name AND n.nspname = 'public'
  ) THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.audit_event FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end
    );
  END IF;
  RETURN v_name;
END $$;

-- 25 months back covers the 24-month retention window plus the current month, and
-- two months ahead so a month boundary never arrives without a partition waiting.
DO $$
DECLARE m date;
BEGIN
  FOR m IN
    SELECT generate_series(
      date_trunc('month', now()) - interval '25 months',
      date_trunc('month', now()) + interval '2 months',
      interval '1 month'
    )::date
  LOOP
    PERFORM audit_event_ensure_partition(m);
  END LOOP;
END $$;

-- Only the retention role may prune. FR-019: removal past the window must not be
-- performable ad hoc by the application.
CREATE OR REPLACE FUNCTION audit_event_drop_expired_partitions(p_retain_months int DEFAULT 24)
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_cutoff date := (date_trunc('month', now()) - make_interval(months => p_retain_months))::date;
  v_part   record;
BEGIN
  FOR v_part IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'audit_event'
      AND c.relname ~ '^audit_event_[0-9]{4}_[0-9]{2}$'
      AND to_date(right(c.relname, 7), 'YYYY_MM') < v_cutoff
  LOOP
    EXECUTE format('ALTER TABLE public.audit_event DETACH PARTITION public.%I', v_part.relname);
    EXECUTE format('DROP TABLE public.%I', v_part.relname);
    RETURN NEXT v_part.relname;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION audit_event_drop_expired_partitions(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_event_drop_expired_partitions(int) TO lc_retention;

REVOKE ALL ON FUNCTION audit_event_ensure_partition(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_event_ensure_partition(date) TO lc_retention, lc_platform;
