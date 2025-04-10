import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

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
    location: {
      latitude: number;
      longitude: number;
    };
  }

const VendorSelection = ({ onSelectVendor }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    // Lấy danh sách cửa hàng từ Firestore
    const fetchVendors = async () => {
      // Giả sử bạn có hàm getVendors để lấy dữ liệu từ Firestore
      const vendorData = await getVendors();
      setVendors(vendorData);
    };

    const getUserLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation(location.coords);
      }
    };

    fetchVendors();
    getUserLocation();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: userLocation?.latitude || 0,
          longitude: userLocation?.longitude || 0,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      >
        {vendors.map(vendor => (
          <Marker
            key={vendor.id}
            coordinate={vendor.location}
            title={vendor.name}
            description={vendor.address}
          />
        ))}
      </MapView>
      <FlatList
        data={vendors}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onSelectVendor(item)}>
            <Text>{item.name}</Text>
            <Text>{item.address}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id}
      />
    </View>
  );
};

export default VendorSelection;