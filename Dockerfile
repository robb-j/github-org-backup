FROM denoland/deno:alpine-2.4.3

RUN mkdir -p /app/repos && chown -R deno:deno /app \
	&& apk add --no-cache git openssh

WORKDIR /app
USER deno

COPY --chown=deno:deno [".", "/app/"]

RUN deno install --allow-import=esm.r0b.io:443,jsr.io:443

ENV DENO_ENV=production

ENTRYPOINT ["/tini", "--", "docker-entrypoint.sh", "deno", "run", "--allow-import=esm.r0b.io:443,jsr.io:443", "--allow-env", "--allow-read=.", "--allow-write=repos,.cache", "--allow-net", "--allow-run", "source/main.ts"]
CMD ["config"]
