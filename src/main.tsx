import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { splitForSpeech } from './lib/voice';

// 调试/自检用：在控制台里可以直接试听断句与韵律参数
(window as any).__tishuoProsody = { splitForSpeech };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
