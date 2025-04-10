import { useState, useEffect } from 'react';
import { Box } from '@/components/ui/box';
import { Button, ButtonText, ButtonIcon } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Center } from '@/components/ui/center';
import { Image } from '@/components/ui/image';
import { ScrollView, View, TouchableOpacity } from 'react-native';
import { useFirestore } from '@/context/storageFirebase';
import { EditIcon } from '@/components/ui/icon';
import * as ImagePicker from 'expo-image-picker';
import { uploadToImgBB } from '@/services/imgbbService';

interface UserData {
  address: string;
  createAt: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  updateAt: string;
  avatar?: string;
}

export default function ProfileScreen() {
  const [formData, setFormData] = useState<Partial<UserData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuth();
  const { getDocument, updateDocument } = useFirestore();

  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid) {
        try {
          const userData = await getDocument('users', user.uid);
          console.log('userData', userData);
          if (userData) {
            setFormData({
              email: userData.username || '',
              fullName: userData.fullName || '',
              phone: userData.phone || '',
              address: userData.address || '',
              role: userData.role || 'user',
              avatar: userData.avatar || '',
            });
          }
        } catch (err: any) {
          setError('Không thể tải thông tin người dùng');
        }
      }
    };
    fetchUserData();
  }, [user]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      return result.assets[0].uri;
    }
    return null;
  };

  const handleUpdateAvatar = async () => {
    try {
      const imageUri = await pickImage();
      if (imageUri && user?.uid) {
        setLoading(true);
        const imageUrl = await uploadToImgBB(imageUri);
        await updateDocument('users', user.uid, {
          avatar: imageUrl,
          updateAt: new Date().toISOString(),
        });
        setFormData(prev => ({ ...prev, avatar: imageUrl }));
      }
    } catch (err: any) {
      setError('Không thể cập nhật ảnh đại diện');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!formData.fullName || !formData.phone || !formData.address) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    try {
      setLoading(true);
      setError('');
      if (user?.uid) {
        const { email, role, ...updateData } = formData;
        await updateDocument('users', user.uid, {
          ...updateData,
          updateAt: new Date().toISOString(),
        });
        setIsEditing(false);
      }
    } catch (err: any) {
      setError('Không thể cập nhật thông tin');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err: any) {
      setError('Không thể đăng xuất');
    }
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Box className="bg-blue-500 h-40 rounded-b-[40px] shadow-lg">
        <View className="absolute right-4 top-4 flex-row space-x-2">
          <Button
            onPress={() => setIsEditing(!isEditing)}
            variant="outline"
            size="sm"
            className="bg-white/20 border-white rounded-full"
          >
            <ButtonIcon as={EditIcon} color="white" />
            <ButtonText className="text-white text-xs ml-1">
              {isEditing ? 'Hủy' : 'Sửa thông tin'}
            </ButtonText>
          </Button>
          <Button
            onPress={handleLogout}
            variant="outline"
            size="sm"
            className="bg-white/20 border-white rounded-full"
          >
            <ButtonText className="text-white text-xs">Đăng xuất</ButtonText>
          </Button>
        </View>
      </Box>

      <Box className="px-4 -mt-20">
        <Center>
          <VStack space="xl" className="w-full max-w-sm">
            <View className="relative self-center">
              <Box className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-lg">
                {formData.avatar ? (
                  <Image 
                    source={{ uri: formData.avatar }}
                    alt="User Avatar"
                    className="w-full h-full"
                  />
                ) : (
                  <Box className="w-full h-full bg-gray-200 items-center justify-center">
                    <Text className="text-gray-500">No Image</Text>
                  </Box>
                )}
              </Box>
              <TouchableOpacity 
                onPress={handleUpdateAvatar}
                className="absolute bottom-0 right-0 bg-blue-500 p-2 rounded-full border-2 border-white"
              >
                <EditIcon color="white" />
              </TouchableOpacity>
            </View>

            <VStack space="md" className="bg-white rounded-2xl p-4 shadow-sm">
              <View className="border-b border-gray-100 pb-3">
                <Text className="text-sm text-gray-500 mb-1">Email</Text>
                <Text className="text-base text-gray-800">{formData.email}</Text>
              </View>

              <View className="border-b border-gray-100 pb-3">
                <Text className="text-sm text-gray-500 mb-1">Họ và tên</Text>
                {isEditing ? (
                  <Input>
                    <InputField
                      value={formData.fullName}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, fullName: text }))}
                    />
                  </Input>
                ) : (
                  <Text className="text-base text-gray-800">{formData.fullName}</Text>
                )}
              </View>

              <View className="border-b border-gray-100 pb-3">
                <Text className="text-sm text-gray-500 mb-1">Số điện thoại</Text>
                {isEditing ? (
                  <Input>
                    <InputField
                      value={formData.phone}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, phone: text }))}
                      keyboardType="phone-pad"
                    />
                  </Input>
                ) : (
                  <Text className="text-base text-gray-800">{formData.phone}</Text>
                )}
              </View>

              <View className="border-b border-gray-100 pb-3">
                <Text className="text-sm text-gray-500 mb-1">Địa chỉ</Text>
                {isEditing ? (
                  <Input>
                    <InputField
                      value={formData.address}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, address: text }))}
                      multiline
                      numberOfLines={2}
                    />
                  </Input>
                ) : (
                  <Text className="text-base text-gray-800">{formData.address}</Text>
                )}
              </View>

              {error ? (
                <Text className="text-red-500 text-center">{error}</Text>
              ) : null}

              {isEditing && (
                <Button
                  onPress={handleUpdateProfile}
                  disabled={loading}
                  className="bg-blue-500 rounded-full mt-4"
                >
                  <ButtonText className="text-white">
                    {loading ? 'Đang cập nhật...' : 'Lưu thay đổi'}
                  </ButtonText>
                </Button>
              )}
            </VStack>
          </VStack>
        </Center>
      </Box>
    </ScrollView>
  );
}
