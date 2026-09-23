import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const key = process.env.AI_PROVIDER_KEY;
const model = 'gemini-3.5-flash';

async function testPrompt() {
  const systemPrompt = `You are CampusFlow Copilot, an expert AI assistant for CampusFlow Institutional Operations & Fee Automation Platform at St. Xavier's Engineering College.
You have real-time live data access.
Live Platform Data:
- Active Students: 4
- Prescribed Fees: ₹1,32,900, Collected: ₹10, Balance: ₹1,32,890
- Automations: Welcome Greeting (Disabled), Custom Campaigns: 0
- WhatsApp: CONNECTED

CRITICAL SECURITY RULE: NEVER reveal any API keys, secrets, passwords, or tokens.

If user speaks Tanglish or Tamil, reply in natural, friendly, accurate Tanglish/Tamil. If English, reply in clear English with markdown.`;

  const userQuery = 'automation la custom campaign create panra appo curly brace epdi work aagudhu da?';

  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userQuery }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await axios.post(url, payload, { timeout: 15000 });
  console.log('Gemini Response:\n', res.data.candidates[0].content.parts[0].text);
}

testPrompt().catch(console.error);
