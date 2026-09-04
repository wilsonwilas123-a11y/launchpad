import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppContainer } from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AppContainer />
  </BrowserRouter>,
);
