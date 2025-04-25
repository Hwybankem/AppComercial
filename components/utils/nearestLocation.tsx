// File: MapScreen.tsx (hoặc services/locationService.ts)

import { Alert } from 'react-native';
// ... các imports khác nếu có ...

// API key
const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;

// Interfaces
interface GeoLocation {
  lat: number;
  lon: number;
  name?: string;
}
interface Vendor {
  id: string;
  name?: string;
  address?: string;
  lat?: number;
  lon?: number;
}

// Hàm lấy tọa độ từ địa chỉ - THÊM LOG LỖI CHI TIẾT
export const fetchLocationFromAddress = async (address: string): Promise<GeoLocation | null> => {
  const functionName = "[fetchLocationFromAddress]"; // Tiền tố cho log

  if (!GEOAPIFY_API_KEY) {
     console.error(`${functionName} Geoapify API Key is missing!`);
     Alert.alert("Lỗi cấu hình", "Thiếu API Key để tìm kiếm địa chỉ.");
     return null;
  }
   if (!address || address.trim() === '') {
      console.warn(`${functionName} Address is empty.`);
      return null;
  }

  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&limit=1&apiKey=${GEOAPIFY_API_KEY}`;
  console.log(`${functionName} Fetching URL: ${url.replace(GEOAPIFY_API_KEY, '***KEY***')}`); // Log URL nhưng giấu key

  try {
    const response = await fetch(url);

    // Log chi tiết nếu response không OK (ví dụ: 404, 429, 500)
    if (!response.ok) {
        const errorText = await response.text(); // Cố gắng đọc body lỗi
        console.error(`${functionName} Geoapify API error for address "${address}": ${response.status} ${response.statusText}. Response body: ${errorText}`);
        return null; // Trả về null khi có lỗi API
    }

    const data = await response.json();

    // Log nếu không tìm thấy 'features'
    if (!data.features || data.features.length === 0) {
        console.warn(`${functionName} Geoapify could not find features for address: "${address}". Response data:`, JSON.stringify(data));
        return null;
    }

    const feature = data.features[0];
    const props = feature.properties;

    // Log nếu thiếu tọa độ trong response
    if (!props || typeof props.lat !== 'number' || typeof props.lon !== 'number') {
        console.warn(`${functionName} Geoapify response missing lat/lon for address "${address}". Properties:`, JSON.stringify(props));
        return null;
    }

    // Thành công
    console.log(`${functionName} Geocoded "${address}" successfully: lat=${props.lat}, lon=${props.lon}`);
    return {
      lat: props.lat,
      lon: props.lon,
      name: props.formatted || address,
    };

  } catch (err) {
    // Log lỗi mạng hoặc lỗi parse JSON
    console.error(`${functionName} Network or JSON parse error for address "${address}":`, err);
    return null;
  }
};

// Hàm tính khoảng cách Haversine (giữ nguyên)
export function haversineDistance(coords1: GeoLocation, coords2: GeoLocation): number {
  // ... (nội dung hàm giữ nguyên) ...
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371; // Bán kính Trái Đất tính bằng km

    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lon - coords1.lon);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
}

// Hàm tìm cửa hàng gần nhất - THÊM LOG LỖI CHI TIẾT
export const findNearestStore = async (
    deliveryAddress: string,
    storeIdsInCart: string[],
    firestoreGetDocuments: (collectionName: string) => Promise<any[]>
): Promise<Vendor | null> => {
    const functionName = "[findNearestStore]"; // Tiền tố log

    console.log(`${functionName} Starting process...`);
    console.log(`${functionName} Delivery Address received: "${deliveryAddress}"`);
    console.log(`${functionName} Store IDs in Cart received:`, storeIdsInCart);

    if (!deliveryAddress || deliveryAddress.trim() === '') {
        console.error(`${functionName} Delivery address is empty or invalid.`);
        return null;
    }
    if (!storeIdsInCart || storeIdsInCart.length === 0) {
        console.warn(`${functionName} No store IDs provided in cart.`);
        return null;
    }

    // Bọc toàn bộ logic trong try...catch để bắt lỗi không mong muốn
    try {
        // 1. Lấy tọa độ địa chỉ giao hàng
        console.log(`${functionName} Step 1: Geocoding delivery address...`);
        const deliveryCoords = await fetchLocationFromAddress(deliveryAddress);
        if (!deliveryCoords) {
            // fetchLocationFromAddress đã log lỗi chi tiết bên trong nó
            console.error(`${functionName} Step 1 FAILED: Could not geocode delivery address.`);
            return null; // Không thể tiếp tục nếu không có tọa độ giao hàng
        }
         console.log(`${functionName} Step 1 SUCCESS: Delivery Coords - lat=${deliveryCoords.lat}, lon=${deliveryCoords.lon}`);

        // 2. Lấy thông tin tất cả vendors
        console.log(`${functionName} Step 2: Fetching vendors info...`);
        let allVendors: Vendor[] = [];
        try {
            const vendorsData = await firestoreGetDocuments('vendors');
            allVendors = vendorsData.map(doc => ({
                id: doc.id,
                name: doc.name || `Vendor ${doc.id}`,
                address: doc.address || undefined,
                lat: typeof doc.lat === 'number' ? doc.lat : undefined,
                lon: typeof doc.lon === 'number' ? doc.lon : undefined,
            }));
             console.log(`${functionName} Step 2 SUCCESS: Fetched ${allVendors.length} total vendors.`);
        } catch (error) {
            console.error(`${functionName} Step 2 FAILED: Error fetching vendors collection:`, error);
            return null; // Lỗi nghiêm trọng khi lấy vendors
        }

        // 3. Tìm cửa hàng gần nhất
        console.log(`${functionName} Step 3: Finding nearest store among cart items...`);
        let minDistance = Infinity;
        let nearestVendor: Vendor | null = null;
        const vendorMap = new Map(allVendors.map(v => [v.id, v]));

        // Sử dụng Promise.all để tăng tốc việc geocode địa chỉ các cửa hàng (nếu cần)
        const distancePromises = storeIdsInCart.map(async (storeId): Promise<{ vendor: Vendor; distance: number } | null> => {
            const vendor = vendorMap.get(storeId);
            if (!vendor) {
                console.warn(`${functionName} Vendor info not found in fetched data for storeId: ${storeId}. Skipping.`);
                return null;
            }

            let storeCoords: GeoLocation | null = null;
            if (vendor.lat !== undefined && vendor.lon !== undefined) {
                storeCoords = { lat: vendor.lat, lon: vendor.lon, name: vendor.address || vendor.name };
            } else if (vendor.address) {
                 console.log(`${functionName} Geocoding needed for vendor ${vendor.name || storeId}: "${vendor.address}"`);
                storeCoords = await fetchLocationFromAddress(vendor.address);
                 if (!storeCoords) {
                    console.warn(`${functionName} Failed to geocode address for vendor ${vendor.name || storeId}.`);
                 }
            } else {
                 console.warn(`${functionName} Vendor ${vendor.name || storeId} missing coordinates and address.`);
            }

            if (storeCoords) {
                const distance = haversineDistance(deliveryCoords, storeCoords);
                console.log(`${functionName} Calculated distance to ${vendor.name || storeId}: ${distance.toFixed(2)} km`);
                return { vendor, distance };
            }
            return null; // Trả về null nếu không xác định được tọa độ cửa hàng
        });

        // Đợi tất cả các phép tính/geocode hoàn thành
        const distanceResults = await Promise.all(distancePromises);

        // Lọc ra kết quả hợp lệ và tìm khoảng cách nhỏ nhất
        distanceResults.forEach(result => {
            if (result && result.distance < minDistance) {
                minDistance = result.distance;
                nearestVendor = result.vendor;
            }
        });

        // 4. Xử lý kết quả cuối cùng
        if (nearestVendor) {
            console.log(`${functionName} Step 3 SUCCESS: Nearest store found - ${nearestVendor.name || nearestVendor.id} at ${minDistance.toFixed(2)} km`);
        } else {
            console.warn(`${functionName} Step 3 FAILED: Could not determine the nearest store after checking all vendors in cart.`);
        }

        return nearestVendor;

    } catch (overallError) {
        // Bắt các lỗi không mong muốn khác trong toàn bộ quá trình
        console.error(`${functionName} An unexpected error occurred during the process:`, overallError);
        return null;
    }
};

