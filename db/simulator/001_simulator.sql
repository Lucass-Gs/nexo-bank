CREATE TABLE settlements(id uuid PRIMARY KEY,amount bigint NOT NULL,status text NOT NULL,mode text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
