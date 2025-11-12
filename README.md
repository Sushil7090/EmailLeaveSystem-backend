# Backend (Express + MongoDB)

## Environment

Create a `.env` file in this folder with:

```
PORT=5000
DBCONNECT=mongodb://localhost:27017/email_management
JWTSECRET=replace-with-secure-random-string
EMAIL_USER=your-gmail@example.com
EMAIL_PASS=your-app-password
FRONTEND_BASE_URL=http://localhost:8080
CORS_ORIGIN=http://localhost:8080
```

## Scripts

- `npm start` – starts Express server with nodemon

## Routes

- `/auth/*` – register, login, profile, password flows
- `/employee/*` – employee leave email endpoints
- `/admin/*` – admin review endpoints
- `/emails/allemails` – admin-only list

In production, the server also serves the frontend from `../Frontend/dist`.

