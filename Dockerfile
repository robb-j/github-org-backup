FROM denoland/deno:alpine-1.45.2

RUN mkdir -p /app/repos && chown -R deno:deno /app \
	&& apk add --no-cache git openssh

WORKDIR /app
USER deno

COPY --chown=deno:deno [".", "/app/"]

RUN deno cache main.ts

ENV DENO_ENV=production

CMD ["deno", "run", "--allow-env", "--allow-read=.", "--allow-write=repos", "--allow-net=api.github.com:443", "--allow-run=git", "main.ts"]
