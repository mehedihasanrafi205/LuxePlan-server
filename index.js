const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

// Firebase Admin setup
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.DOMAIN_URL,
    credentials: true,
  })
);

// MongoDB connection
const client = new MongoClient(process.env.URI, {
  serverApi: { version: ServerApiVersion.v1 },
});

async function run() {
  try {
    const db = client.db("LuxePlan");
    const usersCollection = db.collection("users");
    const serviceCollection = db.collection("service");
    const bookingsCollection = db.collection("bookings");
    const paymentCollection = db.collection("payments");

    console.log("Connected to MongoDB!");

    // USERS
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // SERVICES
    app.get("/services", async (req, res) => {
      const services = await serviceCollection.find().toArray();
      res.send(services);
    });

    app.get("/service/:id", async (req, res) => {
      const { id } = req.params;
      const service = await serviceCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(service);
    });

    app.post("/service", async (req, res) => {
      const result = await serviceCollection.insertOne(req.body);
      res.send(result);
    });

   
  } catch (err) {
    console.error("Server Error:", err);
  }
}

run();

app.get("/", (req, res) => res.send("LuxePlan Backend Running!"));
app.listen(port, () => console.log(`Server running on port ${port}`));
