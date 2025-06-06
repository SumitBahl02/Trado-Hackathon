# 📡 TRADO × IIT Ropar Hackathon – Real-Time Market Data Ingestion (Task 1)

This is **Part 1** of the TRADO × IIT Ropar Hackathon, focused on building a system that ingests **real-time market data** from an **MQTT broker**, processes it, and stores it efficiently in a **PostgreSQL/TimescaleDB** database.

---

## 📌 Problem Statement

Develop a Node.js-based service that:

1. Connects to an MQTT broker streaming Indian stock market data.
2. Subscribes to **indices** (e.g., NIFTY, BANKNIFTY).
3. Calculates the **ATM (At-the-Money)** strike for each index.
4. Subscribes to **ATM ± 5 option strikes** for CE and PE legs.
5. Stores all LTP (Last Traded Price) updates in a TimescaleDB table.

---

## 🚀 Tech Stack

* **Node.js + TypeScript**
* **MQTT (via EMQX broker)**
* **PostgreSQL + TimescaleDB**
* **Protobuf decoding**
* **Modular architecture**

---

## ⚙️ Setup Instructions

### 1. Prerequisites

* Node.js v16+
* PostgreSQL with TimescaleDB extension
* MQTT enabled internet connection

### 2. Clone the Repository

```bash
https://github.com/SumitBahl02/Trado-Hackathon.git
cd hackathon-data-publisher
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment

Copy `.env.example` to `.env` and edit credentials:

```bash
cp .env.example .env
```

> **Note:** MQTT and PostgreSQL credentials are provided in the starter kit or `.env.example`.

### 5. Set Up the Database

```bash
createdb market_data
psql -d market_data -f scripts/db-schema.sql
```

Ensure TimescaleDB extension is enabled.

---

## 🧠 Functional Overview

### ✅ Index Subscription

Subscribes to real-time topics:

```
index/NIFTY
index/BANKNIFTY
index/FINNIFTY
index/MIDCPNIFTY
```

### 🔍 ATM Strike Logic

Strike rounded based on index:

| Index      | Round To |
| ---------- | -------- |
| NIFTY      | 50       |
| BANKNIFTY  | 100      |
| FINNIFTY   | 50       |
| MIDCPNIFTY | 25       |

### 🧾 Options Token Lookup

Queries the Trado API:

```
https://api.trado.trade/token?index=NIFTY&expiryDate=22-05-2025&optionType=ce&strikePrice=25000
```

### 📬 Option Subscription

Subscribes to:

```
index/NSE_FO|{token}
```

for ATM ± 5 strikes and both CE + PE options.

### 🗃️ Database Storage

Data is inserted into PostgreSQL in **batches**, normalized with `topics` and `ltp_data` tables:

```sql
CREATE TABLE topics (
  topic_id SERIAL PRIMARY KEY,
  topic_name TEXT NOT NULL UNIQUE,
  index_name TEXT,
  type TEXT,
  strike NUMERIC
);

CREATE TABLE ltp_data (
  id INTEGER NOT NULL,
  topic_id INTEGER REFERENCES topics(topic_id),
  ltp NUMERIC(10, 2) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, received_at)
);
```

---

## 📂 Project Structure

```
src/
├── config/                # App configuration
├── db/                   # DB connection + batch logic
├── mqtt/                 # MQTT handling & subscriptions
├── proto/                # MarketData protobuf schemas
├── utils/                # Strike rounding, decoding
└── index.ts              # App entry point
```

---

## 🧪 Sample Output (Logs)

```
Connected to MQTT broker
Subscribed to topic: index/NIFTY
ATM Strike for NIFTY: 24850
Subscribed to option topic: index/NSE_FO|49216
Saving to database: index/NSE_FO|49216, LTP: 321.5
Flushing 100 items to database...
Batch insert committed to database
```

---

## 💡 Tips

* Use `async/await` consistently.
* Use `batchInterval` and `batchSize` wisely for database throughput.
* Ensure MQTT and token API calls are **resilient to failure**.

---

## 👨‍💻 Author

Built by Sumit Bahl as part of the **TRADO × IIT Ropar Hackathon (Task 1)**.

---

## 📌 Task 2

Looking to test your strategy? Check out [Task 2 – Backtesting Engine](../task-2-backtest-engine/README.md).
