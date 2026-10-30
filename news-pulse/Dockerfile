# Debian (glibc) base: onnxruntime-node, used for semantic matching, has no musl/Alpine build.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY package.json package-lock.json ./
SHELL ["/bin/bash", "-c"]
RUN npm ci --omit=dev \
 && rm -f node_modules/onnxruntime-node/bin/napi-v*/linux/*/libonnxruntime_providers_{cuda,tensorrt}.so \
 && rm -rf node_modules/onnxruntime-node/bin/napi-v*/{darwin,win32} \
 && npm cache clean --force
COPY config ./config
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server.js"]
