const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");
const { sendSMS } = require("./utils/smsSender");

const app = express();
const port = process.env.PORT || 4000;

// Environment Validation
const requiredEnv = ["URI", "STRIPE_SECRET_KEY", "FB_SERVICE_KEY"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

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
    origin: [process.env.DOMAIN_URL, "http://localhost:5173"],
    credentials: true,
  })
);

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

      const page = parseInt(req.query.page) || 1;
      const size = parseInt(req.query.size) || 9;
      const skip = (page - 1) * size;

      const query = { email: { $ne: adminEmail } };

      try {
        const count = await usersCollection.countDocuments(query);

        const users = await usersCollection
          .find(query)
          .skip(skip)
          .limit(size)
          .toArray();

        res.send({ users, count });
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
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

      const page = parseInt(req.query.page) || 1;
      const size = parseInt(req.query.size) || 9;
      const skip = (page - 1) * size;

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

      try {
        const count = await serviceCollection.countDocuments(query);

        const services = await serviceCollection
          .find(query)
          .skip(skip)
          .limit(size)
          .toArray();

        res.send({ services, count });
      } catch (error) {
        console.error("Error fetching services:", error);
        res.status(500).send({ message: "Failed to fetch services" });
      }
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

    // BOOKINGS
    app.get("/bookings", verifyFBToken, async (req, res) => {
      const { serviceId, date, email } = req.query;
      const page = parseInt(req.query.page) || 1;
      const size = parseInt(req.query.size) || 9;
      const skip = (page - 1) * size;

      const query = {};
      if (serviceId) query.serviceId = serviceId;
      if (date) query.date = date;
      if (email) query.userEmail = email;

      try {
        const count = await bookingsCollection.countDocuments(query);

        const bookings = await bookingsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(size)
          .toArray();

        res.send({ bookings, count });
      } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).send({ message: "Failed to fetch bookings" });
      }
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      booking.status = "pending";
      booking.paymentStatus = "unpaid";
      booking.createdAt = new Date();

      const result = await bookingsCollection.insertOne(booking);

      // Send SMS Notification
      if (booking.userEmail) {
        // Assuming we have a phone number in the user profile or booking data.
        // For now, mocking with a placeholder or if booking has phone.
        const phone = booking.phone || "01700000000"; 
        await sendSMS(
           phone, 
           `Dear ${booking.userName}, your booking for ${booking.service_name} on ${booking.date} at ${booking.time} is placed successfully!`
        );
      }

      res.send(result);
    });

    app.get(
      "/bookings/assigned",
      verifyFBToken,
      verifyDecorator,
      async (req, res) => {
        const { decoratorEmail, page, size } = req.query;

        const pageNumber = parseInt(page) || 1;
        const pageSize = parseInt(size) || 9;
        const skip = (pageNumber - 1) * pageSize;

        const query = {};
        if (decoratorEmail) {
          query.decoratorEmail = decoratorEmail;
        } else {
             // DECORATOR VIEW: Show if this decorator is in the list
             // This assumes middleware sets req.decoratorId, otherwise fallback to email if logical
             query = { 
                 $or: [
                     { decoratorId: req.decoratorId || "undefined_legacy" }, 
                     { decoratorIds: { $in: [req.decoratorId] } } 
                 ]
             };
             // Correction: The original code used query string "decoratorEmail" for filtering?
             // Line 303 says `if (decoratorEmail) query.decoratorEmail = decoratorEmail`. 
             // If this endpoint is used by the Decorator Dashboard to fetch THEIR projects, 
             // they might be passing their email as query param.
             // If so, we should also check the array for the email.
             
             if (decoratorEmail) {
                 query = {
                     $or: [
                         { decoratorEmail: decoratorEmail },
                         { decoratorEmails: { $in: [decoratorEmail] } }
                     ]
                 };
             }
        }

        query.status = { $nin: ["completed"] };

        try {
          const totalCount = await bookingsCollection.countDocuments(query);

          const bookings = await bookingsCollection
            .find(query)
            .skip(skip)
            .limit(pageSize)
            .toArray();

          res.send({
            projects: bookings,
            count: totalCount,
          });
        } catch (error) {
          console.error("Error fetching assigned bookings:", error);
          res
            .status(500)
            .send({ message: "Failed to fetch assigned projects." });
        }
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

        const updatedDoc = {
          $set: {
            status,
            decoratorId,
          },
        };

        const result = await bookingsCollection.updateOne(query, updatedDoc);

        const decoratorQuery = { _id: new ObjectId(decoratorId) };
        let decoratorUpdatedDoc = null;

        if (status === "planning") {
          decoratorUpdatedDoc = { $set: { workStatus: "working" } };
        }

        if (status === "completed") {
          decoratorUpdatedDoc = { $set: { workStatus: "available" } };
        }

        if (decoratorUpdatedDoc) {
          await decoratorCollection.updateOne(
            decoratorQuery,
            decoratorUpdatedDoc
          );
        }

        // Send SMS on Status Change
        if (status === "planning" || status === "completed") {
            const bookingDoc = await bookingsCollection.findOne(query);
            if (bookingDoc && bookingDoc.userEmail) {
                const phone = bookingDoc.phone || "01700000000";
                const msg = status === "planning" 
                    ? `Good news! A decorator has been assigned to your project: ${bookingDoc.service_name}.`
                    : `Your project ${bookingDoc.service_name} is marked as COMPLETED! Thank you for choosing LuxePlan.`;
                
                await sendSMS(phone, msg);
            }
        }

        res.send({ success: true, result });
      }
    );

    app.get("/booking/completed", async (req, res) => {
      const { decoratorEmail, page, size } = req.query;

      if (!decoratorEmail) {
        return res.status(400).send({ message: "Decorator email required" });
      }

      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(size) || 9;
      const skip = (pageNumber - 1) * pageSize;

      const query = {
        decoratorEmail,
        status: "completed",
      };

      try {
        const totalCount = await bookingsCollection.countDocuments(query);

        const projects = await bookingsCollection
          .find(query)
          .sort({ date: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();

        const allCompletedProjects = await bookingsCollection
          .find(query)
          .project({ cost: 1 })
          .toArray();

        const totalEarnings = allCompletedProjects.reduce(
          (sum, project) => sum + project.cost,
          0
        );

        res.send({
          projects: projects,
          count: totalCount,
          totalEarnings: totalEarnings,
        });
      } catch (error) {
        console.error("Error fetching completed projects:", error);
        res.status(500).send({ message: "Failed to fetch earnings data." });
      }
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

    // Assign Decorator (Admin Only) - Multi-Decorator Support
    app.patch("/bookings/:id/assign", verifyFBToken, verifyAdmin, async (req, res) => {
      const bookingId = req.params.id;
      const { decoratorEmails, decoratorNames, decoratorIds } = req.body;
      const query = { _id: new ObjectId(bookingId) };
      
      const updatedDoc = {
        $set: {
          status: "assigned",
          decoratorIds,
          decoratorNames,
          decoratorEmails,
          // Legacy Compatibility
          decoratorId: decoratorIds?.[0], 
          decoratorName: decoratorNames?.[0],
          decoratorEmail: decoratorEmails?.[0],
          assignedAt: new Date(),
        },
      };
      
      const result = await bookingsCollection.updateOne(query, updatedDoc);

      // Update workStatus for ALL assigned decorators
      if (decoratorIds && decoratorIds.length > 0) {
          const decoratorQuery = { _id: { $in: decoratorIds.map(id => new ObjectId(id)) } };
          const decoratorUpdatedDoc = {
            $set: {
              workStatus: "working", // or "assigned"
            },
          };
          await decoratorCollection.updateMany(decoratorQuery, decoratorUpdatedDoc);
      }
      
      res.send(result);
    });

    app.get("/bookings/today", async (req, res) => {
      const { decoratorEmail, page, size } = req.query;
      if (!decoratorEmail)
        return res.status(400).send({ message: "Decorator email required" });

      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(size) || 9;
      const skip = (pageNumber - 1) * pageSize;

      const today = new Date();
      today.setHours(0, 0, 0, 0); // start of day
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1); // start of next day

      const query = {
        decoratorEmail,
        date: { $gte: today.toISOString(), $lt: tomorrow.toISOString() },
        status: { $ne: "completed" },
      };

      try {
        const totalCount = await bookingsCollection.countDocuments(query);

        const projects = await bookingsCollection
          .find(query)
          .sort({ time: 1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();

        res.send({
          projects: projects,
          count: totalCount,
        });
      } catch (error) {
        console.error("Error fetching today's schedule:", error);
        res.status(500).send({ message: "Failed to fetch today's schedule." });
      }
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

    // ====== COUPONS ======
    const couponCollection = db.collection("coupons");

    // Create Coupon (Admin Only)
    app.post("/coupons", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const { code, discountType, amount, expiryDate } = req.body;
        const coupon = {
          code: code.toUpperCase(),
          discountType,
          amount: parseFloat(amount),
          expiryDate: new Date(expiryDate),
          isActive: true,
          createdAt: new Date(),
        };

        const existing = await couponCollection.findOne({ code: coupon.code });
        if (existing) {
          return res.status(400).send({ message: "Coupon code already exists!" });
        }

        const result = await couponCollection.insertOne(coupon);
        res.send(result);
      } catch (error) {
        console.error("Error creating coupon:", error);
        res.status(500).send({ message: "Failed to create coupon" });
      }
    });

    // Get All Coupons (Admin Only)
    app.get("/coupons", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const coupons = await couponCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(coupons);
      } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).send({ message: "Failed to fetch coupons" });
      }
    });

    // Delete Coupon (Admin Only)
    app.delete("/coupons/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await couponCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error("Error deleting coupon:", error);
        res.status(500).send({ message: "Failed to delete coupon" });
      }
    });

    // Validate Coupon (Public/User)
    app.post("/coupons/validate", async (req, res) => {
      try {
        const { code, serviceCost } = req.body;
        const coupon = await couponCollection.findOne({
          code: code.toUpperCase(),
          isActive: true,
        });

        if (!coupon) {
          return res.status(404).send({ message: "Invalid coupon code" });
        }

        const now = new Date();
        const expiry = new Date(coupon.expiryDate);

        if (now > expiry) {
          return res.status(400).send({ message: "Coupon has expired" });
        }

        // Calculate discount
        let discountAmount = 0;
        if (coupon.discountType === "percent") {
          discountAmount = (serviceCost * coupon.amount) / 100;
        } else {
          discountAmount = coupon.amount;
        }

        // Ensure discount doesn't exceed cost (basic protection)
        if (discountAmount > serviceCost) {
            discountAmount = serviceCost;
        }

        res.send({
          success: true,
          discountAmount: discountAmount,
          code: coupon.code,
          type: coupon.discountType,
          value: coupon.amount
        });
      } catch (error) {
        console.error("Error validating coupon:", error);
        res.status(500).send({ message: "Failed to validate coupon" });
      }
    });

    // ====== AI RECOMMENDATION SYSTEM (Available for Admin) ======
    app.post("/decorators/recommend", verifyFBToken, verifyAdmin, async (req, res) => {
        try {
            const { category, date } = req.body;
            
            // 1. Find decorators with matching specialty
            // 2. Filter by availability (status="available") (Simplistic Rule)
            // 3. Sort by Rating (desc)
            
            // Note: In a real system, we would check booking conflicts for the specific date.
            // For now, we use the "workStatus" field and specialty matching.
            
            let query = { 
                workStatus: "available",
            };

            if (category) {
                // If category is provided, match specialty (case-insensitive regex)
                query.specialty = { $regex: category, $options: "i" };
            }

            const recommended = await decoratorCollection
                .find(query)
                .sort({ rating: -1 }) // Highest rated first
                .limit(3) // Top 3
                .toArray();

            res.send(recommended);
        } catch (error) {
            console.error("Recommendation Error:", error);
            res.status(500).send({ message: "Failed to get recommendations" });
        }
    });

    //  GET PAYMENTS

    app.get("/payments", verifyFBToken, async (req, res) => {
      const { email, page, size } = req.query; //

      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(size) || 9;
      const skip = (pageNumber - 1) * pageSize;

      const query = { customer_email: email };

      try {
        const totalCount = await paymentCollection.countDocuments(query);

        const payments = await paymentCollection
          .find(query)
          .sort({ paidAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();

        res.send({
          payments: payments,
          count: totalCount,
        });
      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Failed to fetch payment history." });
      }
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

      const page = parseInt(req.query.page) || 1;
      const size = parseInt(req.query.size) || 9;
      const skip = (page - 1) * size;

      const filter = {};

      if (status) {
        filter.status = status;
      }

      if (workStatus) {
        const workStatusArray = workStatus.split(",");
        filter.workStatus = { $in: workStatusArray };
      }

      try {
        const count = await decoratorCollection.countDocuments(filter);

        const decorators = await decoratorCollection
          .find(filter)
          .skip(skip)
          .limit(size)
          .toArray();

        res.send({ decorators, count });
      } catch (error) {
        console.error("Error fetching decorators:", error);
        res.status(500).send({ message: "Failed to fetch decorators" });
      }
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
    // ====== ERROR HANDLING ======

    // 404 Handler
    app.all("*", (req, res) => {
      res.status(404).send({ message: "Route Not Found" });
    });

    // Global Error Handler
    app.use((err, req, res, next) => {
      console.error("Global Error:", err);
      res.status(err.status || 500).send({ 
        message: err.message || "Internal Server Error",
        error: process.env.NODE_ENV === "development" ? err : {}
      });
    });

  } catch (err) {
    console.error("Server Startup Error:", err);
  }
}

run();

app.get("/", (req, res) => res.send("LuxePlan Backend Running!"));
app.listen(port, () => console.log(`Server running on port ${port}`));
