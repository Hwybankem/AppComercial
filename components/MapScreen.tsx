import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';

// API key để gọi Geoapify và Google Maps
const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

interface Location {
  lat: number;
  lon: number;
  name: string;
}

interface Route {
  coordinates: { latitude: number; longitude: number }[];
  distance: string;
  duration: string;
}

const MapScreen = () => {
  const { deliveryAddress, shipperId } = useLocalSearchParams<{ deliveryAddress: string, shipperId: string }>();
  const [shipperLocation, setShipperLocation] = useState<Location | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState<Location | null>(null);
  const [route, setRoute] = useState<Route | null>(null);

  // Hàm lấy tọa độ từ địa chỉ thông qua API của Geoapify
  const fetchLocationFromAddress = async (address: string): Promise<Location | null> => {
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&apiKey=${GEOAPIFY_API_KEY}`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        return {
          lat: feature.properties.lat,
          lon: feature.properties.lon,
          name: feature.properties.formatted,
        };
      }
      return null;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  // Hàm lấy đường đi từ Google Maps Directions API
  const fetchRoute = async (origin: Location, destination: Location) => {
    try {
      console.log('Fetching route from:', origin, 'to:', destination);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lon}&destination=${destination.lat},${destination.lon}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      console.log('Route response:', data);
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.overview_polyline.points;
        const decodedCoordinates = decodePolyline(coordinates);
        console.log('Decoded coordinates:', decodedCoordinates);
        
        setRoute({
          coordinates: decodedCoordinates,
          distance: route.legs[0].distance.text,
          duration: route.legs[0].duration.text
        });
      } else {
        console.log('No routes found');
      }
    } catch (error) {
      console.error('Error fetching route:', error);
      Alert.alert('Không thể tìm đường đi');
    }
  };

  // Hàm giải mã polyline từ Google Maps
  const decodePolyline = (encoded: string) => {
    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      poly.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return poly;
  };

  // Lấy vị trí hiện tại của shipper
  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Cần quyền truy cập vị trí để sử dụng tính năng này');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address.length > 0) {
        const formattedAddress = `${address[0].street}, ${address[0].district}, ${address[0].city}`;
        setShipperLocation({
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          name: formattedAddress,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Không thể lấy vị trí hiện tại');
    }
  };

  useEffect(() => {
    const setupLocations = async () => {
      await getCurrentLocation();
      if (deliveryAddress) {
        const location = await fetchLocationFromAddress(deliveryAddress);
        if (location) {
          setDeliveryLocation(location);
        } else {
          Alert.alert('Không thể tìm thấy địa chỉ giao hàng');
        }
      }
    };

    setupLocations();
  }, [deliveryAddress]);

  useEffect(() => {
    if (shipperLocation && deliveryLocation) {
      fetchRoute(shipperLocation, deliveryLocation);
    }
  }, [shipperLocation, deliveryLocation]);

  if (!shipperLocation || !deliveryLocation) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: shipperLocation.lat,
          longitude: shipperLocation.lon,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {route && route.coordinates.length > 0 && (
          <Polyline
            coordinates={route.coordinates}
            strokeWidth={4}
            strokeColor="#2196F3"
            lineDashPattern={[1]}
          />
        )}
        <Marker
          coordinate={{
            latitude: shipperLocation.lat,
            longitude: shipperLocation.lon,
          }}
          title="Vị trí của bạn"
          description={shipperLocation.name}
          pinColor="#2196F3"
        />
        <Marker
          coordinate={{
            latitude: deliveryLocation.lat,
            longitude: deliveryLocation.lon,
          }}
          title="Địa chỉ giao hàng"
          description={deliveryLocation.name}
          pinColor="#4CAF50"
        />
      </MapView>
      {route && (
        <View style={styles.routeInfo}>
          <Text style={styles.routeText}>Khoảng cách: {route.distance}</Text>
          <Text style={styles.routeText}>Thời gian: {route.duration}</Text>
        </View>
      )}
    </View>
  );
};

export default MapScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  routeInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  routeText: {
    fontSize: 16,
    marginBottom: 5,
  },
});
