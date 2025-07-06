// src/lib/mongodb.ts
import { MongoClient, Db } from 'mongodb';

// Ensure MONGODB_URI and MONGODB_DB are defined in your .env.local
const uri: string | undefined = process.env.MONGODB_URI;
const dbName: string | undefined = process.env.MONGODB_DB;

if (!uri) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

if (!dbName) {
  throw new Error('Please define the MONGODB_DB environment variable inside .env.local');
}

// Cached connection to reuse across requests
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Connects to the MongoDB database.
 * Reuses an existing connection if available.
 * @returns {Promise<{client: MongoClient, db: Db}>} The connected MongoClient and Db instance.
 */
export async function connectToDatabase() {
  // If a connection is already cached, return it
  if (cachedClient && cachedDb) {
    console.log('Using cached MongoDB connection.');
    return { client: cachedClient, db: cachedDb };
  }

  // If no connection is cached, create a new one
  console.log('Establishing new MongoDB connection...');
  const client = new MongoClient(uri as string); // Assert uri as string since we checked it
  await client.connect();

  const db = client.db(dbName as string); // Assert dbName as string

  // Cache the new connection
  cachedClient = client;
  cachedDb = db;

  console.log('MongoDB connected successfully.');
  return { client, db };
}

// Optional: Graceful shutdown if running in a non-serverless environment (e.g., local development server)
// In Vercel serverless functions, connections are typically managed automatically per invocation
// but for local dev, this can help.
// process.on('SIGINT', async () => {
//   if (cachedClient) {
//     await cachedClient.close();
//     console.log('MongoDB connection closed.');
//   }
//   process.exit(0);
// });