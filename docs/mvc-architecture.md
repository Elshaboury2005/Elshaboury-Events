# MVC Architecture Guide

This project is being migrated to a stricter MVC architecture.

## Target Structure

### Backend

- `routes/`: HTTP route registration only.
- `controllers/`: request/response orchestration, validation, and flow control.
- `models/`: database access and persistence logic only.
- `services/`: reusable business workflows that span multiple models or external systems.
- `middleware/`: auth, guards, request preprocessing.
- `utils/`: low-level helpers with no request or UI responsibility.

### Frontend

- `html/`: page markup only.
- `css/`: styling only.
- `js/mvc/<feature>/`: feature-specific `model`, `view`, and `controller` modules.
- `js/mvc/common/`: reusable page controllers and shared presentation helpers.
- `public/js/`: app-wide bootstrapping and shared runtime scripts.

## Rules

1. Do not keep inline page scripts inside HTML views.
2. Do not query the database directly from backend routes.
3. Do not place SQL inside controllers when it belongs in a model.
4. Keep routes thin and map them to one controller responsibility.
5. Keep frontend DOM rendering inside view modules.
6. Keep frontend API calls and persistence access inside model modules.
7. Keep event handling and page orchestration inside controller modules.

## Migration Pattern

Use the Support feature as the template:

- Backend:
  - `routes/supportRoutes.js`
  - `controllers/supportController.js`
  - `models/SupportTicket.js`
- Frontend:
  - `js/mvc/support/supportModel.js`
  - `js/mvc/support/supportView.js`
  - `js/mvc/support/supportController.js`
  - `js/mvc/support/bootstrap.js`

## Remaining Work

The rest of the migration should follow this order:

1. Move every inline page script in `frontend/html/` into `frontend/js/mvc/<feature>/`.
2. Extract database access from oversized controllers into dedicated models/services.
3. Split feature-specific routes out of overloaded controllers such as admin and booking.
4. Keep `server.js` focused on app composition and route mounting only.
