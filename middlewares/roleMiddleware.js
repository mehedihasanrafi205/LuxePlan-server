const { getDb } = require("../config/db");

const verifyAdmin = async (req, res, next) => {
  const email = req.tokenEmail;
  if (!email) return res.status(401).send({ message: "Unauthorized Access!" });

  try {
      const db = getDb();
      const user = await db.collection("users").findOne({ email });

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Admin only actions", role: user?.role });
      }
      next();
  } catch (e) {
      res.status(500).send({ message: "Internal Server Error during verification" });
  }
};

const verifyDecorator = async (req, res, next) => {
  const email = req.tokenEmail;
  if (!email) return res.status(401).send({ message: "Unauthorized Access!" });

  try {
      const db = getDb();
      const user = await db.collection("users").findOne({ email });

      if (user?.role !== "decorator") {
        return res.status(403).send({ message: "Decorators only actions", role: user?.role });
      }
      
      // Attach decorator info
      const decorator = await db.collection("decorator").findOne({ email });
      if(decorator) {
          req.decoratorId = decorator._id;
      }
      
      next();
  } catch (e) {
      res.status(500).send({ message: "Internal Server Error during verification" });
  }
};

module.exports = { verifyAdmin, verifyDecorator };
