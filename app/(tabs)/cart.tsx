import React, { useEffect, useState } from "react";
import {
  FlatList,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput
} from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from '@/context/AuthContext';
import { Ionicons, Feather } from '@expo/vector-icons';
// Import các hàm cần thiết từ MapScreen hoặc service tương ứng
import { fetchLocationFromAddress, haversineDistance } from '../../components/utils/nearestLocation'; // <-- Đảm bảo đường dẫn chính xác

// Interfaces (Giữ nguyên hoặc điều chỉnh nếu cần)
interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  description: string;
}

interface Order {
  id: string; // ID của document trong collection 'orders'
  userId: string;
  productId: string;
  quantity: number;
  // storeName không còn cần thiết cho logic checkout này nữa
  createdAt: Date;
  updatedAt: Date;
  product?: Product; // Thông tin sản phẩm được fetch riêng
}

interface GeoLocation { // Cần interface này từ MapScreen
    lat: number;
    lon: number;
    name?: string;
}

interface Vendor { // Interface cho collection 'vendors'
    id: string;
    name?: string;
    address?: string;
    lat?: number; // Tọa độ có thể đã lưu sẵn
    lon?: number;
}

export default function CartScreen() {
  const [cartItems, setCartItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true); // Loading chung cho màn hình
  const [checkingOut, setCheckingOut] = useState(false); // Loading riêng cho quá trình checkout
  const [loadingItems, setLoadingItems] = useState<{ [key: string]: boolean }>({});
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const {
    getDocuments,
    getDocument,
    updateDocument,
    deleteDocument,
    addDocument
  } = useFirestore();
  const { user } = useAuth();

  // --- Load Cart Data ---
  useFocusEffect(
    React.useCallback(() => {
      const loadCartAndAddress = async () => {
        if (!user) {
          setCartItems([]);
          setDeliveryAddress('');
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          // Song song lấy địa chỉ và orders
          const addressPromise = getDocument('users', user.uid)
            .then(userData => setDeliveryAddress(userData?.address || ''))
            .catch(err => {
              console.error("Error fetching user address:", err);
              setDeliveryAddress('');
            });

          const ordersPromise = getDocuments('orders')
             .then(orders => orders.filter(order => order.userId === user.uid))
             .catch(err => {
                 console.error("Error fetching orders:", err);
                 Alert.alert("Lỗi", "Không thể tải đơn hàng trong giỏ.");
                 return []; // Trả về mảng rỗng nếu lỗi
             });

          const [_, userOrders] = await Promise.all([addressPromise, ordersPromise]);

          if (!userOrders || userOrders.length === 0) {
               setCartItems([]);
               setLoading(false);
               return; // Không có gì trong giỏ, thoát sớm
          }

          // Lấy thông tin sản phẩm cho các order
          const cartItemsWithProducts = await Promise.all(
            userOrders.map(async (order) => {
              try {
                const productData = await getDocument('products', order.productId);
                return {
                  ...order, // Giữ nguyên các trường của order
                  product: productData ? { // Thêm thông tin product nếu tìm thấy
                    id: order.productId, // Quan trọng: ID product lấy từ order.productId
                    name: productData.name || 'Sản phẩm không tên',
                    price: productData.price || 0,
                    images: Array.isArray(productData.images) ? productData.images : [],
                    description: productData.description || ''
                  } : undefined,
                };
              } catch (error) {
                console.error(`Error fetching product ${order.productId} for order ${order.id}:`, error);
                return { ...order, product: undefined }; // Trả về order gốc nếu lỗi fetch product
              }
            })
          );

          // Lọc bỏ những item không fetch được product (có thể do product đã bị xóa)
          const validCartItems = cartItemsWithProducts.filter(item => item.product) as Order[];
          setCartItems(validCartItems);

        } catch (error) {
          console.error("Error loading cart data:", error);
          Alert.alert("Lỗi", "Đã xảy ra lỗi khi tải dữ liệu giỏ hàng.");
          setCartItems([]);
        } finally {
          setLoading(false);
        }
      };
      loadCartAndAddress();
    }, [user])
  );

  // --- Checkout Logic ---
  const handleCheckout = async () => {
    // Điều kiện kiểm tra ban đầu
    if (cartItems.length === 0) { Alert.alert("Thông báo", "Giỏ hàng của bạn đang trống."); return; }
    if (!deliveryAddress || deliveryAddress.trim() === '') { Alert.alert("Yêu cầu", "Vui lòng nhập địa chỉ nhận hàng."); return; }
    if (!user) { Alert.alert("Lỗi", "Không tìm thấy thông tin người dùng."); return; }
    if (checkingOut) return; // Ngăn chặn nhấn nhiều lần

    setCheckingOut(true); // Bật loading checkout

    try {
      // --- Bước 1: Lấy tọa độ người dùng ---
      console.log("[Checkout] Step 1: Geocoding delivery address...");
      const userCoords = await fetchLocationFromAddress(deliveryAddress);
      if (!userCoords) {
        Alert.alert("Lỗi địa chỉ", "Không thể xác định vị trí từ địa chỉ giao hàng của bạn. Vui lòng kiểm tra lại.");
        setCheckingOut(false);
        return;
      }
      console.log(`[Checkout] Step 1 SUCCESS: User Coords - lat=${userCoords.lat}, lon=${userCoords.lon}`);

      // --- Bước 2: Lấy tất cả Vendors ---
      console.log("[Checkout] Step 2: Fetching all vendors...");
      let allVendors: Vendor[] = [];
      try {
          const vendorsData = await getDocuments('vendors');
          if (!vendorsData || vendorsData.length === 0) {
              Alert.alert("Lỗi hệ thống", "Không tìm thấy thông tin cửa hàng nào.");
              setCheckingOut(false);
              return;
          }
          allVendors = vendorsData.map(doc => ({
              id: doc.id,
              name: doc.name || `Cửa hàng ${doc.id}`,
              address: doc.address || undefined,
              lat: typeof doc.lat === 'number' ? doc.lat : undefined,
              lon: typeof doc.lon === 'number' ? doc.lon : undefined,
          }));
           console.log(`[Checkout] Step 2 SUCCESS: Fetched ${allVendors.length} vendors.`);
      } catch (error) {
          console.error("[Checkout] Step 2 FAILED: Error fetching vendors:", error);
          Alert.alert("Lỗi hệ thống", "Không thể tải danh sách cửa hàng.");
          setCheckingOut(false);
          return;
      }

      // --- Bước 3: Tìm Vendor gần nhất ---
      console.log("[Checkout] Step 3: Finding nearest vendor...");
      let minDistance = Infinity;
      let nearestVendor: Vendor | null = null;

      // Dùng Promise.all để xử lý bất đồng bộ việc lấy tọa độ vendor (nếu cần)
      const vendorDistances = await Promise.all(
          allVendors.map(async (vendor) => {
              let vendorCoords: GeoLocation | null = null;
              // Ưu tiên tọa độ đã lưu
              if (vendor.lat !== undefined && vendor.lon !== undefined) {
                  vendorCoords = { lat: vendor.lat, lon: vendor.lon };
              }
              // Nếu không có, thử geocode từ địa chỉ
              else if (vendor.address) {
                   console.log(`[Checkout] Geocoding needed for vendor ${vendor.name || vendor.id}`);
                   vendorCoords = await fetchLocationFromAddress(vendor.address);
                   if (!vendorCoords) {
                       console.warn(`[Checkout] Failed to geocode address for vendor ${vendor.name || vendor.id}: "${vendor.address}"`);
                   }
              } else {
                  console.warn(`[Checkout] Vendor ${vendor.name || vendor.id} missing coordinates and address.`);
              }

              // Nếu có tọa độ vendor, tính khoảng cách
              if (vendorCoords) {
                  const distance = haversineDistance(userCoords, vendorCoords);
                  console.log(`[Checkout] Distance to ${vendor.name || vendor.id}: ${distance.toFixed(2)} km`);
                  return { vendor, distance };
              }
              return null; // Bỏ qua vendor này nếu không có tọa độ
          })
      );

      // Tìm vendor có khoảng cách nhỏ nhất từ kết quả hợp lệ
      vendorDistances.forEach(result => {
          if (result && result.distance < minDistance) {
              minDistance = result.distance;
              nearestVendor = result.vendor;
          }
      });

      // Kiểm tra kết quả tìm kiếm vendor
      if (!nearestVendor) {
          Alert.alert("Lỗi tìm kiếm", "Không tìm thấy cửa hàng nào phù hợp hoặc có thể xác định vị trí xung quanh bạn.");
          setCheckingOut(false);
          return;
      }
       console.log(`[Checkout] Step 3 SUCCESS: Nearest vendor found - ${nearestVendor.name} (ID: ${nearestVendor.id}) at ${minDistance.toFixed(2)} km`);


      // --- Bước 4: Tạo Transaction (bao gồm TẤT CẢ items trong giỏ) ---
      console.log("[Checkout] Step 4: Creating transaction...");
      const totalAmount = cartItems.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0);
      const transaction = {
        userId: user.uid,
        phoneUser: user.phoneNumber || '', // Lấy SĐT user nếu có
        storeId: nearestVendor?.id || '',          // ID cửa hàng gần nhất
        storeName: nearestVendor?.name || '', // Tên cửa hàng gần nhất
        items: cartItems.map(item => ({     // Tất cả items trong giỏ
          productId: item.productId,
          productName: item.product?.name || 'Không rõ tên',
          quantity: item.quantity,
          price: item.product?.price || 0,
        })),
        totalAmount: totalAmount,
        deliveryAddress: deliveryAddress, // Địa chỉ giao hàng đã nhập
        deliveryLat: userCoords.lat,      // Lưu lại tọa độ giao hàng để tham khảo
        deliveryLon: userCoords.lon,
        status: 'pending', // Trạng thái ban đầu
        createdAt: new Date(),
        updatedAt: new Date(),
      };
       console.log("[Checkout] Step 4 SUCCESS: Transaction object created:", transaction);


      // --- Bước 5: Lưu Transaction vào Firestore ---
      console.log("[Checkout] Step 5: Adding transaction to Firestore...");
      const transactionRef = await addDocument('transactions', transaction);
      console.log(`[Checkout] Step 5 SUCCESS: Transaction added with ID: ${transactionRef.id}`);


      // --- Bước 6: Xóa các Order Items khỏi Firestore ---
      console.log("[Checkout] Step 6: Deleting items from 'orders' collection...");
      const orderIdsToDelete = cartItems.map(item => item.id); // Lấy ID của các document trong 'orders'
      const deletePromises = orderIdsToDelete.map(orderId => deleteDocument('orders', orderId));
      await Promise.all(deletePromises);
      console.log(`[Checkout] Step 6 SUCCESS: Deleted ${orderIdsToDelete.length} items from orders.`);

      // --- Bước 7: Cập nhật UI và Thông báo ---
      console.log("[Checkout] Step 7: Updating UI and showing success message...");
      setCartItems([]); // Xóa sạch giỏ hàng trên UI
      Alert.alert(
          "Đặt hàng thành công!",
          `Đơn hàng của bạn đã được tạo và sẽ được xử lý bởi cửa hàng gần nhất: ${nearestVendor.name}.`
          // Bạn có thể thêm nút để xem chi tiết đơn hàng nếu muốn
      );
       // Optional: Điều hướng đến màn hình xác nhận hoặc danh sách đơn hàng
       // router.push('/order-confirmation/' + transactionRef.id);


    } catch (error) {
      // Xử lý lỗi chung trong quá trình checkout
      console.error("[Checkout] OVERALL ERROR:", error);
      Alert.alert("Lỗi", "Đã xảy ra lỗi không mong muốn trong quá trình đặt hàng. Vui lòng thử lại.");
      // Có thể thêm các xử lý lỗi chi tiết hơn nếu cần
    } finally {
      setCheckingOut(false); // Tắt loading checkout dù thành công hay thất bại
    }
  };

  // --- Các hàm quản lý số lượng và xóa item (Giữ nguyên logic cập nhật Firestore và UI) ---
  const updateItemQuantity = async (id: string, newQuantity: number) => {
      if (!user) return;
      const originalCartItems = [...cartItems];
      const itemIndex = cartItems.findIndex(item => item.id === id);
      if (itemIndex === -1) return;

      setLoadingItems(prev => ({ ...prev, [id]: true }));
      const updatedCartItems = cartItems.map((item, index) =>
        index === itemIndex ? { ...item, quantity: newQuantity } : item
      );
      setCartItems(updatedCartItems);

      try {
        await updateDocument('orders', id, { quantity: newQuantity, updatedAt: new Date() });
      } catch (error) {
        console.error(`Error updating quantity for item ${id}:`, error);
        Alert.alert("Lỗi", "Không thể cập nhật số lượng.");
        setCartItems(originalCartItems); // Rollback UI
      } finally {
        setLoadingItems(prev => ({ ...prev, [id]: false }));
      }
    };

    const increaseQuantity = (id: string) => {
      const item = cartItems.find(item => item.id === id);
      if (item) updateItemQuantity(id, item.quantity + 1);
    };

    const decreaseQuantity = (id: string) => {
      const item = cartItems.find(item => item.id === id);
      if (item) {
        if (item.quantity <= 1) removeFromCart(id);
        else updateItemQuantity(id, item.quantity - 1);
      }
    };

    const removeFromCart = (id: string) => {
      if (!user) return;
      Alert.alert(
        "Xóa sản phẩm",
        "Bạn có chắc muốn xóa sản phẩm này?",
        [
          { text: "Hủy", style: "cancel" },
          {
            text: "Xóa",
            style: "destructive",
            onPress: async () => {
              const originalCartItems = [...cartItems];
              const updatedCartItems = cartItems.filter(item => item.id !== id);
              setCartItems(updatedCartItems); // Update UI first
              try {
                await deleteDocument('orders', id); // Delete from DB
              } catch (error) {
                console.error("Error removing item from cart:", error);
                Alert.alert("Lỗi", "Không thể xóa sản phẩm.");
                setCartItems(originalCartItems); // Rollback UI
              }
            },
          },
        ]
      );
    };


  // --- Hàm Render Item ---
  const renderCartItem = ({ item }: { item: Order }) => {
    // Item lỗi (không có product data)
    if (!item.product) {
      return (
         <View style={[styles.cartItem, styles.errorItem]}>
           <View style={styles.productInfoError}>
                <Text style={styles.errorText}>Lỗi: Không thể tải thông tin sản phẩm</Text>
                <Text style={styles.errorSubText}>(ID Đơn hàng: {item.id})</Text>
           </View>
           <TouchableOpacity style={styles.removeButtonError} onPress={() => removeFromCart(item.id)}>
             <Ionicons name="trash-outline" size={24} color="#EF4444" />
           </TouchableOpacity>
         </View>
      );
    }
    // Item bình thường
    return (
      <View style={styles.cartItem}>
        <Image
          source={{ uri: item.product.images?.[0] || 'https://via.placeholder.com/150' }}
          style={styles.productImage}
          resizeMode="cover"
        />
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.product.name}</Text>
          <Text style={styles.productPrice}>{(item.product.price || 0).toLocaleString('vi-VN')}đ</Text>
          <View style={styles.quantityContainer}>
             {/* Nút giảm */}
             <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => decreaseQuantity(item.id)}
                disabled={loadingItems[item.id]} >
               <Ionicons name="remove" size={18} color={loadingItems[item.id] ? '#D1D5DB' : '#4B5563'} />
             </TouchableOpacity>
             {/* Số lượng hoặc loading */}
             {loadingItems[item.id]
                 ? <ActivityIndicator size="small" color="#3B82F6" style={styles.quantityLoading} />
                 : <Text style={styles.quantityText}>{item.quantity}</Text>
             }
             {/* Nút tăng */}
             <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => increaseQuantity(item.id)}
                disabled={loadingItems[item.id]} >
               <Ionicons name="add" size={18} color={loadingItems[item.id] ? '#D1D5DB' : '#4B5563'} />
             </TouchableOpacity>
          </View>
        </View>
         {/* Nút xóa */}
        <TouchableOpacity
           style={styles.removeButton}
           onPress={() => removeFromCart(item.id)}
           disabled={loadingItems[item.id]} >
          <Ionicons name="trash-outline" size={24} color={loadingItems[item.id] ? '#FECACA' : '#EF4444'} />
        </TouchableOpacity>
      </View>
    );
  };


  // --- Render Giao diện chính ---

  // Loading ban đầu
  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#3B82F6" /><Text style={styles.loadingText}>Đang tải...</Text></View>;
  }

  // Chưa đăng nhập
  if (!user) {
    return (
      <View style={styles.emptyCartContainer}>
         <Stack.Screen options={{ title: "Giỏ hàng", headerRight: () => null }} />
        <Ionicons name="log-in-outline" size={64} color="#9CA3AF" />
        <Text style={styles.emptyCartText}>Vui lòng đăng nhập</Text>
        <TouchableOpacity style={styles.shopButton} onPress={() => router.push('/login')}>
          <Text style={styles.shopButtonText}>Đăng nhập</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Đã đăng nhập
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Giỏ hàng",
          headerRight: () => (
            // Chỉ hiện nút checkout khi có hàng VÀ không đang checkout
            cartItems.length > 0 ? (
              <TouchableOpacity
                style={[styles.checkoutButton, checkingOut && styles.checkoutButtonDisabled]}
                onPress={handleCheckout}
                disabled={checkingOut} // Disable khi đang xử lý
              >
                {checkingOut ? (
                    <ActivityIndicator size="small" color="#FFF" style={{ paddingHorizontal: 18 }}/> // Căn chỉnh loading
                ) : (
                    <Text style={styles.checkoutButtonText}>Thanh toán</Text>
                )}
              </TouchableOpacity>
            ) : null // Ẩn nếu giỏ trống
          ),
        }}
      />

      {cartItems.length === 0 ? (
        // Giỏ hàng trống
        <View style={styles.emptyCartContainer}>
          <Ionicons name="cart-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyCartText}>Giỏ hàng của bạn trống</Text>
          <TouchableOpacity style={styles.shopButton} onPress={() => router.push('/')}>
            <Text style={styles.shopButtonText}>Tiếp tục mua sắm</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Có sản phẩm trong giỏ
        <FlatList
          data={cartItems}
          renderItem={renderCartItem}
          keyExtractor={(item) => item.id} // ID của order là đủ unique trong giỏ
          style={styles.listContainer}
          ListHeaderComponent={ // Header là phần địa chỉ
            <View style={styles.addressSection}>
              <View style={styles.addressHeader}>
                <Feather name="map-pin" size={18} color="#4B5563" />
                <Text style={styles.addressTitle}>Giao đến địa chỉ</Text>
              </View>
              <TextInput
                style={styles.addressInput}
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
                placeholder="Nhập địa chỉ nhận hàng..."
                multiline={true}
                textAlignVertical="top"
                blurOnSubmit={true}
              />
            </View>
          }
          // ItemSeparatorComponent={() => <View style={styles.separator} />} // Bỏ separator nếu dùng margin
          ListFooterComponent={<View style={{ height: 20 }} />} // Khoảng trống dưới
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

// ----- Styles (Giữ nguyên hoặc chỉnh sửa từ lần trước nếu cần) -----
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  listContainer: {
    flex: 1,
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
  emptyCartContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#F9FAFB',
  },
  emptyCartText: {
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
  // Address Section
  addressSection: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 10,
  },
  addressInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    minHeight: 60,
    color: '#111827',
    backgroundColor: '#FFF',
    textAlignVertical: 'top',
  },
  // Cart Item
  cartItem: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Căn lề trên cho các thành phần con
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: 'white',
    marginHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12, // Khoảng cách giữa các item
    //borderWidth: 1, // Bỏ viền nếu dùng đổ bóng
    //borderColor: '#E5E7EB',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  errorItem: { // Style riêng cho item lỗi
      borderColor: '#FECACA',
      backgroundColor: '#FEF2F2',
      shadowOpacity: 0,
      elevation: 0,
  },
  productImage: {
    width: 75, // Giảm kích thước ảnh một chút
    height: 75,
    borderRadius: 8,
    marginRight: 12, // Giảm khoảng cách
    marginTop: 2, // Đẩy ảnh xuống một chút để cân đối hơn khi align-items: flex-start
    backgroundColor: '#E5E7EB',
  },
  productInfo: {
    flex: 1, // Cho phép chiếm không gian còn lại
    // Không cần height cố định
  },
  productInfoError: { // Dành riêng cho item lỗi
      flex: 1,
      justifyContent: 'center', // Căn giữa text báo lỗi
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 5,
  },
  productPrice: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: '700',
    marginBottom: 10, // Tăng khoảng cách trước bộ số lượng
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // Không cần marginTop: 'auto'
  },
  quantityButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    minWidth: 35,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  quantityLoading: {
    width: 35,
    marginHorizontal: 8,
  },
  removeButton: {
    paddingLeft: 10, // Giảm padding trái
    //paddingVertical: 5, // Giảm padding dọc để không quá cao
    marginLeft: 5, // Giảm margin
    // Thêm chiều cao cố định và căn giữa icon nếu cần
     height: 30, // Ví dụ: bằng chiều cao nút số lượng
     justifyContent: 'center',
     alignItems: 'center',
     marginTop: 4 // Đẩy xuống chút cho cân đối với tên SP
  },
   removeButtonError: { // Style nút xóa cho item lỗi
       paddingLeft: 10,
       marginLeft: 5,
       justifyContent: 'center', // Căn giữa icon
   },
  // Checkout Button
  checkoutButton: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
    marginRight: 10,
    minWidth: 90, // Độ rộng tối thiểu để chứa cả loading
    alignItems: 'center', // Căn giữa nội dung (text hoặc loading)
  },
   checkoutButtonDisabled: {
       backgroundColor: '#9CA3AF',
   },
  checkoutButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  // Error Text in Item
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
  separator: { // Style cho đường kẻ nếu bạn muốn dùng lại
    height: 1,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 12,
  },
});