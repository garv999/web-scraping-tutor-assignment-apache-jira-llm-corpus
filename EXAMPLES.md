# Usage Examples

This document provides practical examples of using the Apache Jira Scraper.

## Basic Examples

### 1. Scrape Default Projects (Quick Start)

The simplest way to get started:

```bash
node src/cli.js scrape
```

This will scrape the three default projects: KAFKA, SPARK, and HADOOP with all their issues.

### 2. Scrape Specific Projects

Choose which projects to scrape:

```bash
node src/cli.js scrape CASSANDRA FLINK ZOOKEEPER
```

### 3. Limited Scraping (For Testing)

Scrape only a small number of issues for testing:

```bash
node src/cli.js scrape KAFKA --max-issues=100
```

This is useful for:
- Testing the scraper setup
- Quick data sampling
- Development and debugging

### 4. Resume Interrupted Scraping

If scraping is interrupted, resume from where it stopped:

```bash
node src/cli.js scrape KAFKA
```

The scraper automatically resumes from the last checkpoint. To start fresh:

```bash
node src/cli.js scrape KAFKA --no-resume
```

### 5. Export to JSONL

After scraping, export to training format:

```bash
# Export all scraped projects
node src/cli.js export

# Export specific projects
node src/cli.js export KAFKA SPARK

# Specify output directory
node src/cli.js export --output-dir=./training-data
```

### 6. Check Progress

Monitor scraping progress:

```bash
# Check single project
node src/cli.js status KAFKA

# Check multiple projects
node src/cli.js status KAFKA SPARK HADOOP
```

## Advanced Examples

### 7. Custom Batch Size

Adjust the number of issues fetched per API call:

```bash
# Smaller batches (more API calls, less memory)
node src/cli.js scrape KAFKA --batch-size=25

# Larger batches (fewer API calls, more memory)
node src/cli.js scrape KAFKA --batch-size=100
```

**Trade-offs:**
- Smaller batches: Lower memory usage, more frequent checkpoints, more API calls
- Larger batches: Higher memory usage, fewer checkpoints, fewer API calls

### 8. Combining Options

You can combine multiple options:

```bash
node src/cli.js scrape KAFKA --max-issues=500 --batch-size=50 --no-resume
```

### 9. Using NPM Scripts

The project includes npm scripts for convenience:

```bash
# Scrape (uses default projects)
npm run scrape

# Export
npm run export

# Check status
npm run status KAFKA
```

### 10. Verbose Logging

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=DEBUG node src/cli.js scrape KAFKA --max-issues=10
```

Log levels:
- `ERROR`: Only critical errors
- `WARN`: Warnings and errors
- `INFO`: General progress (default)
- `DEBUG`: Detailed request/response information

## Real-World Scenarios

### Scenario 1: Quick Prototyping

Quickly prototype with a small sample of Jira data:

```bash
# 1. Scrape small sample from multiple projects
node src/cli.js scrape KAFKA SPARK FLINK --max-issues=50

# 2. Export to JSONL
node src/cli.js export

# 3. Use the data
cat output/all_projects_training.jsonl
```

### Scenario 2: Production Dataset

You want to build a comprehensive training dataset:

```bash
# 1. Scrape all issues from selected projects (this will take time)
node src/cli.js scrape KAFKA SPARK HADOOP

# 2. Monitor progress in another terminal
node src/cli.js status KAFKA

# 3. Export each project separately for better organization
node src/cli.js export KAFKA SPARK HADOOP --output-dir=./production-data
```

### Scenario 3: Incremental Updates

You've already scraped data and want to update it:

```bash
# 1. The scraper automatically handles updates (upserts)
# Just run it again with resume enabled (default)
node src/cli.js scrape KAFKA

# 2. Re-export to get updated JSONL
node src/cli.js export KAFKA
```

### Scenario 4: Handling Errors

If scraping fails midway:

```bash
# 1. Check the status to see where it stopped
node src/cli.js status KAFKA

# Output will show:
# - Last position (pagination offset)
# - Total issues scraped
# - Error message (if any)

# 2. Simply re-run to resume
node src/cli.js scrape KAFKA

# The scraper will:
# - Resume from last checkpoint
# - Skip already scraped issues
# - Continue where it left off
```

### Scenario 5: Project Research

You want to analyze a specific project:

```bash
# 1. Scrape the project
node src/cli.js scrape CASSANDRA

# 2. Export to JSONL
node src/cli.js export CASSANDRA --output-dir=./cassandra-analysis

# 3. Analyze the data
# The JSONL file contains structured data you can process with:
# - Python (pandas, jsonlines)
# - jq for command-line analysis
# - Your own scripts
```

## Output Examples

### JSONL Structure

Each line in the JSONL file is a training example. Here's what they look like:

#### Summarization Task
```json
{
  "task_type": "summarization",
  "metadata": {
    "issue_key": "KAFKA-1234",
    "project": "KAFKA",
    "issue_type": "Bug",
    "status": "Resolved"
  },
  "instruction": "Summarize the following software issue in 2-3 sentences...",
  "input": "Issue: KAFKA-1234\nProject: Kafka\nType: Bug\n...",
  "output": "Issue KAFKA-1234 is a bug in the Kafka project affecting..."
}
```

#### Classification Task
```json
{
  "task_type": "classification",
  "metadata": {
    "issue_key": "KAFKA-1234",
    "project": "KAFKA"
  },
  "instruction": "Classify this software issue...",
  "input": "Title: Producer fails...\n\nDescription: When sending...",
  "output": {
    "issue_type": "Bug",
    "priority": "Major",
    "components": ["producer"],
    "labels": ["reliability"]
  }
}
```

### Stats File

Each export includes a stats file:

```json
{
  "totalIssues": 1523,
  "totalRecords": 6092,
  "outputPath": "./output/kafka_training.jsonl"
}
```

This tells you:
- How many Jira issues were processed
- How many training records were generated
- Where the output file is located

## Data Analysis Examples

### Count Records by Task Type

```bash
grep -o '"task_type":"[^" ]*"' output/kafka_training.jsonl | sort | uniq -c
```

Output:
```
300 "task_type":"classification"
250 "task_type":"discussion_analysis"
280 "task_type":"key_extraction"
300 "task_type":"question_answering"
300 "task_type":"summarization"
```

### Extract Specific Task Type

Using Python:

```python
import json

with open('output/kafka_training.jsonl', 'r') as f:
    for line in f:
        record = json.loads(line)
        if record['task_type'] == 'summarization':
            print(f"Issue: {record['metadata']['issue_key']}")
            print(f"Summary: {record['output']}\n")
```

### Check Issue Distribution

```bash
grep -o '"project":"[^" ]*"' output/all_projects_training.jsonl | sort | uniq -c
```

## Performance Tips

### 1. Start Small

Always test with a small dataset first:

```bash
node src/cli.js scrape KAFKA --max-issues=10
```

This helps you:
- Verify setup is correct
- Understand the output format
- Estimate time for full scrape

### 2. Monitor Progress

Use the status command to check progress without interrupting:

```bash
watch -n 10 'node src/cli.js status KAFKA'
```

This updates every 10 seconds.

### 3. Batch Size Selection

Choose batch size based on your situation:

- **Slow network**: Use smaller batches (25)
- **Good network**: Use default (50)
- **Excellent network**: Use larger batches (100)

### 4. Scrape During Off-Peak Hours

For large scrapes, run during off-peak hours to be nice to the Jira servers:

```bash
# Schedule for 2 AM
echo "node src/cli.js scrape KAFKA SPARK HADOOP" | at 02:00
```

## Troubleshooting Examples

### Issue: Rate Limiting

**Symptom**: Scraper keeps warning about 429 errors

**Solution**: The scraper handles this automatically, but you can be more conservative:

```bash
# Reduce batch size and let rate limiter work
node src/cli.js scrape KAFKA --batch-size=25
```

### Issue: Database Connection Error

**Symptom**: Error about Supabase connection

**Solution**: Check your .env file:

```bash
cat .env
# Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
```

### Issue: Large Memory Usage

**Symptom**: Node process using lots of memory

**Solution**: Reduce batch size and max issues:

```bash
node src/cli.js scrape KAFKA --batch-size=25 --max-issues=1000
```

### Issue: Want to Restart Completely

**Symptom**: Want to clear all data and start fresh

**Solution**:

```bash
# Note: This requires database access
# The scraper uses upsert, so simply re-running with --no-resume works
node src/cli.js scrape KAFKA --no-resume
```

## Integration Examples

### Using with Python

```python
import json

# Load JSONL data
def load_training_data(filepath):
    data = []
    with open(filepath, 'r') as f:
        for line in f:
            data.append(json.loads(line))
    return data

# Filter by task type
def get_task_type(data, task_type):
    return [r for r in data if r['task_type'] == task_type]

# Use it
data = load_training_data('output/kafka_training.jsonl')
summaries = get_task_type(data, 'summarization')

print(f"Loaded {len(data)} records")
print(f"Found {len(summaries)} summarization tasks")
```

### Using with Node.js

```javascript
import fs from 'fs';
import readline from 'readline';

async function processJSONL(filepath) {
  const fileStream = fs.createReadStream(filepath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const record = JSON.parse(line);
    // Process each record
    console.log(`${record.task_type}: ${record.metadata.issue_key}`);
  }
}

processJSONL('output/kafka_training.jsonl');
```

## Next Steps

After scraping and exporting:

1. **Validate the data**: Check a few records manually
2. **Split into train/val/test**: Create datasets for model training
3. **Use the JSONL files with your training pipeline**
4. **Iterate**: Based on results, you might want different task types or projects

For more details, see:
- [README.md](README.md) - Complete documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical deep dive
