import React, { useState, useEffect } from 'react';
import { FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { useFirestore } from '@/context/storageFirebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

interface Vendor {
  id: string;
  name: string;
  address: string;
  phone: string;
  description: string;
  logo: string;
  province: string;
  hasOrders: boolean;
  authorizedUsers: {
    fullName: string;
    userId: string;
    username: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const VendorSelection = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const { getDocuments } = useFirestore();

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        setLoading(true);
        const vendorData = await getDocuments('vendors');
        setVendors(vendorData as Vendor[]);
      } catch (error) {
        console.error('Lỗi khi tải danh sách cửa hàng:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVendors();
  }, []);

  const handleSelectVendor = async (vendor: Vendor) => {
    try {
      await AsyncStorage.setItem('selectedVendorId', vendor.id);
      setSelectedVendor(vendor);
      router.replace('/');
    } catch (error) {
      console.error('Lỗi khi lưu cửa hàng:', error);
    }
  };

  const renderVendorItem = ({ item }: { item: Vendor }) => (
    <TouchableOpacity 
      onPress={() => handleSelectVendor(item)}
    >
      <Box 
        className={`flex-row items-center p-4 bg-white rounded-lg mb-3 border ${
          selectedVendor?.id === item.id 
            ? 'border-blue-500 border-2' 
            : 'border-gray-200'
        }`}
      >
        <Image 
          source={{ uri: item.logo || 'https://via.placeholder.com/60' }} 
          className="w-15 h-15 rounded-lg"
        />
        <Box className="ml-4 flex-1">
          <Text className="text-lg font-bold text-gray-800">{item.name}</Text>
          <Text className="text-gray-600">{item.address}</Text>
          <Text className="text-gray-500">{item.phone}</Text>
          <Box className="mt-2 bg-blue-100 px-2 py-1 rounded-full self-start">
            <Text className="text-blue-800 text-xs">{item.province}</Text>
          </Box>
        </Box>
        <Feather 
          name={selectedVendor?.id === item.id ? "check-circle" : "circle"} 
          size={24} 
          color={selectedVendor?.id === item.id ? "#3b82f6" : "#d1d5db"} 
        />
      </Box>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <Box className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-4 text-gray-600">Đang tải danh sách cửa hàng...</Text>
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-gray-50">
      <Box className="p-4 bg-white border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-800">Chọn cửa hàng</Text>
        <Text className="text-gray-600 mt-1">
          Chọn cửa hàng để xem sản phẩm và đặt hàng
        </Text>
      </Box>
      
      {vendors.length === 0 ? (
        <Box className="flex-1 justify-center items-center p-4">
          <Feather name="shopping-bag" size={48} color="#d1d5db" />
          <Text className="mt-4 text-gray-600 text-center">
            Không có cửa hàng nào được tìm thấy
          </Text>
        </Box>
      ) : (
        <FlatList
          data={vendors}
          renderItem={renderVendorItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </Box>
  );
};

export default VendorSelection;