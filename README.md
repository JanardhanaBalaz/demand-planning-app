# Demand Planner

A full-stack web application for demand forecasting, inventory tracking, and analytics.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL
- **Authentication**: JWT-based
- **Charts**: Recharts

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for PostgreSQL)

## Getting Started

### 1. Start the Database

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 with:
- User: `demand_user`
- Password: `demand_password`
- Database: `demand_planner`

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Database Migrations

```bash
npm run db:migrate
```

### 4. Start Development Servers

```bash
npm run dev
```

This starts:
- Frontend: http://localhost:3000
- Backend: http://localhost:4000

## Project Structure

```
demand-planner/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API client functions
│   │   ├── context/        # Auth & app context
│   │   └── utils/          # Helper functions
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── controllers/    # Request handlers
│   │   ├── models/         # Database models
│   │   ├── middleware/     # Auth, validation
│   │   ├── services/       # Business logic
│   │   └── utils/          # Helpers (CSV parser, etc.)
│   └── package.json
├── database/
│   └── migrations/         # SQL migration files
├── docker-compose.yml      # PostgreSQL container config
└── package.json            # Root package.json
```

## Features

### User Management & Authentication
- User registration and login
- JWT-based session management
- Role-based access (Admin, Analyst, Viewer)
- Password hashing with bcrypt

### Inventory Tracking
- Product catalog management (CRUD)
- Stock level monitoring
- Low stock alerts (configurable thresholds)

### Demand Forecasting & Analytics
- Historical demand data visualization
- Basic forecasting (moving average, exponential smoothing, linear trend)
- Interactive charts and dashboards
- Date range filtering

### Data Import/Export
- CSV file upload for bulk data import
- Data validation and error reporting
- Export reports to CSV

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Users (Admin only)
- `GET /api/users` - List all users
- `PATCH /api/users/:id/role` - Update user role
- `DELETE /api/users/:id` - Delete user

### Products
- `GET /api/products` - List all products
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Inventory
- `GET /api/inventory` - List inventory
- `PUT /api/inventory/:productId` - Update inventory
- `GET /api/inventory/alerts` - Get low stock alerts

### Demand
- `GET /api/demand` - Get demand records (supports filtering)
- `POST /api/demand` - Create demand record
- `POST /api/demand/bulk` - Bulk import demand records

### Forecasts
- `GET /api/forecast/:productId` - Get forecasts for product
- `POST /api/forecast/:productId` - Generate new forecast

### Alerts
- `GET /api/alerts` - List all alerts
- `POST /api/alerts` - Create alert
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert

### Import/Export
- `POST /api/import/products` - Import products from CSV
- `POST /api/import/demand` - Import demand from CSV
- `GET /api/export/report?type=` - Export report (products, demand, inventory, forecasts)

## User Roles

| Permission | Admin | Analyst | Viewer |
|------------|-------|---------|--------|
| View dashboard & reports | ✓ | ✓ | ✓ |
| View products & inventory | ✓ | ✓ | ✓ |
| Add/edit products | ✓ | ✓ | - |
| Update inventory | ✓ | ✓ | - |
| Add demand records | ✓ | ✓ | - |
| Generate forecasts | ✓ | ✓ | - |
| Import data | ✓ | ✓ | - |
| Manage users | ✓ | - | - |

## CSV Import Formats

### Products CSV
```csv
sku,name,description,category,unitPrice
PROD-001,Sample Product,Description,Electronics,29.99
```

### Demand CSV
```csv
productId,quantity,date,source
1,100,2024-01-15,Online
```

## Environment Variables

Create a `.env` file in the `server` directory:

```env
PORT=4000
DATABASE_URL=postgresql://demand_user:demand_password@localhost:5432/demand_planner
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

---

## Production Deployment

### Option 1: Docker (Recommended)

1. **Copy the project to your server:**
   ```bash
   scp -r demand-planner user@your-server:/path/to/app
   ```

2. **Create environment file on the server:**
   ```bash
   cp .env.production.example .env
   # Edit .env with your production values
   ```

3. **Build and run with Docker Compose:**
   ```bash
   docker compose -f docker-compose.production.yml up -d --build
   ```

4. **The app will be available on port 4000**

### Option 2: Manual Deployment

1. **Install Node.js 20+ on your server**

2. **Install dependencies and build:**
   ```bash
   npm install
   npm run build
   ```

3. **Set up PostgreSQL and run migrations:**
   ```bash
   npm run db:migrate
   ```

4. **Start with a process manager (PM2):**
   ```bash
   npm install -g pm2
   cd server
   NODE_ENV=production pm2 start dist/index.js --name demand-planner
   ```

### Reverse Proxy (Nginx)

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Production Checklist

- [ ] Change `JWT_SECRET` to a secure random string
- [ ] Change database password
- [ ] Set up SSL/HTTPS
- [ ] Configure firewall (only allow 80/443)
- [ ] Set up database backups
- [ ] Configure Google OAuth redirect URI for your domain

## License

MIT
