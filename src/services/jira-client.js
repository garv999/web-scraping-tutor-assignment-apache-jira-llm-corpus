import axios from 'axios';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { logger } from '../utils/logger.js';

export class JiraClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://issues.apache.org/jira/rest/api/2';
    this.maxRetries = options.maxRetries || 5;
    this.retryDelay = options.retryDelay || 1000;
    this.rateLimit = options.rateLimit || 10;

    this.queue = new PQueue({
      concurrency: 1,
      interval: 1000,
      intervalCap: this.rateLimit
    });

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    this.requestCount = 0;
    this.errorCount = 0;
  }

  async makeRequest(url, params = {}) {
    return this.queue.add(() =>
      pRetry(
        async () => {
          try {
            this.requestCount++;
            logger.debug(`Making request to: ${url}`, { params });

            const response = await this.axiosInstance.get(url, { params });

            logger.debug(`Response received for: ${url}`, {
              status: response.status,
              dataSize: JSON.stringify(response.data).length
            });

            return response.data;
          } catch (error) {
            this.errorCount++;

            if (error.response) {
              const status = error.response.status;

              if (status === 429) {
                const retryAfter = error.response.headers['retry-after'];
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
                logger.warn(`Rate limited (429). Waiting ${delay}ms before retry`);
                await this.sleep(delay);
                throw error;
              }

              if (status >= 500) {
                logger.warn(`Server error (${status}). Retrying...`);
                throw error;
              }

              if (status === 404) {
                logger.warn(`Resource not found (404): ${url}`);
                return null;
              }

              if (status >= 400 && status < 500) {
                logger.error(`Client error (${status}): ${error.response.data?.errorMessages || error.message}`);
                throw new pRetry.AbortError(error);
              }
            }

            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
              logger.warn(`Request timeout. Retrying...`);
              throw error;
            }

            logger.error(`Unexpected error:`, error.message);
            throw error;
          }
        },
        {
          retries: this.maxRetries,
          minTimeout: this.retryDelay,
          maxTimeout: this.retryDelay * 10,
          factor: 2,
          onFailedAttempt: (error) => {
            logger.warn(
              `Request attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
            );
          }
        }
      )
    );
  }

  async getProjects() {
    logger.info('Fetching all projects');
    const data = await this.makeRequest('/project');
    logger.info(`Found ${data?.length || 0} projects`);
    return data;
  }

  async getProject(projectKey) {
    logger.info(`Fetching project: ${projectKey}`);
    return this.makeRequest(`/project/${projectKey}`);
  }

  async searchIssues(jql, startAt = 0, maxResults = 50) {
    logger.debug(`Searching issues: ${jql}`, { startAt, maxResults });

    const params = {
      jql,
      startAt,
      maxResults,
      fields: [
        'summary',
        'description',
        'issuetype',
        'status',
        'priority',
        'resolution',
        'reporter',
        'assignee',
        'labels',
        'components',
        'versions',
        'fixVersions',
        'created',
        'updated',
        'resolutiondate',
        'comment'
      ].join(',')
    };

    const data = await this.makeRequest('/search', params);

    if (data) {
      logger.debug(`Found ${data.issues?.length || 0} issues (${startAt} to ${startAt + (data.issues?.length || 0)} of ${data.total})`);
    }

    return data;
  }

  async getIssue(issueKey) {
    logger.debug(`Fetching issue: ${issueKey}`);
    return this.makeRequest(`/issue/${issueKey}`);
  }

  async getIssueComments(issueKey) {
    logger.debug(`Fetching comments for issue: ${issueKey}`);
    const data = await this.makeRequest(`/issue/${issueKey}/comment`);
    return data?.comments || [];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      queueSize: this.queue.size,
      queuePending: this.queue.pending
    };
  }
}
