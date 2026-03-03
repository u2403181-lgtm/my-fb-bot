const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json());

// --- ১. কনফিগারেশন ---
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = 'AIzaSyB6IzFFU3ybMUAe4IsVimIM-kQSYEoDo_k'; // আপনার নতুন API Key
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycby-xS90L-KxR2Y4jW0y4R8vI_Kz-B6XvD5P_P4L0_P_P4L0/exec'; // আপনার Apps Script URL টি এখানে বসান

// --- ২. ফেসবুক ভেরিফিকেশন (GET) ---
app.get('/webhook', (req, res) => {
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// --- ৩. মেসেজ রিসিভ করা (POST) ---
app.post('/webhook', async (req, res) => {
  let body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(async function(entry) {
      let webhook_event = entry.messaging[0];
      let sender_id = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        let user_message = webhook_event.message.text.trim();
        console.log(`Message from ${sender_id}: ${user_message}`);
        
        handleLogic(sender_id, user_message);
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// --- ৪. মূল লজিক এবং Gemini AI প্রসেসিং ---
async function handleLogic(sender_id, user_text) {
  const prompt = `Extract exactly Name, Phone, and Problem from this text: "${user_text}". 
  If any field is missing, use "N/A". 
  Output MUST be strictly in JSON format like this: {"name": "...", "phone": "...", "problem": "..."}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data && response.data.candidates) {
      const resultText = response.data.candidates[0].content.parts[0].text;
      const jsonMatch = resultText.match(/\{.*\}/s);
      
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);

        if (data.name === "N/A" && data.phone === "N/A") {
          sendMessage(sender_id, "হ্যালো! আপনার নাম এবং ফোন নম্বরসহ আপনার সমস্যার কথাটি লিখুন।");
        } else if (data.phone === "N/A") {
          sendMessage(sender_id, `ধন্যবাদ ${data.name}! আপনার ফোন নম্বরটি দিন যাতে আমরা যোগাযোগ করতে পারি।`);
        } else if (data.problem === "N/A") {
          sendMessage(sender_id, "আপনার সমস্যাটি বিস্তারিত লিখুন।");
        } else {
          sendMessage(sender_id, `ধন্যবাদ ${data.name}! আপনার তথ্যগুলো আমরা পেয়েছি। আমাদের প্রতিনিধি শীঘ্রই যোগাযোগ করবেন।`);
          saveToSheet(data);
        }
      }
    }
  } catch (error) {
    console.error("Gemini Error:", error.response ? error.response.data : error.message);
    sendMessage(sender_id, "দুঃখিত, আমি আপনার কথাটি বুঝতে পারিনি। নাম ও নম্বরসহ আবার লিখুন।");
  }
}

// --- ৫. Google Sheet-এ ডেটা পাঠানো ---
async function saveToSheet(data) {
  try {
    await axios.post(GOOGLE_SHEET_URL, data);
    console.log("Data saved to Sheet!");
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
    console.error("FB Send Error:", error.response ? error.response.data : error.message);
  }
}

// --- ৭. সার্ভার রান করা ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running! Port: ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('Bot is Online!');
});