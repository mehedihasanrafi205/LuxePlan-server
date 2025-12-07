const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
var admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//? Middleware
app.use(express.json());
app.use(cors());

// MongoDB URI
const uri = process.env.URI;

// Create MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    console.log("Pinged your deployment. Successfully connected to MongoDB!");

    //?  collections
    const db = client.db("LuxePlan");
    const usersCollection = db.collection("users");
    const serviceCollection = db.collection("service");

    //? Users related Apis
    app.get("/users", async (req, res) => {
      const data = await usersCollection.find().toArray();
      res.send(data);
    });

    //? Service related Apis
    app.get("/service", async (req, res) => {
      const result = await serviceCollection.find().toArray();
      res.send(result);
    });
    app.post("/service", async (req, res) => {
      const serviceData = req.body;
      const result = await serviceCollection.insertOne(serviceData);
      res.send(result);
    });
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}
run();

// Root Route
app.get("/", (req, res) => {
  res.send("Hello World From Server!");
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
