const express = require('express');
const axios = require('axios');
const app = express().use(require('body-parser').json());

// --- কনফিগারেশন ---
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const SAMBANOVA_API_KEY = 'AIzaSyB6IzFFU3ybMUAe4IsVimIM-kQSYEoDo_k'; 
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwLpwq8sNQ_eHoHb2cLflCxpoIKSazkqKdZK7WHSoJ9Kpiol8uSlIGrPxQDwClZsLsK/exec'; 

// ফেসবুক ভেরিফিকেশন
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// মেসেজ প্রসেসিং
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender_id = event.sender.id;
      
      if (event.message && event.message.text) {
        const text = event.message.text;

        // ১. ডিফল্ট ব্যাকআপ ডাটা
        let finalData = { 
          name: text.split(/[ ,।]/)[0] || "User", 
          phone: (text.match(/01\d{9}/) || ["N/A"])[0], 
          problem: text 
        };

        try {
          // ২. AI কল (৫ সেকেন্ড লিমিট)
          const aiRes = await axios.post('https://api.sambanova.ai/v1/chat/completions', {
            model: "Meta-Llama-3.1-8B-Instruct",
            messages: [{ role: "user", content: `Extract Name, Phone, Problem from: "${text}" as JSON.` }],
            response_format: { type: "json_object" }
          }, { 
            headers: { 'Authorization': `Bearer ${SAMBANOVA_API_KEY}` },
            timeout: 5000 
          });
          finalData = JSON.parse(aiRes.data.choices[0].message.content);
        } catch (e) {
          console.log("AI error, using backup...");
        }

        // ৩. শিটে ডাটা পাঠানো
        if (finalData.phone !== "N/A") {
          try {
            await axios.post(SHEET_URL, finalData);
            sendMessage(sender_id, `ধন্যবাদ ${finalData.name}! আপনার তথ্য ও সমস্যাটি আমরা সেভ করেছি।`);
          } catch (sheetErr) {
            sendMessage(sender_id, "দুঃখিত, ডাটা সেভ করতে সমস্যা হয়েছে।");
          }
        } else {
          sendMessage(sender_id, "দয়া করে আপনার নাম এবং সঠিক ফোন নম্বরটি লিখুন।");
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  }
});

async function sendMessage(id, txt) {
  try {
    await axios.post(`https://graph.facebook.com/v15.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: id }, message: { text: txt }
    });
  } catch (err) { console.error("FB Send Error"); }
}

app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(process.env.PORT || 10000);