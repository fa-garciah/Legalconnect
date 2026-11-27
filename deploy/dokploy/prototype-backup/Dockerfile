# PROTOTYPE ONLY — see run.sh. pg_dump 16 (the server's major version) plus the AWS CLI.
FROM postgres:16-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends awscli ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY run.sh /usr/local/bin/lc-backup
RUN chmod +x /usr/local/bin/lc-backup
ENTRYPOINT ["/usr/local/bin/lc-backup"]
