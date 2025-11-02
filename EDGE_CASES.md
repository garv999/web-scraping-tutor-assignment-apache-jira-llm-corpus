# Edge Cases & Error Handling Documentation

This document provides a comprehensive overview of all edge cases handled by the Apache Jira Scraper and the strategies used to address them.

## Table of Contents

1. [Network & API Errors](#network--api-errors)
2. [Data Quality Issues](#data-quality-issues)
3. [System & Resource Issues](#system--resource-issues)
4. [Business Logic Edge Cases](#business-logic-edge-cases)
5. [Testing Edge Cases](#testing-edge-cases)

## Network & API Errors

### 1. Rate Limiting (HTTP 429)

**Scenario**: API returns "Too Many Requests"

**Detection**:
```javascript
if (error.response.status === 429) {
  // Rate limited
}
```

**Handling**:
1. Extract `Retry-After` header from response
2. Wait for specified duration (default: 60 seconds if header missing)
3. Automatically retry the request
4. Log warning with wait time

**Recovery**: Automatic with no data loss

**Example Log**:
```
[WARN] Rate limited (429). Waiting 60000ms before retry
```

**Test Case**:
```bash
# Trigger by making many rapid requests
# The scraper handles this automatically
```

---

### 2. Server Errors (HTTP 5xx)

**Scenario**: Jira server experiencing issues (500, 502, 503, 504)

**Detection**:
```javascript
if (error.response.status >= 500) {
  // Server error
}
```

**Handling**:
1. Retry with exponential backoff
2. Delays: 1s, 2s, 4s, 8s, 16s (up to 5 retries)
3. Log each retry attempt
4. Abort after max retries

**Recovery**: Usually transient - retries successful

**Example Log**:
```
[WARN] Server error (503). Retrying...
[WARN] Request attempt 2 failed. 3 retries left.
```

---

### 3. Timeout Errors

**Scenario**: Network slow or request hangs

**Detection**:
```javascript
if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
  // Timeout
}
```

**Handling**:
1. Default timeout: 30 seconds per request
2. Retry with exponential backoff
3. Increase timeout on retry (implicit in retry logic)

**Configuration**:
```javascript
axiosInstance = axios.create({
  timeout: 30000  // 30 seconds
});
```

**Recovery**: Retry usually succeeds if network stabilizes

---

### 4. Connection Refused / Network Down

**Scenario**: Internet connection lost or Jira server unreachable

**Detection**:
```javascript
if (error.code === 'ECONNREFUSED' || error.code === 'ENETUNREACH') {
  // Connection error
}
```

**Handling**:
1. Retry with exponential backoff
2. After max retries, fail and save state
3. User can resume when connection restored

**Recovery**: Manual - user restarts scraper when network available

**Example**:
```bash
# Check status after network restored
node src/cli.js status KAFKA

# Resume scraping
node src/cli.js scrape KAFKA
```

---

### 5. DNS Resolution Failures

**Scenario**: Cannot resolve issues.apache.org

**Detection**:
```javascript
if (error.code === 'ENOTFOUND') {
  // DNS error
}
```

**Handling**:
1. Classified as permanent error
2. No retry (DNS unlikely to resolve quickly)
3. Log error and abort
4. State saved for later retry

**Recovery**: Manual - fix DNS configuration and restart

---

### 6. Resource Not Found (HTTP 404)

**Scenario**: Specific project or issue doesn't exist

**Detection**:
```javascript
if (error.response.status === 404) {
  // Not found
}
```

**Handling**:
1. Return `null` instead of throwing error
2. Log warning
3. Continue processing (don't retry)

**Impact**:
- For projects: Scraping aborts for that project
- For issues: Issue skipped, batch continues

**Example Log**:
```
[WARN] Resource not found (404): /rest/api/2/project/INVALID
```

---

### 7. Client Errors (HTTP 4xx, excluding 404 & 429)

**Scenario**: Bad request, unauthorized, forbidden, etc.

**Detection**:
```javascript
if (error.response.status >= 400 && error.response.status < 500) {
  // Client error (not 404 or 429)
}
```

**Handling**:
1. Classified as permanent error (don't retry)
2. Log error with details
3. Abort retry chain
4. Continue with next item

**Recovery**: Manual - fix request parameters

---

## Data Quality Issues

### 8. Missing Required Fields

**Scenario**: Issue doesn't have expected fields

**Example**: Issue without summary, description, or reporter

**Handling**:
```javascript
summary: fields.summary || '',
description: this.extractText(fields.description) || '',
reporter: fields.reporter?.displayName || null,
assignee: fields.assignee?.displayName || null
```

**Strategy**:
- Use default values (empty string, null, empty array)
- Never fail due to missing optional fields
- Only summary is truly required (Jira enforces this)

**Impact**: Training data includes all available information

---

### 9. Malformed JSON

**Scenario**: API returns invalid JSON

**Detection**:
```javascript
try {
  const data = JSON.parse(response.body);
} catch (error) {
  // Malformed JSON
}
```

**Handling**:
1. Axios handles JSON parsing automatically
2. If parsing fails, caught by try-catch
3. Logged as error
4. Request retried (might be transient corruption)

**Recovery**: Retry usually succeeds

---

### 10. Empty Responses

**Scenario**: API returns null or empty data

**Detection**:
```javascript
if (!searchResult || !searchResult.issues || searchResult.issues.length === 0) {
  hasMore = false;
  break;
}
```

**Handling**:
1. Check for null/undefined at each level
2. Treat as end of pagination
3. Don't crash, just stop processing

**Impact**: Scraper completes normally

---

### 11. Atlassian Document Format (ADF)

**Scenario**: Descriptions stored as nested JSON objects instead of plain text

**Example**:
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "The actual description" }
      ]
    }
  ]
}
```

**Handling**:
```javascript
extractTextFromADF(node) {
  if (!node) return '';
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(child => this.extractTextFromADF(child)).join('\n');
  }
  return '';
}
```

**Strategy**:
- Recursive traversal of ADF tree
- Extract all text nodes
- Preserve paragraph breaks with newlines
- Fallback to empty string if parsing fails

**Impact**: Clean text extraction for downstream training and analysis

---

### 12. Very Long Descriptions

**Scenario**: Issue descriptions with 50,000+ characters

**Handling**:
1. **Storage**: No truncation - store complete text
2. **Export**: Selective truncation for specific tasks
   - Key extraction: First 1000 chars
   - Classification: First 500 chars
   - Full context in other tasks

**Strategy**:
```javascript
// In classification task
input: `${baseRecord.summary}\n\n${baseRecord.description.substring(0, 500)}`
```

**Rationale**: Balance between context and token limits

---

### 13. Special Characters & Unicode

**Scenario**: Descriptions with emoji, CJK characters, special symbols

**Examples**:
- Emoji: 🚀 💥 ✨
- CJK: 中文, 日本語, 한국어
- Symbols: ← → ✓ ✗

**Handling**:
1. PostgreSQL stores as UTF-8 natively
2. Node.js handles Unicode correctly
3. JSON.stringify preserves Unicode
4. No special encoding needed

**Test Cases**:
- Tested with various Unicode characters
- No corruption or data loss
- JSONL remains valid

---

### 14. Null vs. Empty String vs. Missing

**Scenario**: Fields can be null, empty string, or undefined

**Handling Strategy**:
```javascript
// Use explicit defaults
reporter: fields.reporter?.displayName || null,  // null if missing
labels: fields.labels || [],                     // empty array if missing
description: this.extractText(fields.description) || '',  // empty string if missing
```

**Database Schema**:
```sql
-- Nullable fields explicitly allow null
assignee text,  -- NULL allowed

-- Non-nullable with defaults
labels text[] DEFAULT ARRAY[]::text[],  -- Empty array
```

**Impact**: Consistent data structure for ML training

---

### 15. Issues Without Comments

**Scenario**: Issue has no comments

**Detection**:
```javascript
if (fields.comment?.comments && fields.comment.comments.length > 0) {
  // Has comments
} else {
  // No comments
}
```

**Handling**:
1. Don't create discussion analysis task
2. Still create other tasks (summarization, classification, Q&A)
3. No error or warning needed

**Impact**: Reduced training examples (3-4 instead of 5 per issue)

---

### 16. Duplicate Issues

**Scenario**: Same issue encountered twice (resume, re-scrape, etc.)

**Handling**:
```javascript
// Database level
CREATE UNIQUE INDEX ON issues(issue_key);

// Application level
.upsert(data, { onConflict: 'issue_key' })
```

**Strategy**:
- Upsert operation updates existing records
- No duplicate data in database
- Idempotent scraping

**Impact**: Safe to re-run scraper without duplicates

---

## System & Resource Issues

### 17. Insufficient Disk Space

**Scenario**: Disk full during export

**Detection**:
```javascript
try {
  await fs.writeFile(path, content);
} catch (error) {
  if (error.code === 'ENOSPC') {
    // Disk full
  }
}
```

**Handling**:
1. Error propagated to user
2. Partial file may exist (invalid JSONL)
3. User must free space and retry

**Prevention**:
- Stream writes (constant memory)
- Check available space before large operations (future enhancement)

**Recovery**: Manual - free disk space and re-export

---

### 18. Database Connection Loss

**Scenario**: Supabase connection interrupted

**Detection**:
```javascript
if (error.message.includes('connection')) {
  // Database connection issue
}
```

**Handling**:
1. Error thrown immediately
2. State preserved at last successful batch
3. Scraper stops cleanly

**Recovery**:
```bash
# Check status
node src/cli.js status KAFKA

# Resume when connection restored
node src/cli.js scrape KAFKA
```

**Impact**: No data loss - resume from checkpoint

---

### 19. Out of Memory

**Scenario**: Node.js heap exhausted

**Detection**:
```javascript
// Node will throw automatically
// Error: JavaScript heap out of memory
```

**Handling**:
1. Use streaming for large datasets
2. Batch processing limits memory usage
3. Database handles large data storage

**Prevention**:
```javascript
// Process in batches
for (const issue of issues) {
  await processIssue(issue);
  // Memory freed after each issue
}

// Not: const allIssues = await fetchAll(); // Loads everything
```

**Mitigation**: Reduce batch size if needed

---

### 20. Process Termination (SIGINT, SIGTERM)

**Scenario**: User presses Ctrl+C or system kills process

**Handling**:
1. State saved after each batch (automatic checkpointing)
2. Last batch saved to database
3. Resume from last checkpoint on restart

**Example**:
```bash
# User presses Ctrl+C
^C
# Scraper stops

# Resume
node src/cli.js scrape KAFKA
# Continues from last batch
```

**Data Loss**: At most one batch (50 issues by default)

---

## Business Logic Edge Cases

### 21. Project with Zero Issues

**Scenario**: Valid project but no issues

**Detection**:
```javascript
if (searchResult.total === 0) {
  // No issues
}
```

**Handling**:
1. Complete normally
2. Mark as completed with 0 issues
3. No error

**Impact**: Empty project in database, no export data

---

### 22. Issue Type Variations

**Scenario**: Different projects use different issue types

**Examples**:
- Standard: Bug, Feature, Improvement, Task
- Custom: Epic, Story, Sub-task, Technical Debt

**Handling**:
1. Store actual issue type as-is
2. No validation or normalization
3. Classification task preserves original type

**Strategy**: Flexible schema accommodates all types

---

### 23. Missing Timestamps

**Scenario**: Issue without created/updated dates

**Handling**:
```javascript
created_date: fields.created || null,
updated_date: fields.updated || null,
resolved_date: fields.resolutiondate || null
```

**Database**:
```sql
-- Nullable timestamp columns
created_date timestamptz,
updated_date timestamptz
```

**Impact**: Timestamps included when available, null otherwise

---

### 24. Circular References in Comments

**Scenario**: Comments referencing other comments

**Handling**:
1. Store comments as flat list
2. Don't attempt to reconstruct thread hierarchy
3. Preserve chronological order

**Impact**: Comment threads flattened for simplicity

---

### 25. Very Old Issues (2000s era)

**Scenario**: Issues from early 2000s with different formats

**Handling**:
1. API normalizes old formats
2. Some fields may be null (acceptable)
3. Description formats may vary (ADF extraction handles this)

**Example**: SPARK-1 from 2013 - processed successfully

**Impact**: Historical data included in training set

---

### 26. Pagination Edge Cases

#### 26.1. Total Count Changes During Scraping

**Scenario**: New issues created while scraping

**Handling**:
1. Use startAt + maxResults, not page numbers
2. Total count is informational only
3. Scrape until no more results

**Impact**: May miss or duplicate recent issues (acceptable for large datasets)

#### 26.2. Last Page Partial

**Scenario**: Last page has fewer than maxResults

**Handling**:
```javascript
if (searchResult.issues.length < batchSize) {
  // Likely last page
}
```

**Strategy**: Normal processing, loop exits when no more results

---

### 27. Comments Without Body

**Scenario**: Comment exists but has no text

**Handling**:
```javascript
body: this.extractText(comment.body) || ''
```

**Impact**: Empty string stored, no error

---

### 28. Labels and Components as Arrays

**Scenario**: Fields that can have 0, 1, or many values

**Handling**:
```javascript
// Database
labels text[] DEFAULT ARRAY[]::text[],

// Processing
labels: fields.labels || [],
components: fields.components?.map(c => c.name) || []
```

**Strategy**: Always use arrays for consistency

---

## Testing Edge Cases

### Manual Test Cases

#### Test 1: Network Interruption
```bash
# Start scraping
node src/cli.js scrape KAFKA

# Disconnect network
# Scraper will fail after retries

# Reconnect network
# Resume
node src/cli.js scrape KAFKA
```

**Expected**: Resume from last checkpoint

---

#### Test 2: Rate Limiting
```bash
# Use small batch size to trigger more requests
node src/cli.js scrape KAFKA --batch-size=10
```

**Expected**: Automatic handling with delays

---

#### Test 3: Invalid Project
```bash
node src/cli.js scrape INVALID_PROJECT
```

**Expected**: 404 error, graceful failure

---

#### Test 4: Partial Scrape
```bash
# Scrape limited issues
node src/cli.js scrape KAFKA --max-issues=50

# Try to resume (should be complete)
node src/cli.js scrape KAFKA

# Export
node src/cli.js export KAFKA
```

**Expected**: Completes, doesn't re-scrape

---

#### Test 5: Multiple Projects
```bash
# One valid, one invalid
node src/cli.js scrape KAFKA INVALID SPARK
```

**Expected**: KAFKA succeeds, INVALID fails, SPARK succeeds

---

### Automated Test Scenarios (Future)

These test cases should be automated in a test suite:

1. **Unit Tests**
   - ADF text extraction with various formats
   - Error classification (429, 5xx, 4xx)
   - Retry logic with mock failures
   - JSONL generation from sample data

2. **Integration Tests**
   - Database upsert behavior
   - State management and resumption
   - API client with mock server
   - End-to-end scraping with test data

3. **Stress Tests**
   - Large number of issues (10,000+)
   - Very long descriptions (100KB+)
   - High concurrency requests
   - Memory usage under load

---

## Error Recovery Flowchart

```
┌─────────────────┐
│  Error Occurs   │
└────────┬────────┘
         │
         ▼
   ┌─────────────┐
   │ Classify    │
   │ Error Type  │
   └──┬──┬──┬───┘
      │  │  │
      │  │  └─────────────┐
      │  │                │
      ▼  ▼                ▼
   Network  Data    System
   Error    Error   Error
      │       │        │
      ▼       ▼        ▼
   Retry?  Log &    Abort &
            Skip    Save State
      │       │        │
   Yes│No     │        │
      │  │    │        │
      ▼  ▼    ▼        ▼
   Retry Abort Continue Exit
   With  Retry & Next   Cleanly
   Backoff     Item
      │
      └──> Max Retries? ──Yes──> Abort & Save State
              │
              No
              │
              └──> Continue Retrying
```

## Summary

The Apache Jira Scraper is designed with comprehensive error handling that:

1. **Recovers Automatically**: Network errors, rate limiting, server errors
2. **Fails Gracefully**: Invalid input, missing data, system issues
3. **Preserves State**: Checkpoint after every batch for resumability
4. **Logs Comprehensively**: Detailed logging at appropriate levels
5. **Handles Edge Cases**: Unicode, empty data, duplicates, malformed content

The system prioritizes **data integrity** and **fault tolerance** over speed, ensuring reliable operation even in adverse conditions.
