import React from 'react';

const Sidebar: React.FC = () => {
  return (
    <div className="w-64 h-screen bg-gray-800 text-white p-4">
      <h2 className="text-xl font-semibold mb-4">Recodarr</h2>
      <nav>
        <ul>
          <li className="mb-2">
            {/* We'll add links/navigation items here later */}
            <a href="#" className="block p-2 rounded hover:bg-gray-700">Dashboard</a>
          </li>
          {/* Add other navigation items here */}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar; 