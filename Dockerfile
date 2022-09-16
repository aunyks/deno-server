FROM denoland/deno:alpine
WORKDIR /project
COPY import_map.json ./import_map.json
COPY deno.json ./deno.json
COPY src ./src
CMD ["deno", "run", "--unstable", "--allow-net", "--allow-env", "--allow-read", "/main.ts"]