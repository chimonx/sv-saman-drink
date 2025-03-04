import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, doc, getDocs, getDoc } from "firebase/firestore";
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
    origin: "https://samandev.smobu.cloud",
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

    // Using push API to send message with Flex layout
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: userId,
        messages: [
          {
            type: "flex",
            altText: "ยืนยันการสั่งเครื่องดื่ม",
            contents: {
              type: "bubble",
              body: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "text",
                    text: "ออเดอร์ของคุณถูกยืนยันแล้ว!",
                    weight: "bold",
                    size: "xl",
                    color: "#00796b",
                  },
                  {
                    type: "text",
                    text: `📌 ${drink}\n📝 ${note}`,
                    wrap: true,
                    margin: "md",
                    color: "#555555",
                    size: "md",
                  },
                  {
                    type: "text",
                    text: "กรุณารอประมาณ 5-10 นาที ⏳",
                    wrap: true,
                    margin: "md",
                    color: "#888888",
                    size: "sm",
                  },
                ],
              },
            },
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
    
    let flexMessage;
    if (status === "พร้อมเสิร์ฟ") {
      // ดึงรายละเอียดออเดอร์ทั้งหมดจาก Firestore
      const orderDocSnap = await getDoc(orderDocRef);
      const orderData = orderDocSnap.data();
      flexMessage = {
        type: "flex",
        altText: "ออเดอร์พร้อมเสิร์ฟ",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: "ออเดอร์พร้อมเสิร์ฟแล้ว!",
                weight: "bold",
                size: "xl",
                color: "#00796b",
              },
              {
                type: "text",
                text: `Order ID: ${orderId}`,
                wrap: true,
                margin: "md",
                size: "sm",
              },
              {
                type: "text",
                text: `ลูกค้า: ${orderData.name}`,
                wrap: true,
                margin: "md",
                size: "sm",
              },
              {
                type: "text",
                text: `รายละเอียด: ${orderData.drink}`,
                wrap: true,
                margin: "md",
                size: "sm",
              },
              {
                type: "text",
                text: `หมายเหตุ: ${orderData.note || '-'}`,
                wrap: true,
                margin: "md",
                size: "sm",
              },
              {
                type: "text",
                text: `สถานะ: ${status}`,
                wrap: true,
                margin: "md",
                size: "sm",
              }
            ],
          },
        },
      };
    } else if (status === "ยกเลิก") {
      flexMessage = {
        type: "flex",
        altText: "แจ้งสถานะออเดอร์",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: "คำสั่งซื้อของคุณถูกยกเลิก",
                weight: "bold",
                size: "xl",
                color: "#d32f2f",
              },
              {
                type: "text",
                text: "กรุณาติดต่อร้านค้า",
                wrap: true,
                margin: "md",
                size: "sm",
              },
            ],
          },
        },
      };
    } else {
      // สำหรับสถานะอื่น ๆ ส่งข้อความแจ้งสถานะง่ายๆ
      flexMessage = {
        type: "flex",
        altText: "แจ้งสถานะออเดอร์",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: `สถานะออเดอร์: ${status}`,
                weight: "bold",
                size: "xl",
                color: "#00796b",
              },
            ],
          },
        },
      };
    }

    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: userId,
        messages: [flexMessage],
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

// Custom middleware to restrict GET /orders requests by origin
const restrictOrigin = (req, res, next) => {
  const allowedOrigin = "https://samandev.smobu.cloud";
  if (req.headers.origin !== allowedOrigin) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
};

// API for fetching orders with origin restriction
server.get("/orders", restrictOrigin, async (req, res) => {
  try {
    const ordersSnapshot = await getDocs(collection(db, "orders"));
    const orders = [];
    ordersSnapshot.forEach((docSnap) => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });
    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
