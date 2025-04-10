import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

// Hàm xử lý định dạng ngày tháng từ Firestore Timestamp
export default function formatDate(timestamp){
    if (!timestamp) return 'Không xác định';

    try {
        // Kiểm tra nếu timestamp là Firestore Timestamp
        if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp && 'nanoseconds' in timestamp) {
            // Chuyển đổi seconds và nanoseconds thành milliseconds
            const milliseconds = timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000;
            const date = new Date(milliseconds);
            console.log(`Đã xử lý timestamp ${JSON.stringify(timestamp)} thành:`, date);

            // Kiểm tra nếu date không hợp lệ
            if (isNaN(date.getTime())) {
                return 'Không xác định';
            }

            // Định dạng theo tiếng Việt
            return format(date, 'dd/MM/yyyy, HH:mm:ss', { locale: vi });
        }

        // Nếu không phải Firestore Timestamp, thử parse như chuỗi
        if (typeof timestamp === 'string') {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return format(date, 'dd/MM/yyyy, HH:mm:ss', { locale: vi });
            }
        }

        return 'Không xác định';
    } catch (error) {
        console.error(`Lỗi khi xử lý timestamp ${JSON.stringify(timestamp)}:`, error);
        return 'Không xác định';
    }
};