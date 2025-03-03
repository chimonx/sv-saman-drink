// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, doc } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import axios from "axios";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Firebase configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Initialize Express app
const server = express();
server.use(cors());
server.use(bodyParser.json());

// LINE Messaging API
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

// 📌 1. API รับออเดอร์จากลูกค้า
server.post("/order", async (req, res) => {
  try {
    const { userId, name, drink, note } = req.body;

    // บันทึกออเดอร์ลง Firebase Firestore
    const orderRef = await addDoc(collection(db, "orders"), {
      userId,
      name,
      drink,
      note,
      status: "กำลังทำ", // สถานะเริ่มต้น
      createdAt: new Date(),
    });

    // แจ้งเตือนลูกค้าผ่าน LINE OA
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

// 📌 2. API ให้สตาฟอัปเดตสถานะออเดอร์
server.post("/update-order", async (req, res) => {
  try {
    const { orderId, status, userId } = req.body;

    // อัปเดตสถานะใน Firebase Firestore
    const orderDocRef = doc(db, "orders", orderId);
    await updateDoc(orderDocRef, { status });

    // แจ้งเตือนลูกค้าผ่าน LINE OA
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

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
