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

    // BOOKINGS
    app.get("/bookings", async (req, res) => {
      const { serviceId, date, email } = req.query;
      const query = {};
      if (serviceId) query.serviceId = serviceId;
      if (date) query.date = date;
      if (email) query.userEmail = email;

      const bookings = await bookingsCollection.find(query).toArray();
      res.json(bookings);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      booking.status = "pending";
      booking.paymentStatus = "unpaid";
      booking.createdAt = new Date();

      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.delete("/bookings/:id", async (req, res) => {
      const { id } = req.params;
      const result = await bookingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // STRIPE CHECKOUT SESSION
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const info = req.body;
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "BDT",
                product_data: { name: info.service_name },
                unit_amount: parseInt(info.cost) * 100,
              },
              quantity: 1,
            },
          ],
          customer_email: info.email,
          mode: "payment",
          metadata: {
            bookingId: info.bookingId,
            serviceId: info.serviceId,
            service_name: info.service_name,
            email: info.email,
            date: info.date,
            time: info.time,
            location: info.location,
            cost: info.cost,
          },
          success_url: `${process.env.DOMAIN_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.DOMAIN_URL}/service/${info.serviceId}`,
        });

        res.send({ url: session.url });
      } catch (err) {
        console.error("Stripe Session Error:", err);
        res.status(500).send({ error: "Failed to create payment session" });
      }
    });

    // PAYMENT SUCCESS
    app.patch("/payment-success", async (req, res) => {
      try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const transactionId = session.payment_intent;
        const existingPayment = await paymentCollection.findOne({
          transactionId,
        });

        if (existingPayment) {
          return res.send({
            message: "Payment already recorded",
            success: true,
            paymentInfo: existingPayment,
          });
        }

        if (session.payment_status === "paid") {
          const bookingId = session.metadata.bookingId;

          await bookingsCollection.updateOne(
            { _id: new ObjectId(bookingId) },
            { $set: { paymentStatus: "paid" } }
          );

          const payment = {
            amount: session.amount_total / 100,
            currency: session.currency,
            customer_email: session.customer_email,
            serviceId: session.metadata.serviceId,
            serviceName: session.metadata.service_name,
            transactionId,
            paymentStatus: session.payment_status,
            paidAt: new Date(),
          };

          const paymentResult = await paymentCollection.insertOne(payment);
          const insertedPayment = await paymentCollection.findOne({
            _id: paymentResult.insertedId,
          });

          return res.send({ success: true, paymentInfo: insertedPayment });
        }

        res.send({ success: false });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: err.message });
      }
    });

    // GET PAYMENTS
    app.get("/payments", async (req, res) => {
      const { email } = req.query;
      if (!email) return res.status(400).json({ message: "Email required" });

      const payments = await paymentCollection
        .find({ customer_email: email })
        .sort({ paidAt: -1 })
        .toArray();

      res.send(payments);
    });
  } catch (err) {
    console.error("Server Error:", err);
  }
}

run();

app.get("/", (req, res) => res.send("LuxePlan Backend Running!"));
app.listen(port, () => console.log(`Server running on port ${port}`));
