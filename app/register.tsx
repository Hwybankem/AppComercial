import { useState } from 'react';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Center } from '@/components/ui/center';
import { ScrollView } from 'react-native';

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

const DEFAULT_AVATAR = 'https://i.ibb.co/43kD3y2/user-image-example.jpg';

export default function RegisterScreen() {
  const [formData, setFormData] = useState<Partial<UserData>>({
    email: '',
    fullName: '',
    phone: '',
    address: '',
    avatar: DEFAULT_AVATAR,
  });
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { register } = useAuth();

  const handleRegister = async () => {
    if (!formData.email || !password || !formData.fullName || !formData.phone || !formData.address) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await register(
        formData.email,
        password,
        formData.fullName,
        formData.phone,
        formData.address,
        'customer',
        DEFAULT_AVATAR
      );
      router.push('/login');
    } catch (err: any) {
      setError(err.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-white">
      <Box className="p-4">
        <Center>
          <VStack space="xl" className="w-full max-w-sm items-center">
            <VStack space="xs" className="w-full">
              <Text className="text-2xl font-bold text-center text-gray-800">
                Đăng ký tài khoản
              </Text>
              <Text className="text-center text-gray-500">
                Tạo tài khoản để mua sắm dễ dàng hơn
              </Text>
            </VStack>

            <VStack space="md" className="w-full">
              <Input>
                <InputField
                  placeholder="Họ và tên"
                  value={formData.fullName}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, fullName: text }))}
                />
              </Input>

              <Input>
                <InputField
                  placeholder="Email"
                  value={formData.email}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </Input>

              <Input>
                <InputField
                  placeholder="Số điện thoại"
                  value={formData.phone}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, phone: text }))}
                  keyboardType="phone-pad"
                />
              </Input>

              <Input>
                <InputField
                  placeholder="Địa chỉ"
                  value={formData.address}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, address: text }))}
                  multiline
                  numberOfLines={2}
                />
              </Input>

              <Input>
                <InputField
                  placeholder="Mật khẩu"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </Input>

              {error ? (
                <Text className="text-red-500 text-center">{error}</Text>
              ) : null}

              <Button
                onPress={handleRegister}
                disabled={loading}
                className="bg-blue-500 rounded-full"
              >
                <ButtonText className="text-white">
                  {loading ? 'Đang đăng ký...' : 'Đăng ký'}
                </ButtonText>
              </Button>

              <Link href="/login" asChild>
                <Button variant="outline" className="rounded-full">
                  <ButtonText className="text-blue-500">
                    Đã có tài khoản? Đăng nhập ngay
                  </ButtonText>
                </Button>
              </Link>
            </VStack>
          </VStack>
        </Center>
      </Box>
    </ScrollView>
  );
} 