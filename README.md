# VEE POWER ELECTRICALS — Full Stack Application

Welcome to the **Vee Power Electricals** e-commerce production application monorepo. This application features a React + TypeScript frontend, Django REST Framework backend, MySQL relational database, and containerized Docker Compose environment.

---

## 🏗️ Architecture & Root Structure

```text
vee-power-electricals/
│
├── frontend/                                # React + TypeScript + Vite + Tailwind CSS v4
│   ├── src/                                 # UI components, pages, services, layouts & types
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── Dockerfile                           # Nginx production Dockerfile
│   └── .env.example
│
├── backend/                                 # Django REST Framework API
│   ├── manage.py
│   ├── config/                              # Settings (base.py, development.py, production.py)
│   ├── apps/                                # users, products, orders, inventory, common
│   ├── requirements/                        # Python dependencies
│   ├── docker/                              # Container orchestration & configs
│   │   ├── backend/Dockerfile               # Python 3.14 + Gunicorn Dockerfile
│   │   ├── mysql/init.sql                   # MySQL database init script
│   │   ├── docker-compose.yml               # Compose service definitions
│   │   ├── docker-compose.dev.yml           # Dev compose override
│   │   ├── docker-compose.prod.yml          # Production compose override
│   │   └── .env.example
│   └── .env.example
│
├── README.md                                # Monorepo Documentation
└── .gitignore                               # Monorepo GitIgnore
```

---

## 🚀 Quick Start (Local Development)

### 1. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:5173`.

### 2. Backend Setup

```bash
cd backend
pip install -r requirements/development.txt
python manage.py migrate
python manage.py seed_data
python manage.py runserver 0.0.0.0:8000
```

The backend API will run on `http://localhost:8000/api/v1/`.

---

## 🐳 Docker Setup

Run the full stack (Frontend + Backend + MySQL) using Docker Compose from the infrastructure directory:

```bash
cd backend/docker
docker-compose up -d --build
```

Or from the root directory:

```bash
docker-compose -f backend/docker/docker-compose.yml up -d --build
```

- **Frontend**: http://localhost
- **Backend API**: http://localhost:8000/api/v1/
- **MySQL Database**: `localhost:3306`

---

## 🔌 REST API Endpoints

- **Products**: `GET /api/v1/products/`
- **Categories**: `GET /api/v1/categories/`
- **Brands**: `GET /api/v1/brands/`
- **Orders**: `POST /api/v1/orders/`, `GET /api/v1/orders/`
- **Inventory**: `GET /api/v1/inventory/`, `POST /api/v1/inventory/<id>/transaction/`
- **Auth**: `POST /api/v1/auth/login/`, `GET /api/v1/auth/me/`
