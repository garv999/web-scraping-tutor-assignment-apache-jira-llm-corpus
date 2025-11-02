#!/usr/bin/env node

import { JiraScraper } from './services/scraper.js';
import { TextFormatter } from './transformers/text-formatter.js';
import { DatabaseService } from './services/database.js';
import { logger } from './utils/logger.js';
import path from 'path';

const DEFAULT_PROJECTS = ['KAFKA', 'SPARK', 'HADOOP'];

const COMMANDS = {
  SCRAPE: 'scrape',
  EXPORT: 'export',
  STATUS: 'status',
  HELP: 'help'
};

function printUsage() {
  console.log(`
Apache Jira Scraper - Issue training data pipeline
=================================================

Usage: node src/cli.js <command> [options]

Commands:
  scrape [projects]     Scrape issues from specified projects
                        Example: node src/cli.js scrape KAFKA SPARK HADOOP
                        Default: KAFKA, SPARK, HADOOP

  export [projects]     Export scraped data to JSONL format
                        Example: node src/cli.js export KAFKA
                        Default: exports all projects

  status [project]      Check scraping status for a project
                        Example: node src/cli.js status KAFKA

  help                  Show this help message

Options:
  --max-issues=N        Limit number of issues to scrape per project
  --batch-size=N        Number of issues to fetch per API call (default: 50)
  --no-resume           Start scraping from beginning (ignore saved state)
  --output-dir=PATH     Output directory for JSONL files (default: ./output)

Environment Variables:
  LOG_LEVEL            Set logging level: ERROR, WARN, INFO, DEBUG (default: INFO)
  VITE_SUPABASE_URL    Supabase project URL (required)
  VITE_SUPABASE_ANON_KEY   Supabase API key (required)

Examples:
  # Scrape default projects (KAFKA, SPARK, HADOOP)
  node src/cli.js scrape

  # Scrape specific projects with limited issues
  node src/cli.js scrape CASSANDRA NIFI --max-issues=100

  # Export all scraped data to JSONL
  node src/cli.js export

  # Export specific project
  node src/cli.js export KAFKA --output-dir=./data

  # Check status of a scraping job
  node src/cli.js status KAFKA
`);
}

function parseArgs(args) {
  const parsed = {
    command: null,
    projects: [],
    options: {}
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value) {
        parsed.options[key] = value;
      } else {
        parsed.options[key] = true;
      }
    } else if (!parsed.command) {
      parsed.command = arg;
    } else {
      parsed.projects.push(arg.toUpperCase());
    }
  }

  return parsed;
}

async function handleScrape(projects, options) {
  const projectsToScrape = projects.length > 0 ? projects : DEFAULT_PROJECTS;

  logger.info(`Starting scrape for projects: ${projectsToScrape.join(', ')}`);

  const scraperOptions = {
    batchSize: parseInt(options['batch-size']) || 50,
    maxIssues: parseInt(options['max-issues']) || null
  };

  const scraper = new JiraScraper(scraperOptions);
  const resume = !options['no-resume'];

  try {
    const results = await scraper.scrapeMultipleProjects(projectsToScrape, resume);

    console.log('\n' + '='.repeat(60));
    console.log('SCRAPING SUMMARY');
    console.log('='.repeat(60));

    for (const result of results) {
      if (result.status === 'completed') {
        console.log(`✓ ${result.projectKey}: ${result.totalIssues} issues scraped`);
      } else {
        console.log(`✗ ${result.projectKey}: ${result.error || 'Unknown error'}`);
      }
    }

    const stats = scraper.jiraClient.getStats();
    console.log(`\nAPI Requests: ${stats.requestCount}`);
    console.log(`API Errors: ${stats.errorCount}`);

  } catch (error) {
    logger.error('Scraping failed:', error);
    process.exit(1);
  }
}

async function handleExport(projects, options) {
  const outputDir = options['output-dir'] || './output';
  const formatter = new TextFormatter();

  try {
    if (projects.length > 0) {
      logger.info(`Exporting projects: ${projects.join(', ')}`);
      const results = await formatter.exportProjectSeparately(projects, outputDir);

      console.log('\n' + '='.repeat(60));
      console.log('EXPORT SUMMARY');
      console.log('='.repeat(60));

      for (const result of results) {
        if (result.totalRecords) {
          console.log(`✓ ${result.projectKey}: ${result.totalRecords} records from ${result.totalIssues} issues`);
          console.log(`  Output: ${result.outputPath}`);
        } else {
          console.log(`✗ ${result.projectKey}: ${result.error}`);
        }
      }
    } else {
      logger.info('Exporting all projects');
  const outputPath = path.join(outputDir, 'all_projects_training.jsonl');
      const stats = await formatter.exportToJSONL(outputPath);

      console.log('\n' + '='.repeat(60));
      console.log('EXPORT SUMMARY');
      console.log('='.repeat(60));
      console.log(`✓ Total Issues: ${stats.totalIssues}`);
      console.log(`✓ Total Records: ${stats.totalRecords}`);
      console.log(`✓ Output: ${stats.outputPath}`);
    }

  } catch (error) {
    logger.error('Export failed:', error);
    process.exit(1);
  }
}

async function handleStatus(projects) {
  const db = new DatabaseService();

  try {
    if (projects.length === 0) {
      console.log('Please specify a project key');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('SCRAPER STATUS');
    console.log('='.repeat(60));

    for (const projectKey of projects) {
      const state = await db.getScraperState(projectKey);
      const issueCount = await db.getIssueCount(projectKey);

      console.log(`\nProject: ${projectKey}`);

      if (state) {
        console.log(`Status: ${state.status}`);
        console.log(`Issues Scraped: ${state.total_issues_scraped}`);
        console.log(`Last Position: ${state.last_start_at}`);

        if (state.started_at) {
          console.log(`Started: ${new Date(state.started_at).toLocaleString()}`);
        }

        if (state.completed_at) {
          console.log(`Completed: ${new Date(state.completed_at).toLocaleString()}`);
        }

        if (state.error_message) {
          console.log(`Error: ${state.error_message}`);
        }
      } else {
        console.log('Status: Not started');
      }

      console.log(`Issues in Database: ${issueCount}`);
    }

    console.log('');

  } catch (error) {
    logger.error('Status check failed:', error);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const { command, projects, options } = parseArgs(args);

  switch (command) {
    case COMMANDS.SCRAPE:
      await handleScrape(projects, options);
      break;

    case COMMANDS.EXPORT:
      await handleExport(projects, options);
      break;

    case COMMANDS.STATUS:
      await handleStatus(projects);
      break;

    case COMMANDS.HELP:
    default:
      printUsage();
      break;
  }
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
