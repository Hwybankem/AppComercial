import { FlatList, Pressable, View, ScrollView, TextInput, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import { router, useRouter } from "expo-router";
import React from 'react';
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from "react-native";
import { Ionicons } from '@expo/vector-icons';

// --- useDebounce, Interfaces (Product, Category) giữ nguyên ---
function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

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

interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  parentName?: string;
  createdAt: Date;
  updatedAt: Date;
}


// --- Component ListProductList ---
function ListProductList({ product }: { product: Product }) {
  const { user } = useAuth();
  const router = useRouter();
  const { getDocuments, addDocument, updateDocument } = useFirestore();
  const [loadingCart, setLoadingCart] = useState(false);

  // --- Cập nhật hàm addToCart ---
  const addToCart = async () => {
    if (!product || !user) {
      Alert.alert("Thông báo", "Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng", [{ text: "Hủy", style: "cancel" }, { text: "Đăng nhập", onPress: () => router.push('/login') }]);
      return;
    }

    // Bỏ hoàn toàn việc lấy và kiểm tra storeName từ AsyncStorage ở đây
    // if (!storeName && product.stock > 0) { ... } // <- Bỏ
    // else if (product.stock <= 0) { ... } // <- Giữ lại kiểm tra stock
     if (product.stock <= 0) {
         Alert.alert("Thông báo", "Sản phẩm này đã hết hàng.");
         return;
     }

    try {
      setLoadingCart(true);
      const cartItems = await getDocuments('orders');

      // Tìm kiếm item chỉ dựa trên userId và productId, bỏ qua storeName
      const cartItem = cartItems.find(item =>
        item.userId === user.uid &&
        item.productId === product.id
        // && item.storeName === storeName // <-- Bỏ điều kiện này
      );

      if (cartItem) {
        // Nếu tìm thấy (bất kể storeName cũ là gì), tăng số lượng
        await updateDocument('orders', cartItem.id, {
          quantity: cartItem.quantity + 1,
          updatedAt: new Date()
        });
        Alert.alert("Cập nhật", `${product.name} đã được cập nhật trong giỏ hàng!`);
      } else {
        // Tạo đơn hàng mới không có storeName
        const newOrder = {
          userId: user.uid,
          productId: product.id,
          productName: product.name,
          productImage: product.images && product.images.length > 0 ? product.images[0] : '',
          productPrice: product.price,
          quantity: 1,
          // storeName: storeName, // <-- Đã xóa trường này
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'pending'
        };
        await addDocument('orders', newOrder);
        Alert.alert("Thành công", `${product.name} đã được thêm vào giỏ hàng!`);
      }
    } catch (error) {
      console.error("Lỗi khi thêm vào giỏ hàng:", error);
      Alert.alert("Lỗi", "Không thể thêm sản phẩm vào giỏ hàng. Vui lòng thử lại sau.");
    } finally {
      setLoadingCart(false);
    }
  };

  const handleProductPress = async () => {
    try {
      router.push(`/product/${product.id}`);
    } catch (error) {
      console.error('Lỗi khi điều hướng đến chi tiết sản phẩm:', error);
    }
  };

  // --- JSX của ListProductList giữ nguyên ---
  return (
    <Pressable style={styles.productItem} onPress={handleProductPress}>
      <View style={styles.productCard}>
        <Image
          source={{ uri: product.images && product.images.length > 0 ? product.images[0] : 'https://via.placeholder.com/300' }}
          style={styles.productImage}
          resizeMode="cover"
        />
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.productDescription} numberOfLines={2}>{product.description}</Text>
          <Text style={styles.productStock}>
            Số lượng: {product.stock > 0 ? product.stock : 'Hết hàng'}
          </Text>
          <View style={styles.priceContainer}>
            <View style={styles.priceWrapper}>
              <Text style={styles.price}>{product.price.toLocaleString('vi-VN')}</Text>
              <Text style={styles.currency}>đ</Text>
            </View>
            <TouchableOpacity
              style={[styles.buyButton, (loadingCart || product.stock <= 0) && styles.buttonDisabled]}
              onPress={(e) => {
                e.stopPropagation();
                 // Kiểm tra stock ngay trước khi gọi addToCart
                 if (product.stock <= 0) {
                   Alert.alert("Thông báo", "Sản phẩm này đã hết hàng.");
                 } else {
                   addToCart(); // Gọi hàm đã cập nhật
                 }
              }}
              disabled={loadingCart || product.stock <= 0}
            >
              {loadingCart ? (<ActivityIndicator size="small" color="#ffffff" />) : (
                <>
                  <Ionicons name="cart-outline" size={16} color="white" />
                  <Text style={styles.buyButtonText}>Mua</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Pressable>
  );
}


// --- Component TabOneScreen (Phần còn lại giữ nguyên) ---
export default function TabOneScreen() {
  const { getDocuments } = useFirestore();
  const [products, setProducts] = useState<Product[]>([]);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [childCategories, setChildCategories] = useState<Category[]>([]);
  const [selectedParent, setSelectedParent] = useState<string | null>('all');
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    loadData();
  }, []);

  // --- loadData giữ nguyên logic tính stock tổng với fallback ---
  const loadData = async () => {
    try {
      setLoading(true);

      const categoriesData = await getDocuments('categories');
      const formattedCategories: Category[] = categoriesData.map((category: any) => ({
        id: category.id, name: category.name, description: category.description, parentId: category.parentId, parentName: category.parentName, createdAt: category.createdAt?.toDate() || new Date(), updatedAt: category.updatedAt?.toDate() || new Date()
      }));
      const parents = formattedCategories.filter(cat => !cat.parentId).sort((a, b) => a.name.localeCompare(b.name));
      const children = formattedCategories.filter(cat => cat.parentId).sort((a, b) => a.name.localeCompare(b.name));
      setParentCategories([{ id: 'all', name: 'Tất cả', createdAt: new Date(), updatedAt: new Date() }, ...parents]);
      setChildCategories(children);

      const allProductsData = await getDocuments('products');
      const allVendorStockData = await getDocuments('vendor_products');

      const totalStockMap: { [productName: string]: number } = {};
      allVendorStockData.forEach((vendorStockDoc) => {
        const productName = vendorStockDoc.products;
        const stock = Number(vendorStockDoc.stock) || 0;
        if (productName && stock > 0) {
          totalStockMap[productName] = (totalStockMap[productName] || 0) + stock;
        }
      });

      const formattedProducts: Product[] = allProductsData.map(product => {
        const productNameFromProducts = product.name || '';
        let finalStock = 0;

        if (totalStockMap.hasOwnProperty(productNameFromProducts)) {
          finalStock = totalStockMap[productNameFromProducts];
        } else {
          finalStock = Number(product.stock) || 0;
        }

        return {
          id: product.id,
          name: productNameFromProducts,
          description: product.description || '',
          price: product.price || 0,
          stock: finalStock,
          images: product.images || [],
          categories: product.categories || [],
          createdAt: product.createdAt?.toDate() || new Date(),
          updatedAt: product.updatedAt?.toDate() || new Date(),
        };
      });

      setProducts(formattedProducts);

    } catch (error) {
      console.error('[LOAD DATA] Error during data loading:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

   // --- filteredProducts, handleSelectParent, handleSelectChild, visibleChildCategories giữ nguyên ---
   const filteredProducts = products.filter((product) => {
    const matchesSearch = debouncedSearchQuery === '' ||
      product.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedChild) {
      return product.categories && product.categories.includes(selectedChild);
    } else if (selectedParent && selectedParent !== 'all') {
      const parentAndDirectChildrenIds = [
        selectedParent,
        ...childCategories.filter(c => c.parentId === selectedParent).map(c => c.id)
      ];
      return product.categories && product.categories.some(catId => parentAndDirectChildrenIds.includes(catId));
    }
    return true;
  });

  const handleSelectParent = (categoryId: string) => {
    setSelectedParent(categoryId);
    setSelectedChild(null);
  };

  const handleSelectChild = (categoryId: string) => {
    setSelectedChild(prev => prev === categoryId ? null : categoryId);
  };

  const visibleChildCategories = selectedParent && selectedParent !== 'all'
    ? childCategories.filter(cat => cat.parentId === selectedParent)
    : [];

   // --- JSX return giữ nguyên ---
   return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm sản phẩm..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Categories Section */}
      <View style={styles.categorySection}>
        {/* Parent Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.parentCategoryScrollContent}
        >
          {parentCategories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryButton,
                selectedParent === category.id && styles.selectedCategory
              ]}
              onPress={() => handleSelectParent(category.id)}
            >
              <Text style={[
                styles.categoryText,
                selectedParent === category.id && styles.selectedCategoryText
              ]}>
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Child Categories */}
        {visibleChildCategories.length > 0 && (
          <View style={styles.childCategoryContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.childCategoryScrollContent}
            >
              {visibleChildCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.subCategoryButton,
                    selectedChild === category.id && styles.selectedSubCategory
                  ]}
                  onPress={() => handleSelectChild(category.id)}
                >
                  <Text style={[
                    styles.subCategoryText,
                    selectedChild === category.id && styles.selectedSubCategoryText
                  ]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Product List / Loading / Empty State */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Đang tải sản phẩm...</Text>
        </View>
      ) : filteredProducts.length > 0 ? (
        <FlatList
          data={filteredProducts}
          renderItem={({ item }) => <ListProductList product={item} />} // Sử dụng component ListProductList đã cập nhật ở trên
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.productList}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="storefront-outline" size={60} color="#D1D5DB" />
          <Text style={styles.emptyText}>Không tìm thấy sản phẩm nào</Text>
          {debouncedSearchQuery !== '' && <Text style={styles.emptySubText}>Hãy thử tìm kiếm với từ khóa khác.</Text>}
          {(selectedParent !== 'all' || selectedChild) && debouncedSearchQuery === '' && <Text style={styles.emptySubText}>Hãy thử chọn danh mục khác hoặc xem tất cả sản phẩm.</Text>}
          {searchQuery === '' && selectedParent === 'all' && !selectedChild && products.length === 0 && !loading && <Text style={styles.emptySubText}>Có thể chưa có sản phẩm nào được thêm.</Text>}
        </View>
      )}
    </View>
  );
}

// --- StyleSheet giữ nguyên ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: '#1F2937',
  },
  categorySection: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 4,
  },
  parentCategoryScroll: {},
  parentCategoryScrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    columnGap: 8,
    alignItems: 'center',
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedCategory: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  selectedCategoryText: {
    color: 'white',
    fontWeight: '600',
  },
  childCategoryContainer: {
    paddingTop: 6,
  },
  childCategoryScrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    columnGap: 8,
    alignItems: 'center',
  },
  subCategoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  selectedSubCategory: {
    backgroundColor: '#60A5FA',
    borderColor: '#3B82F6',
  },
  subCategoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
  },
  selectedSubCategoryText: {
    color: 'white',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 15,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  productList: {
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 12,
  },
  productItem: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  productCard: {
    borderRadius: 8,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  productImage: {
    height: 150,
    width: '100%',
    backgroundColor: '#F3F4F6',
  },
  productInfo: {
    padding: 10,
    flex: 1,
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
    minHeight: 32,
  },
  productStock: {
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 8,
    fontWeight: '500',
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexShrink: 1,
    marginRight: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  currency: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
    marginLeft: 1,
    marginBottom: 1,
  },
  buyButton: {
    backgroundColor: '#2563EB',
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 70,
    height: 32,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.7,
  },
  buyButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
});