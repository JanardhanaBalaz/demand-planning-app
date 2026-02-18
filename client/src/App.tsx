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
import ForecastSummary from './pages/ForecastSummary'
import GlobalInventory from './pages/GlobalInventory'
import StockAnalysis from './pages/StockAnalysis'
import RuleEngine from './pages/RuleEngine'

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
        <Route path="forecast-summary" element={<ForecastSummary />} />
        <Route path="global-inventory" element={<GlobalInventory />} />
        <Route path="stock-analysis" element={<StockAnalysis />} />
        <Route path="rule-engine" element={<RuleEngine />} />
        <Route path="import" element={<Import />} />
        <Route path="users" element={<Users />} />
      </Route>
    </Routes>
  )
}

export default App
