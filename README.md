# ⚡ Vee Power Electricals — Full-Stack E-Commerce Application

An enterprise-ready, full-stack e-commerce web application designed for **Vee Power Electricals**, featuring a modern React frontend, Django REST Framework backend API, multi-database support (SQLite / MySQL), and containerized Docker setup.

---

## 📑 Table of Contents
1. [Prerequisites](#-prerequisites)
2. [Option A: Quick Local Setup (Recommended)](#-option-a-quick-local-setup-recommended)
   - [Step 1: Backend Setup (Django API)](#step-1-backend-setup-django-api)
   - [Step 2: Frontend Setup (React + Vite)](#step-2-frontend-setup-react--vite)
3. [Option B: Docker Setup (Containerized)](#-option-b-docker-setup-containerized)
4. [🔑 Admin Access & Seed Data](#-admin-access--seed-data)
5. [⚙️ Environment Variables](#️-environment-variables)
6. [🔌 API Endpoints Cheat Sheet](#-api-endpoints-cheat-sheet)
7. [🛠️ Troubleshooting & FAQs](#️-troubleshooting--faqs)

---

## 📋 Prerequisites

Before starting, ensure you have the following installed on your machine:

- **Node.js**: `v18.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **Python**: `v3.10` or higher ([Download Python](https://www.python.org/))
- **Git**: Installed ([Download Git](https://git-scm.com/))
- **Docker Desktop** *(Optional - only required if running Option B)*: ([Download Docker](https://www.docker.com/products/docker-desktop/))

---

## 🚀 Option A: Quick Local Setup (Recommended)

Follow these simple step-by-step instructions to run the application locally without Docker.

> 💡 **Note**: In development mode, the backend uses **SQLite** automatically, so you **do NOT need MySQL** installed to run the project locally!

---

### Step 1: Backend Setup (Django API)

1. **Open a terminal** and navigate to the project root directory:
   ```bash
   cd Ecommerce-Website-for-Vee-Power-Electricals
   ```

2. **Navigate into the backend folder**:
   ```bash
   cd backend
   ```

3. **Create a Python Virtual Environment**:
   - **Windows (PowerShell / CMD)**:
     ```powershell
     python -m venv venv
     ```
   - **macOS / Linux**:
     ```bash
     python3 -m venv venv
     ```

4. **Activate the Virtual Environment**:
   - **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
     *(If Windows blocks script execution, run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process` first)*
   - **Windows (Command Prompt / CMD)**:
     ```cmd
     venv\Scripts\activate.bat
     ```
   - **macOS / Linux**:
     ```bash
     source venv/bin/activate
     ```

5. **Install Backend Dependencies**:
   ```bash
   pip install -r requirements/development.txt
   ```

6. **Run Database Migrations**:
   ```bash
   python manage.py migrate
   ```

7. **Seed Initial Demo Data** *(Categories, Brands, Products)*:
   ```bash
   python manage.py seed_data
   ```

8. **(Optional) Create Superuser / Admin Account**:
   ```bash
   python manage.py createsuperuser
   ```
   *(Follow prompt to set admin username, email, and password)*

9. **Start the Backend Server**:
   ```bash
   python manage.py runserver
   ```
   🎉 **Backend is live at**: `http://127.0.0.1:8000/`
   - **API Root**: `http://127.0.0.1:8000/api/v1/`
   - **Django Admin Portal**: `http://127.0.0.1:8000/admin/`

---

### Step 2: Frontend Setup (React + Vite)

1. **Open a NEW terminal window or tab** (keep the backend server terminal running).

2. **Navigate to the frontend folder**:
   ```bash
   cd frontend
   ```

3. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

4. **Start the Frontend Development Server**:
   ```bash
   npm run dev
   ```

5. **Access the Application**:
   Open your browser and navigate to:
   👉 **`http://localhost:5173`**

---

## 🐳 Option B: Docker Setup (Containerized with Live Code Reload)

Docker is configured with **live volume mounting** for both frontend and backend. Any changes you make to the source code on your computer are reflected immediately inside the containers!

1. **Ensure Docker Desktop is running**.

2. **Start all services from the project root directory**:
   ```bash
   docker compose up -d --build
   ```
   *(On first run, database migrations and initial demo data are automatically applied!)*

3. **Verify running services**:
   ```bash
   docker compose ps
   ```

4. **Access the application URLs**:
   - 🌐 **Frontend (Live Hot-Reload)**: `http://localhost:5173`
   - ⚡ **Backend API**: `http://localhost:8000/api/v1/`
   - 🛠️ **Django Admin**: `http://localhost:8000/admin/`
   - 🗄️ **MySQL DB**: `localhost:3306`

5. **Stop Docker containers**:
   ```bash
   docker compose down
   ```

> 💡 **Tip for Production**: To run in production mode (Gunicorn + Nginx static serving):
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
> ```


---

## 🔑 Admin Access & Seed Data

### Accessing Django Admin Portal
1. Run backend server (`python manage.py runserver`).
2. Go to `http://localhost:8000/admin/`.
3. Log in with the superuser credentials created via `python manage.py createsuperuser`.

### Managing Inventory & Products
- All products, brands, and categories loaded by `python manage.py seed_data` can be viewed, edited, and expanded in the Admin Portal or via REST API endpoints.

---

## ⚙️ Environment Variables

Both frontend and backend include `.env.example` files. By default, sensible defaults are configured out-of-the-box.

### Backend (`backend/.env`)
Create `backend/.env` if you want to override default settings (e.g., using MySQL instead of SQLite):
```env
USE_SQLITE=True
DATABASE_ENGINE=django.db.backends.mysql
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=veepower_db
DATABASE_USER=root
DATABASE_PASSWORD=root
DJANGO_SECRET_KEY=your-custom-secret-key
DJANGO_DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

### Frontend (`frontend/.env`)
Create `frontend/.env` if you need custom API URLs:
```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## 🔌 API Endpoints Cheat Sheet

| Feature | HTTP Method | Endpoint |
|---|---|---|
| **Products** | `GET` | `/api/v1/products/` |
| **Product Detail** | `GET` | `/api/v1/products/<sku>/` |
| **Categories** | `GET` | `/api/v1/categories/` |
| **Brands** | `GET` | `/api/v1/brands/` |
| **Orders** | `GET`, `POST` | `/api/v1/orders/` |
| **Inventory** | `GET` | `/api/v1/inventory/` |
| **Stock Movement** | `POST` | `/api/v1/inventory/<id>/transaction/` |
| **Auth Login** | `POST` | `/api/v1/auth/login/` |
| **User Profile** | `GET` | `/api/v1/auth/me/` |

---

## 🛠️ Troubleshooting & FAQs

### Q: Command `python` is not recognized on Windows?
Try using `python3` or `py` instead:
```bash
py -m venv venv
```

### Q: `Activate.ps1 cannot be loaded because running scripts is disabled` on Windows PowerShell?
Run PowerShell as Administrator or in your current terminal session execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```
Then run activate again: `.\venv\Scripts\Activate.ps1`

### Q: Port 8000 or 5173 is already in use?
- For Backend: Run on a different port: `python manage.py runserver 8080`
- For Frontend: Vite will automatically ask to run on `5174` or you can change port in `vite.config.ts`.

### Q: Frontend is showing no products or empty screens?
Make sure you ran `python manage.py seed_data` in the backend virtual environment to populate initial products, categories, and brands into the database.

---

## 📂 Project Architecture Overview

```text
vee-power-electricals/
│
├── frontend/                                # React + TypeScript + Vite + Tailwind CSS
│   ├── src/                                 # Pages, components, services, interfaces
│   ├── package.json                         # Node dependencies & scripts
│   └── vite.config.ts                       # Vite configuration
│
├── backend/                                 # Django REST Framework API
│   ├── manage.py                            # Django CLI entrypoint
│   ├── config/                              # Django settings (base, dev, prod)
│   ├── apps/                                # Feature modules (users, products, orders, inventory)
│   └── requirements/                        # Python package requirements
│
└── backend/docker/                          # Docker Compose & container definitions
```

---

✨ **Happy Coding!** Built for **Vee Power Electricals**.
