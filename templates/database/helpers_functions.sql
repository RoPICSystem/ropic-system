CREATE OR REPLACE FUNCTION update_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_history := COALESCE(OLD.status_history, '{}'::jsonb) || jsonb_build_object(
      to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
