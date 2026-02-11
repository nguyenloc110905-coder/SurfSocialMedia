import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { getAnalyticsSafe } from './lib/firebase/config';
import App from './App';
import './index.css';

getAnalyticsSafe(); // Khởi tạo Firebase Analytics (chỉ chạy trên browser)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
