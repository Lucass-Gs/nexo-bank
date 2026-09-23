CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL UNIQUE,password_hash text NOT NULL,role text NOT NULL DEFAULT 'user',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,csrf text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day');
CREATE INDEX sessions_expiry ON sessions(expires_at);
