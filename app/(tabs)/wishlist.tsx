import React, { useState, useEffect } from "react";
import { Alert, FlatList, View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"; // Thêm ActivityIndicator
import { Link, useFocusEffect, Stack, router } from "expo-router"; // Thêm Stack, router
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons'; // Đã có Ionicons

// Định nghĩa interface cho sản phẩm (Giữ nguyên)
interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  description: string;
}

// Định nghĩa interface cho mục yêu thích (Giữ nguyên)
interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
  product?: Product;
}

export default function WishlistScreen() {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { getDocuments, getDocument, deleteDocument } = useFirestore();
  const { user } = useAuth();

  useFocusEffect(
    React.useCallback(() => {
      const loadWishlist = async () => {
        if (!user) {
          setWishlistItems([]);
          setLoading(false);
          return;
        }

        // Logic tải wishlist khi đã đăng nhập (Giữ nguyên)
        try {
          setLoading(true);
          const wishlistData = await getDocuments('wishlist');
          const userWishlist = wishlistData.filter(item => item.userId === user.uid);
          const wishlistItemsWithProducts = await Promise.all(
            userWishlist.map(async (item) => {
              try {
                const productData = await getDocument('products', item.productId);
                return {
                  ...item,
                  product: productData ? {
                    id: item.productId, // Sửa lại lấy ID từ item
                    name: productData.name || 'Sản phẩm không tên',
                    price: productData.price || 0,
                    images: Array.isArray(productData.images) ? productData.images : [],
                    description: productData.description || ''
                  } : undefined
                };
              } catch (error) {
                console.error(`Error fetching product ${item.productId}:`, error);
                // Trả về item gốc kèm product là undefined để có thể lọc hoặc hiển thị lỗi sau
                return { ...item, product: undefined };
              }
            })
          );
           // Lọc bỏ những item không fetch được product
          const validWishlistItems = wishlistItemsWithProducts.filter(item => item.product) as WishlistItem[];
          setWishlistItems(validWishlistItems);

        } catch (error) {
          console.error("Error loading wishlist:", error);
          Alert.alert("Lỗi", "Không thể tải danh sách yêu thích.");
          setWishlistItems([]); // Set rỗng nếu lỗi
        } finally {
          setLoading(false);
        }
      };
      loadWishlist();
    }, [user]) // Thêm user vào dependency array
  );

  // Hàm removeFromWishlist (Giữ nguyên)
  const removeFromWishlist = async (itemId: string) => {
    if (!user) return;
    Alert.alert(
      "Xác nhận xóa",
      "Bạn có chắc chắn muốn xóa sản phẩm này khỏi danh sách yêu thích?",
      [
        { text: "Hủy", style: "cancel", },
        {
          text: "Xóa",
          onPress: async () => {
            // Tạm thời xóa khỏi UI để phản hồi nhanh
            const originalItems = [...wishlistItems];
            setWishlistItems(prevItems => prevItems.filter(item => item.id !== itemId));
            try {
              await deleteDocument('wishlist', itemId);
              // Alert thành công có thể bỏ nếu muốn ít thông báo hơn
              // Alert.alert("Thành công", "Sản phẩm đã được xóa khỏi danh sách yêu thích!");
            } catch (error) {
              console.error("Error removing item from wishlist:", error);
              Alert.alert("Lỗi", "Không thể xóa sản phẩm. Vui lòng thử lại sau.");
              setWishlistItems(originalItems); // Khôi phục UI nếu lỗi
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  // Hàm renderWishlistItem (Giữ nguyên, nhưng có thể thêm xử lý item.product undefined)
 const renderWishlistItem = ({ item }: { item: WishlistItem }) => {
    // Xử lý trường hợp product không load được (ví dụ sản phẩm đã bị xóa)
    if (!item.product) {
      return (
         <View style={[styles.wishlistItem, styles.errorItem]}>
           <View style={styles.productInfoError}>
               <Text style={styles.errorText}>Lỗi: Sản phẩm không tồn tại</Text>
               <Text style={styles.errorSubText}>(ID Mục: {item.id})</Text>
           </View>
           <TouchableOpacity
             style={styles.removeButton}
             onPress={() => removeFromWishlist(item.id)} // Vẫn cho phép xóa mục lỗi
           >
             <Ionicons name="trash-outline" size={20} color="#EF4444" />
           </TouchableOpacity>
         </View>
      );
    }

    // Render item bình thường
    return (
        // Bọc bằng TouchableOpacity thay vì Link để xử lý onPress dễ hơn
        <TouchableOpacity onPress={() => router.push(`/product/${item.productId}`)} style={styles.linkTouchable}>
            <View style={styles.wishlistItem}>
                <Image
                    source={{ uri: item.product.images?.[0] || 'https://via.placeholder.com/150' }} // Ảnh mặc định
                    style={styles.productImage}
                    resizeMode="cover" // Đảm bảo ảnh vừa khung
                />
                <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>{item.product.name}</Text>
                    {/* <Text style={styles.productDescription} numberOfLines={1}>
                        {item.product.description}
                    </Text> */}
                    <Text style={styles.productPrice}>
                        {item.product.price.toLocaleString('vi-VN')}đ
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.removeButton}
                    onPress={(e) => {
                        e.stopPropagation(); // Ngăn sự kiện press lan ra ngoài vào TouchableOpacity cha
                        removeFromWishlist(item.id);
                    }}
                >
                    <Ionicons name="trash-outline" size={24} color="#EF4444" />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );
};


  // ----- Render Logic -----

  // Trạng thái Loading
  if (loading) {
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
    );
  }

  // Trạng thái Chưa đăng nhập (Áp dụng style mới)
  if (!user) {
    return (
      <View style={styles.emptyCartContainer}>
        <Stack.Screen options={{ title: "Yêu thích", headerRight: () => null }} />
        <Ionicons name="log-in-outline" size={64} color="#9CA3AF" />
        <Text style={styles.emptyCartText}>Vui lòng đăng nhập để xem danh sách yêu thích</Text>
        <TouchableOpacity style={styles.shopButton} onPress={() => router.push('/login')}>
          <Text style={styles.shopButtonText}>Đăng nhập</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Trạng thái Đã đăng nhập
  return (
    <View style={styles.container}>
       <Stack.Screen options={{ title: "Danh sách yêu thích" }} />
      {wishlistItems.length === 0 ? (
        // Danh sách yêu thích trống
        <View style={styles.emptyContainer}>
           <Ionicons name="heart-outline" size={64} color="#9CA3AF" />
           <Text style={styles.emptyText}>Danh sách yêu thích của bạn đang trống</Text>
           <TouchableOpacity style={[styles.shopButton, {marginTop: 20}]} onPress={() => router.push('/')}>
                <Text style={styles.shopButtonText}>Khám phá sản phẩm</Text>
            </TouchableOpacity>
        </View>
      ) : (
        // Có sản phẩm trong danh sách yêu thích
        <FlatList
          data={wishlistItems}
          renderItem={renderWishlistItem}
          keyExtractor={(item) => item.id}
          style={styles.listContainer}
          contentContainerStyle={{ padding: 16 }} // Padding cho toàn bộ list
          // ItemSeparatorComponent={() => <View style={styles.separator} />} // Thêm đường kẻ nếu muốn
        />
      )}
    </View>
  );
}

// ----- StyleSheet -----
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB', // Màu nền chung
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  // --- START: Styles copy từ CartScreen ---
  emptyCartContainer: { // Đổi tên thành emptyContainer cho dễ hiểu hơn
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#F9FAFB',
  },
  emptyCartText: { // Đổi tên thành emptyText
    fontSize: 18,
    color: '#4B5563',
    marginTop: 20,
    marginBottom: 30,
    textAlign: 'center',
  },
  shopButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  shopButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // --- END: Styles copy từ CartScreen ---
   emptyContainer: { // Dùng cho cả chưa đăng nhập và wishlist trống
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 30,
      backgroundColor: '#F9FAFB', // Đồng bộ màu nền
    },
    emptyText: {
      fontSize: 17, // Cỡ chữ phù hợp hơn
      color: '#6B7280', // Màu xám
      marginTop: 20,
      textAlign: 'center', // Căn giữa
    },
  listContainer: {
    flexGrow: 1, // Cho phép list co giãn
    // gap: 12, // Thay bằng padding trong contentContainerStyle và margin của item
  },
  linkTouchable: { // Style cho TouchableOpacity thay vì Link
    marginBottom: 12, // Khoảng cách giữa các item
  },
  wishlistItem: {
    flexDirection: 'row',
    alignItems: 'center', // Căn giữa theo chiều dọc
    backgroundColor: 'white',
    padding: 12, // Giảm padding chút
    borderRadius: 10, // Giảm bo góc
    // marginBottom: 12, // Chuyển margin ra ngoài TouchableOpacity
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, // Giảm độ đổ bóng
    shadowRadius: 3,
    elevation: 2,
  },
  errorItem: { // Style cho item lỗi
      borderColor: '#FECACA',
      backgroundColor: '#FEF2F2',
      shadowOpacity: 0,
      elevation: 0,
  },
  productInfoError: { // Style cho text lỗi
      flex: 1,
      justifyContent: 'center',
      marginRight: 10, // Khoảng cách với nút xóa
  },
  errorText: {
      color: '#B91C1C',
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 2,
  },
  errorSubText: {
      color: '#DC2626',
      fontSize: 12,
  },
  productImage: {
    width: 70, // Giảm kích thước ảnh
    height: 70,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#E5E7EB', // Màu nền fallback
  },
  productInfo: {
    flex: 1, // Chiếm không gian còn lại
    justifyContent: 'center', // Căn giữa nội dung text
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  productDescription: { // Có thể bỏ nếu không cần
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
  },
  productPrice: {
    fontSize: 15, // Giảm cỡ chữ giá
    fontWeight: 'bold',
    color: '#DC2626', // Màu đỏ cho giá
    marginTop: 4, // Khoảng cách với tên
  },
  removeButton: {
    padding: 8, // Vùng bấm lớn hơn
    marginLeft: 8, // Khoảng cách với productInfo
  },
  separator: { // Style cho đường kẻ nếu cần
    height: 1,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 16, // Thêm margin ngang
    marginVertical: 4, // Khoảng cách dọc nhỏ
  },
});