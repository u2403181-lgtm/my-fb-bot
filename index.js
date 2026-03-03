const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json());

const PAGE_ACCESS_TOKEN = 'YOUR_FACEBOOK_PAGE_TOKEN';
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
const VERIFY_TOKEN = 'my_secret_token_123'; // এটি ফেসবুকে বসাতে হবে

// ১. ফেসবুক ভেরিফিকেশন (GET Method)
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

// ২. মেসেজ রিসিভ করা (POST Method)
app.post('/webhook', async (req, res) => {
  let body = req.body;
  if (body.object === 'page') {
    for (let entry of body.entry) {
      let event = entry.messaging[0];
      let sender_id = event.sender.id;
      if (event.message && event.message.text) {
        handleLogic(sender_id, event.message.text.trim());
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  }
});

// ৩. পার্ট-বাই-পার্ট ডেটা আইডেন্টিফিকেশন লজিক
async function handleLogic(sender_id, user_text) {
  // দ্রষ্টব্য: এখানে ইউজারের ডেটা মেমোরিতে সাময়িকভাবে রাখার জন্য 
  // একটি ডাটাবেস (যেমন MongoDB) বা সিম্পল অবজেক্ট ব্যবহার করা যায়।
  // আপাতত আমরা সরাসরি Gemini কে দিয়ে চেক করাবো।
  
  const prompt = `Extract Name, Phone, Problem from: "${user_text}". 
  If any field is missing, put "N/A". Output strictly JSON: {"name":"..","phone":"..","problem":".."}`;

  try {
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      contents: [{ parts: [{ text: prompt }] }]
    });
    
    const resultText = response.data.candidates[0].content.parts[0].text;
    const data = JSON.parse(resultText.match(/\{.*\}/s)[0]);

    if (data.name === "N/A") {
      sendMessage(sender_id, "আপনার নামটি বলুন।");
    } else if (data.phone === "N/A") {
      sendMessage(sender_id, "আপনার মোবাইল নম্বরটি দিন।");
    } else if (data.problem === "N/A") {
      sendMessage(sender_id, "আপনার সমস্যাটি কি?");
    } else {
      sendMessage(sender_id, `ধন্যবাদ ${data.name}! আপনার ফোন (${data.phone}) ও সমস্যা নথিভুক্ত করা হয়েছে।`);
      // এখানে Google Sheets API কল করে ডেটা সেভ করতে হবে।
    }
  } catch (e) { console.log("Error:", e); }
}

async function sendMessage(id, text) {
  await axios.post(`https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: id },
    message: { text: text }
  });
}

app.listen(process.env.PORT || 3000, () => console.log('Webhook is listening'));