/*
  # Add Unique Constraint to Comments

  ## Changes
  Add a unique constraint on comment_id to support upsert operations.
  This allows the scraper to handle duplicate comments gracefully.
*/

-- Add unique constraint to comment_id
ALTER TABLE comments ADD CONSTRAINT comments_comment_id_unique UNIQUE (comment_id);
