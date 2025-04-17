import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Libraries from './pages/Libraries';
import './App.css';

function App() {
    return (
        <Router>
            <div className="dark h-screen bg-background text-foreground">
                <div className="flex h-full">
                    <Navbar />
                    <div className="flex-1">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/libraries" element={<Libraries />} />
                        </Routes>
                    </div>
                </div>
            </div>
        </Router>
    );
}

export default App;
