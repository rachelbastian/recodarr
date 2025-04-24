import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Libraries from './pages/Libraries';
import Media from './pages/Media';
import Workflows from './pages/workflows';
import ManualEncode from './pages/ManualEncode';
import './App.css';

function App() {
    return (
        <Router>
            <div className="dark flex h-screen bg-background text-foreground">
                <Navbar />
                <div className="flex flex-1 flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/libraries" element={<Libraries />} />
                            <Route path="/media" element={<Media />} />
                            <Route path="/workflows" element={<Workflows />} />
                            <Route path="/encoding" element={<ManualEncode />} />
                        </Routes>
                    </main>
                </div>
            </div>
        </Router>
    );
}

export default App;
