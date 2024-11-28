FROM denoland/deno:alpine-1.45.2

RUN mkdir -p /app/repos && chown -R deno:deno /app \
	&& apk add --no-cache git openssh

WORKDIR /app
USER deno

COPY --chown=deno:deno [".", "/app/"]

RUN deno cache main.ts

CMD ["task", "start"]
