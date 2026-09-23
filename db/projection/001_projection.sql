CREATE TABLE inbox(event_id uuid PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE statements(entry_id bigint PRIMARY KEY,account_id uuid NOT NULL,owner_id uuid,journal_id uuid NOT NULL,amount bigint NOT NULL,description text NOT NULL,created_at timestamptz NOT NULL);
CREATE INDEX statement_owner ON statements(owner_id,entry_id DESC);
CREATE TABLE notifications(event_id uuid PRIMARY KEY,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
