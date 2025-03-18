// Project Developed By @ramakrishnan_16

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const authenticateToken = require("./middleware/authenticateToken");

const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:3000" }));

// Database Connection
mongoose.connect("mongodb://localhost:27017/auctionDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.error("MongoDB Connection Error:", err));

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

// Register and Login
const User = mongoose.model("users", userSchema);

// Register
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already in use." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    res.json({ success: true, message: "User registered successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: "User not found." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials." });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Add Auctions
const auctionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  startingBid: { type: Number, required: true },
  currentBid: { type: Number, default: 0 },
  expiryDate: { type: Date, required: true }
});

const Auction = mongoose.model("auction_lists", auctionSchema);

app.post("/api/auctions", async (req, res) => {
  try {
    const { title, description, startingBid, expiryDate } = req.body;
    const newAuction = new Auction({ title, description, startingBid, expiryDate });
    await newAuction.save();
    res.json({ message: "Auction created successfully" });
  } catch (error) {
    console.error("Error creating auction:", error);
    res.status(500).json({ message: "Error creating auction" });
  }
});

app.get("/api/auctions", async (req, res) => {
  try {
    const auctions = await Auction.find();
    res.json(auctions);
  } catch (error) {
    console.error("Error fetching auctions:", error);
    res.status(500).json({ message: "Error fetching auctions" });
  }
});

// Place Bid
const bidSchema = new mongoose.Schema({
  auctionId: { type: mongoose.Schema.Types.ObjectId, ref: "auction_lists", required: true },
  bidAmount: { type: Number, required: true },
  bidder: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Bid = mongoose.model("bids", bidSchema);

app.post("/api/bids", async (req, res) => {
  try {
    console.log("Received bid request:", req.body);

    const { auctionId, bidAmount, bidder } = req.body;

    if (!auctionId || !bidAmount || !bidder) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return res.status(400).json({ message: "Invalid auctionId format" });
    }

    const auctionExists = await Auction.findById(auctionId);
    if (!auctionExists) {
      return res.status(404).json({ message: "Auction not found" });
    }

    const newBid = new Bid({ auctionId, bidAmount, bidder });
    await newBid.save();

    res.json({ message: "Bid placed successfully" });
  } catch (error) {
    console.error("Bid placement error:", error);
    res.status(500).json({ message: "Server error. Try again later." });
  }
});

// Bid-History
app.get("/api/bid-history", async (req, res) => {
  try {
      const bidHistory = await Bid.aggregate([
          {
              $lookup: {
                  from: "auction_lists",
                  localField: "auctionId",
                  foreignField: "_id",
                  as: "auction"
              }
          },
          { $unwind: "$auction" },
          {
              $group: {
                  _id: { auctionId: "$auctionId", bidder: "$bidder" },
                  highestBidByBidder: { $max: "$bidAmount" }, 
                  auctionTitle: { $first: "$auction.title" },
                  bidDetails: { $first: "$$ROOT" }
              }
          },
          {
              $replaceRoot: {
                  newRoot: {
                      _id: "$bidDetails._id",
                      bidderName: "$bidDetails.bidder",
                      auctionTitle: "$auctionTitle",
                      amount: "$highestBidByBidder" 
                  }
              }
          },
          {
              $group: {
                  _id: "$auctionTitle",
                  highestBid: { $max: "$amount" },
                  bids: { $push: "$$ROOT" }
              }
          },
          { $unwind: "$bids" },
          {
              $project: {
                  _id: "$bids._id",
                  bidderName: "$bids.bidderName",
                  auctionTitle: "$bids.auctionTitle",
                  amount: "$bids.amount",
                  status: {
                      $cond: {
                          if: { $eq: ["$bids.amount", "$highestBid"] },
                          then: "Won",
                          else: "Lost"
                      }
                  }
              }
          },
          { $sort: { auctionTitle: 1, amount: -1 } }
      ]);

      res.json(bidHistory);
  } catch (error) {
      console.error("Error fetching bid history:", error);
      res.status(500).json({ message: "Server error. Try again later." });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));

// Project Developed By @ramakrishnan_16