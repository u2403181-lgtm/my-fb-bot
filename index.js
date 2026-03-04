const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json());

// --- ১. কনফিগারেশন ---
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const SAMBANOVA_API_KEY = '2250c538-c5f1-4edf-8db2-1880c38f35f0'; // আপনার SambaNova API Key
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycby-xS90L-KxR2Y4jW0y4R8vI_Kz-B6XvD5P_P4L0_P_P4L0/exec'; 

// --- ২. ফেসবুক ভেরিফিকেশন (GET) ---
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

// --- ৪. SambaNova AI লজিক ---
async function handleLogic(sender_id, user_text) {
  const prompt = `Extract Name, Phone, and Problem from the following text: "${user_text}". 
  Return ONLY a JSON object: {"name": "...", "phone": "...", "problem": "...", "is_greeting": false}. 
  If the text is just a greeting (like hi, hello, kemon achen), set "is_greeting": true. 
  Use "N/A" for missing fields.`;

  try {
    const response = await axios.post(
      'https://api.sambanova.ai/v1/chat/completions',
      {
        model: "Meta-Llama-3.1-8B-Instruct",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs only JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Authorization': `Bearer ${SAMBANOVA_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const resultText = response.data.choices[0].message.content;
    const data = JSON.parse(resultText);

    if (data.is_greeting) {
      sendMessage(sender_id, "হ্যালো! আমি আপনাকে কীভাবে সাহায্য করতে পারি? আপনার নাম, ফোন নম্বর ও সমস্যার কথাটি লিখুন।");
    } else if (data.name !== "N/A" && data.phone !== "N/A") {
      sendMessage(sender_id, `ধন্যবাদ ${data.name}! আপনার তথ্যগুলো আমি সংগ্রহ করেছি। শীঘ্রই আমাদের প্রতিনিধি যোগাযোগ করবেন।`);
      saveToSheet(data);
    } else {
      sendMessage(sender_id, "আপনার নাম এবং ফোন নম্বরসহ সমস্যাটি বিস্তারিত লিখুন যাতে আমি সেটি নোট করতে পারি।");
    }

  } catch (error) {
    console.error("AI Error:", error.response ? error.response.data : error.message);
    sendMessage(sender_id, "দুঃখিত, আমি আপনার কথাটি বুঝতে পারিনি। দয়া করে নাম ও নম্বরসহ আবার লিখুন।");
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
    console.error("FB Send Error:", error.message);
  }
}

// --- ৭. সার্ভার রান করা ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('Bot is Online with SambaNova!');
});