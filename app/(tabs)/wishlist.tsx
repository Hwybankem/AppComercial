import React, { useState, useEffect } from "react";
import { Alert, FlatList } from "react-native";
import { Card } from "@/components/ui/card";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import { Link, useFocusEffect } from "expo-router";
import { Button, ButtonText } from "@/components/ui/button";
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from '@/context/AuthContext';

// Định nghĩa interface cho sản phẩm
interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  description: string;
}

// Định nghĩa interface cho mục yêu thích
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

        try {
          setLoading(true);
          // Lấy tất cả items từ Firestore
          const wishlistData = await getDocuments('wishlist');
          
          // Lọc các items của người dùng hiện tại
          const userWishlist = wishlistData.filter(item => item.userId === user.uid);
          
          // Lấy thông tin sản phẩm cho mỗi item
          const wishlistItemsWithProducts = await Promise.all(
            userWishlist.map(async (item) => {
              try {
                const productData = await getDocument('products', item.productId);
                return {
                  ...item,
                  product: productData ? {
                    id: productData.id,
                    name: productData.name || '',
                    price: productData.price || 0,
                    images: Array.isArray(productData.images) ? productData.images : [],
                    description: productData.description || ''
                  } : undefined
                };
              } catch (error) {
                console.error(`Error fetching product ${item.productId}:`, error);
                return item;
              }
            })
          );
          
          setWishlistItems(wishlistItemsWithProducts as WishlistItem[]);
        } catch (error) {
          console.error("Error loading wishlist:", error);
        } finally {
          setLoading(false);
        }
      };
      loadWishlist();
    }, [user]) // Thêm user vào dependency array
  );

  const removeFromWishlist = async (itemId: string) => {
    if (!user) return;
    
    Alert.alert(
      "Xác nhận xóa",
      "Bạn có chắc chắn muốn xóa sản phẩm này khỏi danh sách yêu thích?",
      [
        {
          text: "Hủy",
          style: "cancel",
        },
        {
          text: "Xóa",
          onPress: async () => {
            try {
              await deleteDocument('wishlist', itemId);
              
              // Cập nhật state
              setWishlistItems(wishlistItems.filter(item => item.id !== itemId));
              
              Alert.alert("Thành công", "Sản phẩm đã được xóa khỏi danh sách yêu thích!");
            } catch (error) {
              console.error("Error removing item from wishlist:", error);
              Alert.alert("Lỗi", "Không thể xóa sản phẩm. Vui lòng thử lại sau.");
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  const renderWishlistItem = ({ item }: { item: WishlistItem }) => {
    if (!item.product) {
      return <Text>Sản phẩm không tồn tại</Text>;
    }
    
    return (
      <Link href={`/product/${item.product.id}`} className="flex-1">
        <Card className="p-4 mb-4 rounded-lg flex-row items-center">
          <Image
            source={{ uri: item.product.images[0] || '' }}
            className="h-[80px] w-[80px] rounded-md mr-4"
            alt={`${item.product.name} image`}
            resizeMode="contain"
          />
          <VStack className="flex-1">
            <Text className="text-md font-semibold">{item.product.name}</Text>
            <Text className="text-sm text-typography-700" numberOfLines={2}>
              {item.product.description}
            </Text>
            <Heading size="sm" className="mt-1">${item.product.price}</Heading>
          </VStack>
          <Button
            variant="outline"
            className="px-2 py-1 border-outline-300 ml-2"
            onPress={() => removeFromWishlist(item.id)}
          >
            <ButtonText size="sm" className="text-typography-600">
              Xóa
            </ButtonText>
          </Button>
        </Card>
      </Link>
    );
  };

  if (loading) {
    return (
      <Box className="flex-1 justify-center items-center">
        <Text className="text-lg">Đang tải danh sách yêu thích...</Text>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box className="flex-1 justify-center items-center">
        <Text className="text-lg">Vui lòng đăng nhập để xem danh sách yêu thích</Text>
      </Box>
    );
  }

  return (
    <GluestackUIProvider mode="light">
      {wishlistItems.length === 0 ? (
        <Box className="flex-1 justify-center items-center">
          <Text className="text-lg">Danh sách yêu thích của bạn đang trống</Text>
        </Box>
      ) : (
        <VStack className="p-4 flex-1">
          <Heading size="lg" className="mb-4">Danh sách yêu thích của bạn</Heading>
          <FlatList
            data={wishlistItems}
            renderItem={renderWishlistItem}
            keyExtractor={(item) => item.id}
            contentContainerClassName="gap-2"
          />
        </VStack>
      )}
    </GluestackUIProvider>
  );
}