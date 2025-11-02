# Architecture Deep Dive

## System Overview

The Apache Jira Scraper is built with a modular architecture that separates concerns into distinct layers, each responsible for specific functionality. This design enables maintainability, testability, and scalability.

## Design Principles

### 1. Separation of Concerns
Each module has a single, well-defined responsibility:
- **API Client**: Handles all HTTP communication
- **Database Service**: Manages all data persistence
- **Scraper**: Orchestrates the scraping workflow
- **Formatter**: Transforms data for ML consumption
- **CLI**: Provides user interface

### 2. Fault Tolerance
The system is designed to handle failures gracefully:
- **Retry Logic**: Exponential backoff for transient errors
- **State Checkpointing**: Resume from last known good state
- **Error Isolation**: Failures in one issue don't affect the batch
- **Graceful Degradation**: Missing optional data doesn't stop processing

### 3. Rate Limit Compliance
Multiple strategies ensure we respect API limits:
- **Request Queue**: Controlled concurrency (10 req/sec)
- **Exponential Backoff**: Increasing delays between retries
- **429 Handling**: Explicit handling of rate limit responses
- **Configurable Limits**: Easy to adjust for different APIs

### 4. Data Integrity
Ensures data consistency and reliability:
- **Upsert Operations**: Idempotent database operations
- **Foreign Keys**: Referential integrity in database
- **Transaction Safety**: Batch operations are atomic
- **Validation**: Type checking and null handling

## Component Architecture

### Layer 1: Data Access (Jira API)

```javascript
┌─────────────────────────────────────────────┐
│         Jira API Client                     │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐      ┌─────────────────┐  │
│  │  Axios      │      │   p-queue       │  │
│  │  Instance   │◄─────┤   Rate Limiter  │  │
│  └─────────────┘      └─────────────────┘  │
│        │                                    │
│        ▼                                    │
│  ┌─────────────────────────────────────┐   │
│  │   p-retry (Retry Logic)             │   │
│  │   - Exponential backoff             │   │
│  │   - Error classification            │   │
│  │   - Retry-After handling            │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Key Classes:**
- `JiraClient`: Main interface for Jira API
  - `makeRequest()`: Core request method with retry logic
  - `searchIssues()`: Paginated issue search
  - `getProject()`: Project metadata retrieval
  - `getIssue()`: Individual issue details

**Error Handling Strategy:**
```javascript
try {
  response = await axios.get(url)
} catch (error) {
  if (error.status === 429) {
    // Rate limited - wait and retry
    wait(retryAfter)
    throw error  // Triggers p-retry
  } else if (error.status >= 500) {
    // Server error - retry with backoff
    throw error  // Triggers p-retry
  } else if (error.status === 404) {
    // Not found - don't retry
    return null
  } else {
    // Client error - abort retry
    throw new AbortError(error)
  }
}
```

### Layer 2: Data Persistence (Database)

```javascript
┌─────────────────────────────────────────────┐
│         Database Service                    │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │   Supabase Client                   │   │
│  │   - PostgreSQL connection           │   │
│  │   - Row Level Security              │   │
│  │   - Real-time subscriptions (opt)   │   │
│  └─────────────────────────────────────┘   │
│        │                                    │
│        ▼                                    │
│  ┌─────────────────────────────────────┐   │
│  │   Data Models                       │   │
│  │   - projects                        │   │
│  │   - issues                          │   │
│  │   - comments                        │   │
│  │   - scraper_state                   │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Key Methods:**
- `saveProject()`: Upsert project metadata
- `saveIssue()`: Upsert issue with all fields
- `saveComments()`: Batch insert comments
- `saveScraperState()`: Update checkpoint state
- `getAllIssuesForExport()`: Retrieve for JSONL generation

**Database Schema Design Decisions:**

1. **JSONB for Metadata**: Flexible schema for varying project metadata
2. **Arrays for Labels/Components**: Native PostgreSQL array support
3. **Timestamps**: Both Jira timestamps and our own for audit trail
4. **Unique Constraints**: Prevent duplicates at database level
5. **Foreign Keys with CASCADE**: Maintain referential integrity

### Layer 3: Business Logic (Scraper)

```javascript
┌─────────────────────────────────────────────────┐
│              Scraper Service                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │   Project Scraping Loop                   │ │
│  │                                           │ │
│  │   1. Get/Resume State                     │ │
│  │   2. Fetch Project Metadata               │ │
│  │   3. Paginate Through Issues:             │ │
│  │      ├─ Fetch Batch (50 issues)           │ │
│  │      ├─ Process Each Issue                │ │
│  │      ├─ Extract Comments                  │ │
│  │      ├─ Save to Database                  │ │
│  │      └─ Update State                      │ │
│  │   4. Mark Complete                        │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Scraping Flow:**

```
START
  │
  ├─ Load/Create State
  │
  ├─ Fetch Project Info
  │   └─ Save to DB
  │
  ├─ Build JQL Query
  │
  ├─ Start Pagination Loop
  │   │
  │   ├─ Fetch Batch (startAt, maxResults)
  │   │   └─ API Call via JiraClient
  │   │
  │   ├─ For Each Issue:
  │   │   ├─ Extract Fields
  │   │   ├─ Parse Description (ADF)
  │   │   ├─ Save Issue
  │   │   └─ Save Comments
  │   │
  │   ├─ Update State (checkpoint)
  │   │   ├─ last_start_at = startAt + batchSize
  │   │   ├─ total_issues_scraped += count
  │   │   └─ status = 'running'
  │   │
  │   ├─ Check Continue Conditions:
  │   │   ├─ More issues available?
  │   │   ├─ Max issues reached?
  │   │   └─ Errors encountered?
  │   │
  │   └─ Loop or Exit
  │
  ├─ Mark Complete
  │   └─ status = 'completed'
  │
END
```

**State Management:**

State is persisted after every batch to enable resumption:

```javascript
{
  project_key: 'KAFKA',
  status: 'running',
  last_start_at: 150,         // Resume from issue 150
  total_issues_scraped: 150,
  last_issue_key: 'KAFKA-9876',
  started_at: '2025-11-01T10:00:00Z',
  updated_at: '2025-11-01T10:15:00Z'
}
```

### Layer 4: Data Transformation (Text Formatter)

```javascript
┌─────────────────────────────────────────────────┐
│           Text Formatter                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  For Each Issue:                                │
│    │                                            │
│    ├─ Create Base Record                       │
│    │                                            │
│    ├─ Generate Tasks:                          │
│    │   ├─ Summarization                        │
│    │   ├─ Classification                       │
│    │   ├─ Question Answering                   │
│    │   ├─ Discussion Analysis (if comments)    │
│    │   └─ Key Extraction (if long desc)        │
│    │                                            │
│    └─ Write to JSONL                           │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Task Generation Strategy:**

Each issue generates 3-5 training examples:

1. **Summarization Task**
   - Input: Full issue context
   - Output: Generated summary
   - Purpose: Train summarization capabilities

2. **Classification Task**
   - Input: Title + partial description
   - Output: Type, priority, labels
   - Purpose: Train categorization

3. **Q&A Task**
   - Input: Issue context
   - Output: 3-4 Q&A pairs
   - Purpose: Train question answering

4. **Discussion Analysis** (conditional)
   - Input: Issue + comments
   - Output: Key points, participants
   - Purpose: Train conversation understanding

5. **Key Extraction** (conditional)
   - Input: Title + description
   - Output: Technical terms, concepts
   - Purpose: Train entity recognition

**Output Format:**

```javascript
// Each line is a complete training example
{
  "task_type": "summarization",
  "metadata": { /* tracking info */ },
  "instruction": "Clear task instruction",
  "input": "Context and data",
  "output": "Expected result"
}
```

### Layer 5: User Interface (CLI)

```javascript
┌─────────────────────────────────────────────────┐
│              CLI Interface                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Commands:                                      │
│    ├─ scrape [projects] [options]              │
│    ├─ export [projects] [options]              │
│    ├─ status [project]                         │
│    └─ help                                      │
│                                                 │
│  Argument Parsing:                              │
│    ├─ Command identification                   │
│    ├─ Project list extraction                  │
│    └─ Option parsing (--key=value)             │
│                                                 │
│  Output Formatting:                             │
│    ├─ Progress indicators                      │
│    ├─ Summary tables                           │
│    └─ Error messages                           │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Data Flow

### Complete Scraping Pipeline

```
┌───────────┐
│   User    │
│  Command  │
└─────┬─────┘
      │
      ▼
┌──────────────────┐
│   CLI Parser     │
│  - Parse args    │
│  - Validate      │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────┐
│  Scraper Orchestration  │
│  - For each project:    │
└────────┬────────────────┘
         │
         ├─────────────────────┐
         │                     │
         ▼                     ▼
┌──────────────────┐   ┌─────────────┐
│   Jira Client    │   │  Database   │
│  - Fetch issues  │   │  - Save     │
│  - Handle errors │   │  - Update   │
└──────────────────┘   └─────────────┘
         │                     │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │   State Updated     │
         │  - Progress tracked │
         └─────────────────────┘
```

### Export Pipeline

```
┌───────────┐
│   User    │
│  Command  │
└─────┬─────┘
      │
      ▼
┌──────────────────┐
│   CLI Parser     │
└────────┬─────────┘
         │
         ▼
┌───────────────────────┐
│   LLM Formatter       │
│  - Query database     │
└────────┬──────────────┘
         │
         ▼
┌───────────────────────┐
│   Database Service    │
│  - Fetch all issues   │
│  - Include comments   │
│  - Include projects   │
└────────┬──────────────┘
         │
         ▼
┌───────────────────────┐
│   Task Generation     │
│  - For each issue:    │
│    - Summarization    │
│    - Classification   │
│    - Q&A              │
│    - Discussion       │
│    - Key Extraction   │
└────────┬──────────────┘
         │
         ▼
┌───────────────────────┐
│   JSONL Writer        │
│  - Stream to file     │
│  - One line per task  │
└────────┬──────────────┘
         │
         ▼
┌───────────────────────┐
│   Output Files        │
│  - *.jsonl            │
│  - *_stats.json       │
└───────────────────────┘
```

## Error Handling Architecture

### Error Types & Responses

```
Error Taxonomy:
│
├─ Network Errors
│  ├─ Timeout → Retry with backoff
│  ├─ Connection refused → Retry with backoff
│  └─ DNS failure → Abort (permanent)
│
├─ HTTP Errors
│  ├─ 4xx Client Errors
│  │  ├─ 404 Not Found → Return null, continue
│  │  ├─ 429 Rate Limited → Wait & retry
│  │  └─ Other 4xx → Abort (permanent)
│  │
│  └─ 5xx Server Errors
│     └─ All 5xx → Retry with backoff
│
├─ Data Errors
│  ├─ Malformed JSON → Log, skip, continue
│  ├─ Missing required fields → Use defaults
│  └─ Invalid types → Coerce or use null
│
└─ System Errors
   ├─ Disk full → Abort, alert user
   ├─ Database connection lost → Abort, preserve state
   └─ Out of memory → Abort, log state
```

### Retry Strategy

```javascript
Retry Decision Tree:

Is error retryable?
├─ Yes
│  ├─ Attempt < maxRetries?
│  │  ├─ Yes
│  │  │  └─ Wait (baseDelay * 2^attempt)
│  │  │     └─ Retry request
│  │  └─ No
│  │     └─ Fail permanently
│  │        └─ Save state
│  │           └─ Log error
└─ No
   └─ Fail immediately
      └─ Log error
         └─ Continue with next item
```

## Performance Considerations

### Request Throttling

**Problem**: Jira API has rate limits
**Solution**: p-queue with configurable rate

```javascript
queue = new PQueue({
  concurrency: 1,           // One request at a time
  interval: 1000,           // Per 1 second
  intervalCap: 10           // Max 10 requests
})

// Effective rate: 10 requests per second
```

**Trade-offs**:
- ✅ Prevents rate limiting
- ✅ Predictable throughput
- ❌ Not maximum speed
- ❌ Conservative limits

### Batch Processing

**Problem**: Fetching issues one-by-one is slow
**Solution**: Paginated batch fetching

```javascript
batchSize = 50  // Fetch 50 issues per request

// 1000 issues = 20 requests instead of 1000
```

**Trade-offs**:
- ✅ 50x fewer API calls
- ✅ Faster overall scraping
- ❌ Larger response payloads
- ❌ Batch failures affect more items

### Database Optimization

**Indexes**:
```sql
-- Fast lookups by project
CREATE INDEX idx_projects_key ON projects(project_key);

-- Fast lookups by issue
CREATE INDEX idx_issues_key ON issues(issue_key);

-- Fast foreign key joins
CREATE INDEX idx_issues_project_id ON issues(project_id);
CREATE INDEX idx_comments_issue_id ON comments(issue_id);
```

**Upsert Strategy**:
```javascript
// Single query handles insert or update
.upsert(data, { onConflict: 'issue_key' })

// vs. Check if exists → Insert or Update (2+ queries)
```

### Memory Management

**Streaming Export**:
```javascript
// Bad: Load all issues into memory
const issues = await getAllIssues()  // Could be GBs
const jsonl = issues.map(toJSONL).join('\n')
await writeFile(jsonl)

// Good: Stream line by line
for await (const issue of issueIterator()) {
  const line = toJSONL(issue)
  await appendLine(line)  // Constant memory
}
```

## Security Considerations

### Data Access

- **Public Data Only**: Scraper accesses only public Jira data
- **No Authentication**: Uses public API endpoints (no credentials stored)
- **Rate Limiting**: Respects Jira's rate limits to avoid abuse

### Database Security

- **Row Level Security**: Enabled on all tables
- **Service Role Policies**: Scraper uses service role for writes
- **Public Read Access**: Data is public, read access is open
- **No Sensitive Data**: Only public issue information stored

### Environment Variables

- **Never Committed**: .env in .gitignore
- **Supabase Keys**: Only anon key used (safe for client-side)
- **No Secrets**: No API keys or credentials required

## Testing Strategy

### Unit Testing (Recommended)

```javascript
// Test individual components
describe('JiraClient', () => {
  test('handles 429 rate limit', async () => {
    // Mock API response with 429
    // Verify retry with delay
  })

  test('extracts text from ADF', () => {
    // Test ADF parser with various formats
  })
})

describe('TextFormatter', () => {
  test('generates correct task types', () => {
    // Verify all 5 task types created
  })

  test('handles missing comments', () => {
    // Verify no discussion task created
  })
})
```

### Integration Testing (Recommended)

```javascript
// Test component interactions
describe('Scraper Integration', () => {
  test('scrapes and saves issue', async () => {
    // Use test Jira instance or mocks
    // Verify database persistence
  })

  test('resumes from checkpoint', async () => {
    // Create partial state
    // Resume scraping
    // Verify continuation from checkpoint
  })
})
```

### End-to-End Testing

```bash
# Test with small dataset
node src/cli.js scrape KAFKA --max-issues=10

# Verify database
node src/cli.js status KAFKA

# Test export
node src/cli.js export KAFKA

# Verify JSONL output
cat output/kafka_training.jsonl | jq .
```

## Deployment Considerations

### Environment Setup

```bash
# Production environment
NODE_ENV=production
LOG_LEVEL=WARN
VITE_SUPABASE_URL=<production-url>
VITE_SUPABASE_ANON_KEY=<production-key>
```

### Monitoring

**Metrics to Track**:
- Requests per second
- Error rate
- Average response time
- Issues scraped per minute
- Database write latency
- Queue length

**Logging**:
- Structured JSON logs for production
- Correlation IDs for request tracking
- Error stack traces with context

### Scaling

**Vertical Scaling**:
- Increase batch size (more memory, faster)
- Increase rate limit (more aggressive)
- Increase database connection pool

**Horizontal Scaling**:
- Multiple workers with shared state
- Distributed rate limiter (Redis)
- Partition projects across workers

## Conclusion

This architecture prioritizes:
1. **Reliability**: Fault tolerance and state management
2. **Maintainability**: Clear separation of concerns
3. **Performance**: Efficient batching and rate limiting
4. **Scalability**: Modular design enables future enhancements

The system successfully balances competing concerns: speed vs. API compliance, simplicity vs. resilience, and immediate functionality vs. future extensibility.
