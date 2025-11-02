import { JiraClient } from './jira-client.js';
import { DatabaseService } from './database.js';
import { logger } from '../utils/logger.js';

export class JiraScraper {
  constructor(options = {}) {
    this.jiraClient = new JiraClient(options.jira);
    this.db = new DatabaseService();
    this.batchSize = options.batchSize || 50;
    this.maxIssues = options.maxIssues || null;
  }

  async scrapeProject(projectKey, resume = true) {
    logger.info(`Starting scrape for project: ${projectKey}`);

    try {
      let state = null;
      if (resume) {
        state = await this.db.getScraperState(projectKey);
        if (state && state.status === 'completed') {
          logger.info(`Project ${projectKey} already completed. Use resume=false to restart.`);
          return state;
        }
      }

      await this.db.saveScraperState({
        project_key: projectKey,
        status: 'running',
        started_at: new Date().toISOString(),
        last_start_at: state?.last_start_at || 0,
        total_issues_scraped: state?.total_issues_scraped || 0
      });

      const projectInfo = await this.jiraClient.getProject(projectKey);
      if (!projectInfo) {
        throw new Error(`Project ${projectKey} not found`);
      }

      const savedProject = await this.db.saveProject({
        project_key: projectInfo.key,
        project_name: projectInfo.name,
        project_url: projectInfo.self,
        description: projectInfo.description || '',
        metadata: {
          lead: projectInfo.lead?.displayName,
          projectTypeKey: projectInfo.projectTypeKey,
          avatarUrls: projectInfo.avatarUrls
        }
      });

      logger.info(`Project metadata saved: ${projectInfo.name}`);

      const jql = `project = ${projectKey} ORDER BY created ASC`;
      let startAt = state?.last_start_at || 0;
      let totalScraped = state?.total_issues_scraped || 0;
      let hasMore = true;

      while (hasMore) {
        try {
          const searchResult = await this.jiraClient.searchIssues(jql, startAt, this.batchSize);

          if (!searchResult || !searchResult.issues || searchResult.issues.length === 0) {
            hasMore = false;
            break;
          }

          logger.info(
            `Processing batch: ${startAt} to ${startAt + searchResult.issues.length} of ${searchResult.total}`
          );

          for (const issue of searchResult.issues) {
            try {
              await this.scrapeIssue(issue, savedProject.id);
              totalScraped++;

              if (this.maxIssues && totalScraped >= this.maxIssues) {
                logger.info(`Reached max issues limit: ${this.maxIssues}`);
                hasMore = false;
                break;
              }
            } catch (error) {
              logger.error(`Error scraping issue ${issue.key}:`, error.message);
            }
          }

          startAt += searchResult.issues.length;

          await this.db.saveScraperState({
            project_key: projectKey,
            status: 'running',
            last_start_at: startAt,
            total_issues_scraped: totalScraped,
            last_issue_key: searchResult.issues[searchResult.issues.length - 1]?.key
          });

          if (startAt >= searchResult.total) {
            hasMore = false;
          }

          if (this.maxIssues && totalScraped >= this.maxIssues) {
            hasMore = false;
          }

        } catch (error) {
          logger.error(`Error in batch processing at startAt=${startAt}:`, error.message);

          await this.db.saveScraperState({
            project_key: projectKey,
            status: 'error',
            last_start_at: startAt,
            total_issues_scraped: totalScraped,
            error_message: error.message
          });

          throw error;
        }
      }

      await this.db.saveScraperState({
        project_key: projectKey,
        status: 'completed',
        last_start_at: startAt,
        total_issues_scraped: totalScraped,
        completed_at: new Date().toISOString()
      });

      logger.info(`Completed scraping project ${projectKey}. Total issues: ${totalScraped}`);

      return {
        projectKey,
        totalIssues: totalScraped,
        status: 'completed'
      };

    } catch (error) {
      logger.error(`Fatal error scraping project ${projectKey}:`, error);

      await this.db.saveScraperState({
        project_key: projectKey,
        status: 'error',
        error_message: error.message
      });

      throw error;
    }
  }

  async scrapeIssue(issue, projectId) {
    const fields = issue.fields;

    const issueData = {
      project_id: projectId,
      issue_key: issue.key,
      issue_id: issue.id,
      summary: fields.summary || '',
      description: this.extractText(fields.description) || '',
      issue_type: fields.issuetype?.name || '',
      status: fields.status?.name || '',
      priority: fields.priority?.name || '',
      resolution: fields.resolution?.name || null,
      reporter: fields.reporter?.displayName || fields.reporter?.name || null,
      assignee: fields.assignee?.displayName || fields.assignee?.name || null,
      labels: fields.labels || [],
      components: fields.components?.map(c => c.name) || [],
      versions: fields.versions?.map(v => v.name) || [],
      fix_versions: fields.fixVersions?.map(v => v.name) || [],
      created_date: fields.created || null,
      updated_date: fields.updated || null,
      resolved_date: fields.resolutiondate || null,
      metadata: {
        votes: fields.votes?.votes || 0,
        watches: fields.watches?.watchCount || 0,
        subtasks: fields.subtasks?.length || 0
      }
    };

    const savedIssue = await this.db.saveIssue(issueData);

    if (fields.comment?.comments && fields.comment.comments.length > 0) {
      const commentsData = fields.comment.comments.map(comment => ({
        issue_id: savedIssue.id,
        comment_id: comment.id,
        author: comment.author?.displayName || comment.author?.name || 'Unknown',
        body: this.extractText(comment.body) || '',
        created_date: comment.created || null,
        updated_date: comment.updated || null
      }));

      await this.db.saveComments(commentsData);
      logger.debug(`Saved ${commentsData.length} comments for issue ${issue.key}`);
    }

    logger.debug(`Saved issue: ${issue.key}`);
  }

  extractText(content) {
    if (!content) return '';
    if (typeof content === 'string') return content;

    if (content.type === 'doc' && content.content) {
      return this.extractTextFromADF(content);
    }

    return '';
  }

  extractTextFromADF(node) {
    if (!node) return '';

    if (node.text) {
      return node.text;
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content.map(child => this.extractTextFromADF(child)).join('\n');
    }

    return '';
  }

  async scrapeMultipleProjects(projectKeys, resume = true) {
    const results = [];

    for (const projectKey of projectKeys) {
      try {
        logger.info(`\n${'='.repeat(60)}`);
        logger.info(`Starting project: ${projectKey}`);
        logger.info('='.repeat(60));

        const result = await this.scrapeProject(projectKey, resume);
        results.push(result);

        logger.info(`\nCompleted ${projectKey}: ${result.totalIssues} issues scraped`);

        const stats = this.jiraClient.getStats();
        logger.info(`API Stats - Requests: ${stats.requestCount}, Errors: ${stats.errorCount}`);

      } catch (error) {
        logger.error(`Failed to scrape project ${projectKey}:`, error.message);
        results.push({
          projectKey,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }
}
