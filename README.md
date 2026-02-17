# CLAP: Comprehensive Learning & Assessment Platform

A modern, full-stack application for managing student assessments, batches, and learning progress.

## 🚀 Overview

CLAP is built with a robust architecture separating concern between a high-performance frontend and a secure, scalable backend.

### Tech Stack

- **Frontend:** [Next.js](https://nextjs.org/) (TypeScript, Tailwind CSS, Radix UI)
- **Backend:** [Django](https://www.djangoproject.com/) (Django REST Framework, Python)
- **Database:** PostgreSQL (via Supabase)

## 🛠️ Getting Started

For detailed instructions on how to set up and run the application locally, please refer to:

👉 **[HOW_TO_RUN.md](./HOW_TO_RUN.md)**

### Quick Start (Windows)

Ideally, just run the automated startup script from the root directory:

```powershell
.\start-app.ps1
```

This will launch both the Django backend and Next.js frontend in separate terminal windows.

## 📂 Project Structure

- `app/`: Next.js application routes and pages
- `components/`: Reusable React components
- `django-backend/`: Django project root
  - `api/`: REST API endpoints and business logic
- `lib/`: Utility functions and shared logic
- `public/`: Static assets

## 🤝 Contributing

Contributions are welcome! Please ensure you:
1. Follow the existing code style (ESLint + Prettier).
2. Test your changes locally.
3. Open a Pull Request for review.

## 📄 License

Proprietary software. All rights reserved.
