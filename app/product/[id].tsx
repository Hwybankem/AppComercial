import React from 'react';
import { Link, Stack, useLocalSearchParams, router } from "expo-router";
import { Text } from "@/components/ui/text";
import { Image } from "@/components/ui/image";
import { VStack } from "@/components/ui/vstack";
import { Heading } from "@/components/ui/heading";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Center } from "@/components/ui/center";
import { View, ScrollView, Dimensions, FlatList, TextInput } from "react-native";
import { Feather } from '@expo/vector-icons';
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from '@/context/AuthContext';
import { Alert } from 'react-native';
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import * as ImagePicker from 'expo-image-picker';
import { uploadToImgBB } from '@/services/imgbbService';
import timeParse from '@/components/utils/timeParse';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  storeName: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Wishlist {
  id?: string;
  userId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function ProductsDetail() {
  const { id } = useLocalSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const screenWidth = Dimensions.get('window').width;
  const { getDocument, addDocument, getDocuments, updateDocument, deleteDocument } = useFirestore();
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [newReview, setNewReview] = useState('');
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      // Lấy thông tin từ vendor_products
      const vendorProducts = await getDocuments('vendor_products');
      console.log('All vendor products:', vendorProducts);
      
      // Lấy sản phẩm từ Firestore
      const productData = await getDocument('products', String(id));
      console.log('Product from Firestore:', productData);

      if (productData) {
        // Tìm vendor product dựa vào products field thay vì id
        const vendorProduct = vendorProducts.find(doc => doc.products === productData.name);
        console.log('Found vendor product:', vendorProduct);

        const formattedProduct: Product = {
          id: productData.id,
          name: productData.name || '',
          description: productData.description || '',
          price: productData.price || 0,
          stock: vendorProduct ? vendorProduct.stock : 0, // Kiểm tra vendorProduct trước khi truy cập stock
          categories: productData.categories || [],
          images: Array.isArray(productData.images) ? productData.images : [],
          createdAt: productData.createdAt?.toDate() || new Date(),
          updatedAt: productData.updatedAt?.toDate() || new Date()
        };
        setProduct(formattedProduct);
      } else {
        console.log('Không tìm thấy sản phẩm với ID:', id);
        setProduct(null);
      }
    } catch (error) {
      console.error('Lỗi khi tải thông tin sản phẩm:', error);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('Current Product State:', product);
  }, [product]);



  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.floor(offset / slideSize);
    setCurrentImageIndex(index);
  };

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
      // Lấy tên cửa hàng từ AsyncStorage
      const storeName = await AsyncStorage.getItem('selectedVendorId');
      if (!storeName) {
        Alert.alert("Lỗi", "Không tìm thấy thông tin cửa hàng");
        return;
      }

      const wishlistItems = await getDocuments('wishlist');
      const wishlistItem = wishlistItems.find(item =>
        item.userId === user.uid &&
        item.productId === product.id
      ) as Wishlist | undefined;

      // Xóa nếu có trong wishlist
      if (wishlistItem) {
        await deleteDocument('wishlist', wishlistItem.id!);
      }

      const cartItems = await getDocuments('orders');
      console.log('cartItems', cartItems);
      const cartItem = cartItems.find(item =>
        item.userId === user.uid &&
        item.productId === product.id
      ) as Order | undefined;
      console.log('cartItem', cartItem);
      if (cartItem) {
        await updateDocument('orders', cartItem.id!, {
          quantity: cartItem.quantity + 1,
          updatedAt: new Date()
        });
        Alert.alert("Cập nhật", `${product.name} đã được cập nhật trong giỏ hàng!`);
      } else {
        const newOrder: Order = {
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
    }
  };


  const addToWishlist = async () => {
    if (!product || !user) {
      Alert.alert(
        "Thông báo",
        "Vui lòng đăng nhập để thêm sản phẩm vào danh sách yêu thích",
        [
          { text: "Hủy", style: "cancel" },
          {
            text: "Đăng nhập",
            onPress: () => router.push('/login')
          }
        ]
      );
      return;
    }

    try {
      // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa
      const cartItems = await getDocuments('orders');
      const cartItem = cartItems.find(item =>
        item.userId === user.uid &&
        item.productId === product.id
      ) as Order | undefined;

      if (cartItem) {
        Alert.alert("Thông báo", "Sản phẩm này đã có trong giỏ hàng!");
      } else {
        // Thêm mới vào danh sách yêu thích
        const wishlistItems = await getDocuments('wishlist');
        const wishlistItem = wishlistItems.find(item =>
          item.userId === user.uid &&
          item.productId === product.id
        ) as Wishlist | undefined;

        if (!wishlistItem) {
          const newWishlist: Wishlist = {
            userId: user.uid,
            productId: product.id,
            quantity: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await addDocument('wishlist', newWishlist);
          Alert.alert("Thành công", `${product.name} đã được thêm vào danh sách yêu thích!`);
        }
      }
    } catch (error) {
      console.error("Lỗi khi thêm vào danh sách yêu thích:", error);
      Alert.alert("Lỗi", "Không thể thêm sản phẩm vào danh sách yêu thích. Vui lòng thử lại sau.");
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setReviewImages([...reviewImages, result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setReviewImages(reviewImages.filter((_, i) => i !== index));
  };

  const handleAddReview = async () => {
    if (!user) {
      Alert.alert("Thông báo", "Vui lòng đăng nhập để thêm bình luận");
      return;
    }

    if (newReview.trim() === '') {
      Alert.alert("Thông báo", "Bình luận không được để trống");
      return;
    }

    try {
      let imageUrls: string[] = [];
      for (const image of reviewImages) {
        const imageUrl = await uploadToImgBB(image);
        imageUrls.push(imageUrl);
      }

      const review: any = {
        userId: user.uid,
        productId: product?.id,
        content: newReview,
        images: imageUrls,
        createdAt: new Date()
      };
      await addDocument('reviews', review);
      setReviews([...reviews, review]);
      setNewReview('');
      setReviewImages([]);
      setShowReviewForm(false);
      Alert.alert("Thành công", "Bình luận đã được thêm!");
    } catch (error) {
      console.error("Lỗi khi thêm bình luận:", error);
      Alert.alert("Lỗi", "Không thể thêm bình luận. Vui lòng thử lại sau.");
    }
  };

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const reviewsData: any[] = await getDocuments('reviews');
        const productReviews = reviewsData.filter(review => review.productId === product?.id);
        setReviews(productReviews);
      } catch (error) {
        console.error("Lỗi khi tải bình luận:", error);
      }
    };
    loadReviews();
  }, [product]);

  if (loading) {
    return (
      <Center className="flex-1">
        <Text>Đang tải thông tin sản phẩm...</Text>
      </Center>
    );
  }

  if (!product) {
    return (
      <Center className="flex-1">
        <Text>Không tìm thấy sản phẩm</Text>
      </Center>
    );
  }

  return (
    <Box className="flex-1 bg-gray-50">
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerLeft: () => (
            <Link href="/" asChild>
              <Button
                variant="link"
                className="p-0 bg-transparent"
              >
                <Feather name="arrow-left" size={24} color="#000" />
              </Button>
            </Link>
          ),
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hình ảnh sản phẩm */}
        <View className="w-full aspect-square bg-white">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {Array.isArray(product.images) && product.images.length > 0 ? (
              product.images.map((image, index) => (
                <View key={index} style={{ width: screenWidth }}>
                  <Image
                    source={{ uri: image }}
                    className="w-full h-full"
                    alt={`${product.name} image ${index + 1}`}
                    resizeMode="contain"
                  />
                </View>
              ))
            ) : (
              <View style={{ width: screenWidth }}>
                <Center className="h-full">
                  <Text>Không có hình ảnh</Text>
                </Center>
              </View>
            )}
          </ScrollView>
          {/* Chỉ số ảnh */}
          {Array.isArray(product.images) && product.images.length > 1 && (
            <View className="absolute bottom-4 left-0 right-0 flex-row justify-center space-x-2">
              {product.images.map((_, index) => (
                <View
                  key={index}
                  className={`w-2 h-2 rounded-full ${currentImageIndex === index ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Thông tin sản phẩm */}
        <VStack className="p-4 bg-white mt-2 pb-30">
          <Text className="text-2xl font-bold text-gray-800 mb-2">
            {product.name}
          </Text>

          <Heading size="2xl" className="text-blue-600 mb-4">
            {product.price.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}
          </Heading>

          <Text className="text-base text-gray-600 leading-relaxed mb-4">
            {product.description}
          </Text>

          <View className="flex-row items-center space-x-4 mb-4">
            <Text className="text-gray-600">Số lượng còn lại:</Text>
            <Text className="font-semibold text-gray-800">{product.stock}</Text>
          </View>

          {/* Danh mục */}
          <VStack space="sm" className="mb-4 pb-10">
            <Text className="text-gray-600">Danh mục:</Text>
            <View className="flex-row flex-wrap gap-2">
              {product.categories.map((category, index) => (
                <Box
                  key={index}
                  className="bg-gray-100 px-3 py-1 rounded-full"
                >
                  <Text className="text-sm text-gray-600">{category}</Text>
                </Box>
              ))}
            </View>
          </VStack>

          {/* Bình luận */}
          <Heading size="lg" className="mb-4">Bình luận</Heading>

          <Box className="flex-row items-center mt-4">
            <Input className="flex-1 mr-2">
              <InputField
                value={newReview}
                onChangeText={setNewReview}
                placeholder="Viết bình luận..."
              />
            </Input>
            <Button onPress={pickImage} className="bg-green-500 rounded-lg mr-2">
              <ButtonText className="text-white">Thêm ảnh</ButtonText>
            </Button>
            <Button onPress={handleAddReview} className="bg-blue-500 rounded-lg">
              <ButtonText className="text-white">Gửi</ButtonText>
            </Button>
          </Box>

          {reviewImages.length > 0 && (
            <Box className="flex-row flex-wrap mt-2">
              {reviewImages.map((image, index) => (
                <Box key={index} className="relative mr-2 mb-2">
                  <Image
                    source={{ uri: image }}
                    className="w-20 h-20 rounded-lg"
                    alt="Selected image"
                  />
                  <Button
                    onPress={() => removeImage(index)}
                    className="absolute top-0 right-0 bg-red-500 rounded-full p-1"
                  >
                    <ButtonText className="text-white font-bold">X</ButtonText>
                  </Button>
                </Box>
              ))}
            </Box>
          )}

          {reviews.length > 0 ? (
            reviews.map((review: any, index) => (
              <Box key={index} className="mb-4 p-3 bg-gray-100 rounded-lg mt-4">
                <Text className="text-sm text-gray-800">{review.content}</Text>
                {review.images && review.images.map((image: string, imgIndex: number) => (
                  <Image
                    key={imgIndex}
                    source={{ uri: image }}
                    className="w-full h-40 mt-2 rounded-lg"
                    alt="Review image"
                  />
                ))}
                <Text className="text-xs text-gray-500">{timeParse(review.createdAt)}</Text>
              </Box>
            ))
          ) : (
            <Box className="mb-4 p-3 bg-gray-100 rounded-lg mt-4">
              <Text className="text-sm text-gray-500">Chưa có bình luận nào</Text>
            </Box>
          )}

          <Box className="h-20"></Box>
        </VStack>
      </ScrollView>

      {/* Bottom Action Bar */}
      <Box className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <View className="flex-row justify-between items-center space-x-4">
          <Button
            className="flex-1 bg-blue-500 rounded-lg mx-2"
            onPress={addToCart}
          >
            <View className="flex-row items-center space-x-2">
              <Feather name="shopping-cart" size={20} color="#fff" className="mr-2" />
              <Text className="text-white">Cart</Text>
            </View>
          </Button>

          <Button
            className="flex-1 bg-red-500 rounded-lg mx-2"
            onPress={addToWishlist}
          >
            <View className="flex-row items-center space-x-2">
              <Feather name="heart" size={20} color="#fff" className="mr-2" />
              <Text className="text-white">Wishlist</Text>
            </View>
          </Button>
        </View>
      </Box>
    </Box>
  );
}