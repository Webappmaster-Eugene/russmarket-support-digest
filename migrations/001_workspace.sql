CREATE TABLE workspaces (
  id text PRIMARY KEY CHECK (id IN ('review', 'support'))
);

CREATE TABLE accounts (
  login text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  password_hash text NOT NULL
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  login text NOT NULL REFERENCES accounts(login) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE login_limits (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_limits_expires_idx ON login_limits (expires_at);

CREATE TABLE cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL REFERENCES workspaces(id),
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 32),
  normalized_reference text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('onboarding', 'offboarding', 'delivery')),
  crm jsonb NOT NULL CHECK (jsonb_typeof(crm) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (workspace_id, normalized_reference),
  UNIQUE (workspace_id, id)
);
CREATE INDEX cases_workspace_archive_idx ON cases (workspace_id, archived_at, updated_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  case_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('employee', 'manager', 'courier', 'recipient', 'other')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  sent_at timestamptz NOT NULL,
  conflict boolean NOT NULL DEFAULT false,
  resolution text CHECK (length(resolution) BETWEEN 1 AND 500),
  resolved_at timestamptz,
  CHECK ((resolution IS NULL) = (resolved_at IS NULL)),
  FOREIGN KEY (workspace_id, case_id) REFERENCES cases(workspace_id, id)
);
CREATE INDEX messages_case_idx ON messages (workspace_id, case_id, sent_at, id);

CREATE TABLE snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL REFERENCES workspaces(id),
  as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  digest jsonb NOT NULL CHECK (jsonb_typeof(digest) = 'object'),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX snapshots_workspace_created_idx ON snapshots (workspace_id, created_at DESC);

INSERT INTO workspaces (id) VALUES ('review'), ('support');
