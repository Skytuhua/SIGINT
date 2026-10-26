# Rate limit identity at the ingress

By default, SIGINT ignores forwarding headers and uses one shared `unknown`
identity per process. Changing `X-Forwarded-For` or `X-Real-IP` cannot create a
fresh request allowance. Each rate limit tier is shared by its routes; the strict
tier also bounds public summary requests in this default configuration.

For per-client quotas, set `TRUSTED_CLIENT_IP_HEADER` to an ingress-owned header,
for example `x-sigint-client-ip`. Configure the ingress to **overwrite** that
header with the authenticated connection's client IP on every request, removing
any value supplied by the caller. Restrict direct access to the origin so every
request passes through that ingress. Setting the variable alone does not make a
publicly supplied header trustworthy.

The configured header must contain exactly one IPv4 or IPv6 address. Chains,
hostnames, addresses with ports, and missing or malformed values use the shared
`unknown` bucket. IPv6 spellings and IPv4-mapped forms are normalized. Do not
configure a header to which your proxy appends an untrusted forwarding chain.

Limiter state is process-local and capped at 10,000 active identities per tier.
At capacity, new identities are rejected until entries expire; active quotas are
not evicted. Deployments with multiple processes need an ingress or shared
service for deployment-wide client quotas and paid-provider budgets.
