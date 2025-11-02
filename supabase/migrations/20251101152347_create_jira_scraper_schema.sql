/*
  # Jira Scraper Database Schema

  ## Overview
  This migration creates the database schema for storing Apache Jira scraped data,
  including projects, issues, comments, and scraper state management.

  ## New Tables

  ### 1. `projects`
  Stores information about scraped Jira projects
  - `id` (uuid, primary key) - Unique identifier
  - `project_key` (text, unique) - Jira project key (e.g., "KAFKA")
  - `project_name` (text) - Full project name
  - `project_url` (text) - URL to the project
  - `description` (text) - Project description
  - `metadata` (jsonb) - Additional project metadata
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. `issues`
  Stores Jira issues with comprehensive metadata
  - `id` (uuid, primary key) - Unique identifier
  - `project_id` (uuid, foreign key) - Reference to projects table
  - `issue_key` (text, unique) - Jira issue key (e.g., "KAFKA-1234")
  - `issue_id` (text) - Jira's internal issue ID
  - `summary` (text) - Issue title/summary
  - `description` (text) - Full issue description
  - `issue_type` (text) - Type (Bug, Feature, Task, etc.)
  - `status` (text) - Current status
  - `priority` (text) - Priority level
  - `resolution` (text) - Resolution status
  - `reporter` (text) - Issue reporter username
  - `assignee` (text) - Assigned user
  - `labels` (text[]) - Array of labels
  - `components` (text[]) - Array of components
  - `versions` (text[]) - Affected versions
  - `fix_versions` (text[]) - Fix versions
  - `created_date` (timestamptz) - Issue creation date in Jira
  - `updated_date` (timestamptz) - Last update date in Jira
  - `resolved_date` (timestamptz) - Resolution date
  - `metadata` (jsonb) - Additional metadata
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 3. `comments`
  Stores issue comments
  - `id` (uuid, primary key) - Unique identifier
  - `issue_id` (uuid, foreign key) - Reference to issues table
  - `comment_id` (text) - Jira's comment ID
  - `author` (text) - Comment author username
  - `body` (text) - Comment text content
  - `created_date` (timestamptz) - Comment creation date in Jira
  - `updated_date` (timestamptz) - Last update date in Jira
  - `created_at` (timestamptz) - Record creation timestamp

  ### 4. `scraper_state`
  Tracks scraper progress for fault tolerance and resumption
  - `id` (uuid, primary key) - Unique identifier
  - `project_key` (text, unique) - Project being scraped
  - `last_issue_key` (text) - Last successfully scraped issue
  - `last_start_at` (int) - Last pagination offset
  - `total_issues_scraped` (int) - Total issues processed
  - `status` (text) - Current status (running, paused, completed, error)
  - `error_message` (text) - Last error message if any
  - `started_at` (timestamptz) - Scraping start time
  - `completed_at` (timestamptz) - Scraping completion time
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated access (for future API access)

  ## Indexes
  - Index on project_key for fast lookups
  - Index on issue_key for fast lookups
  - Index on project_id in issues table for foreign key performance
  - Index on issue_id in comments table for foreign key performance
*/

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text UNIQUE NOT NULL,
  project_name text NOT NULL,
  project_url text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create issues table
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_key text UNIQUE NOT NULL,
  issue_id text NOT NULL,
  summary text NOT NULL,
  description text,
  issue_type text,
  status text,
  priority text,
  resolution text,
  reporter text,
  assignee text,
  labels text[] DEFAULT ARRAY[]::text[],
  components text[] DEFAULT ARRAY[]::text[],
  versions text[] DEFAULT ARRAY[]::text[],
  fix_versions text[] DEFAULT ARRAY[]::text[],
  created_date timestamptz,
  updated_date timestamptz,
  resolved_date timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  comment_id text NOT NULL,
  author text NOT NULL,
  body text NOT NULL,
  created_date timestamptz,
  updated_date timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create scraper_state table
CREATE TABLE IF NOT EXISTS scraper_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text UNIQUE NOT NULL,
  last_issue_key text,
  last_start_at int DEFAULT 0,
  total_issues_scraped int DEFAULT 0,
  status text DEFAULT 'pending',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_key ON projects(project_key);
CREATE INDEX IF NOT EXISTS idx_issues_key ON issues(issue_key);
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_scraper_state_project_key ON scraper_state(project_key);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_state ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (since this is public Jira data)
CREATE POLICY "Public read access for projects"
  ON projects FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public read access for issues"
  ON issues FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public read access for comments"
  ON comments FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public read access for scraper_state"
  ON scraper_state FOR SELECT
  TO public
  USING (true);

-- Create policies for service role (for the scraper to write)
CREATE POLICY "Service role can insert projects"
  ON projects FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update projects"
  ON projects FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert issues"
  ON issues FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update issues"
  ON issues FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert comments"
  ON comments FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can insert scraper_state"
  ON scraper_state FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update scraper_state"
  ON scraper_state FOR UPDATE
  TO service_role
  USING (true);
