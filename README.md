# Apache Jira Scraper

A lightweight, fault-tolerant **CLI tool** to fetch and transform public issue data from **Apache’s Jira instance** into structured **JSONL files** for analysis or model-ready datasets.

---

## 🔍 Overview

The scraper collects issues, comments, and metadata from **Apache Kafka**, **Spark**, and **Hadoop**, handling retries, pagination, and malformed data gracefully.  
Results are persisted to **Supabase** and exported as clean **JSONL corpora** for multiple task types — perfect for LLM fine-tuning or analytics.

---

## ⚙️ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Add Supabase credentials (optional)
VITE_SUPABASE_URL=https://<supabase>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# 3. Run a short scrape
node src/cli.js scrape --max-issues=5

# 4. Export structured data
node src/cli.js export KAFKA --output-dir=./output

```
                 ┌────────────────────────────────────────┐
                 │      CLI Interface(src/cli.js)         │
                 └────────────────────────────────────────┘
                                 │
                                 ▼
       ┌──────────────────────────────────────────────────────┐
       │            Jira API Client(jira-client.js)           │
       │                - Rate limiting                       │
       │                - Retry logic, Error handling         │
       └──────────────────────────────────────────────────────┘
                                 │
                                 ▼
       ┌──────────────────────────────────────────────────────┐
       │           Scraper Service(scraper.js)                │
       │  - SQLite checkpoint with resumable offsets          │
       │  - Batch processing and State checkpointing          │
       └──────────────────────────────────────────────────────┘
                                 │
                                 ▼
       ┌──────────────────────────────────────────────────────┐
       │         Text Formatter(text-formatter.js)            │
       │  - JSONL generation                                  │
       │  - Task creation(Summarization, Classification, Q&A) │
       └──────────────────────────────────────────────────────┘
                                 │
                                 ▼
       ┌──────────────────────────────────────────────────────┐
       │                    Output Files                      │
       │                  (*.jsonl + stats)                   │
       └──────────────────────────────────────────────────────┘

```
## 🧩 Core Components

| Module | Responsibility |
|:--------|:----------------|
| `jira-client.js` | Jira REST API wrapper with rate limiting, retries, and pagination |
| `scraper.js` | Batch scraping and checkpointing for resumability |
| `database.js` | Supabase persistence and upsert logic |
| `text-formatter.js` | Transforms raw data into structured JSONL training tasks |

---

## 📄 Output Format

Each `.jsonl` line = one structured training record with metadata and task type.

### **Supported Task Types**
- 📝 **Summarization** – summarize issue descriptions  
- 🏷️ **Classification** – identify issue type & priority  
- 💬 **Q&A** – generate question–answer pairs from issue context  
- 🧠 **Discussion Analysis** – extract insights from threaded comments  
- ⚙️ **Key Extraction** – extract technical entities and keywords  

### **Example Output Structure**
output/
├── kafka_training.jsonl
├── spark_training.jsonl
└── hadoop_training.jsonl


---

## 🛡️ Reliability & Edge Handling

- ✅ Retries on 429 / 5xx with **exponential backoff**
- 💾 **State checkpointing** for resumable scrapes
- 🧩 **Recursive ADF text extraction**
- ♻️ **Idempotent DB writes** (upsert by issue key)
- 🧯 **Graceful handling** of null / malformed data

---

## ⚡ Optimizations

- 🚀 Request batching (**50 issues per call**)
- ⏱️ Rate-limited queue (**10 req/s**)
- 📄 Streaming JSONL export (**low memory footprint**)
- 🔁 Incremental processing with saved scraper state

---

## 🧱 Tech Stack

- **Node.js** 18+  
- **Axios**, **p-queue**, **p-retry**  
- **Supabase** (PostgreSQL backend)  
- **JSONL** for efficient, streamable dataset export  

---

## 🧭 Future Improvements

- 🧵 Distributed scraping via **Redis queue**  
- 🕒 Incremental updates using `updated_since` filter  
- ☁️ Export formats: **Parquet**, **CSV**, **S3 upload**

---

## 📜 License

**MIT License**

---
