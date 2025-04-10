import { Platform } from 'react-native';

const IMGBB_API_KEY = '1f401dd71ebebbb3b6ccf0b61c4b24ee'; // Thay thế bằng API key của bạn
const API_URL = 'https://api.imgbb.com/1/upload';

export const uploadToImgBB = async (uri: string): Promise<string> => {
    try {
        console.log('Bắt đầu quá trình upload ảnh lên ImgBB...');
        console.log('URI ảnh:', uri);
        console.log('Platform:', Platform.OS);

        const formData = new FormData();

        if (Platform.OS === 'web') {
            console.log('Xử lý upload cho web...');
            // Xử lý cho web
            const response = await fetch(uri);
            const blob = await response.blob();
            console.log('Đã chuyển đổi ảnh thành blob');
            formData.append('image', blob, 'image.jpg');
        } else {
            console.log('Xử lý upload cho Android...');
            // Xử lý cho Android
            const response = await fetch(uri);
            const blob = await response.blob();
            console.log('Đã chuyển đổi ảnh thành blob cho Android');
            formData.append('image', blob, 'image.jpg');
        }

        console.log('Đang gửi request lên ImgBB...');
        const response = await fetch(`${API_URL}?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            console.error('Lỗi response từ ImgBB:', response.status, response.statusText);
            throw new Error('Upload failed');
        }

        const data = await response.json();
        console.log('Upload thành công! URL ảnh:', data.data.url);
        return data.data.url; // Trả về URL của ảnh đã upload
    } catch (error) {
        console.error('Lỗi chi tiết khi upload lên ImgBB:', error);
        throw error;
    }
}; 