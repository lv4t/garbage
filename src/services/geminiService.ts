import { GoogleGenAI } from "@google/genai";
import { WasteCategory, WASTE_CATEGORIES } from '../types';

async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string; } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error("Failed to read file as data URL."));
      }
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

function isValidWasteCategory(value: string): value is WasteCategory {
    return (WASTE_CATEGORIES as readonly string[]).includes(value);
}

export async function classifyWaste(imageFile: File): Promise<WasteCategory> {
  // Fix: Per coding guidelines, the API key must be retrieved from `process.env.API_KEY`.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const imagePart = await fileToGenerativePart(imageFile);
  
  const prompt = `Phân tích hình ảnh và phân loại đối tượng chính vào MỘT trong năm loại sau ĐÂY: "Giấy Tái Chế", "Nhựa Tái Chế", "Kim Loại Tái Chế", "Rác Hữu Cơ", hoặc "Rác Khác". Lưu ý quan trọng: túi ni-lông, bao bì nhựa mỏng, hộp xốp, hoặc ly giấy phải được phân loại là "Rác Khác". Phản hồi của bạn CHỈ ĐƯỢC LÀ MỘT trong năm chuỗi ký tự này và không có gì khác.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { text: prompt },
        imagePart,
      ],
    },
  });

  const classification = (response.text ?? '').trim();

  if (isValidWasteCategory(classification)) {
    return classification;
  } else {
    console.error("Unexpected classification result:", classification);
    // Fallback for unexpected responses
    return "Rác Khác";
  }
}