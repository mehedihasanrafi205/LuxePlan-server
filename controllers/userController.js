const { getDb } = require("../config/db");
const { ObjectId } = require("mongodb");

const getUsers = async (req, res) => {
  const adminEmail = req.tokenEmail;
  const db = getDb();
  
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 9;
  const skip = (page - 1) * size;

  const query = { email: { $ne: adminEmail } };

  try {
    const count = await db.collection("users").countDocuments(query);
    const users = await db.collection("users")
      .find(query)
      .skip(skip)
      .limit(size)
      .toArray();

    res.send({ users, count });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Failed to fetch users" });
  }
};

const createUser = async (req, res) => {
  const userData = req.body;
  const db = getDb();

  const now = new Date().toISOString();
  userData.createdAt = now;
  userData.lastLogin = now;
  userData.role = "client";

  const query = { email: userData.email };
  const alreadyExist = await db.collection("users").findOne(query);

  if (alreadyExist) {
    const result = await db.collection("users").updateOne(query, {
      $set: { lastLogin: now },
    });
    return res.send(result);
  }

  const result = await db.collection("users").insertOne(userData);
  res.send(result);
};

const updateUserRole = async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;
  const db = getDb();

  const filter = { _id: new ObjectId(id) };
  const update = { $set: { role: role } };

  const result = await db.collection("users").updateOne(filter, update);
  res.send(result);
};

const getUserRole = async (req, res) => {
  const db = getDb();
  const user = await db.collection("users").findOne({ email: req.tokenEmail });
  res.send({ role: user?.role || "client" });
};

module.exports = {
  getUsers,
  createUser,
  updateUserRole,
  getUserRole,
};
