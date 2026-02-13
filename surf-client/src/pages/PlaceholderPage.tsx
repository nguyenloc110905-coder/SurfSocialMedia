/** Trang placeholder cho các mục cột trái — tiêu đề + mô tả ngắn */
type Props = { title: string; description?: string };

export default function PlaceholderPage({ title, description = 'Nội dung đang được cập nhật.' }: Props) {
  return (
    <div className="py-4">
      <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">{title}</h2>
      <p className="text-gray-600 dark:text-gray-400 text-sm">{description}</p>
    </div>
  );
}
