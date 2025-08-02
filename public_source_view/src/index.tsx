import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/material-design.css';



import RFIDDashboard from './pages/RFIDDashboard';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <RFIDDashboard />
  </React.StrictMode>
);