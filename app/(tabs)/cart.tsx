import React, { useEffect, useState } from "react";
import { FlatList } from "react-native";
import { Link, Stack, useFocusEffect } from "expo-router";
import { Card } from "@/components/ui/card";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import { Alert } from "react-native";
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

// Định nghĩa interface cho đơn hàng
interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
  product?: Product;
}

export default function CartScreen() {
  const [cartItems, setCartItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { getDocuments, getDocument, updateDocument, deleteDocument } = useFirestore();
  const { user } = useAuth();

  useFocusEffect(
    React.useCallback(() => {
      const loadCart = async () => {
        if (!user) {
          setCartItems([]);
          setLoading(false);
          return;
        }

        try {
          setLoading(true);
          // Lấy tất cả đơn hàng từ Firestore
          const orders = await getDocuments('orders');
          
          // Lọc các đơn hàng của người dùng hiện tại
          const userOrders = orders.filter(order => order.userId === user.uid);
          
          // Lấy thông tin sản phẩm cho mỗi đơn hàng
          const cartItemsWithProducts = await Promise.all(
            userOrders.map(async (order) => {
              try {
                const productData = await getDocument('products', order.productId);
                return {
                  ...order,
                  product: productData ? {
                    id: productData.id,
                    name: productData.name || '',
                    price: productData.price || 0,
                    images: Array.isArray(productData.images) ? productData.images : [],
                    description: productData.description || ''
                  } : undefined
                };
              } catch (error) {
                console.error(`Error fetching product ${order.productId}:`, error);
                return order;
              }
            })
          );
          
          setCartItems(cartItemsWithProducts as Order[]);
        } catch (error) {
          console.error("Error loading cart:", error);
        } finally {
          setLoading(false);
        }
      };
      loadCart();
    }, [user]) // Thêm user vào dependency array
  );

  const getTotalPrice = () => {
    return cartItems
      .reduce((total, item) => {
        if (item.product) {
          return total + item.product.price * item.quantity;
        }
        return total;
      }, 0)
      .toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
  };

  const increaseQuantity = async (id: string) => {
    if (!user) return;
    
    try {
      const item = cartItems.find(item => item.id === id);
      if (item) {
        await updateDocument('orders', id, {
          quantity: item.quantity + 1,
          updatedAt: new Date()
        });
        
        // Cập nhật state
        setCartItems(cartItems.map(cartItem => 
          cartItem.id === id 
            ? { ...cartItem, quantity: cartItem.quantity + 1 } 
            : cartItem
        ));
      }
    } catch (error) {
      console.error("Error increasing quantity:", error);
      Alert.alert("Lỗi", "Không thể cập nhật số lượng. Vui lòng thử lại sau.");
    }
  };

  const decreaseQuantity = async (id: string) => {
    if (!user) return;
    
    try {
      const item = cartItems.find(item => item.id === id);
      if (item) {
        if (item.quantity <= 1) {
          // Nếu số lượng = 1, hiển thị cảnh báo xóa
          Alert.alert(
            "Xóa sản phẩm",
            "Bạn có muốn xóa sản phẩm này khỏi giỏ hàng?",
            [
              { text: "Hủy", style: "cancel" },
              {
                text: "Xóa",
                onPress: () => removeFromCart(id),
                style: "destructive",
              },
            ]
          );
        } else {
          // Giảm số lượng
          await updateDocument('orders', id, {
            quantity: item.quantity - 1,
            updatedAt: new Date()
          });
          
          // Cập nhật state
          setCartItems(cartItems.map(cartItem => 
            cartItem.id === id 
              ? { ...cartItem, quantity: cartItem.quantity - 1 } 
              : cartItem
          ));
        }
      }
    } catch (error) {
      console.error("Error decreasing quantity:", error);
      Alert.alert("Lỗi", "Không thể cập nhật số lượng. Vui lòng thử lại sau.");
    }
  };

  const removeFromCart = async (id: string) => {
    if (!user) return;
    
    Alert.alert(
      "Xóa sản phẩm",
      "Bạn có chắc chắn muốn xóa sản phẩm này khỏi giỏ hàng?",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa",
          onPress: async () => {
            try {
              await deleteDocument('orders', id);
              
              // Cập nhật state
              setCartItems(cartItems.filter(item => item.id !== id));
              
              Alert.alert("Thành công", "Sản phẩm đã được xóa khỏi giỏ hàng!");
            } catch (error) {
              console.error("Error removing item from cart:", error);
              Alert.alert("Lỗi", "Không thể xóa sản phẩm. Vui lòng thử lại sau.");
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  const renderCartItem = ({ item }: { item: Order }) => {
    if (!item.product) {
      return <Text>Sản phẩm không tồn tại</Text>;
    }
    
    return (
      <Card className="p-4 mb-4 rounded-lg flex-row items-center">
        <Image
          source={{ uri: item.product.images[0] || '' }}
          className="h-[80px] w-[80px] rounded-md mr-4"
          alt={`${item.product.name} image`}
          resizeMode="contain"
        />
        <VStack className="flex-1">
          <Text className="text-md font-semibold">{item.product.name}</Text>
          <Text className="text-sm mt-1">
            {item.product.price.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })} x {item.quantity}
          </Text>
          <Heading size="sm" className="mt-1">
            {(item.product.price * item.quantity).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}
          </Heading>
          <Box className="flex-row items-center mt-2">
            <Button
              size="sm"
              variant="outline"
              onPress={() => decreaseQuantity(item.id)}
              className="mr-2"
            >
              <ButtonText>-</ButtonText>
            </Button>
            <Text className="text-md mx-2">{item.quantity}</Text>
            <Button
              size="sm"
              variant="outline"
              onPress={() => increaseQuantity(item.id)}
              className="ml-2"
            >
              <ButtonText>+</ButtonText>
            </Button>
          </Box>
        </VStack>
        <Button
          variant="outline"
          size="sm"
          onPress={() => removeFromCart(item.id)}
        >
          <ButtonText>Xóa</ButtonText>
        </Button>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box className="flex-1 justify-center items-center">
        <Text className="text-lg">Đang tải giỏ hàng...</Text>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box className="flex-1 justify-center items-center">
        <Text className="text-lg">Vui lòng đăng nhập để xem giỏ hàng</Text>
      </Box>
    );
  }

  return (
    <GluestackUIProvider mode="light">
      {cartItems.length === 0 ? (
        <Box className="flex-1 justify-center items-center">
          <Text className="text-lg">Giỏ hàng của bạn đang trống</Text>
        </Box>
      ) : (
        <VStack className="p-4 flex-1">
          <Heading size="lg" className="mb-4">
            Giỏ hàng của bạn
          </Heading>
          <FlatList
            data={cartItems} 
            renderItem={renderCartItem} 
            keyExtractor={(item) => item.id} 
            contentContainerClassName="gap-2" 
          />
          <Card className="p-4 mt-4">
            <Text className="text-lg font-bold mb-4">
              Tổng tiền: {getTotalPrice()}
            </Text>
           <Link href="/CheckOut" asChild>
            <Button>
              <ButtonText>Thanh toán</ButtonText>
            </Button>
          </Link>
          </Card>
        </VStack>
      )}
    </GluestackUIProvider>
  );
}
 
