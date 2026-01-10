const admin = require("firebase-admin");
require("dotenv").config();

// Initialize Firebase (Singleton check)
if (!admin.apps.length) {
    try {
        const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf-8");
        const serviceAccount = JSON.parse(decoded);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin Initialized");
    } catch (error) {
        console.error("Firebase Initialization Error:", error);
    }
}

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

module.exports = { verifyFBToken, admin };
