# Project Structure

This document provides an overview of the project's file organization and the purpose of each component.

```
apache-jira-scraper/
├── src/                              # Source code
│   ├── cli.js                        # Command-line interface
│   ├── lib/                          # Third-party integrations
│   │   └── supabase.js              # Supabase client configuration
│   ├── services/                     # Core business logic
│   │   ├── database.js              # Database operations
│   │   ├── jira-client.js           # Jira API client
│   │   └── scraper.js               # Scraping orchestration
│   ├── transformers/                 # Data transformation
│   │   └── text-formatter.js        # JSONL export for training datasets
│   └── utils/                        # Utility functions
│       └── logger.js                 # Logging utility
├── supabase/                         # Database migrations
│   └── migrations/
│       ├── *_create_jira_scraper_schema.sql
│       ├── *_fix_rls_policies_for_anon.sql
│       └── *_add_unique_constraint_to_comments.sql
├── output/                           # Generated JSONL files (git-ignored)
│   ├── *_training.jsonl
│   └── *_training_stats.json
├── README.md                         # Main documentation
├── ARCHITECTURE.md                   # Technical architecture details
├── EXAMPLES.md                       # Usage examples
├── EDGE_CASES.md                     # Error handling documentation
├── PROJECT_STRUCTURE.md             # This file
├── package.json                      # Node.js dependencies
├── .env                              # Environment variables (git-ignored)
└── .gitignore                        # Git ignore rules
```

## File Descriptions

### Source Code (`src/`)

#### `cli.js` (380 lines)
**Purpose**: Command-line interface for the scraper

**Key Functions**:
- `parseArgs()`: Parse command-line arguments
- `handleScrape()`: Execute scraping command
- `handleExport()`: Execute export command
- `handleStatus()`: Execute status command
- `printUsage()`: Display help information

**Commands**:
- `scrape [projects]`: Scrape Jira issues
- `export [projects]`: Export to JSONL
- `status [project]`: Check progress
- `help`: Show usage

---

#### `lib/supabase.js` (13 lines)
**Purpose**: Initialize Supabase client

**Exports**:
- `supabase`: Configured Supabase client instance

**Configuration**:
- Reads from environment variables
- Validates credentials are present

---

#### `services/jira-client.js` (180 lines)
**Purpose**: Wrapper for Jira REST API with error handling

**Class**: `JiraClient`

**Key Methods**:
- `makeRequest(url, params)`: Core request method with retry logic
- `getProjects()`: Fetch all projects
- `searchIssues(jql, startAt, maxResults)`: Search issues with pagination
- `getIssue(issueKey)`: Fetch single issue
- `getStats()`: Get request statistics

**Features**:
- Rate limiting via p-queue (10 req/sec)
- Automatic retry with exponential backoff
- HTTP error handling (429, 5xx, 4xx)
- Request/error counting

---

#### `services/database.js` (210 lines)
**Purpose**: Abstraction layer for database operations

**Class**: `DatabaseService`

**Key Methods**:
- `saveProject(projectData)`: Upsert project
- `saveIssue(issueData)`: Upsert issue
- `saveComments(commentsData)`: Batch insert/upsert comments
- `getScraperState(projectKey)`: Retrieve checkpoint state
- `saveScraperState(stateData)`: Update checkpoint
- `getAllIssuesForExport(projectKey)`: Fetch for JSONL generation
- `getIssueCount(projectKey)`: Count issues

**Features**:
- Upsert operations for idempotency
- Error handling and logging
- Efficient batch operations

---

#### `services/scraper.js` (250 lines)
**Purpose**: Orchestrates the scraping workflow

**Class**: `JiraScraper`

**Key Methods**:
- `scrapeProject(projectKey, resume)`: Scrape single project
- `scrapeIssue(issue, projectId)`: Process single issue
- `extractText(content)`: Extract text from various formats
- `extractTextFromADF(node)`: Parse Atlassian Document Format
- `scrapeMultipleProjects(projectKeys, resume)`: Scrape multiple projects

**Workflow**:
1. Load or create state
2. Fetch project metadata
3. Paginate through issues
4. Process each issue + comments
5. Update state after each batch
6. Mark complete when done

---

#### `transformers/text-formatter.js` (310 lines)
**Purpose**: Transform scraped data into structured training records

**Class**: `TextFormatter`

**Key Methods**:
- `exportToJSONL(outputPath, projectKey)`: Main export function
- `createSummarizationTask(baseRecord)`: Generate summarization examples
- `createClassificationTask(baseRecord)`: Generate classification examples
- `createQATask(baseRecord)`: Generate Q&A examples
- `createCommentAnalysisTask(baseRecord, comments)`: Analyze discussions
- `createKeyExtractionTask(baseRecord)`: Extract technical terms

**Output Format**:
Each task includes:
- `task_type`: Type of training task
- `metadata`: Tracking information
- `instruction`: Task instruction for LLM
- `input`: Context/data to process
- `output`: Expected result

---

#### `utils/logger.js` (40 lines)
**Purpose**: Centralized logging with levels

**Class**: `Logger`

**Log Levels**:
- `ERROR`: Critical errors only
- `WARN`: Warnings and errors
- `INFO`: General progress (default)
- `DEBUG`: Detailed debugging info

**Usage**:
```javascript
import { logger } from './utils/logger.js';
logger.info('Starting scrape');
logger.debug('Request details:', data);
```

---

### Database (`supabase/`)

#### Migration Files

**1. `create_jira_scraper_schema.sql`**
- Creates 4 tables: projects, issues, comments, scraper_state
- Adds indexes for performance
- Sets up Row Level Security
- Creates initial policies

**2. `fix_rls_policies_for_anon.sql`**
- Updates RLS policies for anon role
- Enables scraper to write data
- Maintains public read access

**3. `add_unique_constraint_to_comments.sql`**
- Adds unique constraint on comment_id
- Enables upsert operations for comments

---

### Documentation

#### `README.md` (900+ lines)
**Sections**:
- Features and capabilities
- Architecture overview
- Setup instructions
- Usage guide
- Data structure
- Edge cases & error handling
- Optimization strategies
- Future improvements

**Target Audience**: Users and developers

---

#### `ARCHITECTURE.md` (600+ lines)
**Sections**:
- System design
- Component architecture
- Data flow diagrams
- Database schema
- Error handling architecture
- Performance considerations
- Security considerations

**Target Audience**: Technical reviewers and contributors

---

#### `EXAMPLES.md` (400+ lines)
**Sections**:
- Basic usage examples
- Advanced usage examples
- Real-world scenarios
- Output format examples
- Data analysis examples
- Troubleshooting examples

**Target Audience**: Users learning the tool

---

#### `EDGE_CASES.md` (700+ lines)
**Sections**:
- Network & API errors
- Data quality issues
- System & resource issues
- Business logic edge cases
- Testing scenarios
- Error recovery flowchart

**Target Audience**: QA engineers and developers

---

#### `PROJECT_STRUCTURE.md` (This file)
**Purpose**: Guide to codebase organization
**Target Audience**: New developers and reviewers

---

### Configuration

#### `package.json`
**Key Information**:
- Project name: `apache-jira-scraper`
- Main entry: `src/cli.js`
- Type: `module` (ES6 modules)
- Dependencies:
  - `@supabase/supabase-js`: Database client
  - `axios`: HTTP requests
  - `dotenv`: Environment variables
  - `p-queue`: Rate limiting
  - `p-retry`: Retry logic

**Scripts**:
- `npm run scrape`: Run scraper with defaults
- `npm run export`: Export to JSONL
- `npm run status`: Check status

---

#### `.env`
**Contents**:
```
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_ANON_KEY=<supabase-key>
LOG_LEVEL=INFO
```

**Security**: Git-ignored, not committed

---

#### `.gitignore`
**Ignored**:
- `node_modules/`: Dependencies
- `.env`: Credentials
- `output/`: Generated files
- `*.log`: Log files
- `*.jsonl`, `*.csv`: Data files

---

## Code Statistics

### Lines of Code

```
Source Code:
- cli.js:                380 lines
- jira-client.js:        180 lines
- database.js:           210 lines
- scraper.js:            250 lines
- text-formatter.js:     310 lines
- logger.js:              40 lines
- supabase.js:            13 lines
Total Source:          1,383 lines

Documentation:
- README.md:             900 lines
- ARCHITECTURE.md:       600 lines
- EXAMPLES.md:           400 lines
- EDGE_CASES.md:         700 lines
- PROJECT_STRUCTURE.md:  250 lines
Total Docs:           2,850 lines

Database:
- Migrations:            200 lines

Grand Total:         ~4,433 lines
```

### File Count

- Source files: 7
- Documentation files: 5
- Configuration files: 3
- Migration files: 3
- Total: 18 files

---

## Dependencies Graph

```
cli.js
├── services/scraper.js
│   ├── services/jira-client.js
│   │   ├── axios
│   │   ├── p-queue
│   │   └── p-retry
│   ├── services/database.js
│   │   └── lib/supabase.js
│   │       └── @supabase/supabase-js
│   └── utils/logger.js
├── transformers/text-formatter.js
│   └── services/database.js
└── services/database.js
```

---

## Data Flow

```
User Command
     ↓
   CLI
     ↓
  Scraper ←→ Jira API (via JiraClient)
     ↓
  Database (via DatabaseService)
     ↓
  Supabase PostgreSQL
     ↓
LLM Formatter
     ↓
JSONL Output Files
```

---

## Adding New Features

### To Add a New Data Source:

1. Create new client in `src/services/` (similar to `jira-client.js`)
2. Extend `scraper.js` or create new scraper
3. Update `database.js` if new tables needed
4. Create migration in `supabase/migrations/`
5. Update `text-formatter.js` for new data structure

### To Add a New Task Type:

1. Add method to `TextFormatter` class
2. Call from `exportToJSONL()` method
3. Update README with new task type
4. Add examples to EXAMPLES.md

### To Add a New CLI Command:

1. Add command to `COMMANDS` object in `cli.js`
2. Implement `handle<Command>()` function
3. Update `printUsage()` help text
4. Add npm script to `package.json`
5. Document in EXAMPLES.md

---

## Testing Strategy

### Current State

The project has been tested manually with:
- Small samples (5-10 issues)
- Multiple projects
- Export functionality
- Status checking
- Resume capability

### Recommended Additions

1. **Unit Tests**
   - Test each service class independently
   - Mock external dependencies (API, database)
   - Framework: Jest or Mocha

2. **Integration Tests**
   - Test full workflow with test database
   - Mock Jira API responses
   - Verify data consistency

3. **End-to-End Tests**
   - Test with real (but small) data
   - Verify complete pipeline
   - Check output JSONL validity

---

## Performance Characteristics

### Speed
- **Scraping**: ~1-2 issues/second (rate limited)
- **Export**: ~100 issues/second (database bound)

### Memory
- **Scraping**: ~50-100 MB constant (streaming)
- **Export**: ~200-500 MB (depends on issue count)

### Disk
- **Database**: ~5-10 KB per issue
- **JSONL**: ~2-5 KB per training record

### Scalability
- Tested with: 20 issues
- Should handle: 100,000+ issues per project
- Bottleneck: API rate limits (10 req/sec)

---

## Maintenance Checklist

### Regular Updates

- [ ] Update dependencies: `npm update`
- [ ] Check for security advisories: `npm audit`
- [ ] Review and update documentation
- [ ] Test with latest Jira API version

### Before Deployment

- [ ] Update README with any changes
- [ ] Verify .env configuration
- [ ] Test scraping small sample
- [ ] Test export functionality
- [ ] Review logs for errors
- [ ] Check disk space

### Monitoring

- [ ] Track API request count
- [ ] Monitor error rate
- [ ] Check database size
- [ ] Verify JSONL output quality
- [ ] Review scraper state for stalled jobs

---

## Contact & Support

For questions or issues:
1. Check documentation (README, EXAMPLES, EDGE_CASES)
2. Review logs with DEBUG level
3. Check database state with status command
4. Open issue on GitHub (if applicable)

---

**Last Updated**: 2025-11-01
**Version**: 1.0.0
