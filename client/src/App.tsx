import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Inventory from './pages/Inventory'
import Demand from './pages/Demand'
import Forecasts from './pages/Forecasts'
import Import from './pages/Import'
import Users from './pages/Users'
import PromotionCalendar from './pages/PromotionCalendar'
import ChannelForecast from './pages/ChannelForecast'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="demand" element={<Demand />} />
        <Route path="forecasts" element={<Forecasts />} />
        <Route path="promotion-calendar" element={<PromotionCalendar />} />
        <Route path="channel-forecast" element={<ChannelForecast />} />
        <Route path="import" element={<Import />} />
        <Route path="users" element={<Users />} />
      </Route>
    </Routes>
  )
}

export default App
