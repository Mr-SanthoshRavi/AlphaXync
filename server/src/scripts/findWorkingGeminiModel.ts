import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const key = process.env.AI_PROVIDER_KEY;

const candidateModels = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-pro-latest'
];

async function findWorkingModel() {
  console.log('Testing models with key:', key?.slice(0, 10) + '...');
  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await axios.post(
        url,
        { contents: [{ parts: [{ text: 'Reply in one short sentence: Hi' }] }] },
        { timeout: 7000 }
      );
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log(`✓ Model "${model}" WORKS! Response: ${text.trim()}`);
        return model;
      }
    } catch (e: any) {
      console.log(`✗ Model "${model}" failed: ${e.response?.status} - ${e.response?.data?.error?.message?.slice(0, 80) || e.message}`);
    }
  }
  return null;
}

findWorkingModel().then((best) => {
  console.log('Best model found:', best);
});
