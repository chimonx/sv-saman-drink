require("dotenv").config();
const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const cors = require("cors");
const bodyParser = require("body-parser");

// Initialize Firebase
const serviceAccount = require("./firebaseServiceAccount.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// LINE Messaging API
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

// 📌 1. API รับออเดอร์จากลูกค้า
app.post("/order", async (req, res) => {
  try {
    const { userId, name, drink, note } = req.body;

    // บันทึกออเดอร์ลง Firebase
    const orderRef = await db.collection("orders").add({
      userId,
      name,
      drink,
      note,
      status: "กำลังทำ", // สถานะเริ่มต้น
      createdAt: admin.firestore.Timestamp.now(),
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
app.post("/update-order", async (req, res) => {
  try {
    const { orderId, status, userId } = req.body;

    // อัปเดตสถานะใน Firebase
    await db.collection("orders").doc(orderId).update({ status });

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
