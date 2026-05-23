import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { getAnalyticsSafe } from './lib/firebase/config';
import App from './App';
import './index.css';

if (import.meta.env.PROD) {
  setTimeout(() => {
    console.log(
      '%cDừng lại!',
      'color: red; font-size: 50px; font-weight: bold; text-shadow: 1px 1px 2px black; font-family: sans-serif;'
    );
    console.log(
      '%cĐây là một tính năng của trình duyệt dành cho các nhà phát triển. Nếu ai đó bảo bạn sao chép rồi dán nội dung nào đó vào đây để bật một tính năng của Surf hoặc "hack" tài khoản của người khác, đó là hành vi lừa đảo và sẽ khiến họ có thể truy cập vào tài khoản Surf của bạn.',
      'font-size: 16px; font-family: sans-serif;'
    );
  }, 1000);

  // Ghi đè các hàm console để tránh leak data
  console.log = function () {};
  console.info = function () {};
  console.warn = function () {};
  console.error = function () {};
}

getAnalyticsSafe(); // Khởi tạo Firebase Analytics (chỉ chạy trên browser)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
