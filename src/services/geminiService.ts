import { GoogleGenAI } from "@google/genai";
import { WasteCategory, WASTE_CATEGORIES } from '../types';

// Lớp lỗi tùy chỉnh để cung cấp phản hồi cụ thể hơn cho UI
export class ClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassificationError';
  }
}

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
  try {
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

    // Kiểm tra các khối an toàn hoặc các lý do khác khiến không có nội dung
    if (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY') {
            throw new ClassificationError("Hình ảnh bị từ chối do vi phạm chính sách an toàn. Vui lòng thử ảnh khác.");
        }
        throw new ClassificationError("Không nhận được phản hồi hợp lệ từ mô hình. Lý do: " + (finishReason || 'Không xác định'));
    }
    
    const classification = (response.text ?? '').trim();

    if (isValidWasteCategory(classification)) {
      return classification;
    } else {
      console.error("Unexpected classification result:", classification);
      // Ném lỗi thay vì trả về một giá trị dự phòng
      throw new ClassificationError(`Hệ thống trả về một loại không xác định: "${classification}". Vui lòng thử lại.`);
    }

  } catch (error) {
    console.error("Error during waste classification:", error);

    if (error instanceof ClassificationError) {
        // Ném lại các lỗi tùy chỉnh của chúng tôi
        throw error;
    }

    let errorMessage = "Phân tích thất bại. Vui lòng thử lại.";
    if (error instanceof Error) {
        if (error.message.includes('API key not valid')) {
            errorMessage = "Lỗi xác thực: API Key không hợp lệ. Vui lòng kiểm tra lại cấu hình.";
        } else if (error.message.includes('fetch failed') || error.message.includes('NetworkError')) {
            errorMessage = "Lỗi mạng: Không thể kết nối đến dịch vụ. Vui lòng kiểm tra kết nối internet của bạn.";
        }
    }
    
    // Ném một lỗi chung mới với thông báo mô tả hơn
    throw new Error(errorMessage);
  }
}