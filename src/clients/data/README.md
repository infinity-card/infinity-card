# Client data folders

Each client lives in its own folder:

```text
src/clients/data/<client-slug>/client.ts
public/assets/clients/<client-slug>/hero.webp
public/assets/clients/<client-slug>/logo.webp
```

The slug must match in both paths. The client registry auto-discovers every
`client.ts` one level below this directory, so no central registry needs to be
edited when a client is added.
