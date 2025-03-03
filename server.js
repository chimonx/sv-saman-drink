import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, doc } from "firebase/firestore";
import axios from "axios";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase and Firestore
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Initialize Express
const server = express();

// Explicitly allow your Netlify domain
server.use(
  cors({
    origin: "https://sprightly-lokum-45d0a5.netlify.app",
  })
);
server.use(bodyParser.json());
server.options("*", cors());

// LINE Messaging API (using reply endpoint for webhook responses)
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_API_URL = "https://api.line.me/v2/bot/message/reply";

// Webhook URL
server.post("/webhook", async (req, res) => {
  console.log("Webhook received:", req.body);
  const events = req.body.events;
  try {
    for (let event of events) {
      const replyToken = event.replyToken;
      const userId = event.source.userId;
      const message = event.message.text;
      let replyMessage = "คุณส่งข้อความ: " + message;
      if (message === "สั่งเครื่องดื่ม") {
        replyMessage = "กรุณากรอกชื่อเครื่องดื่ม";
      }
      await axios.post(
        LINE_API_URL,
        {
          replyToken: replyToken,
          messages: [
            {
              type: "text",
              text: replyMessage,
            },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
          },
        }
      );
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error handling webhook:", error);
    res.status(500).send("Error");
  }
});

// API for placing orders
server.post("/order", async (req, res) => {
  try {
    const { userId, name, drink, note } = req.body;
    console.log("Order request received:", req.body);
    const orderRef = await addDoc(collection(db, "orders"), {
      userId,
      name,
      drink,
      note,
      status: "กำลังทำ",
      createdAt: new Date(),
    });
    // Using push API since replyToken is not available here
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: userId,
        messages: [
          {
            type: "text",
            text: `☕ ออเดอร์ของคุณถูกยืนยันแล้ว!\n\n📌 ${drink}\n📝 ${note}\n\nกรุณารอประมาณ 5-10 นาที ⏳`,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
        },
      }
    );
    res.status(200).json({ message: "Order received", orderId: orderRef.id });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ error: error.message });
  }
});

// API for updating order status
server.post("/update-order", async (req, res) => {
  try {
    const { orderId, status, userId } = req.body;
    console.log("Update order request:", req.body);
    const orderDocRef = doc(db, "orders", orderId);
    await updateDoc(orderDocRef, { status });
    let message = "";
    if (status === "เสร็จแล้ว") {
      message = "🎉 เครื่องดื่มของคุณพร้อมแล้ว! กรุณารับที่เคาน์เตอร์ 🏪";
    } else if (status === "ยกเลิก") {
      message = "❌ คำสั่งซื้อของคุณถูกยกเลิก กรุณาติดต่อร้านค้า";
    }
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: userId,
        messages: [{ type: "text", text: message }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
        },
      }
    );
    res.status(200).json({ message: "Order updated" });
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
