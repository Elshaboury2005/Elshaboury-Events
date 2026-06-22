نظام إدارة الفعاليات - Full Stack Event Management Application

## 📋 المتطلبات (Requirements)

- Node.js (v14 أو أحدث)
- npm أو yarn

## 🚀 خطوات التشغيل (Setup Instructions)

### 1. تثبيت المكتبات (Install Dependencies)

من مجلد المشروع:

```bash
npm install
```

أو يدوياً:

```bash
cd backend
npm install
cd ../frontend
npm install
```

### 2. إعداد قاعدة البيانات (Database Setup)

#### أ. شغّل MySQL وأنشئ قاعدة البيانات:

```sql
CREATE DATABASE events_db;
```

#### ب. نفّذ ملفات الجداول (إن وُجدت):

```bash
mysql -u root -p events_db < database/init.sql
```

### 3. إعداد متغيرات البيئة (Environment Setup)

انسخ ملف المثال وعدّل القيم:

```bash
cd backend
copy project.env.example project.env
```

(في Linux/Mac: `cp project.env.example project.env`)

عدّل `project.env` بالقيم الصحيحة:

| المتغير | الوصف |
|---------|-------|
| PORT | منفذ السيرفر (مثلاً 3000) |
| DB_HOST | عنوان MySQL (localhost) |
| DB_USER | مستخدم MySQL |
| DB_PASSWORD | كلمة مرور MySQL |
| DB_NAME | اسم قاعدة البيانات |
| CORS_ORIGIN | عنوان الـ frontend (مثلاً http://localhost:5500) |
| JWT_SECRET | مفتاح JWT (غيّره في الإنتاج!) |
| JWT_EXPIRE | مدة صلاحية التوكن (مثلاً 7d) |

### 4. تشغيل الـ Backend

```bash
cd backend
npm start
```

أو للإنتاج:

```bash
npm run dev
```

السيرفر سيعمل على: `http://localhost:3000`

### 5. تشغيل الـ Frontend

الـ backend يقدّم ملفات الـ frontend تلقائياً من `frontend/`.

- افتح: `http://localhost:3000` أو `http://localhost:3000/html/signin.html`
- أو استخدم Live Server على `frontend/` ثم ضبط `CORS_ORIGIN` في `project.env`

## 📁 هيكل المشروع (Project Structure) – MVC

```text
.
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── project.env.example
│   ├── project.env           # (انشئه من project.env.example)
│   └── server.js
├── database/
├── frontend/
│   ├── css/
│   ├── html/
│   ├── js/
│   └── public/
└── README.md
```

## 🔐 الأمان (Security)

- **كلمات المرور**: مُهاشة باستخدام bcrypt قبل الحفظ.
- **API**: المحميات تتطلب JWT عبر `Authorization: Bearer <token>`.
- **JWT_SECRET**: في الإنتاج، غيّر القيمة الافتراضية لمفتاح قوي في `project.env`.

## أهم المسارات (Key Endpoints)

- `POST /api/Account/register` - تسجيل مستخدم جديد
- `POST /api/Account/login` - تسجيل الدخول
- `GET /api/Account/verify` - التحقق من التوكن (يتطلب auth)
- `GET /api/Account/checkusername?username=xxx` - التحقق من اسم المستخدم
- `GET /api/Account/checkemail?email=xxx` - التحقق من البريد

- `GET /api/Events` - قائمة الفعاليات
- `GET /api/Events/:id` - تفاصيل فعالية
- `POST /api/Events` - إنشاء فعالية (يتطلب auth)

- `GET /api/health` - التحقق من حالة السيرفر

## ⚙️ تكوين رابط الـ API (Production)

للتشغيل على سيرفر آخر، غيّر رابط الـ API من الواجهة بإحدى الطريقتين:
1. أضف قبل تحميل الصفحة: `<script>window.API_BASE_URL = 'https://api.example.com/api';</script>`
2. أو أضف meta tag: `<meta name="api-base-url" content="https://api.example.com/api">`

## ⚠️ ملاحظات مهمة

1. شغّل MySQL قبل تشغيل السيرفر.
2. غيّر `DB_PASSWORD` و `JWT_SECRET` في `project.env`.
3. إذا استخدمت Live Server لـ frontend منفصل، عدّل `CORS_ORIGIN`.

## 🐛 حل المشاكل (Troubleshooting)

### خطأ في الاتصال بقاعدة البيانات
- تأكد من تشغيل MySQL.
- تحقق من `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` في `project.env`.
- تأكد من وجود قاعدة البيانات.

### خطأ CORS
- عدّل `CORS_ORIGIN` في `project.env` ليطابق عنوان الـ frontend (مثلاً `http://127.0.0.1:5500`).

### مشكلة المنفذ مستخدم
- غيّر `PORT` في `project.env` أو أوقف التطبيق الآخر الذي يستخدم نفس المنفذ.
