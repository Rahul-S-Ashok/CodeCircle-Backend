const express = require("express");

const { userAuth } = require("../middlewares/auth");
const razorpayInstance = require("../utils/razorpay");
const Payment = require("../models/payment");
const User = require("../models/user");
const { membershipAmount } = require("../utils/constants");

const paymentRouter = express.Router();


// CREATE RAZORPAY TEST ORDER

paymentRouter.post("/create", userAuth, async (req, res) => {
  try {
    const { membershipType } = req.body;

    // Validate membership type
    if (!membershipType || !membershipAmount[membershipType]) {
      return res.status(400).json({
        message: "Invalid membership type",
      });
    }

    const { firstName, lastName, emailId } = req.user;

    // Create Razorpay order
    const order = await razorpayInstance.orders.create({
      amount: membershipAmount[membershipType] * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        firstName,
        lastName,
        emailId,
        membershipType,
      },
    });

    // Save payment in database
    const payment = new Payment({
      userId: req.user._id,
      orderId: order.id,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      notes: {
        firstName,
        lastName,
        membershipType,
      },
    });

    await payment.save();

    return res.status(201).json({
      message: "Payment order created successfully",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });

  } catch (err) {
    console.error("Create payment error:", err);

    return res.status(500).json({
      message: err.message,
    });
  }
});


// VERIFY PAYMENT AND ACTIVATE PREMIUM

paymentRouter.post("/verify", userAuth, async (req, res) => {
  try {
    const {
      membershipType,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    // Validate membership type
    if (!membershipType || !membershipAmount[membershipType]) {
      return res.status(400).json({
        message: "Invalid membership type",
      });
    }

    // Find payment
    const payment = await Payment.findOne({
      orderId: razorpay_order_id,
      userId: req.user._id,
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found",
      });
    }

    // Update payment details
    payment.paymentId = razorpay_payment_id;
    payment.status = "paid";

    await payment.save();

    // Activate Premium
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.isPremium = true;
    user.membershipType = membershipType;

    await user.save();

    return res.status(200).json({
      message: "Premium Activated Successfully",
      data: {
        user,
        payment,
      },
    });

  } catch (err) {
    console.error("Verify payment error:", err);

    return res.status(500).json({
      message: err.message,
    });
  }
});


// VERIFY PREMIUM STATUS

paymentRouter.get("/premium/verify", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      data: {
        isPremium: user.isPremium,
        membershipType: user.membershipType,
      },
    });

  } catch (err) {
    console.error("Premium verification error:", err);

    return res.status(500).json({
      message: err.message,
    });
  }
});


module.exports = paymentRouter;