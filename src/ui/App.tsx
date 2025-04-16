import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import './App.css';

function App() {
    return (
        <div className="dark h-screen bg-background text-foreground">
            <div className="flex h-full">
                <Sidebar />
                <div className="flex-1">
                    <Dashboard />
                </div>
            </div>
        </div>
    );
}

export default App;
