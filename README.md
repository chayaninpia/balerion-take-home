# Balerion take-home

Two separate exercises. Neither calls the other.

| Folder | What it is |
|---|---|
| [frontend](frontend/README.md) | Salmon allocation UI. React, 5,200 sub-orders. |
| [backend](backend/README.md) | Decimal amount to Thai baht text. Go. |

## Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Node 20+. Tests, typecheck, and the production build are in [frontend/README.md](frontend/README.md).

## Backend

```bash
cd backend
go run .
```

Go version is the `go` line in `backend/go.mod`. Sample output and `DecimalToBaht` are in [backend/README.md](backend/README.md).
