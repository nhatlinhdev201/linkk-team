import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './components/Dashboard.js';
import { OfficeEventBus } from './events/event-bus.js';

const rootElement = document.getElementById('root');
if (rootElement) {
  const bus = new OfficeEventBus();
  const root = createRoot(rootElement);
  root.render(<Dashboard bus={bus} />);
}
