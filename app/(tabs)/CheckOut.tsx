import React, { useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from '@/context/AuthContext';

interface TransactionItem {
  productId: string;
  quantity: number;
  price: number;
  productName: string;
}

interface Transaction {
  id: string;
  userId: string;
  storeName: string;
  items: TransactionItem[];
  totalAmount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export default function CheckOut() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const { getDocuments } = useFirestore();
  const { user } = useAuth();

  // Các tab trạng thái đơn hàng
  const tabs = [
    { id: 'all', label: 'Tất cả' },
    { id: 'pending', label: 'Đang xử lý' },
    { id: 'completed', label: 'Hoàn thành' },
    { id: 'cancelled', label: 'Đã hủy' }
  ];

  useEffect(() => {
    const loadTransactions = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const docs = await getDocuments('transactions');
        const userTransactions = docs
          .filter(doc => doc.userId === user.uid)
          .map(doc => ({
            id: doc.id,
            userId: doc.userId,
            storeName: doc.storeName,
            items: doc.items,
            totalAmount: doc.totalAmount,
            status: doc.status,
            createdAt: doc.createdAt?.toDate() || new Date(),
            updatedAt: doc.updatedAt?.toDate() || new Date()
          } as Transaction));

        // Sắp xếp theo thời gian tạo mới nhất
        userTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setTransactions(userTransactions);
      } catch (error) {
        console.error('Error loading transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [user, getDocuments]);

  // Lọc transactions theo tab đang active
  const filteredTransactions = transactions.filter(transaction => {
    if (activeTab === 'all') return true;
    return transaction.status === activeTab;
  });

  if (loading) {
    return (
      <Box className="flex-1 justify-center items-center">
        <Text>Đang tải thông tin đơn hàng...</Text>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box className="flex-1 justify-center items-center">
        <Text>Vui lòng đăng nhập để xem đơn hàng</Text>
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-gray-50">
      <Stack.Screen
        options={{
          title: 'Đơn hàng của tôi',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />

      {/* Tab đơn giản */}
      <Box className="bg-white border-b border-gray-200">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10 }}>
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={{ 
                  marginRight: 10,
                  paddingHorizontal: 15,
                  paddingVertical: 8,
                  backgroundColor: activeTab === tab.id ? '#3b82f6' : '#f3f4f6',
                  borderRadius: 20
                }}
              >
                <Text
                  style={{
                    color: activeTab === tab.id ? 'white' : '#4b5563',
                    fontWeight: '500'
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </Box>

      <ScrollView className="flex-1">
        <VStack className="p-4" space="md">
          {filteredTransactions.length === 0 ? (
            <Box className="bg-white p-4 rounded-lg">
              <Text className="text-center text-gray-500">
                Không có đơn hàng nào {activeTab !== 'all' ? `có trạng thái "${tabs.find(tab => tab.id === activeTab)?.label}"` : ''}
              </Text>
            </Box>
          ) : (
            filteredTransactions.map((transaction) => (
              <Box
                key={transaction.id}
                className="bg-white p-4 rounded-lg mb-4"
              >
                <VStack space="sm">
                  <Box className="flex-row justify-between items-center">
                    <Heading size="lg">Đơn hàng #{transaction.id.slice(-6)}</Heading>
                    <Text
                      className={
                        transaction.status === 'pending'
                          ? 'text-yellow-500'
                          : transaction.status === 'completed'
                          ? 'text-green-500'
                          : 'text-red-500'
                      }
                    >
                      {transaction.status === 'pending'
                        ? 'Đang xử lý'
                        : transaction.status === 'completed'
                        ? 'Hoàn thành'
                        : 'Đã hủy'}
                    </Text>
                  </Box>

                  <Text className="text-gray-600">
                    Cửa hàng: {transaction.storeName}
                  </Text>

                  <Text className="text-gray-600">
                    Ngày đặt: {transaction.createdAt.toLocaleDateString('vi-VN')}
                  </Text>

                  <Box className="mt-2">
                    <Text className="font-semibold mb-2">Chi tiết đơn hàng:</Text>
                    {transaction.items.map((item, index) => (
                      <Box
                        key={index}
                        className="flex-row justify-between items-center py-3 border-b border-gray-100"
                      >
                        <VStack style={{ flex: 1 }}>
                          <Text className="font-medium">{item.productName}</Text>
                          <Text className="text-sm text-gray-500 mt-1">
                            Số lượng: {item.quantity}
                          </Text>
                        </VStack>
                        <Text className="font-medium ml-2">
                          {item.price.toLocaleString('vi-VN', {
                            style: 'currency',
                            currency: 'VND',
                          })}
                        </Text>
                      </Box>
                    ))}
                  </Box>

                  <Box className="mt-4 pt-2 border-t border-gray-200">
                    <Text className="text-lg font-bold text-right">
                      Tổng tiền:{' '}
                      {transaction.totalAmount.toLocaleString('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      })}
                    </Text>
                  </Box>
                </VStack>
              </Box>
            ))
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
}