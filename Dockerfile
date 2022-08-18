FROM denoland/deno:alpine
WORKDIR /project
COPY import_map.json ./import_map.json
COPY deno.json ./deno.json
COPY src ./src
COPY static ./static
COPY views ./views
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "/server.ts"]