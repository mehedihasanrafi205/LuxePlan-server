# 🚀 LuxePlan Server - Backend API

**Live API:** [https://luxplan-server.vercel.app/](https://luxplan-server.vercel.app/)  
**Frontend:** [https://luxeplan-0.web.app/](https://luxeplan-0.web.app/)  
**Repository:** [https://github.com/mehedihasanrafi205/LuxePlan-server.git](https://github.com/mehedihasanrafi205/LuxePlan-server.git)

---

## 📌 Purpose

RESTful API backend for **LuxePlan** - a decoration booking platform built with Express.js, MongoDB, and Stripe. Handles authentication, bookings, payments, and business analytics.

---

## ✨ Key Features

- **Firebase Admin SDK** - JWT token verification
- **Role-Based Access** - Admin, Decorator, Client roles
- **Stripe Integration** - Payment processing
- **MongoDB** - 5 collections with optimized queries
- **28+ API Endpoints** - RESTful architecture
- **Business Analytics** - Revenue, demand, and status reports

---

## 🛠️ Tech Stack

- **Express.js** 5.2.1
- **MongoDB** 7.0.0
- **Firebase Admin** 13.6.0
- **Stripe** 20.0.0
- **CORS** 2.8.5
- **dotenv** 17.2.3

---

## 🗄️ Database Collections

**Database:** `LuxePlan`

1. **users** - User accounts with roles
2. **service** - Decoration services catalog
3. **bookings** - Service bookings with status workflow
4. **payments** - Stripe transaction records
5. **decorator** - Decorator profiles and applications

---

## 🔌 API Endpoints Summary

### Authentication
- `POST /users` - Create/update user
- `GET /user/role` - Get user role (JWT)

### Services (Public)
- `GET /services` - List with search/filter/pagination
- `GET /services/top-rated` - Top 4 services
- `GET /service/:id` - Service details
- `POST /service` - Create (JWT)
- `PUT /service/:id` - Update (Admin)
- `DELETE /service/:id` - Delete (Admin)

### Bookings
- `GET /bookings` - List bookings (JWT, filtered)
- `POST /bookings` - Create booking
- `PUT /bookings/:id` - Update booking
- `DELETE /bookings/:id` - Cancel booking
- `PATCH /bookings/:id/assign` - Assign decorator (Admin)
- `GET /bookings/assigned` - Decorator's projects (Decorator)
- `PATCH /bookings/:id/assigned` - Update status (Decorator)
- `GET /booking/completed` - Completed projects
- `GET /bookings/today` - Today's schedule (Decorator)

### Payments (Stripe)
- `POST /create-checkout-session` - Stripe checkout
- `PATCH /payment-success` - Payment verification
- `GET /payments` - Payment history (JWT)

### Decorators
- `POST /decorator` - Apply as decorator (JWT)
- `GET /decorators` - List decorators (filtered)
- `GET /decorators/top-rated` - Top 4 decorators
- `GET /decorator/:id` - Decorator details
- `PATCH /decorators/:id` - Approve/reject (Admin)

### Analytics (Admin Only)
- `GET /dashboard/admin/bookings-status` - Status distribution
- `GET /dashboard/admin/revenue` - Total revenue
- `GET /dashboard/admin/services-demand` - Service demand chart
- `GET /dashboard/admin/revenue-by-service` - Revenue breakdown

---

## 🔐 Authentication Flow

1. Client sends Firebase ID token in `Authorization: Bearer {token}`
2. `verifyFBToken` middleware verifies with Firebase Admin SDK
3. Role middleware (`verifyAdmin`, `verifyDecorator`) checks permissions
4. Request proceeds or returns 401/403

---

## 🌍 Environment Variables

Create `.env` file:

```env
# MongoDB
URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/LuxePlan

# Server
PORT=4000

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_key

# Firebase Admin SDK (Base64 Encoded)
FB_SERVICE_KEY=base64_encoded_service_account

# CORS
DOMAIN_URL=https://luxeplan-0.web.app
```

**Encode Firebase Service Account:**
```bash
# Linux/Mac
base64 -i serviceAccount.json

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccount.json"))
```

---

## 🚀 Installation

```bash
# Clone repository
git clone https://github.com/mehedihasanrafi205/LuxePlan-server.git

# Install dependencies
npm install

# Create .env file and add variables

# Start development server
npm run dev
```

Server runs on `http://localhost:4000`

---

## 📜 Scripts

```bash
npm start      # Production server
npm run dev    # Development with nodemon
```

---

## 🔒 Security

✅ Environment variables in `.env` (gitignored)  
✅ Firebase service account base64 encoded  
✅ JWT verification on protected routes  
✅ CORS configured for specific origins  
✅ Role-based middleware enforced  
✅ Stripe handles payment security (PCI compliant)

---

## 📦 Deployment (Vercel)

**vercel.json:**
```json
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "index.js" }]
}
```

**Deploy:**
```bash
vercel --prod
```

Add environment variables in Vercel Dashboard → Settings → Environment Variables

---

## 🧪 Testing

**Test Endpoints:**
```bash
# Root
curl https://luxplan-server.vercel.app/

# Services
curl https://luxplan-server.vercel.app/services

# Search
curl "https://luxplan-server.vercel.app/services?search=wedding"
```

**Protected Endpoints:** Requires `Authorization: Bearer {firebase_token}` header

---

## 📊 Response Format

**Success:**
```json
{
  "services": [...],
  "count": 25
}
```

**Error:**
```json
{
  "message": "Unauthorized Access!"
}
```

---

## 🛡️ Troubleshooting

**CORS Error?** → Check `DOMAIN_URL` matches frontend exactly  
**MongoDB Connection Failed?** → Verify IP whitelist (0.0.0.0/0) and credentials  
**Token Verification Failed?** → Ensure `FB_SERVICE_KEY` is valid base64  

---

## 👨‍💻 Developer

**Mehedi Hasan Rafi**  
GitHub: [@mehedihasanrafi205](https://github.com/mehedihasanrafi205)

---

**Made with ⚡ by Mehedi Hasan Rafi**
