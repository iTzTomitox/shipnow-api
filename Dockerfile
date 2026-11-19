# Imagen de producción de ShipNow API
# Alpine: imagen base mínima (menos tamaño y menos superficie de ataque).
# Node 24, la misma versión mayor que se usa en desarrollo.
FROM node:24-alpine

WORKDIR /app

# 1) Primero solo los manifiestos de dependencias: mientras package*.json no cambie,
#    Docker reutiliza esta capa (caché) y no reinstala todo en cada build
COPY package.json package-lock.json ./

# 2) Instalación reproducible (exactamente lo del lock) y sin devDependencies
#    (Mocha, Chai, Supertest y mongodb-memory-server no van a producción)
RUN npm ci --omit=dev && npm cache clean --force

# 3) Después el código: cambiar el código no invalida la capa de dependencias
COPY src ./src

# Carpetas donde la app escribe, con dueño el usuario sin privilegios
RUN mkdir -p logs uploads && chown -R node:node logs uploads

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# No correr como root: si alguien compromete la app, no controla el contenedor
USER node

# Docker marca el contenedor como healthy/unhealthy según GET /api/health
# (responde 503 si no hay conexión con MongoDB)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# node directo (no npm start): así recibe el SIGTERM de docker stop y hace el apagado ordenado
CMD ["node", "src/server.js"]
