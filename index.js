const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 4000;

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
app.use(cors({ origin: process.env.DOMAIN_URL, credentials: true }));

// JWT Middleware
const verifyFBToken = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    console.error("Firebase verify error:", err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

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
    const decoratorCollection = db.collection("decorator");

    console.log("Connected to MongoDB!");

    // Role Middleware //
    const verifyAdmin = async (req, res, next) => {
      const email = req.tokenEmail;
      if (!email)
        return res.status(401).send({ message: "Unauthorized Access!" });

      const user = await usersCollection.findOne({ email });

      if (user.role !== "admin") {
        return res
          .status(403)
          .send({ message: "Admin only actions", role: user?.role });
      }

      next();
    };
    const verifyDecorator = async (req, res, next) => {
      const email = req.tokenEmail;
      if (!email)
        return res.status(401).send({ message: "Unauthorized Access!" });

      const user = await usersCollection.findOne({ email });

      if (user.role !== "decorator") {
        return res
          .status(403)
          .send({ message: "Decorators only actions", role: user?.role });
      }

      next();
    };

    // ====== USERS ======

    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const adminEmail = req.tokenEmail;
      const result = await usersCollection
        .find({ email: { $ne: adminEmail } })
        .toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const userData = req.body;
      const now = new Date().toISOString();
      userData.createdAt = now;
      userData.lastLogin = now;
      userData.role = "client";

      const query = { email: userData.email };
      const alreadyExist = await usersCollection.findOne(query);

      if (alreadyExist) {
        const result = await usersCollection.updateOne(query, {
          $set: { lastLogin: now },
        });
        return res.send(result);
      }

      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    app.patch("/users/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;

      const filter = { _id: new ObjectId(id) };
      const update = { $set: { role: role } };

      const result = await usersCollection.updateOne(filter, update);
      res.send(result);
    });

    app.get("/user/role", verifyFBToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.tokenEmail });
      res.send({ role: user?.role || "client" });
    });

    // ====== SERVICES ======
    app.get("/services", async (req, res) => {
      const { search, category, minBudget, maxBudget } = req.query;

      const query = {};

      if (search) {
        query.service_name = { $regex: search, $options: "i" };
      }

      if (category && category !== "all") {
        query.service_category = category;
      }

      if (minBudget || maxBudget) {
        query.cost = {};
        if (minBudget) query.cost.$gte = parseFloat(minBudget);
        if (maxBudget) query.cost.$lte = parseFloat(maxBudget);
      }

      const services = await serviceCollection.find(query).toArray();
      res.send(services);
    });

    app.get("/services/top-rated", async (req, res) => {
      const topServices = await serviceCollection
        .find()
        .sort({ ratings: -1 })
        .limit(4)
        .toArray();

      res.send(topServices);
    });

    app.get("/service/:id", async (req, res) => {
      const { id } = req.params;
      const service = await serviceCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(service);
    });

    app.post("/service", verifyFBToken, async (req, res) => {
      const result = await serviceCollection.insertOne(req.body);
      res.send(result);
    });

    app.put("/service/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      const result = await serviceCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    app.delete("/service/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await serviceCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // ====== BOOKINGS ======
    app.get("/bookings", verifyFBToken, async (req, res) => {
      const { serviceId, date, email } = req.query;
      const query = {};
      if (serviceId) query.serviceId = serviceId;
      if (date) query.date = date;
      if (email) query.userEmail = email;

      const bookings = await bookingsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(bookings);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      booking.status = "pending";
      booking.paymentStatus = "unpaid";
      booking.createdAt = new Date();

      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get(
      "/bookings/assigned",
      verifyFBToken,
      verifyDecorator,
      async (req, res) => {
        const { decoratorEmail, status } = req.query;
        const query = {};
        if (decoratorEmail) {
          query.decoratorEmail = decoratorEmail;
        }
        if (status !== "parcel-delivered") {
          query.status = { $nin: ["completed"] };
        } else {
          query.status = status;
        }

        const cursor = bookingsCollection.find(query);

        const result = await cursor.toArray();
        res.send(result);
      }
    );

    app.patch(
      "/bookings/:id/assigned",
      verifyFBToken,
      verifyDecorator,
      async (req, res) => {
        const { id } = req.params;
        const { status, decoratorId } = req.body;

        const query = { _id: new ObjectId(id) };

        // Update booking status + decoratorId
        const updatedDoc = {
          $set: {
            status,
            decoratorId,
          },
        };

        // First update booking
        const result = await bookingsCollection.updateOne(query, updatedDoc);

        // ---- Update Decorator Work Status ----
        const decoratorQuery = { _id: new ObjectId(decoratorId) };
        let decoratorUpdatedDoc = null;

        if (status === "planning") {
          decoratorUpdatedDoc = { $set: { workStatus: "working" } };
        }

        if (status === "completed") {
          decoratorUpdatedDoc = { $set: { workStatus: "available" } };
        }

        // Only update decorator if needed
        if (decoratorUpdatedDoc) {
          await decoratorCollection.updateOne(
            decoratorQuery,
            decoratorUpdatedDoc
          );
        }

        res.send({ success: true, result });
      }
    );

    app.get("/booking/completed", async (req, res) => {
      const { decoratorEmail } = req.query;

      const query = {
        decoratorEmail,
        status: "completed",
      };

      const cursor = bookingsCollection.find(query).sort({ date: -1 });
      const result = await cursor.toArray();

      res.send(result);
    });

    app.put("/bookings/:id", async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    app.delete("/bookings/:id", async (req, res) => {
      const { id } = req.params;
      const result = await bookingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.patch("/bookings/:id/assign", async (req, res) => {
      const bookingId = req.params.id;
      const { decoratorEmail, decoratorName, decoratorId } = req.body;
      const query = { _id: new ObjectId(bookingId) };
      const updatedDoc = {
        $set: {
          status: "assigned",
          decoratorId: decoratorId,
          decoratorName: decoratorName,
          decoratorEmail: decoratorEmail,
        },
      };
      const result = await bookingsCollection.updateOne(query, updatedDoc);

      // decorator info
      const decoratorQuery = { _id: new ObjectId(decoratorId) };
      const decoratorUpdatedDoc = {
        $set: {
          workStatus: "assigned",
        },
      };
      decoratorResult = await decoratorCollection.updateOne(
        decoratorQuery,
        decoratorUpdatedDoc
      );
      res.send(decoratorResult);
    });

    app.get("/bookings/today", async (req, res) => {
      const { decoratorEmail } = req.query;
      if (!decoratorEmail)
        return res.status(400).send({ message: "Decorator email required" });

      const today = new Date();
      today.setHours(0, 0, 0, 0); // start of day
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1); // start of next day

      const query = {
        decoratorEmail,
        date: { $gte: today.toISOString(), $lt: tomorrow.toISOString() },
        status: { $ne: "completed" },
      };

      const projects = await bookingsCollection
        .find(query)
        .sort({ time: 1 })
        .toArray();
      res.send(projects);
    });

    // ====== STRIPE CHECKOUT ======
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
          customer_email: info.userEmail,
          mode: "payment",
          metadata: {
            bookingId: info.bookingId,
            serviceId: info.serviceId,
            service_name: info.service_name,
            email: info.userEmail,
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

    // ====== PAYMENT SUCCESS ======
    app.patch("/payment-success", async (req, res) => {
      try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const transactionId = session.payment_intent;
        const existingPayment = await paymentCollection.findOne({
          transactionId,
        });

        if (existingPayment) {
          return res.send({ success: true, paymentInfo: existingPayment });
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

    // ====== GET PAYMENTS ======
    app.get("/payments", verifyFBToken, async (req, res) => {
      const { email } = req.query;

      const payments = await paymentCollection
        .find({ customer_email: email })
        .sort({ paidAt: -1 })
        .toArray();

      res.send(payments);
    });

    //  DECORATOR
    app.post("/decorator", verifyFBToken, async (req, res) => {
      try {
        const decorator = req.body;
        const email = decorator.email;

        decorator.status = "pending";
        decorator.createdAt = new Date();

        const alreadyExist = await decoratorCollection.findOne({ email });
        console.log("alreadyExist:", alreadyExist);
        if (alreadyExist) {
          return res.status(409).json({ message: "Already Applied" });
        }

        const result = await decoratorCollection.insertOne(decorator);
        res.status(201).json(result);
      } catch (error) {
        console.error("Error saving decorator:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/decorators", async (req, res) => {
      const { status, workStatus } = req.query;

      const filter = {};

      if (status) {
        filter.status = status;
      }

      if (workStatus) {
        const workStatusArray = workStatus.split(",");
        filter.workStatus = { $in: workStatusArray };
      }

      const decorators = await decoratorCollection.find(filter).toArray();
      res.send(decorators);
    });

    app.get("/decorators/top-rated", async (req, res) => {
      const topDecorators = await decoratorCollection
        .find()
        .sort({ ratings: -1 })
        .limit(4)
        .toArray();

      res.send(topDecorators);
    });

    app.get("/decorator/:id", async (req, res) => {
      const id = req.params.id;

      const objectId = new ObjectId(id);

      const decorator = await decoratorCollection.findOne({ _id: objectId });

      res.send(decorator);
    });

    app.patch(
      "/decorators/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { status } = req.body;
        const id = req.params.id;

        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: { status: status, workStatus: "available" },
        };

        await decoratorCollection.updateOne(query, updatedDoc);

        const updatedDecorator = await decoratorCollection.findOne(query);

        if (status === "accepted" && updatedDecorator?.email) {
          await usersCollection.updateOne(
            { email: updatedDecorator.email },
            { $set: { role: "decorator" } }
          );
        }

        res.status(200).json(updatedDecorator);
      }
    );

    // Get bookings count by status
    app.get(
      "/dashboard/admin/bookings-status",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const pipeline = [
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $project: { status: "$_id", count: 1, _id: 0 } },
        ];
        const stats = await bookingsCollection.aggregate(pipeline).toArray();
        res.send(stats);
      }
    );

    // Get total revenue
    app.get(
      "/dashboard/admin/revenue",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const pipeline = [
          { $match: { paymentStatus: "paid" } },
          { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
        ];
        const revenue = await paymentCollection.aggregate(pipeline).toArray();
        res.send(revenue[0] || { totalRevenue: 0 });
      }
    );

    // Services demand histogram
    app.get(
      "/dashboard/admin/services-demand",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const pipeline = [
          { $group: { _id: "$service_name", count: { $sum: 1 } } },
          { $project: { service: "$_id", count: 1, _id: 0 } },
        ];
        const result = await bookingsCollection.aggregate(pipeline).toArray();
        res.send(result);
      }
    );

    // Get revenue by service
    app.get(
      "/dashboard/admin/revenue-by-service",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const pipeline = [
            { $match: { paymentStatus: "paid" } },
            {
              $group: {
                _id: "$service_name",
                totalRevenue: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            {
              $project: { service: "$_id", totalRevenue: 1, count: 1, _id: 0 },
            },
          ];

          const result = await bookingsCollection.aggregate(pipeline).toArray();
          res.send(result);
        } catch (err) {
          console.error("Revenue by service error:", err);
          res.status(500).send({ error: "Failed to fetch revenue by service" });
        }
      }
    );
    // Decorator assigned projects
    app.get(
      "/dashboard/decorator/projects",
      verifyFBToken,
      verifyDecorator,
      async (req, res) => {
        const email = req.tokenEmail;
        const projects = await bookingsCollection
          .find({ decoratorEmail: email })
          .sort({ date: 1 })
          .toArray();
        res.send(projects);
      }
    );

    // Decorator today's schedule
    app.get(
      "/dashboard/decorator/today",
      verifyFBToken,
      verifyDecorator,
      async (req, res) => {
        const email = req.tokenEmail;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const schedule = await bookingsCollection
          .find({
            decoratorEmail: email,
            date: { $gte: today.toISOString(), $lt: tomorrow.toISOString() },
            status: { $ne: "completed" },
          })
          .sort({ time: 1 })
          .toArray();

        res.send(schedule);
      }
    );

    // Decorator earnings
    app.get(
      "/dashboard/decorator/earnings",
      verifyFBToken,
      verifyDecorator,
      async (req, res) => {
        const email = req.tokenEmail;
        const pipeline = [
          { $match: { decoratorEmail: email, paymentStatus: "paid" } },
          { $group: { _id: null, totalEarnings: { $sum: "$cost" } } },
        ];
        const earnings = await bookingsCollection.aggregate(pipeline).toArray();
        res.send(earnings[0] || { totalEarnings: 0 });
      }
    );

    // user
    app.get("/dashboard/user/bookings", verifyFBToken, async (req, res) => {
      const email = req.tokenEmail;
      const bookings = await bookingsCollection
        .find({ userEmail: email })
        .sort({ date: -1 })
        .toArray();
      res.send(bookings);
    });

    app.get("/dashboard/user/payments", verifyFBToken, async (req, res) => {
      const email = req.tokenEmail;
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
