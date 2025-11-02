
import { WasteCategory, WasteCategoryDetails } from './types';

export const CATEGORY_DETAILS: Record<WasteCategory, WasteCategoryDetails> = {
  "Rác Hữu Cơ": {
    displayName: "Rác Hữu Cơ",
    colorClasses: "text-amber-800 bg-amber-100 border-amber-700",
    description: "ĐÂY LÀ RÁC HỮU CƠ. (Ví dụ: vỏ trái cây/rau, bã cà phê).",
    instructions: "Bạn nên bỏ vào thùng rác hữu cơ (màu xanh lá). (Lưu ý: Hạn chế bỏ thịt, xương, dầu mỡ nhiều)."
  },
  "Giấy Tái Chế": {
    displayName: "Giấy Tái Chế",
    colorClasses: "text-blue-800 bg-blue-100 border-blue-700",
    description: "ĐÂY LÀ GIẤY TÁI CHẾ. (Ví dụ: giấy in, bìa carton sạch, bì thư).",
    instructions: "Vui lòng đảm bảo giấy sạch, khô, không dính thức ăn và bỏ vào thùng tái chế. (Lưu ý: KHÔNG bỏ giấy ướt/bẩn, ly giấy chống thấm)."
  },
  "Nhựa Tái Chế": {
    displayName: "Nhựa Tái Chế",
    colorClasses: "text-yellow-800 bg-yellow-100 border-yellow-700",
    description: "ĐÂY LÀ NHỰA TÁI CHẾ. (Ví dụ: chai PET, hộp PP/HDPE, nắp nhựa).",
    instructions: "Vui lòng tráng sơ qua cho sạch và bỏ vào thùng tái chế. (Lưu ý: KHÔNG bỏ xốp EPS, đồ nhựa dính bẩn nhiều)."
  },
  "Kim Loại Tái Chế": {
    displayName: "Kim Loại Tái Chế",
    colorClasses: "text-gray-800 bg-gray-200 border-gray-700",
    description: "ĐÂY LÀ KIM LOẠI TÁI CHẾ. (Ví dụ: lon nhôm/sắt, giấy bạc sạch).",
    instructions: "Vui lòng rửa sơ qua và bỏ vào thùng tái chế. (Lưu ý: TUYỆT ĐỐI KHÔNG bỏ pin, bình ắc quy, vật sắc nhọn vào đây)."
  },
  "Rác Khác": {
    displayName: "Rác Khác",
    colorClasses: "text-black bg-gray-300 border-gray-900",
    description: "ĐÂY LÀ RÁC KHÁC. (Ví dụ: xốp, gốm sứ, khẩu trang, đồ bẩn khó rửa).",
    instructions: "Đây là rác không tái chế hoặc khó xử lý. Vui lòng bỏ vào thùng rác còn lại (màu xám)."
  }
};
