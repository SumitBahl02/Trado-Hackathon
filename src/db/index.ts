import { Pool } from "pg";
import { config } from "../config";

// Define a type for batch items
export interface BatchItem {
  topic: string;
  ltp: number;
  indexName?: string;
  type?: string;
  strike?: number;
}

// Global database connection pool
let pool: Pool;
// Stores incoming data temporarily before flushing to DB
let dataBatch: BatchItem[] = [];
// Timer for scheduled flushing
let batchTimer: NodeJS.Timeout | null = null;

// Cache for topic_name -> topic_id to avoid repeated DB lookups
const topicCache = new Map<string, number>();

// 🔧 Initialize a new PostgreSQL connection pool using env-configured settings
export function createPool(): Pool {
  return new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  });
}

// Run this once at app start to preload existing topics from DB into memory
export async function initialize(dbPool: Pool) {
  pool = dbPool;
  console.log("Database initialized");

  // Load all existing topics into the topicCache
  const result = await pool.query("SELECT topic_id, topic_name FROM topics");
  result.rows.forEach((row) => {
    topicCache.set(row.topic_name, row.topic_id); // cache {topic_name: topic_id}
  });
}

// Resolve topic_id either from cache, DB, or insert a new one
export async function getTopicId(
  topicName: string,
  indexName?: string,
  type?: string,
  strike?: number
): Promise<number> {
  //  Lookup in in-memory cache
  if (topicCache.has(topicName)) {
    return topicCache.get(topicName)!;
  }

  // If not cached, check database
  const checkRes = await pool.query(
    `SELECT topic_id FROM topics WHERE topic_name = $1`,
    [topicName]
  );
  if (checkRes.rowCount! > 0) {
    const topicId = checkRes.rows[0].topic_id;
    topicCache.set(topicName, topicId); // cache it
    return topicId;
  }

  // If not in DB, insert new topic
  const insertRes = await pool.query(
    `INSERT INTO topics (topic_name, index_name, type, strike) VALUES ($1, $2, $3, $4) RETURNING topic_id`,
    [topicName, indexName || null, type || null, strike || null]
  );

  const newTopicId = insertRes.rows[0].topic_id;
  topicCache.set(topicName, newTopicId); // cache the newly added topic
  return newTopicId;
}

//  Called whenever a new LTP is received
export function saveToDatabase(
  topic: string,
  ltp: number,
  indexName?: string,
  type?: string,
  strike?: number
) {
  // Add the item to the batch array
  dataBatch.push({ topic, ltp, indexName, type, strike });

  // If batch size is reached, flush it immediately
  if (dataBatch.length >= config.app.batchSize) {
    flushBatch(); // triggers immediate DB insert
    return;
  }

  // If timer is not running, start one (for time-based flush)
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      flushBatch();
    }, config.app.batchInterval);
  }
}

// Flush all batched items to the database
export async function flushBatch() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (dataBatch.length === 0) {
    return;
  }

  console.log(`Flushing ${dataBatch.length} items to database...`);
  const dataToFlush = [...dataBatch]; 
  dataBatch = []; // reset the batch
  const client = await pool.connect();
  try {
    // Use transaction for consistency
    await client.query("BEGIN");

    for (const item of dataToFlush) {
      const topicId = await getTopicId(
        item.topic,
        item.indexName,
        item.type,
        item.strike
      );
      await client.query(
        `INSERT INTO ltp_data (topic_id, ltp, received_at) VALUES ($1, $2, NOW())`,
        [topicId, item.ltp]
      );
    }

    await client.query("COMMIT");
    console.log("Batch insert committed to database");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to flush batch:", err);
  } finally {
    client.release();
  }
}

// Final cleanup before app exits
export async function cleanupDatabase() {
  // Flush remaining unflushed items
  if (dataBatch.length > 0) {
    await flushBatch();
  }
  // Gracefully close the DB connection pool
  if (pool) {
    await pool.end();
  }
  console.log("Database cleanup completed");
}
