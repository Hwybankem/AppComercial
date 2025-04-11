import { FlatList, Pressable, View, ScrollView } from "react-native";
//import ListProductList from "@/components/ListProductList";
import { useEffect, useState } from "react";
import { Box } from "@/components/ui/box";
import { Input, InputField, InputIcon } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { router, useRouter } from "expo-router";
import { Card } from "@/components/ui/card";
import { Image } from "@/components/ui/image";
import { VStack } from "@/components/ui/vstack";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import React from 'react';
import { useFirestore } from '@/context/storageFirebase';
import { Center } from "@/components/ui/center";
import { SearchIcon } from "@/components/ui/icon";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from "react-native";

// Custom hook useDebounce để trì hoãn giá trị
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

function ListProductList({ product }: { product: Product }) {
  const { user } = useAuth();
  const router = useRouter();
  const { getDocuments, addDocument, updateDocument } = useFirestore();
  const [loading, setLoading] = useState(false);

  const addToCart = async () => {
    if (!product || !user) {
      Alert.alert(
        "Thông báo",
        "Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng",
        [
          { text: "Hủy", style: "cancel" },
          { text: "Đăng nhập", onPress: () => router.push('/login') }
        ]
      );
      return;
    }

    try {
      setLoading(true);
      const storeName = await AsyncStorage.getItem('selectedVendorId');
      if (!storeName) {
        Alert.alert("Lỗi", "Không tìm thấy thông tin cửa hàng");
        return;
      }

      const cartItems = await getDocuments('orders');
      const cartItem = cartItems.find(item =>
        item.userId === user.uid &&
        item.productId === product.id
      );

      if (cartItem) {
        await updateDocument('orders', cartItem.id, {
          quantity: cartItem.quantity + 1,
          updatedAt: new Date()
        });
        Alert.alert("Cập nhật", `${product.name} đã được cập nhật trong giỏ hàng!`);
      } else {
        const newOrder = {
          userId: user.uid,
          productId: product.id,
          quantity: 1,
          storeName: storeName,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await addDocument('orders', newOrder);
        Alert.alert("Thành công", `${product.name} đã được thêm vào giỏ hàng!`);
      }
    } catch (error) {
      console.error("Lỗi khi thêm vào giỏ hàng:", error);
      Alert.alert("Lỗi", "Không thể thêm sản phẩm vào giỏ hàng. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  const handleProductPress = async () => {
    try {
      router.push(`/product/${product.id}`);
    } catch (error) {
      console.error('Lỗi khi lưu thông tin sản phẩm:', error);
    }
  };

  return (
    <Pressable className="flex-none w-[48%] mb-2" onPress={handleProductPress}>
      <Card className="p-2 rounded-xl shadow-sm bg-white overflow-hidden border border-gray-100">
        <Box className="relative">
          <Image
            source={{
              uri: product.images && product.images.length > 0 ? product.images[0] : 'https://via.placeholder.com/300',
            }}
            className="h-[150px] w-full rounded-lg mb-2"
            alt={`${product.name} image`}
            resizeMode="cover"
          />
          <View className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/70 to-transparent rounded-b-lg" />
        </Box>
        <VStack space="xs" className="px-1">
          <Text className="text-base font-semibold text-gray-800 line-clamp-1">
            {product.name}
          </Text>
          <Text className="text-xs text-gray-500 line-clamp-2 mb-1">
            {product.description}
          </Text>
          <View className="flex-row justify-between items-center">
            <Heading size="md" className="text-blue-600 font-bold">
              {product.price.toLocaleString('vi-VN')}đ
            </Heading>
            <Button
              variant="solid"
              size="sm"
              className="bg-blue-500 rounded-full px-3"
              onPress={addToCart}
              disabled={loading}
            >
              <Text className="text-white text-xs">Mua</Text>
            </Button>
          </View>
        </VStack>
      </Card>
    </Pressable>
  );
}

export default function TabOneScreen() {
  const { getDocuments } = useFirestore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [childCategories, setChildCategories] = useState<Category[]>([]);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 1000);
  const vendorId = AsyncStorage.getItem('selectedVendorId');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Tải danh mục
      const categoriesData = await getDocuments('categories');
      const formattedCategories: Category[] = categoriesData.map((category: any) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        parentId: category.parentId,
        parentName: category.parentName,
        createdAt: category.createdAt?.toDate() || new Date(),
        updatedAt: category.updatedAt?.toDate() || new Date()
      }));

      // Phân loại danh mục cha và con
      const parents = formattedCategories.filter(cat => !cat.parentId);
      const children = formattedCategories.filter(cat => cat.parentId);

      setCategories(formattedCategories);
      setParentCategories([
        {
          id: 'all',
          name: 'Tất cả',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        ...parents
      ]);
      setChildCategories(children);

      // 1. Lấy vendorId từ AsyncStorage
      const vendorId = await AsyncStorage.getItem('selectedVendorId');
      console.log('🔑 Vendor ID from AsyncStorage:', vendorId);

      if (vendorId) {
        // 2. Lấy tất cả documents từ vendor_products trùng với vendorId
        const vendorProductsData = await getDocuments('vendor_products');
        const vendorProductDocs = vendorProductsData.filter(doc => doc.id === vendorId);
        console.log('📄 Vendor Product Documents:', vendorProductDocs);

        if (vendorProductDocs.length > 0) {
          // 3. Lấy danh sách id sản phẩm từ tất cả documents
          const vendorProductsList = vendorProductDocs.map(doc => ({
            products: doc.products || '', // Chuỗi tên sản phẩm
            stock: doc.stock || 0, // Stock từ document
          }));
          console.log('📦 Vendor Products List:', vendorProductsList);

          // Kiểm tra xem vendorProductsList có rỗng không
          if (vendorProductsList.length === 0) {
            console.log('⚠️ Warning: No products found in vendorProducts');
            setProducts([]); // Trả về mảng rỗng nếu không có sản phẩm
            return;
          }

          // 4. Lấy tất cả sản phẩm từ collection products
          const allProducts = await getDocuments('products');
          console.log('🏪 All Products:', allProducts);

          // 5. Lọc sản phẩm trùng với tên từ vendorProducts và format
          const filteredProducts = allProducts
            .filter(product =>
              vendorProductsList.some(vp => vp.products === product.name)
            )
            .map(product => {
              // Tìm document tương ứng trong vendorProductsList để lấy stock
              const vendorProduct = vendorProductsList.find(vp => vp.products === product.name);
              console.log(vendorProduct?.stock)
              // Log để debug nếu không tìm thấy vendorProduct
              if (!vendorProduct) {
                console.log(`⚠️ No vendorProduct found for product name: ${product.name}`);
              }

              return {
                id: product.id,
                name: product.name,
                description: product.description,
                price: product.price,
                stock: vendorProduct?.stock, // Lấy stock từ document, mặc định là 0 nếu không tìm thấy
                images: product.images,
                categories: product.categories,
                createdAt: product.createdAt?.toDate() || new Date(),
                updatedAt: product.updatedAt?.toDate() || new Date(),
              };
            });

          console.log('✅ Final Filtered Products:', filteredProducts);
          setProducts(filteredProducts);
        }
      }
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu:', error);
    } finally {
      setLoading(false);
    }
  };

  // Lọc danh mục con dựa trên danh mục cha được chọn
  const filteredChildCategories = childCategories.filter(
    cat => selectedParent === 'all' || cat.parentId === selectedParent
  );

  // Lọc sản phẩm theo từ khóa tìm kiếm và danh mục
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

    let matchesCategory = false;

    // Nếu có chọn danh mục con, chỉ lọc theo danh mục con
    if (selectedChild) {
      matchesCategory = product.categories && product.categories.includes(selectedChild);
    }
    // Nếu chỉ chọn danh mục cha
    else if (selectedParent) {
      if (selectedParent === 'all') {
        matchesCategory = true;
      } else {
        matchesCategory = product.categories && product.categories.includes(selectedParent);
      }
    }
    // Nếu không chọn danh mục nào
    else {
      matchesCategory = true;
    }

    return matchesSearch && matchesCategory;
  });

  // Xử lý khi chọn danh mục cha
  const handleSelectParent = (categoryId: string) => {
    if (selectedParent === categoryId) {
      setSelectedParent('all');
      setSelectedChild(null);
    } else {
      setSelectedParent(categoryId);
      setSelectedChild(null);
    }
  };

  // Xử lý khi chọn danh mục con
  const handleSelectChild = (categoryId: string) => {
    if (selectedChild === categoryId) {
      setSelectedChild(null);
    } else {
      setSelectedChild(categoryId);
    }
  };

  return (
    <Box className="flex-1 bg-gray-50">
      <VStack space="md" className="p-3">
        <View className="flex-row justify-between items-center mb-1">
          <VStack>
            <Heading size="xl" className="text-gray-800 font-bold">
              Khám phá
            </Heading>
            <Text className="text-gray-500 text-sm">Tìm kiếm sản phẩm yêu thích</Text>
          </VStack>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full bg-white border-gray-200"
            onPress={() => router.push('/vendors/vendor')}
          > <Text>lựa chọn cửa hàng </Text>
          </Button>

        </View>

        <Input
          className="mb-3 bg-white rounded-xl shadow-sm"
          variant="outline"
          size="md"
        >
          <InputIcon>
            <SearchIcon />
          </InputIcon>
          <InputField
            placeholder="Tìm kiếm sản phẩm..."
            value={searchQuery}
            onChangeText={(text) => setSearchQuery(text)}
            className="text-sm"
          />
        </Input>

        <VStack space="sm">
          {/* Danh mục cha */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-2"
          >
            <View className="flex-row space-x-2">
              {parentCategories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedParent === category.id ? "solid" : "outline"}
                  size="sm"
                  className={`rounded-full ${selectedParent === category.id
                    ? 'bg-blue-500 border-blue-500'
                    : 'bg-white border-gray-200'
                    }`}
                  onPress={() => handleSelectParent(category.id)}
                >
                  <Text
                    className={
                      selectedParent === category.id
                        ? 'text-white'
                        : 'text-gray-600'
                    }
                  >
                    {category.name}
                  </Text>
                </Button>
              ))}
            </View>
          </ScrollView>

          {/* Danh mục con */}
          {selectedParent && selectedParent !== 'all' && filteredChildCategories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
            >
              <View className="flex-row space-x-2">
                {filteredChildCategories.map((category) => (
                  <Button
                    key={category.id}
                    variant={selectedChild === category.id ? "solid" : "outline"}
                    size="sm"
                    className={`rounded-full ${selectedChild === category.id
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-white border-gray-200'
                      }`}
                    onPress={() => handleSelectChild(category.id)}
                  >
                    <Text
                      className={
                        selectedChild === category.id
                          ? 'text-white'
                          : 'text-gray-600'
                      }
                    >
                      {category.name}
                    </Text>
                  </Button>
                ))}
              </View>
            </ScrollView>
          )}
        </VStack>

        {loading ? (
          <Center className="py-8">
            <Text className="text-gray-500 text-base">Đang tải dữ liệu...</Text>
          </Center>
        ) : debouncedSearchQuery.length > 0 && filteredProducts.length === 0 ? (
          <Center className="py-8">
            <Text className="text-red-500 text-base">
              Không tìm thấy sản phẩm
            </Text>
          </Center>
        ) : (
          <FlatList
            data={filteredProducts}
            renderItem={({ item }) => <ListProductList product={item} />}
            numColumns={2}
            contentContainerClassName="gap-2 pb-40"
            columnWrapperClassName="gap-2"
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            className="pb-2"
          />
        )}
      </VStack>
    </Box>
  );
}

