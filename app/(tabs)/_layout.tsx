import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { Button, ButtonText } from "@/components/ui/button";
import { useAuth } from '@/context/AuthContext';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Store',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          headerRight: () => (
            user ? (
              <Button 
                variant="outline" 
                size="sm" 
                onPress={() => router.push('/profile')}
                className="border-blue-500 rounded-full"
              >
                <ButtonText className="text-blue-500 text-xs font-medium">Tài khoản</ButtonText>
              </Button>
            ) : (
              <Button 
                variant="solid" 
                size="sm" 
                onPress={() => router.push('/login')}
                className="bg-blue-500 rounded-full"
              >
                <ButtonText className="text-white text-xs font-medium">Đăng nhập</ButtonText>
              </Button>
            )
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color }) => <TabBarIcon name="shopping-cart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: 'WishList',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
        }}
      />
    </Tabs>
  );
}
