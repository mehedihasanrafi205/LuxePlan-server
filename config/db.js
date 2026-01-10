const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const client = new MongoClient(process.env.URI, {
  serverApi: { version: ServerApiVersion.v1 },
});

let db;

const connectDB = async () => {
  if (db) return db;
  try {
    await client.connect();
    db = client.db("LuxePlan");
    console.log("Connected to MongoDB!");
    return db;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const getDb = () => {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB first.");
  }
  return db;
};

module.exports = { connectDB, getDb, client };
