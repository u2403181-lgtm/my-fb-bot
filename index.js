const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json());

// --- ১. কনফিগারেশন (Environment Variables থেকে আসবে) ---
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = 'AIzaSyB6IzFFU3ybMUAe4IsVimIM-kQSYEoDo_k';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1YzWDZ9RRTe2-G7kFXXjal82waklsveGpkASEMFakKc8/edit?usp=sharing'; // এখানে আপনার Apps Script URL বসান

// --- ২. ফেসবুক ভেরিফিকেশন (GET Method) ---
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

// --- ৩. মেসেজ রিসিভ করা (POST Method) ---
app.post('/webhook', async (req, res) => {
  let body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(async function(entry) {
      let webhook_event = entry.messaging[0];
      let sender_id = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        let user_message = webhook_event.message.text.trim();
        console.log(`Message from ${sender_id}: ${user_message}`);
        
        // বটের লজিক ফাংশন কল করা
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
  // Gemini-র জন্য প্রম্পট (ডেটা এক্সট্র্যাক্ট করার জন্য)
  const prompt = `Extract exactly Name, Phone, and Problem from this text: "${user_text}". 
  If any field is missing, use "N/A". 
  Output MUST be strictly in JSON format like this: {"name": "...", "phone": "...", "problem": "..."}`;

  try {
    // Gemini API কল
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );

    const resultText = response.data.candidates[0].content.parts[0].text;
    const jsonMatch = resultText.match(/\{.*\}/s);
    
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);

      // ৫. ডেটা কি সম্পূর্ণ? চেক করা
      if (data.name === "N/A") {
        sendMessage(sender_id, "আপনার নামটি কি দয়া করে বলবেন?");
      } else if (data.phone === "N/A") {
        sendMessage(sender_id, `ধন্যবাদ ${data.name}! আপনার সাথে যোগাযোগ করার জন্য একটি ফোন নম্বর দিন।`);
      } else if (data.problem === "N/A") {
        sendMessage(sender_id, "আপনার সমস্যাটি বিস্তারিত লিখুন যাতে আমরা সমাধান করতে পারি।");
      } else {
        // সব ডেটা পাওয়া গেছে -> Google Sheet-এ সেভ করা
        sendMessage(sender_id, `ধন্যবাদ ${data.name}! আপনার তথ্যগুলো রেকর্ড করা হয়েছে। আমাদের প্রতিনিধি শীঘ্রই যোগাযোগ করবেন।`);
        saveToSheet(data);
      }
    }
  } catch (error) {
    console.error("Gemini or Logic Error:", error.message);
    sendMessage(sender_id, "দুঃখিত, আমি এই মুহূর্তে প্রসেস করতে পারছি না। আবার চেষ্টা করুন।");
  }
}

// --- ৬. Google Sheet-এ ডেটা পাঠানো ---
async function saveToSheet(data) {
  try {
    await axios.post(GOOGLE_SHEET_URL, data);
    console.log("Data successfully sent to Google Sheet!");
  } catch (error) {
    console.error("Sheet Saving Error:", error.message);
  }
}

// --- ৭. ফেসবুক মেসেজ পাঠানো (Send API) ---
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
    console.error("Facebook Send Error:", error.response ? error.response.data : error.message);
  }
}

// --- ৮. সার্ভার চালু করা ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running! Webhook is listening on port ${PORT}`);
});

// রেন্ডার হেলথ চেক (ব্রাউজারে লিঙ্ক চেক করার জন্য)
app.get('/', (req, res) => {
  res.send('Bot is Online and Working!');
});