# Quick Start Guide

Get up and running with the Apache Jira Scraper in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Internet connection

## Installation

```bash
# 1. Install dependencies
npm install
```

That's it! The database is already configured.

## Usage

### Test the Scraper (Recommended First Step)

Start with a small sample to verify everything works:

```bash
# Scrape 10 issues from Kafka
node src/cli.js scrape KAFKA --max-issues=10
```

Expected output:
```
[INFO] Starting scrape for project: KAFKA
[INFO] Processing batch: 0 to 50 of 18584
[INFO] Completed scraping project KAFKA. Total issues: 10
✓ KAFKA: 10 issues scraped
```

### Export to JSONL

```bash
# Export the scraped data
node src/cli.js export KAFKA
```

Expected output:
```
✓ KAFKA: 43 records from 10 issues
  Output: output/kafka_training.jsonl
```

### View the Results

```bash
# Check the output
ls -lh output/

# View first line of JSONL
head -n 1 output/kafka_training.jsonl
```

### Check Status

```bash
# See scraping progress
node src/cli.js status KAFKA
```

Expected output:
```
Project: KAFKA
Status: completed
Issues Scraped: 10
```

## Next Steps

### Scrape More Data

```bash
# Scrape default projects (KAFKA, SPARK, HADOOP)
node src/cli.js scrape

# Or scrape specific projects with more issues
node src/cli.js scrape CASSANDRA FLINK --max-issues=500

# Export everything
node src/cli.js export
```

### Customize

```bash
# Adjust batch size
node src/cli.js scrape KAFKA --batch-size=25

# Enable debug logging
LOG_LEVEL=DEBUG node src/cli.js scrape KAFKA --max-issues=5

# Start fresh (ignore saved state)
node src/cli.js scrape KAFKA --no-resume
```

## Troubleshooting

### Issue: "Module not found"
**Solution**: Run `npm install`

### Issue: "Database error"
**Solution**: Check `.env` file exists with Supabase credentials

### Issue: "Rate limited"
**Solution**: The scraper handles this automatically - just wait

### Issue: Network error
**Solution**: Check internet connection, scraper will resume when connection restored

## Understanding the Output

Each JSONL file contains structured training examples:

```json
{
  "task_type": "summarization",
  "metadata": {
    "issue_key": "KAFKA-1",
    "project": "KAFKA"
  },
  "instruction": "Summarize the following software issue...",
  "input": "Issue details here...",
  "output": "Summary here..."
}
```

**Task Types**:
- `summarization`: Issue summaries
- `classification`: Issue type/priority classification
- `question_answering`: Q&A pairs about issues
- `discussion_analysis`: Comment thread analysis
- `key_extraction`: Technical term extraction

## Full Documentation

- **README.md**: Complete documentation
- **EXAMPLES.md**: More usage examples
- **ARCHITECTURE.md**: Technical details
- **EDGE_CASES.md**: Error handling

## Support

Run `node src/cli.js help` for command reference.

---

**Ready to scrape? Start with the test command above! 🚀**
