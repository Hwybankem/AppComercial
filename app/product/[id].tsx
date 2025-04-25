import React, { useState, useEffect } from 'react';
import { Link, Stack, useLocalSearchParams, router } from "expo-router";
import { Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert, Dimensions, Platform } from 'react-native';
import { View, FlatList, TextInput } from "react-native";
import { Feather } from '@expo/vector-icons';
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from '@/context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { uploadToImgBB } from '@/services/imgbbService';
import timeParse from '@/components/utils/timeParse';
// Bỏ AsyncStorage nếu không dùng trực tiếp ở đây
// import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Interfaces giữ nguyên ---
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
  categories: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface Order {
  id?: string;
  userId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Wishlist {
  id?: string;
  userId: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Vendor {
  id: string;
  name?: string;
  phone?: string;
  address?: string;
}

// Interface cho VendorProduct (quan trọng để biết cấu trúc)
interface VendorProduct {
    id: string;         // ID của document trong vendor_products
    vendorId: string;   // ID của cửa hàng (liên kết với collection 'vendors') - **QUAN TRỌNG: Đảm bảo field này tồn tại và đúng tên**
    products: string;   // Tên sản phẩm (hoặc productId nếu bạn dùng ID)
    stock: number;      // Số lượng tồn kho của sản phẩm tại cửa hàng này
    // Thêm các trường khác nếu có
}


export default function ProductsDetail() {
  const { id } = useLocalSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const screenWidth = Dimensions.get('window').width;
  const { getDocument, addDocument, getDocuments, updateDocument, deleteDocument } = useFirestore();
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [newReview, setNewReview] = useState('');
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true); // Vẫn giữ state loading riêng cho vendors
  const [isSubmittingReview, setIsSubmittingReview] = useState(false); // State quản lý trạng thái submit review

  // Gộp logic tải product và vendors vào một hàm để dễ quản lý
  useEffect(() => {
    if (id) {
        loadProductAndRelatedVendors();
    } else {
        // Xử lý trường hợp không có ID
        setLoadingProduct(false);
        setLoadingVendors(false);
        setProduct(null);
        setVendors([]);
    }
  }, [id]); // Chỉ chạy lại khi ID thay đổi

  const loadProductAndRelatedVendors = async () => {
    setLoadingProduct(true);
    setLoadingVendors(true); // Bắt đầu load cả vendors
    setProduct(null); // Reset state trước khi load
    setVendors([]);   // Reset state trước khi load
    try {
      // 1. Tải thông tin sản phẩm chính
      const productData = await getDocument('products', String(id));

      if (productData) {
        // 2. Tải TOÀN BỘ liên kết sản phẩm-cửa hàng
        const vendorProductsData = await getDocuments('vendor_products');
        const allVendorProducts: VendorProduct[] = vendorProductsData.map(doc => ({
          id: doc.id || '',
          vendorId: doc.vendorId || '',
          products: doc.products || '',
          stock: Number(doc.stock) || 0
        }));

        // 3. Lọc ra các liên kết cho sản phẩm HIỆN TẠI
        //    **QUAN TRỌNG**: Đảm bảo `vp.products` khớp với `productData.name`.
        //    Nếu bạn dùng ID sản phẩm để liên kết, hãy đổi thành `vp.productId === productData.id`
        const relevantVendorProducts = allVendorProducts.filter(
          vp => vp.products === productData.name
        );

        // 4. Xác định stock (ưu tiên stock từ cửa hàng nếu có)
        //    Logic này lấy stock từ *bản ghi đầu tiên tìm thấy*.
        //    Cân nhắc xem bạn muốn hiển thị tổng stock hay stock của một cửa hàng cụ thể ở đây.
        const vendorProductInfo = relevantVendorProducts.length > 0 ? relevantVendorProducts[0] : null;
        const stock = vendorProductInfo
                      ? Number(vendorProductInfo.stock) || 0
                      : Number(productData.stock) || 0; // Fallback về stock gốc của sản phẩm

        // 5. Format thông tin sản phẩm
        const formattedProduct: Product = {
          id: productData.id,
          name: productData.name || '',
          description: productData.description || '',
          price: productData.price || 0,
          stock: stock, // Sử dụng stock đã xác định
          categories: productData.categories || [],
          images: Array.isArray(productData.images) ? productData.images : [],
          createdAt: productData.createdAt?.toDate() || new Date(),
          updatedAt: productData.updatedAt?.toDate() || new Date()
        };
        setProduct(formattedProduct); // Cập nhật state sản phẩm

        // 6. Tải danh sách cửa hàng (vendors) dựa trên `relevantVendorProducts`
        try {
            // 6a. Lấy danh sách ID của các cửa hàng có bán sản phẩm này
            //     **QUAN TRỌNG**: Đảm bảo document trong `vendor_products` có field `vendorId` chứa ID của cửa hàng.
            const vendorIdsWithProduct = relevantVendorProducts.map(vp => vp.id);

            // 6b. Tải TOÀN BỘ danh sách cửa hàng gốc từ collection 'vendors'
            const allVendorsData = await getDocuments('vendors');

            let finalVendorsData: any[] = [];

            // 6c. Quyết định danh sách cửa hàng cần hiển thị
            if (vendorIdsWithProduct.length > 0) {
                // * Chỉ lấy những cửa hàng có ID nằm trong danh sách `vendorIdsWithProduct`
                finalVendorsData = allVendorsData.filter(vendor =>
                    vendorIdsWithProduct.includes(vendor.id)
                );
                console.log(`Tìm thấy ${finalVendorsData.length} cửa hàng có sản phẩm '${formattedProduct.name}'`);
            } else {
                // * Fallback: Lấy tất cả cửa hàng nếu không có cửa hàng nào liên kết với sản phẩm
                finalVendorsData = allVendorsData;
                 console.log(`Không tìm thấy cửa hàng nào có sản phẩm '${formattedProduct.name}'. Hiển thị tất cả ${finalVendorsData.length} cửa hàng.`);
            }

            // 6d. Format lại dữ liệu vendors để hiển thị
            const formattedVendors: Vendor[] = finalVendorsData.map(doc => ({
                id: doc.id,
                name: doc.name || 'N/A', // Thêm 'N/A' nếu không có tên
                phone: doc.phone || 'N/A',
                address: doc.address || 'N/A',
            }));
            setVendors(formattedVendors);

        } catch (vendorError) {
             console.error("Lỗi khi tải hoặc lọc danh sách cửa hàng:", vendorError);
             setVendors([]); // Set rỗng nếu có lỗi
        } finally {
            setLoadingVendors(false); // Kết thúc loading vendors dù thành công hay lỗi
        }

      } else {
        console.log('Không tìm thấy sản phẩm với ID:', id);
        setProduct(null);
        setLoadingVendors(false); // Cũng kết thúc loading vendors nếu sản phẩm không tồn tại
      }
    } catch (error) {
      console.error('Lỗi nghiêm trọng khi tải thông tin sản phẩm/cửa hàng:', error);
      setProduct(null);
      setVendors([]);
      setLoadingVendors(false); // Kết thúc loading vendors nếu có lỗi
    } finally {
      setLoadingProduct(false); // Kết thúc loading product
    }
  };


  // useEffect để load reviews, phụ thuộc vào state 'product'
  useEffect(() => {
    if (!product) {
      setReviews([]); // Xóa reviews nếu không có sản phẩm
      return;
    };

    const loadReviews = async () => {
      try {
        // Tối ưu: Nếu Firestore hỗ trợ, thêm điều kiện lọc ngay trong query
        // Ví dụ: const reviewsData = await getDocuments('reviews', where('productId', '==', product.id));
        const reviewsData: any[] = await getDocuments('reviews');
        const productReviews = reviewsData
          .filter(review => review.productId === product.id)
          .sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate()); // Sắp xếp mới nhất lên đầu
        setReviews(productReviews);
      } catch (error) {
        console.error("Lỗi khi tải bình luận:", error);
        setReviews([]); // Set rỗng nếu có lỗi
      }
    };
    loadReviews();
  }, [product]); // Chạy lại khi product thay đổi (sau khi loadProductAndRelatedVendors thành công)

  // --- Các hàm xử lý sự kiện khác (addToCart, addToWishlist, pickImage, removeImage) ---
  // Không cần thay đổi các hàm này trừ khi logic của chúng phụ thuộc vào danh sách vendors cụ thể
  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.floor(offset / slideSize);
    setCurrentImageIndex(index);
  };

  const addToCart = async () => {
    if (!product || !user) {
      Alert.alert("Thông báo", "Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng", [{ text: "Hủy", style: "cancel" }, { text: "Đăng nhập", onPress: () => router.push('/login') }]);
      return;
    }

    if (product.stock <= 0) {
      Alert.alert("Thông báo", "Sản phẩm này đã hết hàng.");
      return;
    }

    try {
      // Kiểm tra và xóa khỏi wishlist nếu có
      const wishlistItems = await getDocuments('wishlist');
      const wishlistItem = wishlistItems.find(item => item.userId === user.uid && item.productId === product.id) as Wishlist | undefined;
      if (wishlistItem?.id) {
        await deleteDocument('wishlist', wishlistItem.id);
        console.log('Removed from wishlist before adding to cart');
      }

      // Kiểm tra và cập nhật giỏ hàng
      const cartItems = await getDocuments('orders');
      const cartItem = cartItems.find(item => item.userId === user.uid && item.productId === product.id) as Order | undefined;
      if (cartItem?.id) {
        await updateDocument('orders', cartItem.id, {
          quantity: cartItem.quantity + 1,
          updatedAt: new Date()
        });
        Alert.alert("Cập nhật", `${product.name} đã được cập nhật trong giỏ hàng!`);
      } else {
        const newOrder: Order = {
          userId: user.uid,
          productId: product.id,
          quantity: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await addDocument('orders', newOrder);
        Alert.alert("Thành công", `${product.name} đã được thêm vào giỏ hàng!`);
      }
    } catch (error) {
      console.error("Lỗi khi thêm vào giỏ hàng:", error);
      Alert.alert("Lỗi", "Không thể thêm sản phẩm vào giỏ hàng. Vui lòng thử lại sau.");
    }
  };

  const addToWishlist = async () => {
    if (!product || !user) {
      Alert.alert("Thông báo", "Vui lòng đăng nhập để thêm sản phẩm vào danh sách yêu thích", [{ text: "Hủy", style: "cancel" }, { text: "Đăng nhập", onPress: () => router.push('/login') }]);
      return;
    }

    try {
      // Kiểm tra xem đã có trong giỏ hàng chưa
      const cartItems = await getDocuments('orders');
      const cartItem = cartItems.find(item => item.userId === user.uid && item.productId === product.id) as Order | undefined;
      if (cartItem) {
        Alert.alert("Thông báo", "Sản phẩm này đã có trong giỏ hàng!");
        return; // Không thêm vào wishlist nếu đã có trong giỏ hàng
      }

      // Kiểm tra xem đã có trong wishlist chưa
      const wishlistItems = await getDocuments('wishlist');
      const wishlistItem = wishlistItems.find(item => item.userId === user.uid && item.productId === product.id) as Wishlist | undefined;

      if (!wishlistItem) {
        const newWishlist: Wishlist = {
          userId: user.uid,
          productId: product.id,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await addDocument('wishlist', newWishlist);
        Alert.alert("Thành công", `${product.name} đã được thêm vào danh sách yêu thích!`);
      } else {
        Alert.alert("Thông báo", "Sản phẩm này đã có trong danh sách yêu thích!");
      }
    } catch (error) {
      console.error("Lỗi khi thêm vào danh sách yêu thích:", error);
      Alert.alert("Lỗi", "Không thể thêm sản phẩm vào danh sách yêu thích. Vui lòng thử lại sau.");
    }
  };

  const pickImage = async () => {
    try {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8, // Giảm chất lượng để upload nhanh hơn
            allowsMultipleSelection: false, // Cho phép chọn 1 ảnh mỗi lần
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            // Giới hạn số lượng ảnh có thể thêm (ví dụ: 5 ảnh)
            if (reviewImages.length < 5) {
                 setReviewImages([...reviewImages, result.assets[0].uri]);
            } else {
                Alert.alert("Thông báo", "Bạn chỉ có thể thêm tối đa 5 ảnh.");
            }
        }
    } catch (error) {
        console.error("Lỗi khi chọn ảnh:", error);
        Alert.alert("Lỗi", "Không thể chọn ảnh. Vui lòng kiểm tra quyền truy cập thư viện.");
    }
  };


  const removeImage = (index: number) => {
    setReviewImages(reviewImages.filter((_, i) => i !== index));
  };

  const handleAddReview = async () => {
    if (!user) { Alert.alert("Thông báo", "Vui lòng đăng nhập để thêm bình luận"); return; }
    if (!product) { Alert.alert("Lỗi", "Không tìm thấy thông tin sản phẩm."); return; } // Thêm kiểm tra product
    if (newReview.trim() === '' && reviewImages.length === 0) { // Yêu cầu có text hoặc ảnh
         Alert.alert("Thông báo", "Vui lòng nhập nội dung bình luận hoặc thêm ảnh.");
         return;
    }
    if (isSubmittingReview) return; // Ngăn chặn submit nhiều lần

    setIsSubmittingReview(true); // Bắt đầu quá trình submit
    try {
      let imageUrls: string[] = [];
      // Chỉ upload nếu có ảnh được chọn
      if (reviewImages.length > 0) {
           Alert.alert("Thông báo", "Đang tải ảnh lên..."); // Thông báo cho người dùng
          for (const imageUri of reviewImages) {
            try {
              const imageUrl = await uploadToImgBB(imageUri);
              if (imageUrl) {
                  imageUrls.push(imageUrl);
              } else {
                   // Ném lỗi nếu uploadToImgBB trả về null/undefined
                   throw new Error(`Không thể tải lên ảnh: ${imageUri}`);
              }
            } catch (uploadError: any) {
              console.error("Lỗi upload ảnh:", uploadError);
              // Hiển thị lỗi cụ thể hơn nếu có thể
              Alert.alert("Lỗi Upload", `Không thể tải lên một hoặc nhiều ảnh. Lỗi: ${uploadError.message || 'Unknown error'}`);
              setIsSubmittingReview(false); // Dừng submit nếu upload lỗi
              return; // Thoát khỏi hàm
            }
          }
      }


      const reviewData = {
        userId: user.uid,
        userName: user.displayName || user.email || 'Người dùng ẩn danh', // Fallback name
        userAvatar: user.photoURL || '', // Có thể thêm ảnh avatar mặc định
        productId: product.id, // Đảm bảo product không null
        content: newReview.trim(), // Trim khoảng trắng thừa
        images: imageUrls,
        createdAt: new Date(), // Sử dụng new Date() cho nhất quán
        rating: 0, // Mặc định rating, có thể thêm UI chọn rating sau
        // updatedAt: new Date() // Có thể thêm nếu cần cập nhật review
      };

      const addedDocRef = await addDocument('reviews', reviewData); // addDocument có thể trả về ID hoặc không tùy implementation
      const newReviewEntry = { ...reviewData, id: addedDocRef?.id || Date.now().toString() }; // Dùng ID trả về nếu có, hoặc timestamp

      // Cập nhật UI ngay lập tức
      setReviews(prevReviews => [newReviewEntry, ...prevReviews].sort((a,b) => b.createdAt - a.createdAt)); // Thêm vào đầu và sắp xếp lại
      setNewReview('');
      setReviewImages([]);
      Alert.alert("Thành công", "Bình luận của bạn đã được gửi!");

    } catch (error: any) {
      console.error("Lỗi khi thêm bình luận:", error);
      Alert.alert("Lỗi", `Không thể thêm bình luận. Lỗi: ${error.message || 'Vui lòng thử lại sau.'}`);
    } finally {
      setIsSubmittingReview(false); // Kết thúc quá trình submit
    }
  };


  // --- Render Logic ---

  // 1. Trạng thái Loading chính (chờ cả product và vendor)
  if (loadingProduct) { // Chỉ cần kiểm tra loadingProduct vì vendor load sau/cùng lúc
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Đang tải thông tin sản phẩm...</Text>
      </View>
    );
  }

  // 2. Trạng thái không tìm thấy sản phẩm
  if (!product) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <Feather name="alert-circle" size={64} color="#F87171" />
        <Text style={styles.errorText}>Không tìm thấy sản phẩm</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3. Render giao diện chính khi có sản phẩm
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: product.name || "Chi tiết sản phẩm" }} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Phần hiển thị ảnh sản phẩm (Image Slider) */}
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {Array.isArray(product.images) && product.images.length > 0 ? (
              product.images.map((image, index) => (
                <View key={index} style={{ width: screenWidth, height: screenWidth * 0.8 }}>
                  <Image source={{ uri: image }} style={styles.productImage} resizeMode="contain" />
                </View>
              ))
            ) : (
              <View style={[styles.noImagePlaceholder, { width: screenWidth, height: screenWidth * 0.8 }]}>
                <Feather name="image" size={64} color="#D1D5DB" />
                <Text style={styles.noImageText}>Không có hình ảnh</Text>
              </View>
            )}
          </ScrollView>
          {Array.isArray(product.images) && product.images.length > 1 && (
            <View style={styles.imageIndicators}>
              {product.images.map((_, index) => (
                <View key={index} style={[styles.indicator, currentImageIndex === index && styles.activeIndicator]} />
              ))}
            </View>
          )}
        </View>

        {/* Phần thông tin chi tiết sản phẩm */}
        <View style={styles.contentContainer}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.productPrice}>{product.price.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}</Text>

          {/* Thông tin Stock */}
          <View style={styles.infoRow}>
             <Feather name="package" size={16} color="#6B7280" style={styles.infoIcon} />
             <Text style={styles.stockLabel}>Tình trạng:</Text>
             <Text style={[styles.stockValue, product.stock <= 0 && styles.outOfStock]}>
               {product.stock > 0 ? `Còn hàng (${product.stock})` : 'Hết hàng'}
             </Text>
          </View>

           {/* Danh mục */}
           {product.categories && product.categories.length > 0 && (
             <View style={styles.infoRow}>
               <Feather name="tag" size={16} color="#6B7280" style={styles.infoIcon} />
               <Text style={styles.categoriesLabel}>Danh mục:</Text>
               <View style={styles.categoriesList}>
                 {product.categories.map((category, index) => (
                   <View key={index} style={styles.categoryItem}>
                     <Text style={styles.categoryText}>{category}</Text>
                   </View>
                 ))}
               </View>
             </View>
           )}

           {/* Mô tả sản phẩm */}
           {product.description && (
             <>
               <View style={styles.separatorThin} />
               <Text style={styles.sectionTitleSmall}>Mô tả sản phẩm</Text>
               <Text style={styles.productDescription}>{product.description}</Text>
             </>
           )}

          {/* Phần hệ thống cửa hàng */}
          <View style={styles.separator} />
          <Text style={styles.sectionTitle}>Hệ thống cửa hàng</Text>
          {loadingVendors ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color="#3B82F6" />
          ) : vendors.length > 0 ? (
            <View style={styles.vendorListContainer}>
              {vendors.map((vendor) => (
                <View key={vendor.id} style={styles.vendorItem}>
                   {/* Hiển thị tên cửa hàng nếu có */}
                   {vendor.name && vendor.name !== 'N/A' && (
                       <Text style={styles.vendorName}>{vendor.name}</Text>
                   )}
                  {/* Chỉ hiển thị thông tin nếu có và không phải 'N/A' */}
                  {vendor.phone && vendor.phone !== 'N/A' && (
                    <View style={styles.vendorInfoLine}>
                      <Feather name="phone-call" size={15} color="#DC2626" style={styles.vendorIcon} />
                      <Text style={styles.vendorText}>{vendor.phone}</Text>
                    </View>
                  )}
                  {vendor.address && vendor.address !== 'N/A' && (
                    <View style={styles.vendorInfoLine}>
                      <Feather name="map-pin" size={15} color="#3B82F6" style={styles.vendorIcon} />
                      <Text style={styles.vendorText}>{vendor.address}</Text>
                    </View>
                  )}
                  {/* Hiển thị nếu không có cả phone và address */}
                  {(!vendor.phone || vendor.phone === 'N/A') && (!vendor.address || vendor.address === 'N/A') && (
                      <Text style={styles.vendorTextMuted}>Chưa cập nhật thông tin</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
             // Kiểm tra lại điều kiện `vendorIdsWithProduct.length > 0` để biết nên hiển thị thông báo nào
             // (Cần truyền biến này xuống hoặc kiểm tra lại logic)
             // Tạm thời hiển thị thông báo chung:
            <Text style={styles.noDataText}>Hiện chưa có cửa hàng nào bán sản phẩm này hoặc chưa có thông tin cửa hàng.</Text>
          )}

          {/* Phần Đánh giá & Bình luận */}
          <View style={styles.separator} />
          <Text style={styles.sectionTitle}>Đánh giá & Bình luận ({reviews.length})</Text>
          {/* Form thêm review */}
          {user && ( // Chỉ hiển thị form nếu đã đăng nhập
            <View style={styles.reviewForm}>
              <TextInput
                style={styles.reviewInput}
                value={newReview}
                onChangeText={setNewReview}
                placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..."
                multiline
                placeholderTextColor="#9CA3AF"
              />
              {/* Hiển thị ảnh đang chọn để review */}
              {reviewImages.length > 0 && (
                 <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reviewImagesContainer}>
                    {reviewImages.map((image, index) => (
                      <View key={index} style={styles.reviewImageWrapper}>
                         <Image source={{ uri: image }} style={styles.reviewImagePreview} />
                         <TouchableOpacity style={styles.removeImageButton} onPress={() => removeImage(index)}>
                           <Feather name="x" size={12} color="#fff" />
                         </TouchableOpacity>
                      </View>
                    ))}
                 </ScrollView>
              )}
              <View style={styles.reviewActions}>
                <TouchableOpacity style={styles.iconButton} onPress={pickImage} disabled={isSubmittingReview || reviewImages.length >= 5}>
                  <Feather name="image" size={22} color={reviewImages.length >= 5 ? "#D1D5DB" : "#6B7280"} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, (!newReview.trim() && reviewImages.length === 0 || isSubmittingReview) && styles.submitButtonDisabled]}
                  onPress={handleAddReview}
                  disabled={(!newReview.trim() && reviewImages.length === 0) || isSubmittingReview}
                >
                   {isSubmittingReview ? (
                       <ActivityIndicator size="small" color="#fff" />
                   ) : (
                       <Text style={styles.submitButtonText}>Gửi</Text>
                   )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          {!user && ( // Thông báo đăng nhập để review
              <View style={styles.loginPrompt}>
                  <Text style={styles.loginPromptText}>Vui lòng </Text>
                  <TouchableOpacity onPress={() => router.push('/login')}>
                      <Text style={styles.loginPromptLink}>đăng nhập</Text>
                  </TouchableOpacity>
                  <Text style={styles.loginPromptText}> để gửi đánh giá.</Text>
              </View>
          )}

          {/* Danh sách reviews */}
          {reviews.length > 0 ? (
            reviews.map((review) => (
              <View key={review.id || review.createdAt.toString()} style={styles.reviewItem}>
                 <View style={styles.reviewHeader}>
                      <Image
                          source={review.userAvatar ? { uri: review.userAvatar } : require('@/assets/images/icon.png')} // Cần có ảnh default
                          style={styles.reviewAvatar}
                      />
                      <View>
                           <Text style={styles.reviewUserName}>{review.userName}</Text>
                           <Text style={styles.reviewTime}>{timeParse(review.createdAt)}</Text>
                      </View>

                 </View>
                 {/* Nội dung text */}
                {review.content && <Text style={styles.reviewContent}>{review.content}</Text>}
                {/* Hiển thị ảnh của review */}
                {Array.isArray(review.images) && review.images.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reviewImagesContainer}>
                    {review.images.map((image: string, imgIndex: number) => (
                      <TouchableOpacity key={imgIndex} onPress={() => {/* TODO: Mở ảnh full screen */ }}>
                        <Image source={{ uri: image }} style={styles.reviewImageDisplay} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyReviews}>
              <Text style={styles.noDataText}>Chưa có đánh giá nào.</Text>
            </View>
          )}
          <View style={styles.spacer} />
        </View>
      </ScrollView>

      {/* Thanh hành động dưới cùng */}
      <View style={styles.bottomBar}>
        <View style={styles.actionButtons}>
           {/* Nút Wishlist */}
          <TouchableOpacity
            style={[styles.actionButtonBase, styles.wishlistButton]}
            onPress={addToWishlist}
             // Không nên disable wishlist chỉ vì hết hàng
          >
            <Feather name="heart" size={20} color="#EF4444" />
          </TouchableOpacity>

          {/* Nút Thêm vào giỏ */}
          <TouchableOpacity
            style={[styles.actionButtonBase, styles.cartButton, product.stock <= 0 && styles.disabledButton]}
            onPress={addToCart}
            disabled={product.stock <= 0 || loadingProduct} // Disable nếu hết hàng hoặc đang load
          >
            <Feather name="shopping-cart" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>
                {product.stock <= 0 ? "Hết hàng" : "Thêm vào giỏ"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// --- StyleSheet ---
// Thêm hoặc cập nhật các style cần thiết
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: { // Style cho text lỗi
     marginTop: 15,
     fontSize: 18,
     color: '#B91C1C', // Màu đỏ đậm
     textAlign: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6B7280',
  },
  backButton: {
    marginTop: 20,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  imageContainer: {
    width: '100%',
    backgroundColor: 'white',
    position: 'relative', // Để định vị indicator
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  noImagePlaceholder: { // Style cho placeholder khi không có ảnh
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#F3F4F6' // Màu nền nhạt
  },
  noImageText: {
    marginTop: 8,
    color: '#9CA3AF',
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 15, // Tăng khoảng cách từ đáy
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8, // Khoảng cách lớn hơn
  },
  indicator: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  activeIndicator: {
    backgroundColor: '#3B82F6', width: 10, height: 10, borderRadius: 5,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16, // Giảm padding trên dưới chút
    backgroundColor: 'white',
    // marginTop: 6, // Bỏ margin top nếu không cần thiết
  },
  productName: {
    fontSize: 24, // Tăng cỡ chữ tên SP
    fontWeight: 'bold', // Đậm hơn nữa
    color: '#111827', // Màu đen hơn
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 22, // Tăng cỡ chữ giá
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 16,
  },
  infoRow: { // Style cho các dòng thông tin (stock, category)
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
  },
  infoIcon: {
      marginRight: 8,
  },
  stockLabel: { // Đổi tên từ categoriesLabel
    color: '#4B5563',
    fontSize: 15,
    marginRight: 5,
  },
  stockValue: {
    fontWeight: '600',
    color: '#059669', // Màu xanh lá cây đậm hơn
    fontSize: 15,
  },
  outOfStock: {
    color: '#EF4444',
    fontWeight: 'bold',
  },
  categoriesLabel: {
      color: '#4B5563',
      fontSize: 15,
      marginRight: 5,
  },
  categoriesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1, // Để wrap đúng cách
  },
  categoryItem: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  categoryText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500'
  },
  separatorThin: { // Đường kẻ mỏng hơn
      height: 1,
      backgroundColor: '#F3F4F6',
      marginVertical: 16,
  },
  sectionTitleSmall: { // Tiêu đề nhỏ hơn cho mô tả
       fontSize: 16,
       fontWeight: '600',
       color: '#1F2937',
       marginBottom: 8,
  },
  productDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    // marginBottom: 20, // Xóa margin dưới nếu đã có separator
  },
  separator: { // Đường kẻ dày hơn giữa các section chính
    height: 6, // Làm dày hơn
    backgroundColor: '#F3F4F6', // Màu nền xám
    marginVertical: 20, // Tăng khoảng cách
    marginHorizontal: -16, // Kéo dài hết chiều rộng contentContainer
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold', // Đậm hơn
    color: '#111827', // Đen hơn
    marginBottom: 16,
  },
  vendorListContainer: {
    // marginBottom: 16, // Không cần nếu đã có separator
  },
  vendorItem: {
    backgroundColor: '#F9FAFB',
    padding: 12, // Tăng padding
    borderRadius: 8, // Bo góc nhiều hơn
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB', // Border rõ hơn
  },
  vendorName: { // Style cho tên cửa hàng
      fontSize: 15,
      fontWeight: '600',
      color: '#1F2937',
      marginBottom: 8,
  },
  vendorInfoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6, // Giảm khoảng cách dòng
  },
  vendorIcon: {
    marginRight: 8,
  },
  vendorText: {
    fontSize: 14,
    color: '#374151',
    flex: 1, // Để text dài có thể xuống dòng
  },
  vendorTextMuted: { // Style khi không có thông tin
      fontSize: 14,
      color: '#9CA3AF',
      fontStyle: 'italic',
  },
  noDataText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 15, // Thêm padding cho đẹp
    fontStyle: 'italic',
  },
  reviewForm: {
    marginBottom: 20, // Tăng khoảng cách dưới form
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingTop: 12, // Tăng padding
    paddingBottom: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    minHeight: 80, // Tăng chiều cao tối thiểu
    textAlignVertical: 'top',
    marginBottom: 12, // Tăng khoảng cách
    backgroundColor: '#fff' // Nền trắng cho input
  },
  reviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
  },
  submitButton: {
    backgroundColor: '#2563EB', // Màu xanh đậm hơn
    paddingHorizontal: 20, // Tăng padding ngang
    paddingVertical: 10, // Tăng padding dọc
    borderRadius: 8,
    flexDirection: 'row', // Để chứa ActivityIndicator
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80, // Chiều rộng tối thiểu
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  reviewImagesContainer: { // Dùng cho cả preview và display
    marginVertical: 10, // Tăng khoảng cách trên dưới
  },
  reviewImageWrapper: { // Wrapper cho ảnh preview + nút xóa
    position: 'relative',
    marginRight: 10,
  },
  reviewImagePreview: { // Ảnh nhỏ khi chọn
    width: 70, // Tăng kích thước
    height: 70,
    borderRadius: 8, // Bo góc nhiều hơn
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  removeImageButton: {
    position: 'absolute',
    top: -6, // Điều chỉnh
    right: -6, // Điều chỉnh
    backgroundColor: 'rgba(0,0,0,0.7)',
    width: 20, // To hơn
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff'
  },
  reviewItem: {
    backgroundColor: '#fff', // Nền trắng cho review item
    padding: 14, // Tăng padding
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reviewHeader: { // Chứa avatar và tên/thời gian
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
  },
  reviewAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18, // Bo tròn avatar
      marginRight: 10,
      backgroundColor: '#E5E7EB' // Màu nền fallback
  },
  reviewUserName: {
      fontSize: 14,
      fontWeight: '600',
      color: '#1F2937',
  },
  reviewContent: {
    fontSize: 14,
    color: '#374151', // Màu chữ nội dung
    lineHeight: 21, // Giãn dòng
    marginBottom: 8,
  },
  reviewImageDisplay: { // Ảnh trong bình luận đã đăng
    width: 80, // Kích thước vừa phải
    height: 80,
    borderRadius: 6,
    marginRight: 8, // Khoảng cách giữa các ảnh
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  reviewTime: {
    fontSize: 12, // Cỡ chữ thời gian
    color: '#6B7280',
    // marginTop: 8, // Xóa margin top vì đã nằm trong header
  },
  emptyReviews: {
    paddingVertical: 15,
    // marginBottom: 16, // Không cần margin dưới nếu đã có spacer
  },
  loginPrompt: { // Style cho thông báo yêu cầu đăng nhập
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      marginBottom: 15,
      backgroundColor: '#FEF2F2', // Nền hồng nhạt
      borderRadius: 6,
      paddingHorizontal: 10,
  },
  loginPromptText: {
      fontSize: 14,
      color: '#991B1B', // Màu đỏ đậm
  },
  loginPromptLink: {
      fontSize: 14,
      color: '#DC2626', // Màu đỏ tươi
      fontWeight: '600',
      textDecorationLine: 'underline',
  },
  spacer: { // Tăng chiều cao spacer để thanh bottom không che mất review cuối
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Nền trắng hơi mờ
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingVertical: 8, // Giảm padding dọc
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8, // Thêm padding dưới cho iOS
    paddingTop: 10,
    flexDirection: 'row', // Cho các nút nằm ngang
    alignItems: 'center',
  },
  actionButtons: {
    flex: 1, // Chiếm hết không gian
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // Tăng khoảng cách giữa các nút
  },
  actionButtonBase: {
    paddingVertical: 12, // Tăng padding dọc
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  wishlistButton: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 15, // Padding ngang cho nút icon
  },
  cartButton: {
    flex: 1, // Nút giỏ hàng chiếm phần lớn không gian
    backgroundColor: '#2563EB',
  },
  actionButtonText: {
    color: 'white', fontWeight: 'bold', fontSize: 16, // Tăng cỡ chữ
  },
  disabledButton: {
    backgroundColor: '#D1D5DB',
    borderColor: '#D1D5DB', // Đồng bộ màu border
    opacity: 0.8, // Tăng độ mờ
  },
});