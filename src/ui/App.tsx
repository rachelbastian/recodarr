import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import './App.css'

function App() {

    return (
        <div className='flex h-screen bg-gray-900 text-white'>
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <Dashboard />
            </main>
        </div>
    )
}

export default App
