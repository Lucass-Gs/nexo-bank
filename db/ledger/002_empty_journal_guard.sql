CREATE OR REPLACE FUNCTION assert_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal uuid;
BEGIN
  IF TG_TABLE_NAME='journals' THEN journal=NEW.id; ELSE journal=NEW.journal_id; END IF;
  IF (SELECT COALESCE(sum(amount),0) FROM entries WHERE journal_id=journal)<>0
     OR (SELECT count(*) FROM entries WHERE journal_id=journal)<2 THEN
    RAISE EXCEPTION 'Unbalanced or empty journal';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_has_entries AFTER INSERT ON journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced();
