import { Router } from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

const router = Router();
const upload = multer();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const SYSTEM_INSTRUCTION = "Parse financial data. Return ONLY valid JSON exactly matching this schema: { \"title\": string, \"amount\": number, \"type\": \"expense\"|\"income\", \"category\": string }. Do not include markdown formatting or backticks.";

router.post('/receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No receipt image provided' });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } },
            { text: "Extract the total amount, suggest a title, determine if it's an expense or income, and suggest a category based on this receipt." }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
      }
    });

    const text = response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(jsonStr);

    res.json(parsedData);
  } catch (error) {
    console.error('Error scanning receipt:', error);
    res.status(500).json({ error: 'Failed to process receipt' });
  }
});

router.post('/voice', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio provided' });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } },
            { text: "Listen to this audio and extract the financial transaction details." }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
      }
    });

    const text = response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(jsonStr);

    res.json(parsedData);
  } catch (error) {
    console.error('Error processing voice:', error);
    res.status(500).json({ error: 'Failed to process voice' });
  }
});

export default router;
