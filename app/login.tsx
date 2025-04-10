import { useState } from 'react';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Center } from '@/components/ui/center';

interface UserData {
  address: string;
  createAt: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  updateAt: string;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await login(email, password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="flex-1 bg-white p-4">
      <Center className="flex-1">
        <VStack space="xl" className="w-full max-w-sm">
          <VStack space="xs">
            <Text className="text-2xl font-bold text-center text-gray-800">
              Đăng nhập
            </Text>
            <Text className="text-center text-gray-500">
              Đăng nhập để tiếp tục mua sắm
            </Text>
          </VStack>

          <VStack space="md">
            <Input>
              <InputField
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
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
              onPress={handleLogin}
              disabled={loading}
              className="bg-blue-500 rounded-full"
            >
              <ButtonText className="text-white">
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </ButtonText>
            </Button>

            <Link href="/register" asChild>
              <Button variant="outline" className="rounded-full">
                <ButtonText className="text-blue-500">
                  Chưa có tài khoản? Đăng ký ngay
                </ButtonText>
              </Button>
            </Link>
          </VStack>
        </VStack>
      </Center>
    </Box>
  );
}