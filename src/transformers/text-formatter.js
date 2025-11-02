import { logger } from '../utils/logger.js';
import { DatabaseService } from '../services/database.js';
import fs from 'fs/promises';
import path from 'path';

export class TextFormatter {
  constructor() {
    this.db = new DatabaseService();
  }

  async exportToJSONL(outputPath, projectKey = null) {
    logger.info(`Starting JSONL export${projectKey ? ` for project ${projectKey}` : ' for all projects'}`);

    try {
      const issues = await this.db.getAllIssuesForExport(projectKey);
      logger.info(`Retrieved ${issues.length} issues for export`);

      const jsonlRecords = [];

      for (const issue of issues) {
        const baseRecord = this.createBaseRecord(issue);

        jsonlRecords.push(this.createSummaryItem(baseRecord));
        jsonlRecords.push(this.createClassificationItem(baseRecord));
        jsonlRecords.push(this.createQAItem(baseRecord));

        if (issue.comments && issue.comments.length > 0) {
          jsonlRecords.push(this.createCommentAnalysisItem(baseRecord, issue.comments));
        }

        if (issue.description && issue.description.length > 100) {
          jsonlRecords.push(this.createKeyExtractionItem(baseRecord));
        }
      }

      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      const jsonlContent = jsonlRecords.map(record => JSON.stringify(record)).join('\n');
      await fs.writeFile(outputPath, jsonlContent, 'utf-8');

      logger.info(`Exported ${jsonlRecords.length} records to ${outputPath}`);

      const stats = {
        totalIssues: issues.length,
        totalRecords: jsonlRecords.length,
        outputPath
      };

      const statsPath = outputPath.replace('.jsonl', '_stats.json');
      await fs.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf-8');

      return stats;

    } catch (error) {
      logger.error(`Error during JSONL export:`, error);
      throw error;
    }
  }

  createBaseRecord(issue) {
    return {
      issue_key: issue.issue_key,
      project: issue.project?.project_name || 'Unknown',
      project_key: issue.project?.project_key || 'Unknown',
      summary: issue.summary,
      description: issue.description || '',
      issue_type: issue.issue_type,
      status: issue.status,
      priority: issue.priority,
      resolution: issue.resolution,
      reporter: issue.reporter,
      assignee: issue.assignee,
      labels: issue.labels || [],
      components: issue.components || [],
      created_date: issue.created_date,
      updated_date: issue.updated_date,
      resolved_date: issue.resolved_date
    };
  }

  createSummaryItem(baseRecord) {
    const input = this.buildIssueContext(baseRecord);

    return {
      type: 'summary',
      metadata: {
        issue_key: baseRecord.issue_key,
        project: baseRecord.project_key,
        issue_type: baseRecord.issue_type,
        status: baseRecord.status
      },
      instruction: 'Write a brief (2–3 sentence) summary of the issue, mentioning the main problem and any suggested remediation.',
      input: input,
      output: this.generateSummary(baseRecord)
    };
  }

  createClassificationItem(baseRecord) {
    const input = `Title: ${baseRecord.summary}\n\nDescription: ${baseRecord.description.substring(0, 500)}`;

    return {
      type: 'classification',
      metadata: {
        issue_key: baseRecord.issue_key,
        project: baseRecord.project_key,
        actual_type: baseRecord.issue_type,
        actual_priority: baseRecord.priority
      },
      instruction: 'Assign a category to this issue (Bug, Feature, Improvement, Task) and indicate priority (Critical, Major, Minor, Trivial).',
      input: input,
      output: {
        issue_type: baseRecord.issue_type,
        priority: baseRecord.priority,
        components: baseRecord.components,
        labels: baseRecord.labels
      }
    };
  }

  createQAItem(baseRecord) {
    const context = this.buildIssueContext(baseRecord);

    const questions = [
      {
        question: `What is the main problem described in issue ${baseRecord.issue_key}?`,
        answer: baseRecord.summary
      },
      {
        question: `What is the current status of issue ${baseRecord.issue_key}?`,
        answer: `The issue is currently ${baseRecord.status}${baseRecord.resolution ? ` and resolved as ${baseRecord.resolution}` : ''}.`
      },
      {
        question: `Which components are affected by issue ${baseRecord.issue_key}?`,
        answer: baseRecord.components.length > 0
          ? `The affected components are: ${baseRecord.components.join(', ')}`
          : 'No specific components are mentioned.'
      }
    ];

    if (baseRecord.assignee) {
      questions.push({
        question: `Who is assigned to work on issue ${baseRecord.issue_key}?`,
        answer: `This issue is assigned to ${baseRecord.assignee}.`
      });
    }

    return {
      type: 'qa',
      metadata: {
        issue_key: baseRecord.issue_key,
        project: baseRecord.project_key
      },
      instruction: 'Answer the questions below using the issue context.',
      context: context,
      qa_pairs: questions
    };
  }

  createCommentAnalysisItem(baseRecord, comments) {
    const commentTexts = comments
      .slice(0, 10)
      .map((c, idx) => `Comment ${idx + 1} by ${c.author}:\n${c.body}`)
      .join('\n\n');

    return {
      type: 'discussion',
      metadata: {
        issue_key: baseRecord.issue_key,
        project: baseRecord.project_key,
        comment_count: comments.length
      },
      instruction: 'Summarize discussion comments and extract any action items or decisions.',
      input: {
        issue_summary: baseRecord.summary,
        comments: commentTexts
      },
      output: {
        key_points: this.extractKeyPoints(comments),
        participant_count: new Set(comments.map(c => c.author)).size,
        total_comments: comments.length
      }
    };
  }

  createKeyExtractionItem(baseRecord) {
    return {
      type: 'key_extraction',
      metadata: {
        issue_key: baseRecord.issue_key,
        project: baseRecord.project_key
      },
      instruction: 'List the main technical terms, components, and labels found in this issue.',
      input: `${baseRecord.summary}\n\n${baseRecord.description.substring(0, 1000)}`,
      output: {
        labels: baseRecord.labels,
        components: baseRecord.components,
        issue_type: baseRecord.issue_type
      }
    };
  }

  buildIssueContext(record) {
    let context = `Issue: ${record.issue_key}\n`;
    context += `Project: ${record.project}\n`;
    context += `Type: ${record.issue_type}\n`;
    context += `Priority: ${record.priority}\n`;
    context += `Status: ${record.status}\n`;

    if (record.resolution) {
      context += `Resolution: ${record.resolution}\n`;
    }

    context += `\nSummary: ${record.summary}\n`;

    if (record.description) {
      context += `\nDescription:\n${record.description}\n`;
    }

    if (record.components.length > 0) {
      context += `\nComponents: ${record.components.join(', ')}\n`;
    }

    if (record.labels.length > 0) {
      context += `Labels: ${record.labels.join(', ')}\n`;
    }

    return context;
  }

  generateSummary(record) {
    let summary = `Issue ${record.issue_key} is a ${record.issue_type.toLowerCase()} `;
    summary += `in the ${record.project} project`;

    if (record.components.length > 0) {
      summary += ` affecting ${record.components[0]}`;
    }

    summary += `. ${record.summary}`;

    if (record.status === 'Resolved' || record.status === 'Closed') {
      summary += ` This issue has been ${record.status.toLowerCase()}`;
      if (record.resolution) {
        summary += ` as ${record.resolution.toLowerCase()}`;
      }
      summary += '.';
    } else {
      summary += ` The issue is currently ${record.status.toLowerCase()}.`;
    }

    return summary;
  }

  extractKeyPoints(comments) {
    const keyPoints = [];

    if (comments.length > 0) {
      keyPoints.push(`Discussion involves ${new Set(comments.map(c => c.author)).size} participants`);
    }

    const recentComments = comments.slice(-3);
    if (recentComments.length > 0) {
      keyPoints.push('Recent activity suggests ongoing development or discussion');
    }

    return keyPoints;
  }

  async exportProjectSeparately(projectKeys, outputDir) {
    const results = [];

    for (const projectKey of projectKeys) {
      try {
        const outputPath = path.join(outputDir, `${projectKey.toLowerCase()}_training.jsonl`);
        const stats = await this.exportToJSONL(outputPath, projectKey);
        results.push({ projectKey, ...stats });
      } catch (error) {
        logger.error(`Failed to export project ${projectKey}:`, error);
        results.push({ projectKey, error: error.message });
      }
    }

    return results;
  }
}
