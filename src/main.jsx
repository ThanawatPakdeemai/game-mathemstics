import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import HostApp from './host/HostApp.jsx';
import PlayerApp from './player/PlayerApp.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HostApp />} />
        <Route path="/join" element={<PlayerApp />} />
        <Route path="/join/:code" element={<PlayerApp />} />
        <Route path="*" element={<HostApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
