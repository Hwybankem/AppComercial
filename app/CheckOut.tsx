import {Image} from "@/components/ui/image"

export default function CheckOutScreen() {
  return (
    <Image
      source={require("@/assets/images/qrcoe.jpg")} // Sử dụng require với đường dẫn tương đối
      className="h-full w-full rounded-md flex-1"
      alt="Product image"
      resizeMode="contain"
    />
  );
}