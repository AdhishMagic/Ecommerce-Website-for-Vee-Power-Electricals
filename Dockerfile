# Root-context DockHosting build for the React/Vite frontend.
# The Django API is deployed as a separate service from backend/.
FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ARG VITE_RAZORPAY_KEY_ID=""
ENV VITE_RAZORPAY_KEY_ID=${VITE_RAZORPAY_KEY_ID}

RUN npm run build

FROM nginx:alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
