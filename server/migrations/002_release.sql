-- Release candidate schema: account ownership, recovery, session management, roles,
-- audit, billing entitlements, editorial workflow, source lifecycle and operations.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','editor','reviewer','admin'));
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
ALTER TABLE users ADD COLUMN trial_requested INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sessions ADD COLUMN id TEXT;
ALTER TABLE sessions ADD COLUMN created_at TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
ALTER TABLE sessions ADD COLUMN client TEXT;
UPDATE sessions SET id = lower(hex(randomblob(16))) WHERE id IS NULL;
CREATE UNIQUE INDEX sessions_id ON sessions(id);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password','change_email')),
  new_email TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX auth_tokens_user ON auth_tokens(user_id, purpose);

-- actor/target are pseudonymous account identifiers, never email addresses or IPs.
CREATE TABLE audit_log(
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE INDEX audit_log_actor ON audit_log(actor);
CREATE INDEX audit_log_created ON audit_log(created_at);

CREATE TABLE subscriptions(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  customer_id TEXT UNIQUE,
  subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  last_event_created INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE billing_events(
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  outcome TEXT NOT NULL
);

ALTER TABLE opportunities ADD COLUMN editorial_state TEXT NOT NULL DEFAULT 'published' CHECK (editorial_state IN ('published','retired'));
ALTER TABLE opportunities ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE opportunities ADD COLUMN procedure_id TEXT;
ALTER TABLE opportunities ADD COLUMN superseded_by TEXT;
ALTER TABLE opportunities ADD COLUMN review_due_at TEXT;
CREATE INDEX opportunities_procedure ON opportunities(procedure_id);

CREATE TABLE ted_results(
  procedure_id TEXT PRIMARY KEY,
  publication_number TEXT NOT NULL,
  published_at TEXT,
  seen_at TEXT NOT NULL
);

CREATE TABLE grant_drafts(
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  data TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','in_review','approved','rejected','withdrawn')),
  author TEXT NOT NULL,
  submitted_by TEXT,
  reviewer TEXT,
  decision_note TEXT,
  evidence_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX grant_drafts_state ON grant_drafts(state);
CREATE TABLE editorial_events(
  id INTEGER PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  draft_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX editorial_events_opportunity ON editorial_events(opportunity_id);

-- Raw messages and attachments are never stored; only the extracted, validated candidate references.
CREATE TABLE inbound_messages(
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  channel TEXT NOT NULL,
  message_hash TEXT NOT NULL UNIQUE,
  sender_domain TEXT,
  subject TEXT,
  candidates TEXT NOT NULL,
  ignored_links INTEGER NOT NULL DEFAULT 0,
  attachments_ignored INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','imported','dismissed')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  note TEXT
);

CREATE TABLE incidents(
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','minor','major')),
  status TEXT NOT NULL CHECK (status IN ('open','resolved')),
  title TEXT NOT NULL,
  customer_message TEXT,
  customer_visible INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE job_locks(
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

ALTER TABLE sync_runs ADD COLUMN detail TEXT;
ALTER TABLE sync_runs ADD COLUMN trigger TEXT;
CREATE INDEX sync_runs_source ON sync_runs(source, started_at);
