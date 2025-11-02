import { supabase } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';

export class DatabaseService {
  async saveProject(projectData) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .upsert(
          {
            project_key: projectData.project_key,
            project_name: projectData.project_name,
            project_url: projectData.project_url,
            description: projectData.description,
            metadata: projectData.metadata,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'project_key',
            ignoreDuplicates: false
          }
        )
        .select()
        .maybeSingle();

      if (error) {
        logger.error(`Error saving project ${projectData.project_key}:`, error);
        throw error;
      }

      logger.debug(`Saved project: ${projectData.project_key}`);
      return data;
    } catch (error) {
      logger.error(`Failed to save project ${projectData.project_key}:`, error);
      throw error;
    }
  }

  async getProject(projectKey) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('project_key', projectKey)
      .maybeSingle();

    if (error) {
      logger.error(`Error fetching project ${projectKey}:`, error);
      throw error;
    }

    return data;
  }

  async saveIssue(issueData) {
    try {
      const { data, error } = await supabase
        .from('issues')
        .upsert(
          {
            project_id: issueData.project_id,
            issue_key: issueData.issue_key,
            issue_id: issueData.issue_id,
            summary: issueData.summary,
            description: issueData.description,
            issue_type: issueData.issue_type,
            status: issueData.status,
            priority: issueData.priority,
            resolution: issueData.resolution,
            reporter: issueData.reporter,
            assignee: issueData.assignee,
            labels: issueData.labels,
            components: issueData.components,
            versions: issueData.versions,
            fix_versions: issueData.fix_versions,
            created_date: issueData.created_date,
            updated_date: issueData.updated_date,
            resolved_date: issueData.resolved_date,
            metadata: issueData.metadata,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'issue_key',
            ignoreDuplicates: false
          }
        )
        .select()
        .maybeSingle();

      if (error) {
        logger.error(`Error saving issue ${issueData.issue_key}:`, error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Failed to save issue ${issueData.issue_key}:`, error);
      throw error;
    }
  }

  async saveComments(commentsData) {
    if (!commentsData || commentsData.length === 0) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('comments')
        .upsert(
          commentsData.map(comment => ({
            issue_id: comment.issue_id,
            comment_id: comment.comment_id,
            author: comment.author,
            body: comment.body,
            created_date: comment.created_date,
            updated_date: comment.updated_date,
            created_at: new Date().toISOString()
          })),
          {
            onConflict: 'comment_id',
            ignoreDuplicates: true
          }
        )
        .select();

      if (error) {
        logger.error(`Error saving comments:`, error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Failed to save comments:`, error);
      throw error;
    }
  }

  async getScraperState(projectKey) {
    const { data, error } = await supabase
      .from('scraper_state')
      .select('*')
      .eq('project_key', projectKey)
      .maybeSingle();

    if (error) {
      logger.error(`Error fetching scraper state for ${projectKey}:`, error);
      throw error;
    }

    return data;
  }

  async saveScraperState(stateData) {
    try {
      const { data, error } = await supabase
        .from('scraper_state')
        .upsert(
          {
            project_key: stateData.project_key,
            last_issue_key: stateData.last_issue_key,
            last_start_at: stateData.last_start_at,
            total_issues_scraped: stateData.total_issues_scraped,
            status: stateData.status,
            error_message: stateData.error_message,
            started_at: stateData.started_at,
            completed_at: stateData.completed_at,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'project_key',
            ignoreDuplicates: false
          }
        )
        .select()
        .maybeSingle();

      if (error) {
        logger.error(`Error saving scraper state for ${stateData.project_key}:`, error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Failed to save scraper state for ${stateData.project_key}:`, error);
      throw error;
    }
  }

  async getAllIssuesForExport(projectKey = null) {
    let query = supabase
      .from('issues')
      .select(`
        *,
        project:projects(*),
        comments(*)
      `)
      .order('created_date', { ascending: true });

    if (projectKey) {
      query = query.eq('project.project_key', projectKey);
    }

    const { data, error } = await query;

    if (error) {
      logger.error(`Error fetching issues for export:`, error);
      throw error;
    }

    return data;
  }

  async getIssueCount(projectKey = null) {
    let query = supabase
      .from('issues')
      .select('id', { count: 'exact', head: true });

    if (projectKey) {
      const project = await this.getProject(projectKey);
      if (project) {
        query = query.eq('project_id', project.id);
      }
    }

    const { count, error } = await query;

    if (error) {
      logger.error(`Error counting issues:`, error);
      throw error;
    }

    return count || 0;
  }
}
