import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
// import Statistics from './pages/Statistics'; // Commented out - file doesn't exist
import Media from './pages/Media';
import Libraries from './pages/Libraries';
// import Workflows from './pages/Workflows'; // Old import
import { WorkflowsPage } from './pages/workflows/components/WorkflowsPage'; // Correct import for named export
import Settings from './pages/Settings';
import ManualEncode from './pages/ManualEncode'; // Import ManualEncode
import Presets from './pages/Presets'; // Import the new Presets page
import Queue from './pages/Queue'; // Import the Queue page
import './App.css';
import { useEffect, useState } from 'react';

function App() {
    return (
        <Router>
            <div className="flex h-screen bg-background text-foreground bg-stars">
                <div className="twinkle-layer"></div>
                
                <Navbar />
                <div className="flex flex-1 flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            {/* <Route path="/statistics" element={<Statistics />} /> */}{/* Commented out */}
                            <Route path="/media" element={<Media />} />
                            <Route path="/libraries" element={<Libraries />} />
                            {/* <Route path="/workflows" element={<Workflows />} /> */}
                            <Route path="/workflows" element={<WorkflowsPage />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/encoding" element={<ManualEncode />} /> {/* Add Manual Encode route */}
                            <Route path="/queue" element={<Queue />} /> {/* Add Queue route */}
                            <Route path="/presets" element={<Presets />} /> {/* Add Presets route */}
                        </Routes>
                    </main>
                </div>
            </div>
        </Router>
    );
}

export default App;
