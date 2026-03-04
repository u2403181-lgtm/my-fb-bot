const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json());

// --- ১. কনফিগারেশন ---
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = 'AIzaSyB6IzFFU3ybMUAe4IsVimIM-kQSYEoDo_k'; 
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycby-xS90L-KxR2Y4jW0y4R8vI_Kz-B6XvD5P_P4L0_P_P4L0/exec'; 

// --- ২. ফেসবুক ভেরিফিকেশন ---
app.get('/webhook', (req, res) => {
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// --- ৩. মেসেজ রিসিভ করা ---
app.post('/webhook', async (req, res) => {
  let body = req.body;
  if (body.object === 'page') {
    body.entry.forEach(async function(entry) {
      let webhook_event = entry.messaging[0];
      let sender_id = webhook_event.sender.id;
      if (webhook_event.message && webhook_event.message.text) {
        let user_message = webhook_event.message.text.trim();
        handleLogic(sender_id, user_message);
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// --- ৪. স্মার্ট লজিক (Greetings + Data Extraction) ---
async function handleLogic(sender_id, user_text) {
  // এখানে Gemini-কে পরিষ্কার ইনস্ট্রাকশন দেওয়া হয়েছে
  const prompt = `Analyze this message: "${user_text}". 
  1. If it's just a greeting (like hi, hello, kemon achen), set "is_greeting": true.
  2. If the user provides any info, extract it into: {"name": "...", "phone": "...", "problem": "...", "is_greeting": false}.
  3. Use "N/A" for missing fields. 
  Always return strictly in JSON format.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const resultText = response.data.candidates[0].content.parts[0].text;
    const jsonMatch = resultText.match(/\{.*\}/s);
    
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);

      // কন্ডিশনাল রিপ্লাই
      if (data.is_greeting) {
        // ইউজার যখন শুধু Hi/Hello দিবে
        sendMessage(sender_id, "হ্যালো! আমি আপনার ডিজিটাল অ্যাসিস্ট্যান্ট। আপনার নাম, ফোন নম্বর এবং আপনার সমস্যার কথাটি এখানে লিখুন, আমি সেটি নোট করে রাখব।");
      } else if (data.name !== "N/A" && data.phone !== "N/A" && data.problem !== "N/A") {
        // যখন সব তথ্য পাবে
        sendMessage(sender_id, `ধন্যবাদ ${data.name}! আপনার তথ্যগুলো আমি সংগ্রহ করেছি। আমাদের টিম শীঘ্রই আপনার সাথে যোগাযোগ করবে।`);
        saveToSheet(data);
      } else {
        // তথ্য অসম্পূর্ণ থাকলে
        sendMessage(sender_id, "আমি আপনার মেসেজটি পেয়েছি। দয়া করে আপনার নাম ও ফোন নম্বরসহ বিস্তারিত লিখুন যাতে আমরা আপনাকে সাহায্য করতে পারি।");
      }
    }
  } catch (error) {
    // এররটি কনসোলে প্রিন্ট করুন যাতে আপনি রেন্ডারে দেখতে পারেন
    console.log("Detailed Error:", error.response ? error.response.data : error.message);
    
    // ইউজারকে একটি সাধারণ ব্যাকআপ মেসেজ দিন
    sendMessage(sender_id, "আমি আপনার মেসেজটি পেয়েছি, কিন্তু প্রসেস করতে একটু সমস্যা হচ্ছে। দয়া করে আবার চেষ্টা করুন।");
  }
}

// --- ৫. Google Sheet-এ ডেটা পাঠানো ---
async function saveToSheet(data) {
  try {
    await axios.post(GOOGLE_SHEET_URL, data);
  } catch (error) {
    console.error("Sheet Error:", error.message);
  }
}

// --- ৬. ফেসবুক মেসেজ পাঠানো ---
async function sendMessage(recipientId, messageText) {
  try {
    await axios.post(
      `https://graph.facebook.com/v15.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: { text: messageText }
      }
    );
  } catch (error) {
    console.error("FB Send Error:", error.message);
  }
}

app.listen(process.env.PORT || 3000, () => console.log("Server is live!"));
app.get('/', (req, res) => res.send('Bot is Online!'));