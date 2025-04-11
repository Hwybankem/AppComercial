import React, { useEffect, useState } from "react";
import { FlatList } from "react-native";
import { Link, router, Stack, useFocusEffect } from "expo-router";
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
  storeName: string;
  createdAt: Date;
  updatedAt: Date;
  product?: Product;
}

interface GroupedCartItems {
  [key: string]: Order[];
}

export default function CartScreen() {
  const [cartItems, setCartItems] = useState<Order[]>([]);
  const [groupedCartItems, setGroupedCartItems] = useState<GroupedCartItems>({});
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState<{[key: string]: boolean}>({});
  const { getDocuments, getDocument, updateDocument, deleteDocument, addDocument } = useFirestore();
  const { user } = useAuth();

  // Hàm nhóm sản phẩm theo cửa hàng
  const groupItemsByStore = (items: Order[]) => {
    const grouped = items.reduce((acc: GroupedCartItems, item) => {
      const storeName = item.storeName || 'Không xác định';
      if (!acc[storeName]) {
        acc[storeName] = [];
      }
      acc[storeName].push(item);
      return acc;
    }, {});
    setGroupedCartItems(grouped);
  };

  // Thêm useEffect để log ra console mỗi khi groupedCartItems thay đổi
  useEffect(() => {
    console.log('groupedCartItems updated:', Object.keys(groupedCartItems).length);
  }, [groupedCartItems]);

  useFocusEffect(
    React.useCallback(() => {
      const loadCart = async () => {
        if (!user) {
          setCartItems([]);
          setGroupedCartItems({});
          setLoading(false);
          return;
        }

        try {
          setLoading(true);
          const orders = await getDocuments('orders');
          const userOrders = orders.filter(order => order.userId === user.uid);
          
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
          
          const validCartItems = cartItemsWithProducts.filter(item => item.product) as Order[];
          setCartItems(validCartItems);
          groupItemsByStore(validCartItems);
        } catch (error) {
          console.error("Error loading cart:", error);
        } finally {
          setLoading(false);
        }
      };
      loadCart();
    }, [user])
  );

  const handleCheckout = async () => {
    try {
      // Tạo transaction cho từng cửa hàng
      for (const [storeName, items] of Object.entries(groupedCartItems)) {
        const transaction = {
          userId: user?.uid,
          storeName: storeName,
          items: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.product?.price || 0,
            productName: item.product?.name || ''
          })),
          totalAmount: items.reduce((total, item) => 
            total + (item.product?.price || 0) * item.quantity, 0
          ),
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Thêm vào collection transactions
        await addDocument('transactions', transaction);

        // Xóa các sản phẩm đã thanh toán khỏi giỏ hàng
        for (const item of items) {
          await deleteDocument('orders', item.id);
        }
      }

      // Cập nhật state
      setCartItems([]);
      setGroupedCartItems({});
      Alert.alert("Thành công", "Đơn hàng đã được tạo thành công!");
      
      // Chuyển đến trang checkout
      router.push('/CheckOut');
    } catch (error) {
      console.error("Error during checkout:", error);
      Alert.alert("Lỗi", "Không thể tạo đơn hàng. Vui lòng thử lại sau.");
    }
  };

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
      // Tìm sản phẩm trong giỏ hàng
      const item = cartItems.find(item => item.id === id);
      if (item) {
        const newQuantity = item.quantity + 1;
        
        // Cập nhật loading state cho item này
        setLoadingItems(prev => ({ ...prev, [id]: true }));

        // Tạo ra danh sách sản phẩm mới với số lượng đã cập nhật
        const updatedCartItems = cartItems.map(cartItem => 
          cartItem.id === id 
            ? { ...cartItem, quantity: newQuantity } 
            : cartItem
        );
        
        console.log(`Increasing quantity for item ${id} to ${newQuantity}`);
        
        // Cập nhật state và làm lại việc nhóm
        setCartItems([...updatedCartItems]);
        
        // Thực hiện việc nhóm lại sản phẩm theo cửa hàng
        const newGroupedItems: GroupedCartItems = updatedCartItems.reduce((acc: GroupedCartItems, item) => {
          const storeName = item.storeName || 'Không xác định';
          if (!acc[storeName]) {
            acc[storeName] = [];
          }
          acc[storeName].push(item);
          return acc;
        }, {});
        
        // Cập nhật state groupedCartItems
        setGroupedCartItems({...newGroupedItems});

        // Gọi API để cập nhật database
        await updateDocument('orders', id, {
          quantity: newQuantity,
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error("Error increasing quantity:", error);
      Alert.alert("Lỗi", "Không thể cập nhật số lượng. Vui lòng thử lại sau.");
      
      // Nếu có lỗi, rollback lại state cũ
      const originalItem = cartItems.find(item => item.id === id);
      if (originalItem) {
        const updatedCartItems = cartItems.map(cartItem => 
          cartItem.id === id 
            ? { ...cartItem, quantity: originalItem.quantity } 
            : cartItem
        );
        setCartItems([...updatedCartItems]);
        
        // Thực hiện việc nhóm lại sản phẩm theo cửa hàng
        const newGroupedItems: GroupedCartItems = updatedCartItems.reduce((acc: GroupedCartItems, item) => {
          const storeName = item.storeName || 'Không xác định';
          if (!acc[storeName]) {
            acc[storeName] = [];
          }
          acc[storeName].push(item);
          return acc;
        }, {});
        
        // Cập nhật state groupedCartItems
        setGroupedCartItems({...newGroupedItems});
      }
    } finally {
      // Xóa loading state cho item này
      setLoadingItems(prev => ({ ...prev, [id]: false }));
    }
  };

  const decreaseQuantity = async (id: string) => {
    if (!user) return;
    
    try {
      const item = cartItems.find(item => item.id === id);
      if (item) {
        if (item.quantity <= 1) {
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
          const newQuantity = item.quantity - 1;
          
          // Cập nhật loading state cho item này
          setLoadingItems(prev => ({ ...prev, [id]: true }));

          // Tạo ra danh sách sản phẩm mới với số lượng đã cập nhật
          const updatedCartItems = cartItems.map(cartItem => 
            cartItem.id === id 
              ? { ...cartItem, quantity: newQuantity } 
              : cartItem
          );
          
          console.log(`Decreasing quantity for item ${id} to ${newQuantity}`);
          
          // Cập nhật state và làm lại việc nhóm
          setCartItems([...updatedCartItems]);
          
          // Thực hiện việc nhóm lại sản phẩm theo cửa hàng
          const newGroupedItems: GroupedCartItems = updatedCartItems.reduce((acc: GroupedCartItems, item) => {
            const storeName = item.storeName || 'Không xác định';
            if (!acc[storeName]) {
              acc[storeName] = [];
            }
            acc[storeName].push(item);
            return acc;
          }, {});
          
          // Cập nhật state groupedCartItems
          setGroupedCartItems({...newGroupedItems});

          // Gọi API để cập nhật database
          await updateDocument('orders', id, {
            quantity: newQuantity,
            updatedAt: new Date()
          });
        }
      }
    } catch (error) {
      console.error("Error decreasing quantity:", error);
      Alert.alert("Lỗi", "Không thể cập nhật số lượng. Vui lòng thử lại sau.");
      
      // Nếu có lỗi, rollback lại state cũ
      const originalItem = cartItems.find(item => item.id === id);
      if (originalItem) {
        const updatedCartItems = cartItems.map(cartItem => 
          cartItem.id === id 
            ? { ...cartItem, quantity: originalItem.quantity } 
            : cartItem
        );
        setCartItems([...updatedCartItems]);
        
        // Thực hiện việc nhóm lại sản phẩm theo cửa hàng
        const newGroupedItems: GroupedCartItems = updatedCartItems.reduce((acc: GroupedCartItems, item) => {
          const storeName = item.storeName || 'Không xác định';
          if (!acc[storeName]) {
            acc[storeName] = [];
          }
          acc[storeName].push(item);
          return acc;
        }, {});
        
        // Cập nhật state groupedCartItems
        setGroupedCartItems({...newGroupedItems});
      }
    } finally {
      // Xóa loading state cho item này
      setLoadingItems(prev => ({ ...prev, [id]: false }));
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
              // Cập nhật UI ngay lập tức trước khi gọi API
              const updatedCartItems = cartItems.filter(item => item.id !== id);
              
              console.log(`Removing item ${id} from cart`);
              
              // Cập nhật state
              setCartItems([...updatedCartItems]);
              
              // Thực hiện việc nhóm lại sản phẩm theo cửa hàng
              const newGroupedItems: GroupedCartItems = updatedCartItems.reduce((acc: GroupedCartItems, item) => {
                const storeName = item.storeName || 'Không xác định';
                if (!acc[storeName]) {
                  acc[storeName] = [];
                }
                acc[storeName].push(item);
                return acc;
              }, {});
              
              // Cập nhật state groupedCartItems
              setGroupedCartItems({...newGroupedItems});
              
              // Sau đó gọi API để xóa khỏi database
              await deleteDocument('orders', id);
              
              Alert.alert("Thành công", "Sản phẩm đã được xóa khỏi giỏ hàng!");
            } catch (error) {
              console.error("Error removing item from cart:", error);
              Alert.alert("Lỗi", "Không thể xóa sản phẩm. Vui lòng thử lại sau.");
              
              // Nếu có lỗi, load lại dữ liệu từ server
              const orders = await getDocuments('orders');
              const userOrders = orders.filter(order => order.userId === user.uid);
              
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
              
              const validCartItems = cartItemsWithProducts.filter(item => item.product) as Order[];
              setCartItems(validCartItems);
              groupItemsByStore(validCartItems);
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
    
    const itemTotal = item.product.price * item.quantity;
    const isLoading = loadingItems[item.id] || false;
    
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
            {itemTotal.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}
          </Heading>
          <Box className="flex-row items-center mt-2">
            <Button
              size="sm"
              variant="outline"
              onPress={() => decreaseQuantity(item.id)}
              className="mr-2"
              disabled={isLoading}
              style={isLoading ? { opacity: 0.7 } : {}}
            >
              <ButtonText>{isLoading ? '...' : '-'}</ButtonText>
            </Button>
            <Text className="text-md mx-2">{isLoading ? '...' : item.quantity}</Text>
            <Button
              size="sm"
              variant="outline"
              onPress={() => increaseQuantity(item.id)}
              className="ml-2"
              disabled={isLoading}
              style={isLoading ? { opacity: 0.7 } : {}}
            >
              <ButtonText>{isLoading ? '...' : '+'}</ButtonText>
            </Button>
          </Box>
        </VStack>
        <Button
          variant="outline"
          size="sm"
          onPress={() => removeFromCart(item.id)}
          disabled={isLoading}
          style={isLoading ? { opacity: 0.7 } : {}}
        >
          <ButtonText>Xóa</ButtonText>
        </Button>
      </Card>
    );
  };

  const renderStoreSection = (storeName: string, items: Order[]) => {
    // Tạo key duy nhất dựa trên tổng số lượng sản phẩm để đảm bảo re-render khi số lượng thay đổi
    const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0);
    
    return (
      <Box key={`${storeName}-${totalQuantity}`} className="mb-4 bg-white rounded-lg p-4">
        <Heading size="lg" className="mb-4">{storeName}</Heading>
        <FlatList
          data={items}
          renderItem={renderCartItem}
          keyExtractor={item => `${item.id}-${item.quantity}`} // Thêm quantity vào key để buộc re-render khi số lượng thay đổi
          scrollEnabled={false}
          extraData={loadingItems} // Thêm extraData để FlatList biết khi nào cần re-render
        />
        <Box className="mt-4 border-t border-gray-200 pt-4">
          <Text className="text-right text-lg">
            Tổng tiền: {getTotalPriceByStore(items)}
          </Text>
        </Box>
      </Box>
    );
  };

  const getTotalPriceByStore = (items: Order[]) => {
    return items
      .reduce((total, item) => {
        if (item.product) {
          return total + item.product.price * item.quantity;
        }
        return total;
      }, 0)
      .toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
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
      <Stack.Screen
        options={{
          title: 'Giỏ hàng',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      
      {loading ? (
        <Box className="flex-1 justify-center items-center">
          <Text className="text-lg">Đang tải giỏ hàng...</Text>
        </Box>
      ) : cartItems.length === 0 ? (
        <Box className="flex-1 justify-center items-center p-4">
          <Text className="text-lg text-gray-600 mb-4">Giỏ hàng trống</Text>
          <Link href="/" asChild>
            <Button>
              <ButtonText>Tiếp tục mua sắm</ButtonText>
            </Button>
          </Link>
        </Box>
      ) : (
        <VStack className="flex-1">
          <Box className="flex-1 p-4">
            {Object.entries(groupedCartItems).map(([storeName, items]) => {
              // Tính tổng số lượng của từng cửa hàng để đặt key duy nhất
              const storeQuantity = items.reduce((acc, item) => acc + item.quantity, 0);
              console.log(`Rendering store ${storeName} with ${items.length} items, total quantity: ${storeQuantity}`);
              
              return renderStoreSection(storeName, items);
            })}
          </Box>
          
          <Box 
            className="p-4 bg-white border-t border-gray-200"
            key={`footer-${cartItems.reduce((acc, item) => acc + item.quantity, 0)}`}
          >
            <Text className="text-lg font-bold mb-2">
              Tổng cộng: {getTotalPrice()}
            </Text>
            <Button
              onPress={handleCheckout}
              className="bg-blue-500 rounded-lg"
            >
              <ButtonText>Thanh toán</ButtonText>
            </Button>
          </Box>
        </VStack>
      )}
    </GluestackUIProvider>
  );
}
 
