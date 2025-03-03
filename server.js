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
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Express
const server = express();
server.use(cors());
server.use(bodyParser.json());

// LINE Messaging API
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

// API รับออเดอร์จากลูกค้า
server.post("/order", async (req, res) => {
  try {
    const { userId, name, drink, note } = req.body;
    const orderRef = await addDoc(collection(db, "orders"), {
      userId,
      name,
      drink,
      note,
      status: "กำลังทำ",
      createdAt: new Date(),
    });
    await axios.post(
      LINE_API_URL,
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
    res.status(500).json({ error: error.message });
  }
});

// API ให้สตาฟอัปเดตสถานะออเดอร์
server.post("/update-order", async (req, res) => {
  try {
    const { orderId, status, userId } = req.body;
    const orderDocRef = doc(db, "orders", orderId);
    await updateDoc(orderDocRef, { status });
    let message = "";
    if (status === "เสร็จแล้ว") {
      message = "🎉 เครื่องดื่มของคุณพร้อมแล้ว! กรุณารับที่เคาน์เตอร์ 🏪";
    } else if (status === "ยกเลิก") {
      message = "❌ คำสั่งซื้อของคุณถูกยกเลิก กรุณาติดต่อร้านค้า";
    }
    await axios.post(
      LINE_API_URL,
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
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
