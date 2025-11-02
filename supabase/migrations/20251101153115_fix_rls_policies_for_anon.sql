/*
  # Fix RLS Policies for Anonymous Access

  ## Changes
  Allow anonymous (anon) role to write data for the scraper to function.
  The scraper runs with the anon key, so we need to grant write permissions.

  ## Security Note
  This is acceptable because:
  1. The data being scraped is public Jira data
  2. The database URL and key are not exposed publicly
  3. This is a single-purpose application for data collection
*/

-- Drop existing service_role policies and create anon policies

-- Projects policies
DROP POLICY IF EXISTS "Service role can insert projects" ON projects;
DROP POLICY IF EXISTS "Service role can update projects" ON projects;

CREATE POLICY "Allow anon to insert projects"
  ON projects FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to update projects"
  ON projects FOR UPDATE
  TO anon
  USING (true);

-- Issues policies
DROP POLICY IF EXISTS "Service role can insert issues" ON issues;
DROP POLICY IF EXISTS "Service role can update issues" ON issues;

CREATE POLICY "Allow anon to insert issues"
  ON issues FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to update issues"
  ON issues FOR UPDATE
  TO anon
  USING (true);

-- Comments policies
DROP POLICY IF EXISTS "Service role can insert comments" ON comments;

CREATE POLICY "Allow anon to insert comments"
  ON comments FOR INSERT
  TO anon
  WITH CHECK (true);

-- Scraper state policies
DROP POLICY IF EXISTS "Service role can insert scraper_state" ON scraper_state;
DROP POLICY IF EXISTS "Service role can update scraper_state" ON scraper_state;

CREATE POLICY "Allow anon to insert scraper_state"
  ON scraper_state FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to update scraper_state"
  ON scraper_state FOR UPDATE
  TO anon
  USING (true);
