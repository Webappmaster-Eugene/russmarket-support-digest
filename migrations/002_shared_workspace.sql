LOCK TABLE accounts, cases, messages, snapshots IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cases review JOIN cases support USING (normalized_reference)
    WHERE review.workspace_id = 'review' AND support.workspace_id = 'support'
  ) THEN
    RAISE EXCEPTION 'Cannot merge workspaces: duplicate case references';
  END IF;

  IF EXISTS (
    SELECT 1 FROM snapshots review JOIN snapshots support USING (id)
    WHERE review.workspace_id = 'review' AND support.workspace_id = 'support'
  ) THEN
    RAISE EXCEPTION 'Cannot merge workspaces: duplicate snapshot IDs';
  END IF;
END $$;

ALTER TABLE messages DROP CONSTRAINT messages_workspace_id_case_id_fkey;
ALTER TABLE messages ADD FOREIGN KEY (workspace_id, case_id)
  REFERENCES cases(workspace_id, id) ON UPDATE CASCADE;

UPDATE cases SET workspace_id = 'support' WHERE workspace_id = 'review';
UPDATE snapshots SET workspace_id = 'support' WHERE workspace_id = 'review';
UPDATE accounts SET workspace_id = 'support' WHERE workspace_id = 'review';

DELETE FROM workspaces WHERE id = 'review';
ALTER TABLE workspaces ADD CHECK (id = 'support');
