import { Outlet, NavLink } from 'react-router-dom'
import './Layout.css'

function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">Demand Planner</h1>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/products" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Products
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Inventory
          </NavLink>
          <NavLink to="/demand" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Demand Data
          </NavLink>
          <NavLink to="/forecasts" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Forecasts
          </NavLink>
          <NavLink to="/promotion-calendar" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Promotion Calendar
          </NavLink>
          <NavLink to="/channel-forecast" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Channel Forecast Inputs
          </NavLink>
          <NavLink to="/forecast-summary" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Forecast Summary
          </NavLink>
          <NavLink to="/global-inventory" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Global Inventory
          </NavLink>
          <NavLink to="/stock-analysis" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Stock Analysis
          </NavLink>
          <NavLink to="/rule-engine" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Rule Engine
          </NavLink>
          <NavLink to="/import" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Import/Export
          </NavLink>
          <NavLink to="/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Users
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
